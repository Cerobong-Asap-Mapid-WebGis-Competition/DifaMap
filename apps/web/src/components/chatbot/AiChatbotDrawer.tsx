'use client';

import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Sparkles,
  Send,
  MapPin,
  Compass,
  Layers,
  BarChart3,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Building,
  UtensilsCrossed,
  ShieldAlert,
  Users,
  Clock,
  Accessibility,
  ChevronRight,
  Eye
} from 'lucide-react';
import { difaMapApi } from '../../lib/api';
import { useIsMobile } from '../../hooks/useIsMobile';

export type SiniAiTab = 'CHAT' | 'SITE_SELECTION' | 'SITE_ANALYSIS';

/**
 * Jarak dua koordinat dalam meter (haversine).
 *
 * Dipakai hanya untuk menyaring titik ekonomi, yang jumlahnya puluhan dan sudah
 * ada di memori browser. Untuk lokasi survei, jarak tetap dihitung PostGIS di
 * server lewat /locations/nearby.
 */
function jarakMeter(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Satu masalah aksesibilitas yang dicari di lokasi sekitar titik analisis. */
const MASALAH_DIPANTAU: Array<{ kolom: string; nilaiBermasalah: string[]; sebutan: string }> = [
  { kolom: 'rampStatus', nilaiBermasalah: ['NONE', 'DAMAGED'], sebutan: 'ramp tidak ada atau rusak' },
  { kolom: 'guidingBlockStatus', nilaiBermasalah: ['NONE', 'DAMAGED'], sebutan: 'ubin pemandu terputus' },
  { kolom: 'sidewalkCondition', nilaiBermasalah: ['DAMAGED', 'BLOCKED', 'NARROW'], sebutan: 'trotoar rusak, sempit, atau terhalang' },
  { kolom: 'lightingLevel', nilaiBermasalah: ['DARK', 'DIM'], sebutan: 'penerangan jalan kurang' },
];

/**
 * Menyusun rekomendasi aksesibilitas dari lokasi survei di sekitar titik.
 *
 * Semua angka berasal dari baris yang benar-benar ada di radius tersebut. Kalau
 * tidak ada satu pun lokasi, fungsi ini mengatakannya - tidak mengarang skor.
 */
function ringkasAksesibilitas(lokasi: any[], radiusMeter: number) {
  if (lokasi.length === 0) {
    return {
      jumlahLokasi: 0,
      skorRata: null,
      action: `Belum ada titik survei dalam radius ${radiusMeter} m dari titik ini, jadi kondisi aksesibilitasnya belum bisa dinilai.`,
      temuan: [] as string[],
    };
  }

  const berskor = lokasi.filter((l) => typeof l.overallScore === 'number');
  const skorRata = berskor.length
    ? berskor.reduce((jml, l) => jml + l.overallScore, 0) / berskor.length
    : null;

  const temuan = MASALAH_DIPANTAU
    .map((m) => {
      const jml = lokasi.filter((l) => m.nilaiBermasalah.includes(l[m.kolom])).length;
      return { sebutan: m.sebutan, jml };
    })
    .filter((t) => t.jml > 0)
    .sort((a, b) => b.jml - a.jml)
    .map((t) => `${t.sebutan} (${t.jml} titik)`);

  // Parameter NOT_VISIBLE berarti tidak terlihat di foto survei, bukan tidak ada.
  // Jumlahnya disebut supaya pembaca tahu seberapa lengkap dasar kesimpulan ini.
  const belumTeramati = lokasi.reduce(
    (jml, l) => jml + MASALAH_DIPANTAU.filter((m) => l[m.kolom] === 'NOT_VISIBLE').length,
    0
  );

  const action =
    temuan.length > 0
      ? `Dari ${lokasi.length} titik survei dalam radius ${radiusMeter} m, masalah terbanyak: ${temuan.join('; ')}.`
      : `Dari ${lokasi.length} titik survei dalam radius ${radiusMeter} m, tidak ada hambatan yang tercatat bermasalah.`;

  return {
    jumlahLokasi: lokasi.length,
    skorRata,
    action,
    temuan,
    belumTeramati,
    totalParameterDiperiksa: lokasi.length * MASALAH_DIPANTAU.length,
  };
}

interface AiChatbotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLocationId?: string;
  onToggleSiniGrid?: (show: boolean, gridSize?: number) => void;
  onRunIsochroneAnalysis?: (lat: number, lng: number, mode?: 'walking' | 'wheelchair') => void;
  onClearAnalysis?: () => void;
  onSelectCoordinateForAnalysis?: () => void;
  analysisTarget?: { lat: number; lng: number; name?: string } | null;
}

export default function AiChatbotDrawer({
  isOpen,
  onClose,
  selectedLocationId,
  onToggleSiniGrid,
  onRunIsochroneAnalysis,
  onClearAnalysis,
  onSelectCoordinateForAnalysis,
  analysisTarget,
}: AiChatbotDrawerProps) {
  const isMobile = useIsMobile(768);
  // 1. Tab Navigation: Chat vs Site Selection vs Site Analysis
  const [activeTab, setActiveTab] = useState<SiniAiTab>('CHAT');

  // ----------------------------------------------------
  // State: Tab 1 (Chatbot Spatial RAG)
  // ----------------------------------------------------
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([
    {
      role: 'assistant',
      content:
        'Halo! Saya **DifaMap AI Assistant**. Saya terintegrasi dengan data **SINI AI MAPID** untuk membantu analisis rute ramah disabilitas, pencarian lokasi prioritas (*Site Selection*), dan analisis daya jangkau (*Site Analysis*) di Kota Makassar dan Kabupaten Gowa.',
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ----------------------------------------------------
  // State: Tab 2 (Site Selection - MAPID SINI Grid & Formula)
  // ----------------------------------------------------
  const [gridSize, setGridSize] = useState<number>(1000);
  const [isComputingGrid, setIsComputingGrid] = useState(false);
  const [gridResultSummary, setGridResultSummary] = useState<any>(null);
  const [isGridVisibleOnMap, setIsGridVisibleOnMap] = useState(false);

  // ----------------------------------------------------
  // State: Tab 3 (Site Analysis - Demographics, Isochrone, POI)
  // ----------------------------------------------------
  const [isochroneMode, setIsochroneMode] = useState<'wheelchair' | 'walking'>('wheelchair');
  const [isochroneMinutes, setIsochroneMinutes] = useState<number>(10);
  const [isAnalyzingSite, setIsAnalyzingSite] = useState(false);
  const [siteAnalysisData, setSiteAnalysisData] = useState<any>(null);
  const [gagalAnalisis, setGagalAnalisis] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Handle ESC key to close AiChatbotDrawer
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // When analysisTarget changes (user picked point on map), trigger Site Analysis automatically
  useEffect(() => {
    if (analysisTarget && activeTab === 'SITE_ANALYSIS') {
      handleRunSiteAnalysis(analysisTarget.lat, analysisTarget.lng, analysisTarget.name);
    }
  }, [analysisTarget]);

  if (!isOpen) return null;

  // Handler: Chatbot Message
  const handleSendMessage = async (textToSend: string) => {
    if (!textToSend.trim() || isSending) return;

    const userMsg = textToSend.trim();
    setInputText('');
    const newHistory = [...messages, { role: 'user' as const, content: userMsg }];
    setMessages(newHistory);
    setIsSending(true);

    try {
      const historyPayload = newHistory.map((m) => ({ role: m.role, content: m.content }));
      const response = await difaMapApi.chatWithAi(
        userMsg,
        { latitude: -5.1700, longitude: 119.4500 },
        selectedLocationId,
        historyPayload
      );

      const reply = response.data?.reply || 'Terima kasih atas pertanyaannya.';
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Maaf, terjadi kendala saat memproses jawaban AI. Silakan coba kembali sesaat lagi.',
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  // Handler: Execute SINI AI Site Selection Grid
  const handleComputeSiniGrid = async () => {
    try {
      setIsComputingGrid(true);
      const res = await difaMapApi.getSiniGridPriority(gridSize);
      const features: any[] = res.data?.features ?? [];

      // Nilai 25 adalah keluaran bawaan server untuk sel yang tidak punya satu pun
      // titik survei maupun titik ekonomi di bawahnya. Sel seperti itu bukan
      // "prioritas rendah" - melainkan belum terjangkau data, dan tidak layak
      // muncul sebagai temuan.
      const NILAI_SEL_KOSONG = 25;
      const selBerdata = features.filter(
        (f) => (f.properties?.priorityIndex ?? NILAI_SEL_KOSONG) !== NILAI_SEL_KOSONG
      );

      const tigaTeratas = [...selBerdata]
        .sort((a, b) => (b.properties?.priorityIndex ?? 0) - (a.properties?.priorityIndex ?? 0))
        .slice(0, 3)
        .map((f) => {
          const p = f.properties ?? {};
          const [lng, lat] = p.center ?? [];
          return {
            zone: p.gridId ?? 'Sel tanpa nama',
            koordinat:
              typeof lat === 'number' && typeof lng === 'number'
                ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
                : null,
            score: Math.round(p.priorityIndex ?? 0),
            issue: p.recommendedIntervention ?? 'Belum ada rekomendasi',
          };
        });

      setGridResultSummary({
        totalCells: features.length,
        selBerdata: selBerdata.length,
        formulaApplied: `0.6 × Bobot_Kerusakan + 0.4 × Kepadatan_POIs`,
        topPriorityZones: tigaTeratas,
      });

      setIsGridVisibleOnMap(true);
      if (onToggleSiniGrid) {
        onToggleSiniGrid(true, gridSize);
      }
    } catch (err) {
      console.error('Failed to run SINI Grid AI:', err);
    } finally {
      setIsComputingGrid(false);
    }
  };

  // Handler: Execute Site Analysis
  const handleRunSiteAnalysis = async (lat: number = -5.1700, lng: number = 119.4500, locName?: string) => {
    // Kecepatan yang dipakai server untuk isokron: kursi roda 60 m/menit,
    // jalan kaki 80 m/menit. Disamakan di sini agar radius penyaring titik
    // ekonomi persis sama dengan lingkaran yang digambar di peta.
    const radiusJangkauan = isochroneMinutes * (isochroneMode === 'wheelchair' ? 60 : 80);

    try {
      setIsAnalyzingSite(true);
      setGagalAnalisis(null);
      if (onRunIsochroneAnalysis) {
        onRunIsochroneAnalysis(lat, lng, isochroneMode);
      }

      // Tiga sumber data nyata, diminta bersamaan supaya tidak menunggu berantai.
      const [isokron, sekitar, ekonomi] = await Promise.all([
        difaMapApi.getIsochrone(lat, lng, [isochroneMinutes], isochroneMode),
        difaMapApi.getNearbyLocations(lat, lng, radiusJangkauan, 100),
        difaMapApi.getEconomicPoints('ALL'),
      ]);

      const sifatIsokron = isokron?.data?.features?.[0]?.properties ?? {};
      const radiusMeter: number = sifatIsokron.radiusMeters ?? radiusJangkauan;
      const lokasiSekitar: any[] = sekitar?.data ?? [];

      // Titik ekonomi belum punya penyaring radius di server, jadi disaring di sini.
      const titikEkonomiDekat: any[] = (ekonomi?.data ?? []).filter(
        (p: any) => jarakMeter(lat, lng, p.latitude, p.longitude) <= radiusMeter
      );

      const hitungJenis = (jenis: string) =>
        titikEkonomiDekat.filter((p) => p.type === jenis).length;

      const kategoriPoi = [
        { name: 'Titik Survei Aksesibilitas', count: lokasiSekitar.length, color: '#10b981' },
        { name: 'Makanan & Minuman (Menu Go)', count: hitungJenis('MENU_GO'), color: '#FDC323' },
        { name: 'Properti (Properti Go)', count: hitungJenis('PROPERTI_GO'), color: '#38bdf8' },
        { name: 'Komersial Lainnya', count: hitungJenis('COMMERCIAL'), color: '#ec4899' },
      ];

      setSiteAnalysisData({
        name: locName || 'Titik Analisis Terpilih',
        coordinates: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,

        // Demografi dan nilai tanah sengaja null: DifaMap belum punya sumbernya.
        // Menampilkan angka tebakan di sini pernah membuat panel melaporkan
        // kecamatan yang berbeda belasan kilometer dari titik yang diklik.
        demography: null,
        landAndDisaster: null,

        isochrone: {
          mode: isochroneMode === 'wheelchair' ? 'Kursi Roda' : 'Jalan Kaki',
          radiusMeters: radiusMeter,
          areaSqKm: sifatIsokron.areaSqKm ?? null,
        },
        poiCatchment: {
          total: kategoriPoi.reduce((jml, k) => jml + k.count, 0),
          categories: kategoriPoi,
        },
        accessibilityRecommendation: ringkasAksesibilitas(lokasiSekitar, radiusMeter),
      });
      setIsAnalyzingSite(false);
    } catch (err) {
      console.error('Site analysis error:', err);
      setSiteAnalysisData(null);
      setGagalAnalisis('Data analisis gagal diambil dari server. Coba ulangi.');
      setIsAnalyzingSite(false);
    }
  };

  return (
    <aside
      className={isMobile ? 'animate-slide-up' : 'animate-slide-in'}
      style={{
        position: 'fixed',
        left: isMobile ? 0 : 'auto',
        right: isMobile ? 0 : '24px',
        top: isMobile ? 'auto' : '24px',
        bottom: isMobile ? 0 : '24px',
        width: isMobile ? '100%' : '460px',
        maxWidth: isMobile ? '100vw' : 'calc(100vw - 48px)',
        maxHeight: isMobile ? '86vh' : 'calc(100vh - 48px)',
        backgroundColor: '#FFFFFF',
        borderRadius: isMobile ? '24px 24px 0 0' : '16px',
        boxShadow: isMobile ? '0 -8px 36px rgba(0, 0, 0, 0.25)' : '0 8px 32px rgba(0, 0, 0, 0.18)',
        border: '1px solid rgba(0, 0, 0, 0.08)',
        borderBottom: isMobile ? 'none' : undefined,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Mobile Top Drag Handle Bar */}
      {isMobile && <div className="bottom-sheet-drag-handle" />}

      {/* 1. Header with MAPID SINI AI Branding */}
      <div
        style={{
          padding: isMobile ? '12px 18px' : '16px 20px',
          borderBottom: '1px solid #EFEFEF',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: '#539BA9',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FDC323',
            }}
          >
            <Sparkles size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#000000' }}>
                SINI AI Assistant
              </h3>
              <span style={{ fontSize: '10px', backgroundColor: '#FDC323', color: '#000000', fontWeight: '800', padding: '2px 6px', borderRadius: '10px' }}>
                MAPID ENGINE
              </span>
            </div>
            <span style={{ fontSize: '11px', color: '#5FD300', fontWeight: '600' }}>
              ● Spatial Multi-Criteria RAG Aktif
            </span>
          </div>
        </div>

        {/* Elderly-friendly large Close Button */}
        <button
          onClick={onClose}
          title="Tutup Panel"
          style={{
            background: isMobile ? '#F1F5F9' : 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: isMobile ? '6px 14px' : '6px',
            borderRadius: isMobile ? '20px' : '50%',
            color: '#0F172A',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: isMobile ? '13.5px' : '13px',
            fontWeight: '700',
            minHeight: isMobile ? '38px' : undefined,
            transition: 'background-color 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#E2E8F0')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = isMobile ? '#F1F5F9' : 'transparent')}
        >
          <X size={isMobile ? 18 : 20} strokeWidth={2.5} />
          {isMobile && <span>Tutup</span>}
        </button>
      </div>

      {/* 2. Top Segmented Tabs (Tanya AI / Site Selection / Site Analysis) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          backgroundColor: '#F1F5F9',
          padding: '4px',
          margin: '12px 16px 0 16px',
          borderRadius: '10px',
          gap: '4px',
        }}
      >
        <button
          onClick={() => setActiveTab('CHAT')}
          style={{
            padding: '8px 4px',
            border: 'none',
            borderRadius: '8px',
            backgroundColor: activeTab === 'CHAT' ? '#FFFFFF' : 'transparent',
            color: activeTab === 'CHAT' ? '#000000' : '#64748B',
            fontWeight: activeTab === 'CHAT' ? '700' : '600',
            fontSize: '12px',
            cursor: 'pointer',
            boxShadow: activeTab === 'CHAT' ? 'var(--shadow-sm)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          💬 Tanya AI
        </button>

        <button
          onClick={() => setActiveTab('SITE_SELECTION')}
          style={{
            padding: '8px 4px',
            border: 'none',
            borderRadius: '8px',
            backgroundColor: activeTab === 'SITE_SELECTION' ? '#FFFFFF' : 'transparent',
            color: activeTab === 'SITE_SELECTION' ? '#000000' : '#64748B',
            fontWeight: activeTab === 'SITE_SELECTION' ? '700' : '600',
            fontSize: '12px',
            cursor: 'pointer',
            boxShadow: activeTab === 'SITE_SELECTION' ? 'var(--shadow-sm)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          🎯 Site Selection
        </button>

        <button
          onClick={() => setActiveTab('SITE_ANALYSIS')}
          style={{
            padding: '8px 4px',
            border: 'none',
            borderRadius: '8px',
            backgroundColor: activeTab === 'SITE_ANALYSIS' ? '#FFFFFF' : 'transparent',
            color: activeTab === 'SITE_ANALYSIS' ? '#000000' : '#64748B',
            fontWeight: activeTab === 'SITE_ANALYSIS' ? '700' : '600',
            fontSize: '12px',
            cursor: 'pointer',
            boxShadow: activeTab === 'SITE_ANALYSIS' ? 'var(--shadow-sm)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          📊 Site Analysis
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: CHATBOT SPATIAL RAG                                                */}
      {/* ========================================================================= */}
      {activeTab === 'CHAT' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Messages Body */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              backgroundColor: '#F8FAFC',
            }}
          >
            {messages.map((msg, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth: '85%',
                    padding: '12px 14px',
                    borderRadius: '14px',
                    fontSize: '13px',
                    lineHeight: '19px',
                    backgroundColor: msg.role === 'user' ? '#FDC323' : '#FFFFFF',
                    color: '#000000',
                    boxShadow: 'var(--shadow-sm)',
                    border: msg.role === 'user' ? 'none' : '1px solid #E2E8F0',
                    borderBottomRightRadius: msg.role === 'user' ? '4px' : '14px',
                    borderBottomLeftRadius: msg.role === 'assistant' ? '4px' : '14px',
                    whiteSpace: 'pre-line',
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {isSending && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#767676', fontSize: '12px' }}>
                <Sparkles size={15} className="animate-spin" color="#539BA9" />
                <span>AI sedang menganalisis koridor spasial Makassar...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Chips */}
          <div
            style={{
              padding: '8px 14px',
              backgroundColor: '#FFFFFF',
              borderTop: '1px solid #EFEFEF',
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
            }}
          >
            {[
              'Halte paling ramah kursi roda',
              'Kondisi guiding block Hertasning',
              'Analisis zona SINI AI',
            ].map((q, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(q)}
                style={{
                  backgroundColor: '#F1F5F9',
                  border: 'none',
                  borderRadius: '20px',
                  padding: '5px 10px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#334155',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage(inputText);
            }}
            style={{
              padding: '12px 14px',
              backgroundColor: '#FFFFFF',
              borderTop: '1px solid #EFEFEF',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Tanyakan rute aman atau fasilitas difabel..."
              style={{
                flex: 1,
                padding: isMobile ? '12px 16px' : '9px 14px',
                borderRadius: '50px',
                border: '1px solid #CBD5E1',
                outline: 'none',
                fontSize: '16px', // 16px prevents iOS Safari auto-zoom & enhances elderly readability
              }}
            />

            <button
              type="submit"
              disabled={isSending || !inputText.trim()}
              style={{
                width: isMobile ? '44px' : '38px',
                height: isMobile ? '44px' : '38px',
                borderRadius: '50%',
                backgroundColor: '#539BA9',
                border: 'none',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: isSending || !inputText.trim() ? 'not-allowed' : 'pointer',
                flexShrink: 0,
              }}
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: SITE SELECTION (MAPID SINI Grid & Formula Generator)               */}
      {/* ========================================================================= */}
      {activeTab === 'SITE_SELECTION' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Info Card */}
          <div style={{ backgroundColor: '#F8FAFC', borderRadius: '10px', padding: '12px', border: '1px solid #E2E8F0', fontSize: '12.5px', color: '#475569', lineHeight: '18px' }}>
            <strong style={{ color: '#000000' }}>SINI AI Site Selection</strong> membagi peta menjadi grid sel spasial untuk menemukan zona prioritas intervensi infrastruktur disabilitas berdasarkan formula multi-kriteria.
          </div>

          {/* Grid Settings (Sesuai MAPID Screenshot 2) */}
          <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: '700', color: '#000000', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sliders size={16} color="#539BA9" />
              <span>Atur Grid & Wilayah</span>
            </h4>

            {/* Ukuran Grid - satu-satunya parameter yang benar-benar dikirim ke
                server. Pemilih kecamatan dan bentuk grid dihapus: server hanya
                membuat sel kotak untuk seluruh wilayah studi, dan penyaringan
                per kecamatan butuh batas administrasi yang belum kita punya.
                Kontrol yang tidak mengubah apa pun lebih buruk daripada tidak ada. */}
            <div>
              <label style={{ fontSize: '11.5px', color: '#64748B', display: 'block', marginBottom: '4px' }}>Ukuran Sel Grid:</label>
              <select
                value={gridSize}
                onChange={(e) => setGridSize(Number(e.target.value))}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
              >
                <option value={250}>250 meter (paling rinci)</option>
                <option value={500}>500 meter</option>
                <option value={1000}>1000 meter (cakupan terbaik)</option>
              </select>
              <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '4px', lineHeight: '15px' }}>
                Sel kotak untuk seluruh wilayah studi 7 kecamatan Makassar &amp; Gowa.
                Sel yang lebih kecil lebih rinci, tetapi lebih sedikit yang punya data survei.
              </div>
            </div>
          </div>

          {/* Formula penilaian - tetap, dan disebutkan apa adanya */}
          <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: '700', color: '#000000', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={16} color="#FDC323" />
              <span>Hitung Prioritas Perbaikan</span>
            </h4>

            <div style={{ fontSize: '11.5px', color: '#64748B', lineHeight: '17px' }}>
              Setiap sel dinilai dari dua hal: seberapa buruk kondisi aksesibilitas titik
              survei di dalamnya, dan seberapa ramai kegiatan di sekitarnya. Sel dengan
              kondisi buruk sekaligus ramai mendapat prioritas tertinggi.
            </div>

            <button
              onClick={handleComputeSiniGrid}
              disabled={isComputingGrid}
              className="btn-yellow-pill"
              style={{
                width: '100%',
                height: '42px',
                justifyContent: 'center',
                fontSize: '13px',
                marginTop: '4px',
              }}
            >
              <Sparkles size={16} />
              <span>{isComputingGrid ? 'Menghitung prioritas...' : 'Hitung & Tampilkan Grid'}</span>
            </button>
          </div>

          {/* Hasil SINI Grid Priority Summary */}
          {gridResultSummary && (
            <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#000000' }}>Hasil Analisis SINI Grid AI</span>
                <span style={{ fontSize: '11px', backgroundColor: '#10b981', color: '#FFFFFF', padding: '2px 8px', borderRadius: '10px', fontWeight: '700' }}>
                  {gridResultSummary.totalCells} Sel Ter-generate
                </span>
              </div>

              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px', color: '#539BA9', backgroundColor: '#FFFFFF', padding: '6px 10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                Formula: {gridResultSummary.formulaApplied}
              </div>

              {/* Cakupan data disebut di muka. Tanpa ini, peta yang hampir seluruhnya
                  bernilai sama terbaca sebagai fitur rusak, padahal apa adanya. */}
              <div style={{ fontSize: '11px', color: '#64748B', backgroundColor: '#FFFFFF', padding: '6px 10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                <strong style={{ color: '#000000' }}>{gridResultSummary.selBerdata}</strong> dari{' '}
                <strong style={{ color: '#000000' }}>{gridResultSummary.totalCells}</strong> sel punya titik survei
                atau titik ekonomi di bawahnya. Sisanya belum terjangkau data, bukan berprioritas rendah.
              </div>

              <div style={{ fontSize: '12px', fontWeight: '600', color: '#000000', marginTop: '4px' }}>Zona Prioritas Teratas:</div>
              {gridResultSummary.topPriorityZones.length === 0 ? (
                <div style={{ backgroundColor: '#FFFFFF', padding: '10px', borderRadius: '6px', border: '1px dashed #CBD5E1', fontSize: '11.5px', color: '#64748B' }}>
                  Belum ada sel yang punya data pendukung, jadi belum ada zona prioritas yang bisa diurutkan.
                </div>
              ) : (
                gridResultSummary.topPriorityZones.map((z: any, idx: number) => (
                  <div key={idx} style={{ backgroundColor: '#FFFFFF', padding: '8px 10px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700' }}>
                      <span>{idx + 1}. {z.zone}</span>
                      <span style={{ color: '#EF0004' }}>{z.score}/100</span>
                    </div>
                    {z.koordinat && (
                      <div style={{ color: '#94A3B8', fontSize: '10.5px', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>{z.koordinat}</div>
                    )}
                    <div style={{ color: '#64748B', fontSize: '11px', marginTop: '2px' }}>{z.issue}</div>
                  </div>
                ))
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <button
                  onClick={() => {
                    const next = !isGridVisibleOnMap;
                    setIsGridVisibleOnMap(next);
                    if (onToggleSiniGrid) onToggleSiniGrid(next, gridSize);
                  }}
                  style={{
                    width: '100%',
                    padding: '8px',
                    borderRadius: '8px',
                    backgroundColor: isGridVisibleOnMap ? '#539BA9' : '#E2E8F0',
                    color: isGridVisibleOnMap ? '#FFFFFF' : '#000000',
                    border: 'none',
                    fontWeight: '700',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  {isGridVisibleOnMap ? '✓ Sembunyikan Grid dari Peta' : '🗺️ Tampilkan Grid di Peta'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: SITE ANALYSIS (Demography, Isochrone, POI, Land Value)             */}
      {/* ========================================================================= */}
      {activeTab === 'SITE_ANALYSIS' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Action: Pick Point on Map (Sesuai MAPID Screenshot 1) */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => {
                if (onSelectCoordinateForAnalysis) onSelectCoordinateForAnalysis();
              }}
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: '10px',
                backgroundColor: '#539BA9',
                color: '#FFFFFF',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                fontSize: '12.5px',
                fontWeight: '700',
                cursor: 'pointer',
              }}
            >
              <MapPin size={16} />
              <span>Klik di Peta untuk Analisis</span>
            </button>

            <button
              onClick={() => handleRunSiteAnalysis()}
              className="btn-yellow-pill"
              style={{
                height: 'auto',
                padding: '0 16px',
                fontSize: '12.5px',
              }}
            >
              <span>Mulai SINI AI</span>
            </button>

            {siteAnalysisData && (
              <button
                type="button"
                onClick={() => {
                  setSiteAnalysisData(null);
                  if (onClearAnalysis) onClearAnalysis();
                }}
                style={{
                  padding: '0 12px',
                  borderRadius: '10px',
                  backgroundColor: '#FEE2E2',
                  color: '#DC2626',
                  border: '1px solid #FECACA',
                  fontSize: '12px',
                  fontWeight: '700',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title="Hapus lingkaran analisis dari peta"
              >
                <span>Hapus</span>
              </button>
            )}
          </div>

          {/* Isochrone Settings Card (Sesuai MAPID Screenshot 1) */}
          <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: '700', color: '#000000', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Clock size={16} color="#539BA9" />
              <span>Parameter Isokron Waktu Tempuh</span>
            </h4>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', color: '#64748B', display: 'block', marginBottom: '3px' }}>Moda Aksesibilitas:</label>
                <select
                  value={isochroneMode}
                  onChange={(e: any) => setIsochroneMode(e.target.value)}
                  style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                >
                  <option value="wheelchair">Kursi Roda (Difabel)</option>
                  <option value="walking">Pejalan Kaki (Tunanetra)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: '#64748B', display: 'block', marginBottom: '3px' }}>Waktu Tempuh:</label>
                <select
                  value={isochroneMinutes}
                  onChange={(e) => setIsochroneMinutes(Number(e.target.value))}
                  style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                >
                  <option value={5}>5 Menit (~300m)</option>
                  <option value={10}>10 Menit (~600m)</option>
                  <option value={15}>15 Menit (~900m)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Results: Sesuai MAPID Screenshot 1 & 3 */}
          {isAnalyzingSite ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="skeleton" style={{ height: '80px', width: '100%' }} />
              <div className="skeleton" style={{ height: '120px', width: '100%' }} />
            </div>
          ) : gagalAnalisis ? (
            <div role="alert" style={{ backgroundColor: '#FEE2E2', border: '1px solid #FECACA', color: '#991B1B', borderRadius: '10px', padding: '12px', fontSize: '12px' }}>
              {gagalAnalisis}
            </div>
          ) : siteAnalysisData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Card 1: Jangkauan tempuh - satu-satunya angka geometris yang dihitung server */}
              <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#539BA9', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Clock size={15} />
                  <span>Jangkauan {siteAnalysisData.isochrone.mode}</span>
                </div>
                <div style={{ fontSize: '13px', fontWeight: '800', color: '#000000' }}>
                  Radius {siteAnalysisData.isochrone.radiusMeters} m
                  {siteAnalysisData.isochrone.areaSqKm != null && ` · ${siteAnalysisData.isochrone.areaSqKm} km²`}
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                  Lingkaran radius, bukan isokron jaringan jalan · titik {siteAnalysisData.coordinates}
                </div>
              </div>

              {/* Card 2: Data yang DifaMap belum punya sumbernya.
                  Dikosongkan dengan terang-terangan, bukan diisi perkiraan. */}
              <div style={{ backgroundColor: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <Users size={15} />
                  <span>Demografi &amp; Nilai Tanah</span>
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748B', lineHeight: '17px' }}>
                  Belum tersedia. DifaMap belum punya sumber data jumlah penduduk, batas kecamatan,
                  maupun nilai tanah untuk titik ini.
                </div>
              </div>

              {/* Card 3: Point of Interest Catchment (Screenshot 3) */}
              <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#000000' }}>Point of Interest</span>
                  <span style={{ fontSize: '12px', fontWeight: '800', color: '#539BA9' }}>
                    {siteAnalysisData.poiCatchment.total} titik dalam radius
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(() => {
                    // Skala batang mengikuti kategori terbanyak pada radius ini.
                    // Pembagi tetap membuat seluruh batang tak terlihat ketika
                    // angkanya kecil - dan angka kecil memang yang sebenarnya.
                    const tertinggi = Math.max(
                      1,
                      ...siteAnalysisData.poiCatchment.categories.map((c: any) => c.count)
                    );
                    return siteAnalysisData.poiCatchment.categories.map((c: any, i: number) => (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: '600' }}>
                          <span>{c.name}</span>
                          <span>{c.count}</span>
                        </div>
                        <div style={{ height: '6px', width: '100%', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              width: `${(c.count / tertinggi) * 100}%`,
                              backgroundColor: c.color,
                              borderRadius: '4px',
                            }}
                          />
                        </div>
                      </div>
                    ));
                  })()}
                </div>

                <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '8px' }}>
                  Dihitung dari basis data DifaMap sendiri: titik survei dan titik ekonomi
                  Menu Go / Properti Go, bukan seluruh POI komersial Makassar.
                </div>
              </div>

              {/* Card 4: Rekomendasi Aksesibilitas - disusun dari lokasi survei di radius ini */}
              <div style={{ backgroundColor: 'rgba(253, 195, 35, 0.12)', border: '1px solid #FDC323', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#000000', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <Accessibility size={16} />
                  <span>Indeks Prioritas Aksesibilitas DifaMap</span>
                </div>
                {siteAnalysisData.accessibilityRecommendation.skorRata != null && (
                  <div style={{ fontSize: '13px', fontWeight: '800', color: '#000000', marginBottom: '4px' }}>
                    Skor aksesibilitas rata-rata: {siteAnalysisData.accessibilityRecommendation.skorRata.toFixed(2)} / 5
                  </div>
                )}
                <div style={{ fontSize: '12px', color: '#334155', lineHeight: '18px' }}>
                  {siteAnalysisData.accessibilityRecommendation.action}
                </div>
                {siteAnalysisData.accessibilityRecommendation.belumTeramati > 0 && (
                  <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '6px' }}>
                    {siteAnalysisData.accessibilityRecommendation.belumTeramati} dari{' '}
                    {siteAnalysisData.accessibilityRecommendation.totalParameterDiperiksa} parameter belum
                    teramati di foto survei, jadi hambatan sebenarnya bisa lebih banyak daripada yang tercatat.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '30px 16px', color: '#767676', fontSize: '12.5px', border: '1px dashed #CBD5E1', borderRadius: '10px' }}>
              Klik tombol <strong>"Klik di Peta untuk Analisis"</strong> atau <strong>"Mulai SINI AI"</strong> untuk menguji daya jangkau isokron dan catchment ekonomi POI di titik terpilih.
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
