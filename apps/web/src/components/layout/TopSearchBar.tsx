'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Search,
  SlidersHorizontal,
  X,
  Sparkles,
  Plus,
  Building,
  UtensilsCrossed,
  Activity,
  BusFront,
  Crosshair,
  Check,
  MapPin,
  Layers,
  Bus,
  Star,
  ChevronRight,
} from 'lucide-react';
import { SidebarMode } from './AppSidebar';
import { difaMapApi } from '../../lib/api';
import { susunTempat } from '../../data/tempatPilihan';
import { FILTER_PARAMETER, hitungFilter } from '../../data/filterParameter';
import { useIsMobile } from '../../hooks/useIsMobile';

/**
 * Mode penyaring peta publik.
 *
 * AKTIVITAS dihapus: seluruh titik survei kini tampil di mode bawaan, sehingga
 * tombolnya tidak menambah apa pun - ia hanya menampilkan ulang yang sudah ada.
 * Digantikan HALTE, yang melengkapi rantai perjalanan bersama TEMPAT: tujuan
 * yang hendak dicapai, dan simpul transit untuk mencapainya.
 */
export type PublicSubMode = 'HALTE' | 'TEMPAT' | 'NONE';
/**
 * Saringan titik ekonomi di mode Urban Planner.
 *
 * 'NONE' adalah tampilan bawaan: seluruh titik properti DAN kuliner tampil
 * bersamaan, sama seperti mode bawaan di sisi disabilitas yang menampilkan
 * seluruh titik survei sekaligus. Menekan salah satu tombol menyaring ke satu
 * jenis saja; menekannya lagi kembali ke tampilan penuh.
 */
export type UrbanPlannerFilter = 'PROPERTI_GO' | 'MENU_GO' | 'NONE';

interface TopSearchBarProps {
  sidebarMode: SidebarMode;
  publicSubMode: PublicSubMode;
  onSelectPublicSubMode: (mode: PublicSubMode) => void;
  urbanFilter: UrbanPlannerFilter;
  onChangeUrbanFilter: (filter: UrbanPlannerFilter) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenAiAssistant: () => void;
  onOpenCreateModal: () => void;
  bufferRadius: number;
  onChangeBufferRadius: (radius: number) => void;
  isBufferVisible?: boolean;
  onToggleBufferVisible?: (visible: boolean) => void;
  locations?: any[];
  activities?: any[];
  onSelectSuggestion?: (item: { type: 'LOCATION' | 'ACTIVITY'; data: any }) => void;
  /**
   * Dipilihnya sebuah tempat yang TIDAK ada di basis data DifaMap - hasil
   * pencarian luar. Yang diteruskan hanya nama dan koordinat; penilaiannya
   * disusun panel dari survei di sekitarnya, atau dinyatakan belum ada.
   */
  onSelectTempatLuar?: (poi: {
    nama: string;
    kategori?: string;
    latitude: number;
    longitude: number;
  }) => void;
  /**
   * Diminta ketika tempat yang dicari tidak ada di daftar mana pun. Pengguna
   * lalu menunjuk titiknya sendiri di peta.
   */
  onMintaTunjukPeta?: () => void;
  /** Seluruh lokasi sebelum disaring, untuk menghitung isi tiap pilihan. */
  semuaLokasi?: any[];
  filterAktif?: string[];
  onFilterChange?: (kunci: string[]) => void;
  onResetToDefault?: () => void;
}

export default function TopSearchBar({
  sidebarMode,
  publicSubMode,
  onSelectPublicSubMode,
  urbanFilter,
  onChangeUrbanFilter,
  searchQuery,
  onSearchChange,
  onOpenAiAssistant,
  onOpenCreateModal,
  bufferRadius,
  onChangeBufferRadius,
  isBufferVisible = true,
  onToggleBufferVisible,
  locations = [],
  activities = [],
  onSelectSuggestion,
  onSelectTempatLuar,
  onMintaTunjukPeta,
  semuaLokasi = [],
  filterAktif = [],
  onFilterChange,
  onResetToDefault,
}: TopSearchBarProps) {
  const isMobile = useIsMobile(768);
  /**
   * Apakah Difa AI pernah dibuka di peramban ini.
   *
   * Cincin pemanggil berhenti begitu dicoba sekali: yang sudah tahu tidak perlu
   * terus dipanggil, dan animasi yang tidak pernah berhenti berubah dari
   * penunjuk jalan menjadi gangguan.
   *
   * Dibaca setelah komponen terpasang, bukan saat state pertama dibentuk -
   * localStorage tidak ada saat halaman dirakit di server, dan membacanya di
   * sana membuat tampilan server dan peramban berbeda.
   */
  const [sudahCobaAI, setSudahCobaAI] = useState(true);

  useEffect(() => {
    try {
      setSudahCobaAI(window.localStorage.getItem('difamap:ai-dicoba') === '1');
    } catch {
      // Mode penyamaran memblokir localStorage. Anggap sudah dicoba supaya
      // cincinnya tidak berdenyut selamanya tanpa pernah bisa dihentikan.
      setSudahCobaAI(true);
    }
  }, []);

  const tandaiCobaAI = () => {
    setSudahCobaAI(true);
    try {
      window.localStorage.setItem('difamap:ai-dicoba', '1');
    } catch {
      // Tidak bisa diingat antar kunjungan - tidak apa, sesi ini tetap tenang.
    }
  };

  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);

  /**
   * Tempat di luar basis data DifaMap.
   *
   * Pencarian sebelumnya hanya menjangkau 94 titik survei, sehingga tujuan yang
   * belum pernah disurvei - hotel, masjid, sekolah - seolah tidak ada di
   * Makassar. Padahal justru di situ orang ingin tahu kondisinya, dan jawaban
   * "belum ada data" adalah jawaban yang sah.
   */
  /**
   * Berapa titik yang lolos tiap penyaring, dan berapa yang parameternya belum
   * pernah teramati. Ditampilkan di sebelah tiap pilihan supaya pengguna tahu
   * sebelum memilih - tanpa itu, memilih "Ada toilet difabel" mengosongkan peta
   * tanpa penjelasan, padahal sebabnya hanya satu titik yang pernah diamati.
   */
  const isiFilter = useMemo(() => hitungFilter(semuaLokasi), [semuaLokasi]);

  const [tempatLuar, setTempatLuar] = useState<any[]>([]);
  const [sedangCariLuar, setSedangCariLuar] = useState(false);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 3) {
      setTempatLuar([]);
      return;
    }

    // Ditunda 500 ms: layanan pencarian luar membatasi satu permintaan per
    // detik, dan tanpa jeda setiap ketikan huruf akan mengirim satu permintaan.
    let dibatalkan = false;
    setSedangCariLuar(true);
    const timer = setTimeout(() => {
      difaMapApi
        .cariTempatLuas(q, 6)
        .then((j: any) => {
          if (!dibatalkan) setTempatLuar(j?.data ?? []);
        })
        .catch(() => {
          if (!dibatalkan) setTempatLuar([]);
        })
        .finally(() => {
          if (!dibatalkan) setSedangCariLuar(false);
        });
    }, 500);

    return () => {
      dibatalkan = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const searchWrapperRef = useRef<HTMLDivElement>(null);

  // Close suggestions when clicking outside or pressing Escape
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setIsInputFocused(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFilterDropdownOpen) {
          setIsFilterDropdownOpen(false);
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
        if (isInputFocused) {
          setIsInputFocused(false);
          (document.activeElement as HTMLElement)?.blur();
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return;
        }
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  /**
   * Saran pencarian dari data DifaMap sendiri.
   *
   * Tiga perbaikan atas versi sebelumnya:
   *
   * 1. Tempat pilihan tim ikut dicari. Sebelumnya mengetik "trans studio" hanya
   *    memunculkan pengamatan di dalamnya, tidak pernah tempatnya - padahal
   *    tempat itulah yang orang cari, dan panelnya yang paling lengkap.
   *
   * 2. Aktivitas yang sudah terwakili lokasinya dibuang. Setiap aktivitas
   *    menunjuk balik ke sebuah lokasi dengan judul yang sama persis, sehingga
   *    "mall pa" menghasilkan empat baris untuk dua tempat - dua sebagai
   *    "Tempat", dua lagi sebagai "Aktivitas" dengan tulisan identik.
   *
   * 3. Deskripsi ikut dicari. Mengetik "ramp" sebelumnya menemukan 2 dari 94
   *    titik karena hanya nama yang dicocokkan; dengan deskripsi ikut dicari
   *    menjadi 33. Untuk aplikasi aksesibilitas, itu perbedaan antara berguna
   *    dan tidak.
   */
  const suggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();

    // Tempat pilihan tim lebih dulu: ia membawa panel radius yang paling utuh.
    const matchedTempat = susunTempat(locations)
      .filter((t) => t.nama.toLowerCase().includes(q) || t.kategori.toLowerCase().includes(q))
      .slice(0, 4)
      .map((t) => ({
        type: 'TEMPAT_TIM' as const,
        id: `tempat-${t.nama}`,
        name: t.nama,
        subtitle: `${t.anggota.length} pengamatan survei di sekitarnya`,
        category: t.kategori,
        score: t.skorRata ?? undefined,
        entityType: 'PLACE',
        coverImageUrl: undefined,
        data: {
          nama: t.nama,
          kategori: t.kategori,
          latitude: t.latitude,
          longitude: t.longitude,
        },
      }));

    const matchedLocs = locations
      .filter(
        (loc) =>
          loc.name?.toLowerCase().includes(q) ||
          loc.specificLocation?.toLowerCase().includes(q) ||
          loc.category?.toLowerCase().includes(q) ||
          // Deskripsi surveyor memuat kata yang tidak pernah ada di nama:
          // "ramp", "guiding block", "terhalang parkir".
          loc.description?.toLowerCase().includes(q)
      )
      .slice(0, 6)
      .map((loc) => ({
        type: 'LOCATION' as const,
        id: loc.id,
        name: loc.name,
        subtitle: loc.name?.toLowerCase().includes(q)
          ? loc.specificLocation || 'Kota Makassar'
          : 'Cocok di catatan surveyor',
        category: loc.category,
        score: loc.overallScore,
        entityType: loc.entityType,
        coverImageUrl: loc.coverImageUrl,
        data: loc,
      }));

    // Aktivitas hanya ditampilkan bila lokasinya TIDAK ikut muncul - kalau ikut,
    // keduanya bertuliskan sama dan hanya membuat daftar terasa penuh.
    const idLokasiTampil = new Set(matchedLocs.map((l) => l.id));
    const matchedActs = activities
      .filter(
        (act) =>
          !idLokasiTampil.has(act.locationId) &&
          (act.title?.toLowerCase().includes(q) ||
            act.specificLocation?.toLowerCase().includes(q) ||
            act.description?.toLowerCase().includes(q))
      )
      .slice(0, 3)
      .map((act) => ({
        type: 'ACTIVITY' as const,
        id: act.id,
        name: act.title,
        subtitle: act.title?.toLowerCase().includes(q)
          ? act.specificLocation || 'Laporan lapangan'
          : 'Cocok di catatan surveyor',
        category: undefined,
        score: act.aiScore,
        entityType: undefined,
        coverImageUrl: undefined,
        data: act,
      }));

    return [...matchedTempat, ...matchedLocs, ...matchedActs];
  }, [searchQuery, locations, activities]);

  // Helper function to highlight matched character sequences
  const highlightMatch = (text: string, query: string) => {
    if (!query || !text) return text;
    const index = text.toLowerCase().indexOf(query.toLowerCase());
    if (index === -1) return text;
    const before = text.substring(0, index);
    const match = text.substring(index, index + query.length);
    const after = text.substring(index + query.length);
    return (
      <>
        {before}
        <span style={{ backgroundColor: '#FEF08A', color: '#854D0E', fontWeight: '700', borderRadius: '2px', padding: '0 2px' }}>
          {match}
        </span>
        {after}
      </>
    );
  };

  // Helper function to render thematic icons for each place category
  const renderItemIcon = (item: any) => {
    if (item.type === 'ACTIVITY') {
      return (
        <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Activity size={18} color="#D97706" />
        </div>
      );
    }
    const cat = (item.category || '').toUpperCase();
    if (item.entityType === 'TRANSIT_HUB' || cat.includes('BUS') || cat.includes('HALTE')) {
      return (
        <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#E0F2FE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Bus size={18} color="#0284C7" />
        </div>
      );
    }
    if (cat.includes('MALL') || cat.includes('PLAZA')) {
      return (
        <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#FFE4E6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Building size={18} color="#E11D48" />
        </div>
      );
    }
    if (cat.includes('HEALTH') || cat.includes('RS') || cat.includes('RUMAH SAKIT') || cat.includes('KLINIK')) {
      return (
        <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <MapPin size={18} color="#059669" />
        </div>
      );
    }
    return (
      <div style={{ width: '36px', height: '36px', borderRadius: '10px', backgroundColor: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <MapPin size={18} color="#000000" />
      </div>
    );
  };

  return (
    <header
      style={{
        position: 'fixed',
        top: isMobile ? '12px' : '24px',
        left: isMobile ? '12px' : '104px',
        right: isMobile ? '12px' : '24px',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: 'space-between',
        gap: isMobile ? '8px' : '16px',
        // Di atas kedua panel detail (50 dan 20). Daftar saran pencarian tumbuh
        // ke bawah dan melintasi panel yang terbuka - dengan lapisan lebih
        // rendah, saran itu terpotong di balik panel meski kotak pencariannya
        // sendiri terlihat.
        zIndex: 70,
        pointerEvents: 'none',
      }}
    >
      {/* 1. Search Bar Wrapper with Autocomplete Dropdown */}
      <div
        ref={searchWrapperRef}
        style={{
          position: 'relative',
          width: isMobile ? '100%' : '464px',
          maxWidth: '100%',
          pointerEvents: 'auto',
        }}
      >
        <div
          style={{
            width: '100%',
            height: isMobile ? '52px' : '60px',
            backgroundColor: '#FFFFFF',
            borderRadius: '16px',
            boxShadow: isInputFocused ? '0px 8px 24px rgba(0, 0, 0, 0.12)' : '0px 4px 14px rgba(0, 0, 0, 0.08)',
            border: isInputFocused ? '1.5px solid #FDC323' : '1px solid rgba(0, 0, 0, 0.06)',
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            gap: '12px',
            transition: 'all 0.2s ease',
          }}
        >
          {isMobile ? (
            <button
              onClick={onResetToDefault}
              title="Kembali ke Tampilan Normal (DifaMap)"
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <img
                src="/difamap-icon.png"
                alt="DifaMap"
                style={{ width: '28px', height: '28px', objectFit: 'contain' }}
              />
            </button>
          ) : (
            <Search size={22} color={isInputFocused ? '#000000' : '#767676'} style={{ flexShrink: 0 }} />
          )}

          <input
            type="text"
            value={searchQuery}
            onFocus={() => setIsInputFocused(true)}
            onChange={(e) => {
              onSearchChange(e.target.value);
              setIsInputFocused(true);
            }}
            placeholder={
              sidebarMode === 'PUBLIC'
                ? publicSubMode === 'HALTE'
                  ? 'Cari halte bus, terminal, simpul transit...'
                  : 'Cari Halte Bus, RS Grestelina, Mall...'
                : 'Cari titik analisis spasial (Halte / Hub)...'
            }
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              fontFamily: 'inherit',
              fontSize: '16px', // 16px prevents iOS Safari auto-zoom & enhances elderly readability
              color: '#000000',
              fontWeight: '500',
              backgroundColor: 'transparent',
            }}
          />

          {searchQuery && (
            <button
              onClick={() => {
                onSearchChange('');
                setIsInputFocused(false);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#767676',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={18} />
            </button>
          )}

          {/* Separator Line */}
          <div style={{ width: '1px', height: '28px', backgroundColor: '#EFEFEF' }} />

          {/* Filter / Category Quick Toggle */}
          <button
            onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
            title="Opsi Filter"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: isFilterDropdownOpen || filterAktif.length > 0 ? '#FDC323' : '#539BA9',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.2s ease',
              // Lencana jumlah penyaring aktif diletakkan relatif terhadap tombol.
              position: 'relative',
            }}
          >
            <SlidersHorizontal size={20} />
            {filterAktif.length > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '-2px',
                  right: '-2px',
                  minWidth: '16px',
                  height: '16px',
                  borderRadius: '8px',
                  backgroundColor: '#EF4444',
                  color: '#FFFFFF',
                  fontSize: '10px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {filterAktif.length}
              </span>
            )}
          </button>
        </div>

        {/* Panel penyaring parameter.
            Tombol slider ini sebelumnya tidak melakukan apa pun: keadaannya
            di-toggle, tetapi tidak ada panel yang pernah digambar - yang
            berubah hanya warna ikonnya.

            Yang disaring adalah parameter yang tercatat apa adanya, bukan
            label jenis disabilitas. "Ramah kursi roda" adalah tafsiran atas
            beberapa parameter sekaligus, dan tafsiran itu bisa keliru: sebuah
            titik bisa punya ramp bagus tetapi trotoar menujunya terputus. */}
        {isFilterDropdownOpen && (
          <div
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              width: isMobile ? '100%' : '340px',
              backgroundColor: '#FFFFFF',
              borderRadius: '14px',
              boxShadow: '0 12px 32px rgba(0,0,0,0.16)',
              border: '1px solid #E2E8F0',
              zIndex: 60,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #F1F5F9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#0F172A' }}>
                Saring menurut fasilitas
              </span>
              {filterAktif.length > 0 && (
                <button
                  onClick={() => onFilterChange && onFilterChange([])}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: '#2563EB',
                    fontSize: '11.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Hapus semua
                </button>
              )}
            </div>

            <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
              {FILTER_PARAMETER.map((f) => {
                const aktif = filterAktif.includes(f.kunci);
                const isi = isiFilter[f.kunci] ?? { lolos: 0, belumTeramati: 0 };
                return (
                  <div
                    key={f.kunci}
                    onClick={() => {
                      if (!onFilterChange) return;
                      onFilterChange(
                        aktif ? filterAktif.filter((k) => k !== f.kunci) : [...filterAktif, f.kunci]
                      );
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '11px 16px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #F8FAFC',
                      backgroundColor: aktif ? '#EFF6FF' : '#FFFFFF',
                    }}
                  >
                    <span
                      style={{
                        width: '18px',
                        height: '18px',
                        borderRadius: '5px',
                        border: `2px solid ${aktif ? '#2563EB' : '#CBD5E1'}`,
                        backgroundColor: aktif ? '#2563EB' : '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {aktif && <Check size={12} color="#FFFFFF" strokeWidth={3.5} />}
                    </span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: '#0F172A' }}>
                        {f.label}
                      </div>
                      <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '1px' }}>
                        {isi.lolos} titik memenuhi
                        {isi.belumTeramati > 0 && ` · ${isi.belumTeramati} belum teramati`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div
              style={{
                padding: '10px 16px',
                backgroundColor: '#F8FAFC',
                fontSize: '10.5px',
                color: '#64748B',
                lineHeight: '15px',
              }}
            >
              Memilih lebih dari satu menyisakan titik yang memenuhi{' '}
              <strong>semuanya</strong>. Titik yang parameternya belum teramati tidak ikut
              lolos &mdash; itu berarti belum disurvei, bukan berarti tidak ada.
            </div>

            {/* Tidak ada tombol "Terapkan".
                Penyaring bekerja seketika saat dicentang, dan petanya ada tepat
                di belakang panel ini - perubahannya langsung terlihat. Tombol
                terapkan justru menunda satu-satunya umpan balik yang berguna,
                dan memaksa pengguna menebak apa yang akan terjadi.

                Yang benar-benar dibutuhkan dua: mengembalikan ke semula, dan
                menutup panel supaya peta terlihat utuh. */}
            <div
              style={{
                display: 'flex',
                gap: '8px',
                padding: '10px 16px 14px',
                backgroundColor: '#F8FAFC',
                borderTop: '1px solid #E2E8F0',
              }}
            >
              <button
                onClick={() => onFilterChange && onFilterChange([])}
                disabled={filterAktif.length === 0}
                style={{
                  flex: 1,
                  padding: '9px',
                  borderRadius: '9px',
                  border: '1px solid #CBD5E1',
                  backgroundColor: '#FFFFFF',
                  color: filterAktif.length === 0 ? '#CBD5E1' : '#334155',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: filterAktif.length === 0 ? 'not-allowed' : 'pointer',
                }}
              >
                Atur ulang
              </button>
              <button
                onClick={() => setIsFilterDropdownOpen(false)}
                style={{
                  flex: 1,
                  padding: '9px',
                  borderRadius: '9px',
                  border: 'none',
                  backgroundColor: '#539BA9',
                  color: '#FFFFFF',
                  fontSize: '12px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {filterAktif.length > 0 ? `Lihat ${filterAktif.length} penyaring di peta` : 'Selesai'}
              </button>
            </div>
          </div>
        )}

        {/* Autocomplete / Search Suggestions Dropdown */}
        {isInputFocused && searchQuery.trim().length > 0 && (
          <div
            style={{
              position: 'absolute',
              top: isMobile ? '58px' : '68px',
              left: 0,
              right: 0,
              backgroundColor: '#FFFFFF',
              borderRadius: '16px',
              boxShadow: '0 14px 40px rgba(0, 0, 0, 0.18)',
              border: '1px solid rgba(0, 0, 0, 0.08)',
              overflow: 'hidden',
              zIndex: 100,
              maxHeight: isMobile ? '300px' : '380px',
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
              display: 'flex',
              flexDirection: 'column',
              animation: 'fadeIn 0.15s ease-out',
            }}
          >
            {/* Header / Counter */}
            <div
              style={{
                padding: '10px 16px',
                backgroundColor: '#F8FAFC',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '12px',
                fontWeight: '700',
                color: '#64748B',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              <span>Hasil Pencarian Tempat ({suggestions.length})</span>
              <span style={{ fontSize: '11px', fontWeight: '500', color: '#94A3B8' }}>Pilih untuk menuju ke lokasi</span>
            </div>

            {/* List of suggestions */}
            {suggestions.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {suggestions.map((item) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    onClick={() => {
                      onSearchChange(item.name);
                      setIsInputFocused(false);
                      // Tempat pilihan tim membuka panel radius, bukan panel
                      // detail satu baris - datanya memang bukan baris basis
                      // data, melainkan nama dan koordinat.
                      if (item.type === 'TEMPAT_TIM') {
                        if (onSelectTempatLuar) onSelectTempatLuar(item.data as any);
                      } else if (onSelectSuggestion) {
                        onSelectSuggestion({ type: item.type, data: item.data });
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      borderBottom: '1px solid #F1F5F9',
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease',
                      backgroundColor: '#FFFFFF',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#F8FAFC';
                      e.currentTarget.style.borderLeft = '3px solid #FDC323';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#FFFFFF';
                      e.currentTarget.style.borderLeft = 'none';
                    }}
                  >
                    {/* Thematic Category Icon */}
                    {renderItemIcon(item)}

                    {/* Title and Subtitle */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '14px',
                          fontWeight: '700',
                          color: '#0F172A',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {highlightMatch(item.name, searchQuery)}
                      </div>
                      <div
                        style={{
                          fontSize: '12px',
                          color: '#64748B',
                          marginTop: '2px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.subtitle}
                      </div>
                    </div>

                    {/* Right side: Rating & Type Badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      {item.score && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                            fontSize: '12px',
                            fontWeight: '700',
                            color: '#0F172A',
                            backgroundColor: '#FEF9C3',
                            padding: '2px 6px',
                            borderRadius: '6px',
                          }}
                        >
                          <Star size={12} fill="#FACC15" color="#EAB308" />
                          <span>{Number(item.score).toFixed(1)}</span>
                        </div>
                      )}

                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: '700',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          backgroundColor: item.type === 'LOCATION' ? '#EBF5F7' : '#FEF3C7',
                          color: item.type === 'LOCATION' ? '#0E7490' : '#B45309',
                        }}
                      >
                        {item.type === 'LOCATION' ? 'Tempat' : 'Aktivitas'}
                      </span>

                      <ChevronRight size={16} color="#CBD5E1" />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Tempat lain di Makassar - di luar basis data DifaMap.
                Ditaruh SESUDAH hasil sendiri karena yang punya data survei
                lebih berguna; tempat luar justru berguna untuk menunjukkan
                bahwa datanya belum ada di sana. */}
            {tempatLuar.length > 0 && (
              <div>
                <div
                  style={{
                    padding: '8px 16px',
                    fontSize: '11px',
                    fontWeight: 800,
                    color: '#64748B',
                    backgroundColor: '#F8FAFC',
                    borderTop: suggestions.length > 0 ? '1px solid #E2E8F0' : 'none',
                    letterSpacing: '0.03em',
                  }}
                >
                  TEMPAT LAIN DI MAKASSAR &amp; GOWA
                </div>

                {tempatLuar.map((t, i) => (
                  <div
                    key={`luar-${i}-${t.latitude}`}
                    onClick={() => {
                      onSearchChange(t.nama);
                      setIsInputFocused(false);
                      if (onSelectTempatLuar) onSelectTempatLuar(t);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      borderBottom: '1px solid #F1F5F9',
                      cursor: 'pointer',
                      backgroundColor: '#FFFFFF',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#F8FAFC';
                      e.currentTarget.style.borderLeft = '3px solid #2563EB';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#FFFFFF';
                      e.currentTarget.style.borderLeft = 'none';
                    }}
                  >
                    <MapPin size={18} color="#2563EB" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0F172A' }}>
                        {t.nama}
                      </div>
                      <div
                        style={{
                          fontSize: '11.5px',
                          color: '#64748B',
                          marginTop: '2px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {t.alamat}
                      </div>
                    </div>
                    <ChevronRight size={16} color="#CBD5E1" />
                  </div>
                ))}
              </div>
            )}

            {/* Jalan keluar yang selalu tersedia.
                Pencarian tempat tidak akan pernah lengkap - kafe yang belum
                didaftarkan di OpenStreetMap tidak akan ketemu betapapun bagusnya
                layanan pencarian. Menunjuk titik di peta melewati soal itu
                sepenuhnya, dan penilaiannya tetap disusun dari survei sekitar. */}
            {onMintaTunjukPeta && (
              <div
                onClick={() => {
                  setIsInputFocused(false);
                  onMintaTunjukPeta();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '12px 16px',
                  cursor: 'pointer',
                  backgroundColor: '#F8FAFC',
                  borderTop: '1px solid #E2E8F0',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#EFF6FF';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#F8FAFC';
                }}
              >
                <Crosshair size={17} color="#2563EB" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0F172A' }}>
                    Tempatnya tidak ada di daftar?
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B', marginTop: '1px' }}>
                    Tunjuk titiknya langsung di peta, kondisi sekitarnya tetap bisa dinilai.
                  </div>
                </div>
                <ChevronRight size={16} color="#CBD5E1" />
              </div>
            )}

            {suggestions.length === 0 && tempatLuar.length === 0 && (
              <div
                style={{
                  padding: '28px 20px',
                  textAlign: 'center',
                  color: '#64748B',
                  fontSize: '13.5px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <div style={{ fontWeight: '600', color: '#1E293B' }}>
                  {sedangCariLuar ? 'Mencari tempat...' : 'Tidak ada tempat yang cocok'}
                </div>
                <div style={{ fontSize: '12px', color: '#94A3B8' }}>
                  {sedangCariLuar
                    ? 'Menelusuri tempat di Makassar & Gowa.'
                    : 'Tidak ditemukan hasil. Coba kata kunci lain seperti halte, mall, atau rumah sakit.'}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Floating Filter & Action Tabs */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? '8px' : '12px',
          pointerEvents: 'auto',
          overflowX: isMobile ? 'auto' : 'visible',
          flexWrap: isMobile ? 'nowrap' : 'wrap',
          paddingBottom: isMobile ? '4px' : '0px',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          maxWidth: '100%',
        }}
      >
        {/* PUBLIC MODE (Aktivitas & Tempat Quick Toggles) */}
        {sidebarMode === 'PUBLIC' ? (
          <>
            {/* Tab: Tempat */}
            <button
              onClick={() => onSelectPublicSubMode(publicSubMode === 'TEMPAT' ? 'NONE' : 'TEMPAT')}
              className={publicSubMode === 'TEMPAT' ? 'btn-yellow-pill' : 'btn-white-pill'}
              style={{
                backgroundColor: publicSubMode === 'TEMPAT' ? '#FDC323' : '#FFFFFF',
                height: isMobile ? '42px' : '48px',
                padding: isMobile ? '0 14px' : '0 24px',
                fontSize: isMobile ? '14px' : '15px',
                fontWeight: '700',
                flexShrink: 0,
              }}
              title="Tampilkan Titik Tempat"
            >
              <Building size={18} strokeWidth={2.4} />
              <span>Tempat</span>
            </button>

            {/* Tab: Halte - pasangan Tempat dalam rantai perjalanan */}
            <button
              onClick={() => onSelectPublicSubMode(publicSubMode === 'HALTE' ? 'NONE' : 'HALTE')}
              className={publicSubMode === 'HALTE' ? 'btn-yellow-pill' : 'btn-white-pill'}
              style={{
                backgroundColor: publicSubMode === 'HALTE' ? '#FDC323' : '#FFFFFF',
                height: isMobile ? '42px' : '48px',
                padding: isMobile ? '0 14px' : '0 24px',
                fontSize: isMobile ? '14px' : '15px',
                fontWeight: '700',
                flexShrink: 0,
              }}
              title="Tampilkan halte dan simpul transit saja"
            >
              <BusFront size={18} strokeWidth={2.4} />
              <span>Halte</span>
            </button>
          </>
        ) : (
          /* URBAN PLANNER MODE (Properti Go & Menu Go Tabs) */
          <>
            {/* Tab: Properti Go */}
            <button
              onClick={() => onChangeUrbanFilter(urbanFilter === 'PROPERTI_GO' ? 'NONE' : 'PROPERTI_GO')}
              className={urbanFilter === 'PROPERTI_GO' ? 'btn-yellow-pill' : 'btn-white-pill'}
              style={{
                backgroundColor: urbanFilter === 'PROPERTI_GO' ? '#FDC323' : '#FFFFFF',
                height: isMobile ? '42px' : '48px',
                padding: isMobile ? '0 14px' : '0 24px',
                fontSize: isMobile ? '14px' : '15px',
                fontWeight: '700',
                flexShrink: 0,
              }}
            >
              <Building size={18} strokeWidth={2.4} />
              <span>Properti</span>
            </button>

            {/* Tab: Menu Go */}
            <button
              onClick={() => onChangeUrbanFilter(urbanFilter === 'MENU_GO' ? 'NONE' : 'MENU_GO')}
              className={urbanFilter === 'MENU_GO' ? 'btn-yellow-pill' : 'btn-white-pill'}
              style={{
                backgroundColor: urbanFilter === 'MENU_GO' ? '#FDC323' : '#FFFFFF',
                height: isMobile ? '42px' : '48px',
                padding: isMobile ? '0 14px' : '0 24px',
                fontSize: isMobile ? '14px' : '15px',
                fontWeight: '700',
                flexShrink: 0,
              }}
            >
              <UtensilsCrossed size={18} strokeWidth={2.4} />
              <span>{isMobile ? 'Kuliner' : 'Restoran & Kafe'}</span>
            </button>
          </>
        )}

        {/* 3. Tombol Difa AI.
            Sebelumnya lingkaran putih tanpa tulisan, berdiri di antara tombol
            putih lainnya - dan fitur yang paling membedakan aplikasi ini justru
            yang paling mudah terlewat. Sekarang bertulisan, berwarna sendiri,
            dan dikelilingi cincin yang memuai sampai sekali dicoba. */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          {!sudahCobaAI && (
            <span
              aria-hidden
              className="difa-cincin"
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '999px',
                border: '2px solid #539BA9',
                pointerEvents: 'none',
              }}
            />
          )}

          <button
            onClick={() => {
              tandaiCobaAI();
              onOpenAiAssistant();
            }}
            title={
              sidebarMode === 'URBAN_PLANNER'
                ? 'Buka Site Selection & Site Analysis'
                : 'Tanya Difa AI tentang rute dan aksesibilitas'
            }
            style={{
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              height: isMobile ? '42px' : '48px',
              padding: isMobile ? '0 14px' : '0 18px',
              borderRadius: '999px',
              // Hijau-teal merek, bukan putih: kuning sudah menjadi milik
              // "Bagikan Laporan", dan dua tombol utama berwarna sama saling
              // melemahkan alih-alih saling menguatkan.
              background: 'linear-gradient(135deg, #539BA9 0%, #3E7C88 100%)',
              color: '#FFFFFF',
              border: 'none',
              boxShadow: '0 4px 14px rgba(83,155,169,0.38)',
              fontSize: isMobile ? '14px' : '15px',
              fontWeight: 800,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <Sparkles size={isMobile ? 18 : 20} color="#FDC323" fill="#FDC323" />
            <span>
              {sidebarMode === 'URBAN_PLANNER' ? 'Analisis' : isMobile ? 'Difa AI' : 'Tanya Difa AI'}
            </span>
          </button>
        </div>

        {/* 4. Bagikan Laporan.
            Disembunyikan di mode Urban Planner: yang melapor adalah pengguna
            jalan yang sedang berada di lokasi, sementara mode ini untuk
            membaca data yang sudah terkumpul. Menaruh keduanya berdampingan
            hanya memadati bilah tanpa ada yang memakainya. */}
        {sidebarMode !== 'URBAN_PLANNER' && (
        <button
          onClick={onOpenCreateModal}
          className="btn-yellow-pill"
          title="Laporkan Aksesibilitas Baru"
          style={{
            height: isMobile ? '42px' : '48px',
            padding: isMobile ? '0 14px' : '0 20px',
            fontSize: isMobile ? '14px' : '15px',
            fontWeight: '700',
            flexShrink: 0,
          }}
        >
          <Plus size={18} strokeWidth={3} />
          <span>{isMobile ? 'Lapor' : 'Bagikan Laporan'}</span>
        </button>
        )}
      </div>
    </header>
  );
}
