'use client';

import React, { useState, useRef, useEffect } from 'react';
import type { RuteDigambar } from '../../data/rute';
import TeksKaya from './TeksKaya';
import MemuatAI from '../common/MemuatAI';
import {
  X,
  Sparkles,
  Send,
  MapPin,
  Compass,
  Layers,
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

/**
 * Isi panel kanan, ditentukan oleh sidebar mana yang sedang aktif.
 *
 * Dulu ketiganya berbagi satu panel dengan tab di atasnya, dan itu
 * mencampur dua pemakai yang berbeda: penyandang disabilitas yang bertanya
 * soal perjalanannya, dan perencana kota yang mencari zona prioritas. Tab
 * membuat keduanya harus melewati menu milik orang lain lebih dulu.
 */
export type TampilanPanel = 'CHAT' | 'PERENCANA';

/**
 * Parameter yang dipakai menilai sel grid.
 *
 * Dinamai menurut yang dihitung, bukan menurut siapa yang memakainya. Satu
 * orang bisa memerlukan ketiganya dalam satu duduk, dan menyebutnya "dinas"
 * atau "developer" justru mempersempitnya tanpa alasan.
 */
export type ModaGrid = 'AKSESIBILITAS' | 'HUNIAN' | 'KOMERSIAL';

const MODA_GRID: Array<{ kunci: ModaGrid; label: string; jelas: string }> = [
  {
    kunci: 'AKSESIBILITAS',
    label: 'Aksesibilitas & Keramaian',
    jelas: 'Sel bernilai tinggi: banyak orang melewatinya, tetapi kondisinya buruk.',
  },
  {
    kunci: 'HUNIAN',
    label: 'Hunian & Akses Transit',
    jelas: 'Sel bernilai tinggi: ada tempat tinggal terdata, tetapi jalan menuju transit buruk atau transitnya belum terdata.',
  },
  {
    kunci: 'KOMERSIAL',
    label: 'Komersial & Fasilitas Difabel',
    jelas: 'Sel bernilai tinggi: ada usaha yang terbukti ramai, tetapi lingkungannya belum ramah difabel.',
  },
];

/** Hasil analisis satu titik dari server, termasuk wawasan Difa AI. */
interface PutusanBanding {
  unggul: 'A' | 'B' | 'SEIMBANG';
  ringkasan: string;
  alasan: string[];
  catatan: string;
}

interface AnalisisTitik {
  namaWilayah: string | null;
  koordinat?: { latitude: number; longitude: number };
  cakupanIsokron: { persen: number; petakBerdata: number; petakTotal: number; radiusUjiMeter: number } | null;
  isokronNyata: boolean;
  pita: Array<{ menit: number; jumlahTitik: number; skorRata: number | null; luasKm2: number | null }>;
  terjangkau: Array<{ nama: string; skor: number | null; jenis: string; jarakMeter: number; menit: number | null }>;
  terdekat: Array<{ kebutuhan: string; nama: string | null; skor: number | null; jarakMeter: number | null; didalamJangkauan: boolean }>;
  cakupan: { didalam: number; diluar: number };
  skenario: Array<{
    nama: string;
    jenis: string;
    menit: number | null;
    jarakMeter: number;
    skor: number | null;
    hambatan: string[];
    dampak: string[];
    nilaiDampak: number;
  }>;
  wawasan: { ringkasan: string; temuan: string[]; perbaikan: string; catatan: string } | null;
}

interface WawasanGrid {
  ringkasan: string;
  sel: Array<{ gridId: string; judul: string; alasan: string; tindakan: string }>;
}

/** Alat mana yang sedang dibuka di panel Urban Planner. */
export type AlatPerencana = 'SELECTION' | 'ANALYSIS';

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
  onToggleSiniGrid?: (show: boolean, gridSize?: number, moda?: string) => void;
  /** Menyorot satu sel grid di peta, dipanggil dari daftar prioritas. */
  onSorotSel?: (gridId: string | null) => void;
  /** Meneruskan ringkasan Difa AI supaya bisa ditampilkan di atas peta. */
  onWawasanGrid?: (ringkasan: string | null) => void;
  onRunIsochroneAnalysis?: (lat: number, lng: number, mode?: 'walking' | 'wheelchair') => void;
  onClearAnalysis?: () => void;
  onSelectCoordinateForAnalysis?: () => void;
  /**
   * Membuka panel detail sebuah titik survei dari kartu rujukan jawaban.
   *
   * Difa AI menyebut nama titik yang jadi dasar jawabannya, tetapi nama itu
   * hanya teks - pengguna harus mencarinya sendiri di peta untuk melihat
   * fotonya. Kartu menjadikan dasar penilaian itu satu ketukan saja.
   */
  onSelectLocation?: (lokasi: any) => void;
  /** Meneruskan jalur rute dari jawaban Difa AI supaya digambar di peta. */
  onRuteDitemukan?: (rute: RuteDigambar | null) => void;
  /** Isi panel: percakapan saja, atau kedua alat perencanaan sekaligus. */
  tampilan?: TampilanPanel;
  analysisTarget?: { lat: number; lng: number; name?: string } | null;
  /** Titik kedua yang dipilih pengguna untuk dibandingkan. */
  compareTarget?: { lat: number; lng: number } | null;
  onSelectCoordinateForCompare?: () => void;
  onClearCompare?: () => void;
  /** Meneruskan koordinat titik yang sedang dianalisis, untuk ditandai di peta. */
  onTitikAnalisis?: (koordinat: { latitude: number; longitude: number } | null) => void;
}

export default function AiChatbotDrawer({
  isOpen,
  onClose,
  selectedLocationId,
  onToggleSiniGrid,
  onSorotSel,
  onWawasanGrid,
  onRunIsochroneAnalysis,
  onClearAnalysis,
  onSelectCoordinateForAnalysis,
  onSelectLocation,
  onRuteDitemukan,
  tampilan = 'CHAT',
  analysisTarget,
  compareTarget,
  onSelectCoordinateForCompare,
  onClearCompare,
  onTitikAnalisis,
}: AiChatbotDrawerProps) {
  const isMobile = useIsMobile(768);
  // Sidebar menentukan ISI panel; di dalam panel Urban Planner, dua alatnya
  // masih bergantian lewat tombol geser di bawah ini.
  const [alatPerencana, setAlatPerencana] = useState<AlatPerencana>('SELECTION');

  // ----------------------------------------------------
  // State: Tab 1 (Chatbot Spatial RAG)
  // ----------------------------------------------------
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; rujukan?: any[] }>>([
    {
      role: 'assistant',
      content:
        [
          'Halo! Saya **Difa AI**.',
          '',
          'Saya tidak menebak dari peta jalan. Saya membaca **titik survei lapangan DifaMap** beserta fotonya, lalu menilai sendiri apa yang terlihat di sana.',
          '',
          '### Yang tidak bisa dilakukan aplikasi peta biasa',
          '- **Menilai rute dari kondisi trotoarnya**, bukan dari jaraknya. Jalur terpendek kadang justru saya tolak, dan alasannya saya sebutkan.',
          '- **Memberi tahu apa yang harus diwaspadai di sepanjang jalan** - trotoar yang putus, ubin pemandu rusak, motor parkir di atasnya. Saya membaca foto surveyornya, bukan hanya angkanya.',
          '- **Memeriksa tempat tujuan sebelum Anda berangkat** - ada ramp atau tidak, ubin pemandunya utuh atau terputus, ada tempat duduk untuk beristirahat.',
          '',
          'Saya juga akan berterus terang bila sebuah tempat belum pernah disurvei. "Belum teramati" tidak pernah saya artikan "aman".',
          '',
          'Coba salah satu saran di bawah, atau tanyakan apa saja.',
        ].join('\n'),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ----------------------------------------------------
  // State: Tab 2 (Site Selection - grid prioritas Difa AI)
  // ----------------------------------------------------
  const [gridSize, setGridSize] = useState<number>(1000);
  const [gridModa, setGridModa] = useState<ModaGrid>('AKSESIBILITAS');
  const [wawasanGrid, setWawasanGrid] = useState<WawasanGrid | null>(null);
  const [analisisTitik, setAnalisisTitik] = useState<AnalisisTitik | null>(null);
  const [sedangMenyusunTitik, setSedangMenyusunTitik] = useState(false);
  const [banding, setBanding] = useState<{ a: AnalisisTitik; b: AnalisisTitik; putusan: PutusanBanding | null } | null>(null);
  const [sedangMembandingkan, setSedangMembandingkan] = useState(false);
  const [sedangMenyusunWawasan, setSedangMenyusunWawasan] = useState(false);
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

  // Mobile Draggable Bottom Sheet State
  const [sheetMode, setSheetMode] = useState<'peek' | 'expanded'>('peek');
  const [dragDeltaY, setDragDeltaY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [windowHeight, setWindowHeight] = useState(800);
  const touchStartYRef = useRef(0);
  const touchCurrentYRef = useRef(0);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWindowHeight(window.innerHeight);
      const handleResize = () => setWindowHeight(window.innerHeight);
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, []);

  // Batas aman atas: minimal 132px dari tepi atas layar agar bilah pencarian & tombol filter tidak tertimpa
  const topSafetyOffset = 132;
  const maxAllowedHeight = Math.max(300, windowHeight - topSafetyOffset);
  const expandedHeight = tampilan === 'PERENCANA'
    ? Math.min(maxAllowedHeight, Math.round(windowHeight * 0.74))
    : Math.min(maxAllowedHeight, Math.round(windowHeight * 0.82));
  const peekHeight = tampilan === 'PERENCANA'
    ? Math.min(340, Math.max(240, Math.round(windowHeight * 0.40)))
    : Math.min(360, Math.max(250, Math.round(windowHeight * 0.44)));
  const peekOffset = Math.max(0, expandedHeight - peekHeight);

  // Animasi tutup halus (slide down ke bawah layar) tanpa langsung hilang mendadak
  const triggerClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 260);
  };

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, []);

  // Reset mode bottom sheet & trigger animasi masuk saat drawer dibuka atau berganti mode tampilan
  useEffect(() => {
    if (isOpen) {
      setSheetMode('peek');
      setDragDeltaY(0);
      setIsDragging(false);
      setIsClosing(false);
      setIsMounted(false);
      const t = requestAnimationFrame(() => setIsMounted(true));
      return () => cancelAnimationFrame(t);
    }
  }, [isOpen, tampilan]);

  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Handle ESC key to smoothly close AiChatbotDrawer
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        triggerClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isClosing]);

  // When analysisTarget changes (user picked point on map), trigger Site Analysis automatically
  useEffect(() => {
    if (analysisTarget && tampilan === 'PERENCANA') {
      // Titik yang baru dipilih di peta selalu untuk Site Analysis, jadi
      // alatnya ikut berpindah sendiri - tanpa ini, hasilnya mendarat di balik
      // tab yang sedang tidak terlihat.
      setAlatPerencana('ANALYSIS');
      handleRunSiteAnalysis(analysisTarget.lat, analysisTarget.lng, analysisTarget.name);
    }
  }, [analysisTarget]);

  /**
   * Menjalankan pembandingan begitu titik kedua dipilih di peta.
   *
   * Titik pertamanya diambil dari analisis yang sedang terbuka, jadi urutannya
   * selalu: analisis satu titik dulu, baru pilih pembandingnya.
   */
  useEffect(() => {
    if (!compareTarget || !analisisTitik?.koordinat) return;

    const a = analisisTitik.koordinat;
    setSedangMembandingkan(true);
    setBanding(null);

    difaMapApi
      .compareSites(
        { lat: a.latitude, lng: a.longitude },
        { lat: compareTarget.lat, lng: compareTarget.lng },
        isochroneMode
      )
      .then((r) => setBanding(r?.data ?? null))
      .catch(() => setBanding(null))
      .finally(() => setSedangMembandingkan(false));
    // Sengaja hanya bergantung pada titik kedua: mengubah moda tidak boleh
    // memicu perbandingan ulang tanpa diminta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareTarget]);

  if (!isOpen && !isClosing) return null;

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
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: reply, rujukan: response.data?.referencedLocations ?? [] },
      ]);

      // Jalur rute hanya ada bila pertanyaannya berbentuk perjalanan. Bila
      // tidak, peta dibersihkan supaya rute lama tidak tertinggal menempel di
      // layar saat pertanyaan sudah berganti topik.
      const r = response.data?.rute;
      onRuteDitemukan?.(
        r?.jalur?.length > 1
          ? { awal: r.awal, tujuan: r.tujuan, jalur: r.jalur, pilihan: r.pilihan ?? [] }
          : null
      );
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

  // Handler: Execute Difa AI Site Selection Grid
  const handleComputeSiniGrid = async () => {
    try {
      setIsComputingGrid(true);
      const res = await difaMapApi.getSiniGridPriority(gridSize, gridModa);
      const features: any[] = res.data?.features ?? [];

      // Sel tanpa titik survei bernilai null dari server, bukan angka tengah
      // hasil tebakan. Sel seperti itu bukan "prioritas rendah" - melainkan
      // belum terjangkau data, dan tidak layak muncul sebagai temuan.
      const selBerdata = features.filter(
        (f) => f.properties?.priorityIndex !== null && f.properties?.priorityIndex !== undefined
      );

      const tigaTeratas = [...selBerdata]
        .sort((a, b) => (b.properties?.priorityIndex ?? 0) - (a.properties?.priorityIndex ?? 0))
        .slice(0, 5)
        .map((f) => {
          const p = f.properties ?? {};
          const [lng, lat] = p.center ?? [];
          return {
            zone: p.gridId ?? 'Sel tanpa nama',
            wilayah: p.namaWilayah ?? null,
            koordinat:
              typeof lat === 'number' && typeof lng === 'number'
                ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
                : null,
            lat,
            lng,
            score: Math.round(p.priorityIndex ?? 0),
            issue: p.recommendedIntervention ?? 'Belum ada rekomendasi',
            jumlahTitik: p.jumlahTitik ?? 0,
            skorAkses: p.accessibilityScore,
            hambatan: Array.isArray(p.hambatan) ? p.hambatan : [],
          };
        });

      setGridResultSummary({
        totalCells: features.length,
        selBerdata: selBerdata.length,
        formulaApplied: MODA_GRID.find((m) => m.kunci === gridModa)?.label ?? gridModa,
        topPriorityZones: tigaTeratas,
      });

      // Penjelasan naratif diminta terpisah supaya peta tidak menunggu AI.
      setWawasanGrid(null);
      setSedangMenyusunWawasan(true);
      difaMapApi
        .getSiniGridInsight(gridSize, gridModa)
        .then((w) => {
          setWawasanGrid(w?.data ?? null);
          onWawasanGrid?.(w?.data?.ringkasan ?? null);
        })
        .catch(() => {
          setWawasanGrid(null);
          onWawasanGrid?.(null);
        })
        .finally(() => setSedangMenyusunWawasan(false));

      setIsGridVisibleOnMap(true);
      if (onToggleSiniGrid) {
        onToggleSiniGrid(true, gridSize, gridModa);
      }
    } catch (err) {
      console.error('Gagal menghitung grid prioritas Difa AI:', err);
    } finally {
      setIsComputingGrid(false);
    }
  };

  /**
   * Menyimpan daftar kerja sebagai CSV.
   *
   * Titik koma sebagai pemisah, bukan koma: Excel berbahasa Indonesia membaca
   * koma sebagai pemisah desimal, dan file berkoma mendarat menumpuk di satu
   * kolom. Tanda BOM di depan supaya huruf beraksen tidak berubah jadi simbol.
   */
  const unduhDaftarKerja = () => {
    const zona = gridResultSummary?.topPriorityZones ?? [];
    if (zona.length === 0) return;

    const aman = (nilai: unknown) => `"${String(nilai ?? '').replace(/"/g, '""')}"`;

    const baris = [
      ['No', 'Daerah', 'Kode Sel', 'Lintang', 'Bujur', 'Nilai Prioritas', 'Skor Aksesibilitas', 'Jumlah Titik Survei', 'Hambatan Tercatat', 'Tindakan'],
      ...zona.map((z: any, i: number) => {
        const w = wawasanGrid?.sel.find((x) => x.gridId === z.zone);
        return [
          i + 1,
          z.wilayah ?? '',
          z.zone,
          typeof z.lat === 'number' ? z.lat.toFixed(6) : '',
          typeof z.lng === 'number' ? z.lng.toFixed(6) : '',
          z.score,
          z.skorAkses ?? '',
          z.jumlahTitik,
          z.hambatan.join('; '),
          w?.tindakan ?? '',
        ];
      }),
    ]
      .map((r) => r.map(aman).join(';'))
      .join('\r\n');

    const berkas = new Blob(['\ufeff' + baris], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(berkas);
    const tautan = document.createElement('a');
    tautan.href = url;
    tautan.download = `difamap-prioritas-${gridModa.toLowerCase()}-${gridSize}m.csv`;
    tautan.click();
    URL.revokeObjectURL(url);
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

      // Analisis titik lengkap dari server - jangkauan per pita waktu, apa yang
      // benar-benar terjangkau lewat jalan, titik terdekat per kebutuhan, dan
      // wawasan Difa AI. Dimulai lebih dulu supaya berjalan bersamaan dengan
      // permintaan lain yang dipakai kartu ringkasan lama.
      setAnalisisTitik(null);
      setSedangMenyusunTitik(true);
      setBanding(null);
      onClearCompare?.();
      const janjiTitik = difaMapApi
        .getSiteInsight(lat, lng, isochroneMode, [5, 10, isochroneMinutes > 10 ? isochroneMinutes : 15])
        .then((r) => {
          setAnalisisTitik(r?.data ?? null);
          onTitikAnalisis?.(r?.data?.koordinat ?? null);
        })
        .catch(() => setAnalisisTitik(null))
        .finally(() => setSedangMenyusunTitik(false));

      void janjiTitik;

      // Tiga sumber data nyata, diminta bersamaan supaya tidak menunggu berantai.
      const [isokron, sekitar, ekonomi] = await Promise.all([
        difaMapApi.getIsochrone(lat, lng, [isochroneMinutes], isochroneMode),
        difaMapApi.getNearbyLocations(lat, lng, radiusJangkauan, 100),
        difaMapApi.getEconomicPoints('ALL'),
      ]);

      const sifatIsokron = isokron?.data?.features?.[0]?.properties ?? {};
      // Server mengembalikan isokron sungguhan bila OpenRouteService tersedia,
      // dan jatuh ke lingkaran radius bila tidak. Keduanya sah, tetapi artinya
      // berbeda - jadi asalnya ikut dibawa dan disebutkan ke pengguna.
      const isokronNyata = isokron?.sumber === 'openrouteservice';
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
          nyata: isokronNyata,
          menit: isochroneMinutes,
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

  // Handler drag gesture untuk mobile bottom sheet
  const handleDragStart = (e: React.TouchEvent) => {
    if (!isMobile) return;
    touchStartYRef.current = e.touches[0].clientY;
    touchCurrentYRef.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleDragMove = (e: React.TouchEvent) => {
    if (!isMobile || !isDragging) return;
    const currentY = e.touches[0].clientY;
    touchCurrentYRef.current = currentY;
    const delta = currentY - touchStartYRef.current;
    setDragDeltaY(delta);
  };

  const handleDragEnd = () => {
    if (!isMobile || !isDragging) return;
    setIsDragging(false);
    const delta = touchCurrentYRef.current - touchStartYRef.current;
    setDragDeltaY(0);

    if (sheetMode === 'peek') {
      if (delta < -45) {
        setSheetMode('expanded');
      } else if (delta > 70) {
        triggerClose();
      } else {
        setSheetMode('peek');
      }
    } else {
      if (delta > 220 || delta > peekOffset + 40) {
        triggerClose();
      } else if (delta > 55) {
        setSheetMode('peek');
      } else {
        setSheetMode('expanded');
      }
    }
  };

  const handleBodyTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return;
    touchStartYRef.current = e.touches[0].clientY;
    touchCurrentYRef.current = e.touches[0].clientY;
    const target = e.currentTarget as HTMLElement;
    if (sheetMode === 'peek' || (target && target.scrollTop <= 0)) {
      setIsDragging(true);
    }
  };

  const handleBodyTouchMove = (e: React.TouchEvent) => {
    if (!isMobile || !isDragging) return;
    const currentY = e.touches[0].clientY;
    touchCurrentYRef.current = currentY;
    const delta = currentY - touchStartYRef.current;

    if (sheetMode === 'peek') {
      setDragDeltaY(delta);
    } else {
      const target = e.currentTarget as HTMLElement;
      if (target && target.scrollTop <= 0 && delta > 0) {
        setDragDeltaY(delta);
      } else if (delta < 0) {
        setIsDragging(false);
        setDragDeltaY(0);
      }
    }
  };

  const handleBodyTouchEnd = () => {
    if (!isMobile || !isDragging) return;
    handleDragEnd();
  };

  // Posisi vertikal GPU-accelerated: 0 = expanded (di bawah bilah atas), peekOffset = peek mode, expandedHeight + 120 = offscreen
  const currentTranslateY = (() => {
    if (!isMobile) return 0;
    if (!isMounted || isClosing) {
      return expandedHeight + 120;
    }
    const baseTranslateY = sheetMode === 'peek' ? peekOffset : 0;
    if (!isDragging) {
      return baseTranslateY;
    }
    const target = baseTranslateY + dragDeltaY;
    // Damping / rubber-band saat ditarik melebihi batas atas expanded agar tidak menimpa search bar
    if (target < 0) {
      return Math.max(-25, target * 0.2);
    }
    return target;
  })();

  return (
    <aside
      className={isMobile ? undefined : 'animate-slide-in'}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: isMobile ? 0 : 'auto',
        right: isMobile ? 0 : '24px',
        top: isMobile ? 'auto' : '96px',
        bottom: isMobile ? 0 : '24px',
        width: isMobile ? '100%' : '460px',
        maxWidth: isMobile ? '100vw' : 'calc(100vw - 48px)',
        height: isMobile ? `${expandedHeight}px` : undefined,
        maxHeight: isMobile ? `${expandedHeight}px` : 'calc(100vh - 48px)',
        transform: isMobile ? `translateY(${currentTranslateY}px)` : undefined,
        transition: isDragging
          ? 'none'
          : 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        backgroundColor: '#FFFFFF',
        borderRadius: isMobile ? '24px 24px 0 0' : '16px',
        boxShadow: isMobile ? '0 -8px 36px rgba(0, 0, 0, 0.25)' : '0 8px 32px rgba(0, 0, 0, 0.18)',
        border: '1px solid rgba(0, 0, 0, 0.08)',
        borderBottom: isMobile ? 'none' : undefined,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        willChange: isMobile ? 'transform' : undefined,
      }}
    >
      {/* 0. Mobile Top Drag Handle Bar */}
      {isMobile && (
        <div
          onTouchStart={handleDragStart}
          onTouchMove={handleDragMove}
          onTouchEnd={handleDragEnd}
          onClick={() => setSheetMode((prev) => (prev === 'peek' ? 'expanded' : 'peek'))}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: '10px',
            paddingBottom: '2px',
            cursor: 'grab',
            touchAction: 'none',
            backgroundColor: '#FFFFFF',
            flexShrink: 0,
          }}
          title={sheetMode === 'peek' ? 'Tarik ke atas untuk melihat detail lengkap' : 'Tarik ke bawah untuk mengecilkan'}
        >
          <div
            style={{
              width: '40px',
              height: '4.5px',
              borderRadius: '999px',
              backgroundColor: '#CBD5E1',
            }}
          />
        </div>
      )}

      {/* 1. Header Difa AI */}
      <div
        onTouchStart={handleDragStart}
        onTouchMove={handleDragMove}
        onTouchEnd={handleDragEnd}
        style={{
          padding: isMobile ? '10px 18px' : '16px 20px',
          borderBottom: '1px solid #EFEFEF',
          backgroundColor: '#FFFFFF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          touchAction: isMobile ? 'none' : 'auto',
          cursor: isMobile ? 'grab' : 'default',
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
                Difa AI
              </h3>
              <span style={{ fontSize: '10px', backgroundColor: '#FDC323', color: '#000000', fontWeight: '800', padding: '2px 6px', borderRadius: '10px' }}>
                MAPID ENGINE
              </span>
            </div>
            <span style={{ fontSize: '11px', color: '#5FD300', fontWeight: '600' }}>
              {tampilan === 'PERENCANA'
                ? '● Site Selection & Site Analysis'
                : '● Spatial Multi-Criteria RAG Aktif'}
            </span>
          </div>
        </div>

        {/* Elderly-friendly large Close Button */}
        <button
          onClick={triggerClose}
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

      {/* ========================================================================= */}
      {/* PANEL DISABILITAS: percakapan Difa AI                                     */}
      {/* ========================================================================= */}
      {tampilan === 'CHAT' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Messages Body */}
          <div
            onTouchStart={handleBodyTouchStart}
            onTouchMove={handleBodyTouchMove}
            onTouchEnd={handleBodyTouchEnd}
            style={{
              flex: 1,
              overflowY: isMobile && sheetMode === 'peek' && !isDragging ? 'hidden' : 'auto',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              backgroundColor: '#F8FAFC',
              WebkitOverflowScrolling: 'touch',
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
                    // Pesan pengguna dicetak apa adanya; jawaban Difa AI lewat
                    // TeksKaya, yang sudah mengatur jaraknya sendiri per baris.
                    whiteSpace: msg.role === 'user' ? 'pre-line' : 'normal',
                  }}
                >
                  {msg.role === 'assistant' ? <TeksKaya teks={msg.content} /> : msg.content}
                </div>

                {/* Kartu titik survei yang menjadi dasar jawaban.
                    Difa AI menyebut namanya di dalam teks, tetapi nama itu hanya
                    kata - pengguna harus mencarinya sendiri di peta untuk
                    melihat fotonya dan catatan surveyornya. Kartu menjadikan
                    dasar penilaian itu satu ketukan saja, sekaligus memperlihatkan
                    bahwa jawabannya memang bersandar pada data, bukan karangan. */}
                {msg.role === 'assistant' && Array.isArray(msg.rujukan) && msg.rujukan.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px', maxWidth: '85%' }}>
                    <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#94A3B8', letterSpacing: '0.03em' }}>
                      DASAR JAWABAN INI
                    </span>
                    {msg.rujukan.map((r: any) => {
                      const warna =
                        typeof r.overallScore !== 'number'
                          ? '#94A3B8'
                          : r.overallScore < 2.5
                            ? '#EF4444'
                            : r.overallScore < 3.5
                              ? '#F59E0B'
                              : '#16A34A';
                      return (
                        <div
                          key={r.id}
                          onClick={() => onSelectLocation?.(r)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '9px',
                            padding: '9px 11px',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            backgroundColor: '#FFFFFF',
                            cursor: 'pointer',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#F8FAFC';
                            e.currentTarget.style.borderColor = '#CBD5E1';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = '#FFFFFF';
                            e.currentTarget.style.borderColor = '#E2E8F0';
                          }}
                        >
                          <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: warna, flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.name}
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#64748B', marginTop: '1px' }}>
                              {typeof r.overallScore === 'number' ? `Skor ${r.overallScore.toFixed(1)}` : 'Belum dinilai'}
                              {r.rampStatus && r.rampStatus !== 'NOT_VISIBLE' && ` · ramp ${r.rampStatus === 'GOOD' ? 'layak' : r.rampStatus === 'NONE' ? 'tidak ada' : 'rusak'}`}
                            </div>
                          </div>
                          <ChevronRight size={15} color="#CBD5E1" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            {isSending && <MemuatAI ringkas pesan="Difa AI menyusun jawaban" />}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick Chips */}
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: '#FFFFFF',
              borderTop: '1px solid #EFEFEF',
              display: 'flex',
              gap: '6px',
              // Membungkus, bukan menggulir mendatar. Dengan gulir, empat dari
              // enam saran tersembunyi di luar layar - dan saran yang tidak
              // terlihat tidak memancing siapa pun.
              flexWrap: 'wrap',
            }}
          >
            {/* Saran pertanyaan.
                Tiap saran memperagakan kemampuan yang BERBEDA, dan semuanya
                sudah diuji lebih dulu - dua saran lama justru menghasilkan
                jawaban yang keliru, dan itu tidak boleh terulang pada tombol
                yang kami sodorkan sendiri kepada penilai. */}
            {[
              'Rute kursi roda dari Pantai Losari ke Karebosi',
              'Seberapa parah trotoar depan Kantor Pos?',
              'Halte paling ramah kursi roda',
              'Trotoar mana yang paling parah?',
              'Di mana sebaiknya survei berikutnya?',
              'Seberapa lengkap data DifaMap?',
            ].map((q, i) => (
              <button
                key={i}
                onClick={() => handleSendMessage(q)}
                style={{
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: '20px',
                  padding: '5px 11px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#334155',
                  cursor: 'pointer',
                  textAlign: 'left',
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
      {/* PANEL URBAN PLANNER: Site Selection dan Site Analysis berurutan           */}
      {/*                                                                           */}
      {/* Keduanya tampil sekaligus dalam satu gulungan, tanpa tab. Seorang         */}
      {/* perencana memakai keduanya dalam satu duduk - menemukan zona prioritas,   */}
      {/* lalu menguji daya jangkau titik di dalamnya - jadi memisahkannya ke dua   */}
      {/* tab hanya menambah satu ketukan di antara dua langkah yang berurutan.     */}
      {/* ========================================================================= */}
      {tampilan === 'PERENCANA' && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            backgroundColor: '#F1F5F9',
            padding: '4px',
            margin: '12px 16px 0 16px',
            borderRadius: '10px',
            gap: '4px',
          }}
        >
          {([
            ['SELECTION', '\u{1F3AF} Site Selection'],
            ['ANALYSIS', '\u{1F4CA} Site Analysis'],
          ] as Array<[AlatPerencana, string]>).map(([kunci, label]) => (
            <button
              key={kunci}
              onClick={() => setAlatPerencana(kunci)}
              style={{
                padding: '8px 4px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: alatPerencana === kunci ? '#FFFFFF' : 'transparent',
                color: alatPerencana === kunci ? '#000000' : '#64748B',
                fontWeight: alatPerencana === kunci ? '700' : '600',
                fontSize: '12px',
                cursor: 'pointer',
                boxShadow: alatPerencana === kunci ? 'var(--shadow-sm)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {tampilan === 'PERENCANA' && alatPerencana === 'SELECTION' && (
        <div
          onTouchStart={handleBodyTouchStart}
          onTouchMove={handleBodyTouchMove}
          onTouchEnd={handleBodyTouchEnd}
          style={{
            flex: 1,
            overflowY: isMobile && sheetMode === 'peek' && !isDragging ? 'hidden' : 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {/* Info Card */}
          <div style={{ backgroundColor: '#F8FAFC', borderRadius: '10px', padding: '12px', border: '1px solid #E2E8F0', fontSize: '12.5px', color: '#475569', lineHeight: '18px' }}>
            <strong style={{ color: '#000000' }}>Difa AI Site Selection</strong> membagi peta menjadi grid sel spasial untuk menemukan zona prioritas intervensi infrastruktur disabilitas berdasarkan formula multi-kriteria.
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
            {/* Parameter penilaian.
                Grid yang sama dibaca tiga cara, karena yang disebut "prioritas"
                bergantung pada apa yang sedang dicari. Labelnya menyebut
                parameter yang dihitung, bukan siapa yang memakainya. */}
            <div>
              <label style={{ fontSize: '11.5px', color: '#64748B', display: 'block', marginBottom: '6px' }}>
                Parameter Penilaian:
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {MODA_GRID.map((m) => (
                  <button
                    key={m.kunci}
                    onClick={() => setGridModa(m.kunci)}
                    style={{
                      textAlign: 'left',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      border: gridModa === m.kunci ? '2px solid #539BA9' : '1px solid #E2E8F0',
                      backgroundColor: gridModa === m.kunci ? '#F0F9FB' : '#FFFFFF',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A' }}>{m.label}</div>
                    <div style={{ fontSize: '10.5px', color: '#64748B', lineHeight: '14px', marginTop: '2px' }}>
                      {m.jelas}
                    </div>
                  </button>
                ))}
              </div>
            </div>

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
              survei di dalamnya, dan {gridModa === 'HUNIAN'
                ? 'ada tidaknya hunian yang terkurung tanpa transit layak'
                : gridModa === 'KOMERSIAL'
                  ? 'seberapa banyak tempat usaha ramai di sekitarnya'
                  : 'seberapa ramai kegiatan di sekitarnya'}. Sel yang buruk sekaligus{' '}
              {gridModa === 'HUNIAN' ? 'berpenghuni' : 'ramai'} mendapat prioritas tertinggi.
              Sel tanpa satu pun titik survei tidak dinilai sama sekali.
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

          {/* Ringkasan hasil grid prioritas */}
          {gridResultSummary && (
            <div style={{ backgroundColor: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#000000' }}>Hasil Analisis Grid Difa AI</span>
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
                di dalamnya. Sisanya belum terjangkau data, bukan berprioritas rendah.
              </div>

              <div style={{ fontSize: '12px', fontWeight: '600', color: '#000000', marginTop: '4px' }}>Zona Prioritas Teratas:</div>
              {gridResultSummary.topPriorityZones.length === 0 ? (
                <div style={{ backgroundColor: '#FFFFFF', padding: '10px', borderRadius: '6px', border: '1px dashed #CBD5E1', fontSize: '11.5px', color: '#64748B' }}>
                  Belum ada sel yang punya data pendukung, jadi belum ada zona prioritas yang bisa diurutkan.
                </div>
              ) : (
                gridResultSummary.topPriorityZones.map((z: any, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => onSorotSel?.(z.zone)}
                    title="Tunjukkan sel ini di peta"
                    style={{ textAlign: 'left', width: '100%', cursor: 'pointer', backgroundColor: '#FFFFFF', padding: '8px 10px', borderRadius: '6px', border: '1px solid #E2E8F0', fontSize: '12px' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700' }}>
                      <span>{idx + 1}. {z.wilayah ?? z.zone}</span>
                      <span style={{ color: '#EF0004' }}>{z.score}/100</span>
                    </div>
                    <div style={{ color: '#94A3B8', fontSize: '10.5px', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                      {z.wilayah ? `${z.zone} · ` : ''}{z.koordinat ?? ''}
                    </div>
                    <div style={{ color: '#64748B', fontSize: '11px', marginTop: '2px' }}>{z.issue}</div>
                  </button>
                ))
              )}

              {/* Wawasan Difa AI.
                  Menggantikan tiga kalimat mati yang dulu dipilih dari ambang
                  angka - kalimat yang sama muncul di tiap sel, dan menyuruh
                  memperbaiki ramp bahkan di sel yang tidak punya data ramp. */}
              {sedangMenyusunWawasan && (
                <div style={{ marginTop: '6px' }}>
                  <MemuatAI pesan="Difa AI membaca pola antar sel" />
                </div>
              )}

              {wawasanGrid && (
                <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '11px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
                      <Sparkles size={14} color="#D97706" />
                      <span style={{ fontSize: '12px', fontWeight: 800, color: '#000000' }}>Wawasan Difa AI</span>
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#475569', lineHeight: '17px' }}>
                      {wawasanGrid.ringkasan}
                    </div>
                  </div>

                  {wawasanGrid.sel.slice(0, 5).map((w) => (
                    <div key={w.gridId} style={{ backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px' }}>
                      <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#0F172A' }}>
                        {w.judul}
                      </div>
                      <div style={{ fontSize: '10px', color: '#94A3B8', fontFamily: 'var(--font-mono)', marginTop: '1px' }}>
                        {w.gridId}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#475569', lineHeight: '17px', marginTop: '5px' }}>
                        {w.alasan}
                      </div>
                      <div style={{ fontSize: '11.5px', color: '#0F172A', lineHeight: '17px', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #F1F5F9' }}>
                        <strong>Tindakan:</strong> {w.tindakan}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Daftar kerja.
                  Yang dibawa ke rapat anggaran bukan peta, melainkan daftar:
                  urutan, koordinat, dasar penilaian, dan tindakan. Tanpa ini,
                  seluruh analisis berhenti di layar. */}
              {gridResultSummary.topPriorityZones.length > 0 && (
                <div style={{ marginTop: '8px', backgroundColor: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '11px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 800, color: '#000000' }}>Daftar Kerja</span>
                    <button
                      onClick={() => unduhDaftarKerja()}
                      style={{
                        border: '1px solid #CBD5E1',
                        backgroundColor: '#F8FAFC',
                        borderRadius: '6px',
                        padding: '4px 9px',
                        fontSize: '10.5px',
                        fontWeight: 700,
                        color: '#334155',
                        cursor: 'pointer',
                      }}
                    >
                      Unduh CSV
                    </button>
                  </div>

                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px' }}>
                      <thead>
                        <tr style={{ color: '#64748B', textAlign: 'left' }}>
                          <th style={{ padding: '4px 6px 4px 0', fontWeight: 700 }}>#</th>
                          <th style={{ padding: '4px 6px', fontWeight: 700 }}>Sel</th>
                          <th style={{ padding: '4px 6px', fontWeight: 700 }}>Nilai</th>
                          <th style={{ padding: '4px 6px', fontWeight: 700 }}>Titik</th>
                          <th style={{ padding: '4px 0 4px 6px', fontWeight: 700 }}>Tindakan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gridResultSummary.topPriorityZones.map((z: any, idx: number) => {
                          const w = wawasanGrid?.sel.find((x) => x.gridId === z.zone);
                          return (
                            <tr key={z.zone} style={{ borderTop: '1px solid #F1F5F9', color: '#334155' }}>
                              <td style={{ padding: '5px 6px 5px 0', fontWeight: 700 }}>{idx + 1}</td>
                              <td style={{ padding: '5px 6px', fontSize: '10px' }}>
                                <div style={{ fontWeight: 700 }}>{z.wilayah ?? z.zone}</div>
                                <div style={{ color: '#94A3B8', fontFamily: 'var(--font-mono)', fontSize: '9px' }}>
                                  {z.koordinat ?? ''}
                                </div>
                              </td>
                              <td style={{ padding: '5px 6px', fontWeight: 700, color: '#EF0004' }}>{z.score}</td>
                              <td style={{ padding: '5px 6px' }}>{z.jumlahTitik}</td>
                              <td style={{ padding: '5px 0 5px 6px' }}>
                                {w?.tindakan ?? (z.hambatan[0] ?? 'Menunggu wawasan Difa AI')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '7px', lineHeight: '14px' }}>
                    Kolom &quot;Titik&quot; adalah banyaknya titik survei yang mendasari penilaian sel.
                    Angka kecil berarti kesimpulannya bersandar pada sedikit pengamatan.
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                <button
                  onClick={() => {
                    const next = !isGridVisibleOnMap;
                    setIsGridVisibleOnMap(next);
                    if (onToggleSiniGrid) onToggleSiniGrid(next, gridSize, gridModa);
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

      {tampilan === 'PERENCANA' && alatPerencana === 'ANALYSIS' && (
        <div
          onTouchStart={handleBodyTouchStart}
          onTouchMove={handleBodyTouchMove}
          onTouchEnd={handleBodyTouchEnd}
          style={{
            flex: 1,
            overflowY: isMobile && sheetMode === 'peek' && !isDragging ? 'hidden' : 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            WebkitOverflowScrolling: 'touch',
          }}
        >
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
              <span>Mulai Difa AI</span>
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
                  {siteAnalysisData.isochrone.nyata
                    ? `Jangkauan ${siteAnalysisData.isochrone.menit} menit`
                    : `Radius ${siteAnalysisData.isochrone.radiusMeters} m`}
                  {siteAnalysisData.isochrone.areaSqKm != null && ` · ${siteAnalysisData.isochrone.areaSqKm} km²`}
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748B', marginTop: '2px' }}>
                  {siteAnalysisData.isochrone.nyata
                    ? `Isokron jaringan jalan, profil ${siteAnalysisData.isochrone.mode.toLowerCase()} · titik ${siteAnalysisData.coordinates}`
                    : `Lingkaran radius - layanan isokron tidak tersedia · titik ${siteAnalysisData.coordinates}`}
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
                {sedangMenyusunTitik && !analisisTitik && (
                  <div style={{ marginTop: '10px', borderTop: '1px solid #E2E8F0', paddingTop: '10px' }}>
                    <MemuatAI pesan="Difa AI menelusuri jangkauan titik ini" />
                  </div>
                )}

                {analisisTitik && (
                  <div style={{ marginTop: '10px', borderTop: '1px solid #E2E8F0', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '9px' }}>

                    {/* Jangkauan per pita waktu.
                        Satu cincin hanya menjawab "berapa banyak"; tiga cincin
                        menjawab "berapa lama sampai menemukan yang layak". */}
                    <div>
                      <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#000000', marginBottom: '5px' }}>
                        Jangkauan per Pita Waktu
                      </div>
                      {analisisTitik.pita.map((q) => (
                        <div key={q.menit} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#475569', padding: '3px 0' }}>
                          <span style={{ width: '54px', fontWeight: 700, color: '#0F172A' }}>{q.menit} menit</span>
                          <span style={{ flex: 1 }}>
                            {q.jumlahTitik} titik survei
                            {q.luasKm2 != null && ` \u00b7 ${q.luasKm2.toFixed(2)} km\u00b2`}
                          </span>
                          <span style={{ fontWeight: 700, color: q.skorRata == null ? '#94A3B8' : q.skorRata < 2.5 ? '#EF4444' : q.skorRata < 3.5 ? '#D97706' : '#16A34A' }}>
                            {q.skorRata != null ? q.skorRata.toFixed(2) : 'belum ada'}
                          </span>
                        </div>
                      ))}
                      {!analisisTitik.isokronNyata && (
                        <div style={{ fontSize: '10px', color: '#B45309', marginTop: '3px' }}>
                          Layanan isokron tidak tersedia - angka di atas memakai lingkaran radius, bukan jaringan jalan.
                        </div>
                      )}

                      {/* Cakupan data di dalam jangkauan.
                          Skor 4,5 dari satu titik di dalam 1,1 km persegi bukan
                          hal yang sama dengan skor 4,5 dari dua belas titik -
                          dan tanpa baris ini keduanya tampil identik. */}
                      {analisisTitik.cakupanIsokron && (
                        <div style={{ marginTop: '7px', backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                            <span style={{ color: '#64748B' }}>Cakupan survei di dalam jangkauan</span>
                            <span style={{
                              fontWeight: 800,
                              color: analisisTitik.cakupanIsokron.persen < 40 ? '#EF4444'
                                : analisisTitik.cakupanIsokron.persen < 70 ? '#D97706' : '#16A34A',
                            }}>
                              {analisisTitik.cakupanIsokron.persen}%
                            </span>
                          </div>
                          <div style={{ height: '5px', borderRadius: '3px', backgroundColor: '#E2E8F0', marginTop: '5px', overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.min(100, analisisTitik.cakupanIsokron.persen)}%`,
                              height: '100%',
                              backgroundColor: analisisTitik.cakupanIsokron.persen < 40 ? '#EF4444'
                                : analisisTitik.cakupanIsokron.persen < 70 ? '#D97706' : '#16A34A',
                            }} />
                          </div>
                          <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '4px', lineHeight: '14px' }}>
                            {analisisTitik.cakupanIsokron.petakBerdata} dari {analisisTitik.cakupanIsokron.petakTotal} petak
                            di dalam jangkauan punya titik survei dalam {analisisTitik.cakupanIsokron.radiusUjiMeter} m.
                            Sisanya belum pernah didatangi surveyor.
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Titik terdekat per kebutuhan, termasuk yang di luar jangkauan.
                        "Tidak ada halte dalam 10 menit" adalah temuan, bukan
                        kolom kosong - jadi jaraknya tetap ditulis. */}
                    <div>
                      <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#000000', marginBottom: '5px' }}>
                        Terdekat per Kebutuhan
                      </div>
                      {analisisTitik.terdekat.map((t) => (
                        <div key={t.kebutuhan} style={{ padding: '5px 0', borderTop: '1px solid #F8FAFC' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '11px' }}>
                            <span style={{ color: '#64748B' }}>{t.kebutuhan}</span>
                            <span style={{
                              flexShrink: 0,
                              fontWeight: 700,
                              fontSize: '9.5px',
                              padding: '1px 6px',
                              borderRadius: '8px',
                              backgroundColor: t.nama === null ? '#F1F5F9' : t.didalamJangkauan ? '#DCFCE7' : '#FEF3C7',
                              color: t.nama === null ? '#64748B' : t.didalamJangkauan ? '#15803D' : '#B45309',
                            }}>
                              {t.nama === null ? 'tidak ada data' : t.didalamJangkauan ? 'terjangkau' : 'di luar jangkauan'}
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#0F172A', marginTop: '1px' }}>
                            {t.nama ?? 'Tidak ada satu pun di seluruh data survei'}
                            {t.jarakMeter != null && (
                              <span style={{ color: '#94A3B8' }}>
                                {' '}&middot; {t.jarakMeter >= 1000 ? `${(t.jarakMeter / 1000).toFixed(1)} km` : `${t.jarakMeter} m`}
                                {t.skor != null && ` \u00b7 skor ${t.skor}`}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Daftar yang terjangkau - bisa ditelusuri, bukan dipercaya. */}
                    {analisisTitik.terjangkau.length > 0 && (
                      <details>
                        <summary style={{ fontSize: '11.5px', fontWeight: 800, color: '#000000', cursor: 'pointer' }}>
                          Titik yang Terjangkau ({analisisTitik.terjangkau.length})
                        </summary>
                        <div style={{ marginTop: '6px', maxHeight: '190px', overflowY: 'auto' }}>
                          {analisisTitik.terjangkau.map((t, i) => (
                            <div key={i} style={{ display: 'flex', gap: '7px', fontSize: '10.5px', padding: '3px 0', borderTop: i === 0 ? 'none' : '1px solid #F8FAFC' }}>
                              <span style={{ width: '42px', flexShrink: 0, color: '#94A3B8' }}>{t.menit} mnt</span>
                              <span style={{ flex: 1, color: '#334155' }}>{t.nama}</span>
                              <span style={{ flexShrink: 0, fontWeight: 700, color: t.skor == null ? '#94A3B8' : t.skor < 2.5 ? '#EF4444' : t.skor < 3.5 ? '#D97706' : '#16A34A' }}>
                                {t.skor ?? '-'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}

                    {/* Bandingkan dengan titik lain.
                        Memilih antara dua ruko atau dua calon lokasi halte
                        adalah keputusan yang sesungguhnya - dan satu-satunya
                        cara menjawabnya adalah menaruh keduanya berdampingan. */}
                    <div>
                      {!banding && !sedangMembandingkan && (
                        <button
                          onClick={() => onSelectCoordinateForCompare?.()}
                          style={{
                            width: '100%',
                            padding: '9px',
                            borderRadius: '8px',
                            border: '1px solid #0F766E',
                            backgroundColor: '#FFFFFF',
                            color: '#0F766E',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          Bandingkan dengan titik lain
                        </button>
                      )}

                      {sedangMembandingkan && (
                        <MemuatAI pesan="Difa AI menimbang kedua titik" />
                      )}

                      {banding && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#000000' }}>
                              Perbandingan Dua Titik
                            </span>
                            <button
                              onClick={() => { setBanding(null); onClearCompare?.(); }}
                              style={{ border: 'none', background: '#F1F5F9', borderRadius: '6px', padding: '3px 9px', fontSize: '10.5px', fontWeight: 700, color: '#334155', cursor: 'pointer' }}
                            >
                              Tutup
                            </button>
                          </div>

                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px' }}>
                              <thead>
                                <tr style={{ color: '#64748B', textAlign: 'left' }}>
                                  <th style={{ padding: '4px 6px 4px 0', fontWeight: 700 }}>&nbsp;</th>
                                  <th style={{ padding: '4px 6px', fontWeight: 700, color: banding.putusan?.unggul === 'A' ? '#15803D' : '#64748B' }}>
                                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#0F766E', marginRight: '4px' }} />
                                    A {banding.putusan?.unggul === 'A' && '\u2713'}
                                  </th>
                                  <th style={{ padding: '4px 0 4px 6px', fontWeight: 700, color: banding.putusan?.unggul === 'B' ? '#15803D' : '#64748B' }}>
                                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#6D28D9', marginRight: '4px' }} />
                                    B {banding.putusan?.unggul === 'B' && '\u2713'}
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr style={{ borderTop: '1px solid #F1F5F9' }}>
                                  <td style={{ padding: '5px 6px 5px 0', color: '#64748B' }}>Daerah</td>
                                  <td style={{ padding: '5px 6px', fontWeight: 700 }}>{banding.a.namaWilayah ?? '-'}</td>
                                  <td style={{ padding: '5px 0 5px 6px', fontWeight: 700 }}>{banding.b.namaWilayah ?? '-'}</td>
                                </tr>
                                {banding.a.pita.map((q, i) => (
                                  <tr key={q.menit} style={{ borderTop: '1px solid #F1F5F9' }}>
                                    <td style={{ padding: '5px 6px 5px 0', color: '#64748B' }}>{q.menit} menit</td>
                                    <td style={{ padding: '5px 6px' }}>{q.jumlahTitik} titik &middot; {q.skorRata ?? '-'}</td>
                                    <td style={{ padding: '5px 0 5px 6px' }}>
                                      {banding.b.pita[i]?.jumlahTitik ?? '-'} titik &middot; {banding.b.pita[i]?.skorRata ?? '-'}
                                    </td>
                                  </tr>
                                ))}
                                {banding.a.terdekat.map((t, i) => (
                                  <tr key={t.kebutuhan} style={{ borderTop: '1px solid #F1F5F9' }}>
                                    <td style={{ padding: '5px 6px 5px 0', color: '#64748B' }}>{t.kebutuhan.replace(' (skor 3,5 ke atas)', '')}</td>
                                    {[t, banding.b.terdekat[i]].map((x, k) => (
                                      <td key={k} style={{ padding: k === 0 ? '5px 6px' : '5px 0 5px 6px', color: x?.didalamJangkauan ? '#15803D' : '#B45309' }}>
                                        {x?.jarakMeter == null
                                          ? 'tidak ada'
                                          : `${x.jarakMeter >= 1000 ? `${(x.jarakMeter / 1000).toFixed(1)} km` : `${x.jarakMeter} m`}${x.didalamJangkauan ? '' : ' (luar)'}`}
                                      </td>
                                    ))}
                                  </tr>
                                ))}
                                <tr style={{ borderTop: '1px solid #E2E8F0' }}>
                                  <td style={{ padding: '5px 6px 5px 0', color: '#64748B' }}>Cakupan data</td>
                                  {[banding.a, banding.b].map((x, k) => (
                                    <td key={k} style={{ padding: k === 0 ? '5px 6px' : '5px 0 5px 6px', fontWeight: 700 }}>
                                      {x.cakupanIsokron ? `${x.cakupanIsokron.persen}%` : '-'}
                                    </td>
                                  ))}
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {banding.putusan && (
                            <div style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '11px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
                                <Sparkles size={14} color="#D97706" />
                                <span style={{ fontSize: '12px', fontWeight: 800, color: '#000000' }}>
                                  Putusan Difa AI &middot;{' '}
                                  {banding.putusan.unggul === 'SEIMBANG' ? 'Seimbang' : `Titik ${banding.putusan.unggul} unggul`}
                                </span>
                              </div>
                              <div style={{ fontSize: '11.5px', color: '#475569', lineHeight: '17px' }}>
                                {banding.putusan.ringkasan}
                              </div>
                              {banding.putusan.alasan.length > 0 && (
                                <ul style={{ margin: '7px 0 0 0', paddingLeft: '16px', fontSize: '11.5px', color: '#475569', lineHeight: '17px' }}>
                                  {banding.putusan.alasan.map((x, i) => (
                                    <li key={i} style={{ marginTop: '2px' }}>{x}</li>
                                  ))}
                                </ul>
                              )}
                              <div style={{ fontSize: '10.5px', color: '#92400E', marginTop: '7px', paddingTop: '6px', borderTop: '1px solid #FDE68A' }}>
                                {banding.putusan.catatan}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Skenario perbaikan.
                        Panel lain memotret KEADAAN; bagian ini menjawab
                        pertanyaan yang sebenarnya dihadapi perencana - kalau
                        anggarannya hanya cukup untuk satu titik, titik mana
                        yang paling mengubah keadaan dari sini. */}
                    {analisisTitik.skenario.length > 0 && (
                      <div>
                        <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#000000', marginBottom: '2px' }}>
                          Bila Satu Titik Diperbaiki
                        </div>
                        <div style={{ fontSize: '10px', color: '#94A3B8', lineHeight: '14px', marginBottom: '6px' }}>
                          Diurutkan menurut pengaruhnya: jumlah hambatan, kedekatan, dan apakah
                          perbaikan itu membuka kebutuhan yang kini belum terpenuhi.
                        </div>

                        {analisisTitik.skenario.slice(0, 3).map((k, i) => (
                          <div
                            key={k.nama + i}
                            style={{
                              backgroundColor: '#FFFFFF',
                              border: '1px solid #E2E8F0',
                              borderRadius: '8px',
                              padding: '9px 10px',
                              marginTop: '5px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                              <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#0F172A', flex: 1 }}>
                                {i + 1}. {k.nama}
                              </span>
                              <span style={{ fontSize: '10.5px', color: '#94A3B8', flexShrink: 0 }}>
                                {k.menit} mnt &middot; {k.jarakMeter} m
                              </span>
                            </div>

                            <div style={{ fontSize: '10.5px', color: '#B91C1C', marginTop: '3px', lineHeight: '15px' }}>
                              Sekarang: {k.hambatan.join('; ')}
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#15803D', marginTop: '2px', lineHeight: '15px' }}>
                              Bila diperbaiki: {k.dampak.join('; ')}
                            </div>
                          </div>
                        ))}

                        {analisisTitik.wawasan?.perbaikan && (
                          <div style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px', padding: '10px', marginTop: '7px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                              <Sparkles size={13} color="#15803D" />
                              <span style={{ fontSize: '11.5px', fontWeight: 800, color: '#14532D' }}>
                                Saran Difa AI
                              </span>
                            </div>
                            <div style={{ fontSize: '11.5px', color: '#166534', lineHeight: '17px' }}>
                              {analisisTitik.wawasan.perbaikan}
                            </div>
                          </div>
                        )}

                        <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '6px', lineHeight: '14px' }}>
                          Yang disimulasikan adalah parameter tercatat - ramp, ubin pemandu,
                          trotoar, permukaan, penerangan. Bentuk jangkauan isokron TIDAK ikut
                          dihitung ulang: layanan rute tidak tahu trotoar itu sudah diperbaiki.
                        </div>
                      </div>
                    )}

                    {/* Wawasan Difa AI */}
                    {analisisTitik.wawasan && (
                      <div style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '8px', padding: '11px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
                          <Sparkles size={14} color="#D97706" />
                          <span style={{ fontSize: '12px', fontWeight: 800, color: '#000000' }}>
                            Wawasan Difa AI{analisisTitik.namaWilayah ? ` \u00b7 ${analisisTitik.namaWilayah}` : ''}
                          </span>
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#475569', lineHeight: '17px' }}>
                          {analisisTitik.wawasan.ringkasan}
                        </div>
                        {analisisTitik.wawasan.temuan.length > 0 && (
                          <ul style={{ margin: '7px 0 0 0', paddingLeft: '16px', fontSize: '11.5px', color: '#475569', lineHeight: '17px' }}>
                            {analisisTitik.wawasan.temuan.map((t, i) => (
                              <li key={i} style={{ marginTop: '2px' }}>{t}</li>
                            ))}
                          </ul>
                        )}
                        <div style={{ fontSize: '10.5px', color: '#92400E', marginTop: '7px', paddingTop: '6px', borderTop: '1px solid #FDE68A' }}>
                          {analisisTitik.wawasan.catatan}
                        </div>
                      </div>
                    )}
                  </div>
                )}

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
              Klik tombol <strong>"Klik di Peta untuk Analisis"</strong> atau <strong>"Mulai Difa AI"</strong> untuk menguji daya jangkau dan titik ekonomi di sekitar titik terpilih.
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
