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

export type SiniAiTab = 'CHAT' | 'SITE_SELECTION' | 'SITE_ANALYSIS';

interface AiChatbotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLocationId?: string;
  onToggleSiniGrid?: (show: boolean, gridSize?: number) => void;
  onRunIsochroneAnalysis?: (lat: number, lng: number, mode?: 'walking' | 'wheelchair') => void;
  onSelectCoordinateForAnalysis?: () => void;
  analysisTarget?: { lat: number; lng: number; name?: string } | null;
}

export default function AiChatbotDrawer({
  isOpen,
  onClose,
  selectedLocationId,
  onToggleSiniGrid,
  onRunIsochroneAnalysis,
  onSelectCoordinateForAnalysis,
  analysisTarget,
}: AiChatbotDrawerProps) {
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
  const [targetZone, setTargetZone] = useState('Semua 7 Zona Kecamatan');
  const [gridSize, setGridSize] = useState<number>(1000);
  const [gridShape, setGridShape] = useState<'square' | 'hexagon'>('square');
  const [formulaPrompt, setFormulaPrompt] = useState('Cari zona dengan halte transit dan faskes ramai yang membutuhkan perbaikan guiding block & ramp');
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

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

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
      setGridResultSummary({
        totalCells: res.data?.features?.length || 360,
        formulaApplied: `0.6 × Bobot_Kerusakan + 0.4 × Kepadatan_POIs`,
        topPriorityZones: [
          { zone: 'Koridor Jl. Hertasning (Panakkukang)', score: 88, issue: 'Guiding block terputus & ramp curam' },
          { zone: 'Kawasan Transit Halte Karebosi (Ujung Pandang)', score: 82, issue: 'Trotoar sempit & paving rusak' },
          { zone: 'Area Perintis Kemerdekaan (Tamalanrea)', score: 76, issue: 'Kurang penerangan malam & tanpa ramp' },
        ],
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
    try {
      setIsAnalyzingSite(true);
      if (onRunIsochroneAnalysis) {
        onRunIsochroneAnalysis(lat, lng, isochroneMode);
      }

      // Synthesize Site Analysis Output (Demografi, Isokron, POI Catchment)
      setTimeout(() => {
        setSiteAnalysisData({
          name: locName || 'Titik Analisis Terpilih',
          coordinates: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
          demography: {
            subdistrict: 'TAMALANREA INDAH, KEC. TAMALANREA',
            city: 'KOTA MAKASSAR, SULAWESI SELATAN',
            estimatedPopulation: '30.232 Jiwa',
          },
          isochrone: {
            mode: isochroneMode === 'wheelchair' ? 'Kursi Roda' : 'Jalan Kaki',
            radiusMeters: isochroneMinutes * (isochroneMode === 'wheelchair' ? 60 : 80),
            areaSqKm: '1.13 km²',
          },
          landAndDisaster: {
            estimatedLandValue: 'Rp 1.425.000 / m²',
            landUse: 'Jasa & Fasilitas Umum / Permukiman',
            floodRisk: 'RENDAH - SEDANG',
          },
          poiCatchment: {
            total: 1082,
            categories: [
              { name: 'Perdagangan & Retail', count: 397, color: '#38bdf8' },
              { name: 'Layanan atau Jasa', count: 231, color: '#ec4899' },
              { name: 'Kesehatan & Pengobatan', count: 136, color: '#10b981' },
              { name: 'Makanan & Minuman (Menu Go)', count: 77, color: '#FDC323' },
            ],
          },
          accessibilityRecommendation: {
            score: 3.8,
            priorityIndex: 78.5,
            action: 'Prioritas Tinggi: Modifikasi kelandaian ramp akses masuk (<8%) dan penyambungan ubin pemandu tunanetra di radius 300m.',
          },
        });
        setIsAnalyzingSite(false);
      }, 500);
    } catch (err) {
      console.error('Site analysis error:', err);
      setIsAnalyzingSite(false);
    }
  };

  return (
    <aside
      className="animate-slide-in"
      style={{
        position: 'fixed',
        right: '24px',
        top: '24px',
        bottom: '24px',
        width: '460px',
        maxWidth: 'calc(100vw - 48px)',
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.18)',
        border: '1px solid rgba(0, 0, 0, 0.08)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* 1. Header with MAPID SINI AI Branding */}
      <div
        style={{
          padding: '16px 20px',
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

        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '50%',
            color: '#000000',
          }}
        >
          <X size={20} />
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
              placeholder="Tanyakan rute aman atau fasilitas ramah difabel..."
              style={{
                flex: 1,
                padding: '9px 14px',
                borderRadius: '50px',
                border: '1px solid #CBD5E1',
                outline: 'none',
                fontSize: '13px',
              }}
            />

            <button
              type="submit"
              disabled={isSending || !inputText.trim()}
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                backgroundColor: '#539BA9',
                border: 'none',
                color: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: isSending || !inputText.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              <Send size={16} />
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

            {/* Wilayah Administrasi */}
            <div>
              <label style={{ fontSize: '11.5px', color: '#64748B', display: 'block', marginBottom: '4px' }}>Cari Level Administrasi:</label>
              <select
                value={targetZone}
                onChange={(e) => setTargetZone(e.target.value)}
                style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
              >
                <option value="Semua 7 Zona Kecamatan">Semua 7 Zona (Makassar & Gowa)</option>
                <option value="Kecamatan Panakkukang">Kecamatan Panakkukang</option>
                <option value="Kecamatan Tamalanrea">Kecamatan Tamalanrea</option>
                <option value="Kecamatan Ujung Pandang">Kecamatan Ujung Pandang</option>
                <option value="Kecamatan Rappocini">Kecamatan Rappocini</option>
                <option value="Kecamatan Somba Opu (Gowa)">Kecamatan Somba Opu (Gowa)</option>
              </select>
            </div>

            {/* Bentuk & Ukuran Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '11.5px', color: '#64748B', display: 'block', marginBottom: '4px' }}>Bentuk Grid:</label>
                <input
                  type="text"
                  readOnly
                  value="square"
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', fontSize: '12px' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '11.5px', color: '#64748B', display: 'block', marginBottom: '4px' }}>Ukuran Grid (meter):</label>
                <select
                  value={gridSize}
                  onChange={(e) => setGridSize(Number(e.target.value))}
                  style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                >
                  <option value={500}>500 meter</option>
                  <option value={1000}>1000 meter</option>
                </select>
              </div>
            </div>
          </div>

          {/* Buat Formula AI (Sesuai MAPID Screenshot 2) */}
          <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: '700', color: '#000000', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={16} color="#FDC323" />
              <span>Buat Formula SINI AI</span>
            </h4>

            <div>
              <label style={{ fontSize: '11.5px', color: '#64748B', display: 'block', marginBottom: '4px' }}>Ketik Kebutuhan / Prompt Spasial Anda:</label>
              <textarea
                rows={3}
                value={formulaPrompt}
                onChange={(e) => setFormulaPrompt(e.target.value)}
                placeholder="Ketik kebutuhan analisis lokasi Anda..."
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '12.5px',
                  fontFamily: 'inherit',
                  resize: 'none',
                }}
              />
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
              <span>{isComputingGrid ? 'Menghitung Grid SINI AI...' : 'Buat Formula & Tampilkan Grid'}</span>
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

              <div style={{ fontSize: '12px', fontWeight: '600', color: '#000000', marginTop: '4px' }}>Zona Prioritas Teratas:</div>
              {gridResultSummary.topPriorityZones.map((z: any, idx: number) => (
                <div key={idx} style={{ backgroundColor: '#FFFFFF', padding: '8px 10px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700' }}>
                    <span>{idx + 1}. {z.zone}</span>
                    <span style={{ color: '#EF0004' }}>{z.score}/100</span>
                  </div>
                  <div style={{ color: '#64748B', fontSize: '11px', marginTop: '2px' }}>{z.issue}</div>
                </div>
              ))}

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
          ) : siteAnalysisData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Card 1: Demografi & Lokasi (Screenshot 1) */}
              <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#539BA9', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <Users size={15} />
                  <span>Demografi & Administrasi</span>
                </div>
                <div style={{ fontSize: '13px', fontWeight: '800', color: '#000000' }}>
                  Jumlah Penduduk: {siteAnalysisData.demography.estimatedPopulation}
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                  {siteAnalysisData.demography.subdistrict}, {siteAnalysisData.demography.city}
                </div>
              </div>

              {/* Card 2: Guna & Nilai Tanah (Screenshot 3) */}
              <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#000000', marginBottom: '4px' }}>
                  Guna & Perkiraan Nilai Tanah
                </div>
                <div style={{ fontSize: '13px', fontWeight: '800', color: '#10b981' }}>
                  {siteAnalysisData.landAndDisaster.estimatedLandValue}
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748B' }}>
                  Perkiraan Guna Lahan: {siteAnalysisData.landAndDisaster.landUse}
                </div>
              </div>

              {/* Card 3: Point of Interest Catchment (Screenshot 3) */}
              <div style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <span style={{ fontSize: '13px', fontWeight: '700', color: '#000000' }}>Point of Interest</span>
                  <span style={{ fontSize: '12px', fontWeight: '800', color: '#539BA9' }}>
                    {siteAnalysisData.poiCatchment.total} Total POIs
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {siteAnalysisData.poiCatchment.categories.map((c: any, i: number) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: '600' }}>
                        <span>{c.name}</span>
                        <span>{c.count}</span>
                      </div>
                      <div style={{ height: '6px', width: '100%', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                        <div
                          style={{
                            height: '100%',
                            width: `${(c.count / 400) * 100}%`,
                            backgroundColor: c.color,
                            borderRadius: '4px',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Card 4: Rekomendasi Aksesibilitas AI */}
              <div style={{ backgroundColor: 'rgba(253, 195, 35, 0.12)', border: '1px solid #FDC323', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: '700', color: '#000000', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <Accessibility size={16} />
                  <span>Indeks Prioritas Aksesibilitas DifaMap</span>
                </div>
                <div style={{ fontSize: '12px', color: '#334155', lineHeight: '18px' }}>
                  {siteAnalysisData.accessibilityRecommendation.action}
                </div>
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
