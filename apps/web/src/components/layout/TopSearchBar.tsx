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
  MapPin,
  Layers,
  Bus,
  Star,
  ChevronRight,
} from 'lucide-react';
import { SidebarMode } from './AppSidebar';
import { difaMapApi } from '../../lib/api';
import { susunTempat } from '../../data/tempatPilihan';
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
export type UrbanPlannerFilter = 'PROPERTI_GO' | 'MENU_GO';

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
  onResetToDefault,
}: TopSearchBarProps) {
  const isMobile = useIsMobile(768);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);

  /**
   * Tempat di luar basis data DifaMap.
   *
   * Pencarian sebelumnya hanya menjangkau 94 titik survei, sehingga tujuan yang
   * belum pernah disurvei - hotel, masjid, sekolah - seolah tidak ada di
   * Makassar. Padahal justru di situ orang ingin tahu kondisinya, dan jawaban
   * "belum ada data" adalah jawaban yang sah.
   */
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
        .cariTempatLuas(q, 4)
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
        zIndex: 30,
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
              color: isFilterDropdownOpen ? '#FDC323' : '#539BA9',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              transition: 'color 0.2s ease',
            }}
          >
            <SlidersHorizontal size={20} />
          </button>
        </div>

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
              onClick={() => onChangeUrbanFilter('PROPERTI_GO')}
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
              <span>Properti Go</span>
            </button>

            {/* Tab: Menu Go */}
            <button
              onClick={() => onChangeUrbanFilter('MENU_GO')}
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
              <span>Menu Go</span>
            </button>
          </>
        )}

        {/* 3. AI Assistant Trigger Button */}
        <button
          onClick={onOpenAiAssistant}
          className={isMobile ? 'btn-white-pill' : 'btn-circle-action'}
          title="Tanya Asisten AI DifaMap (Spatial RAG & SINI AI)"
          style={{
            position: 'relative',
            height: isMobile ? '42px' : '48px',
            padding: isMobile ? '0 14px' : undefined,
            backgroundColor: '#FFFFFF',
            flexShrink: 0,
            fontSize: isMobile ? '14px' : undefined,
            fontWeight: '700',
            border: isMobile ? '1px solid rgba(0,0,0,0.08)' : undefined,
          }}
        >
          <Sparkles size={isMobile ? 18 : 22} color="#D97706" />
          {isMobile && <span>Tanya AI</span>}
          <span
            style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#FDC323',
            }}
          />
        </button>

        {/* 4. Bagikan Laporan / Ulasan Button */}
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
      </div>
    </header>
  );
}
