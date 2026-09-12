'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import AppSidebar, { SidebarMode } from '../components/layout/AppSidebar';
import TopSearchBar, { PublicSubMode, UrbanPlannerFilter } from '../components/layout/TopSearchBar';
import DetailDrawer, { SelectedItemState } from '../components/drawer/DetailDrawer';
import PanelTempat from '../components/drawer/PanelTempat';
import PanelSurvei from '../components/drawer/PanelSurvei';
import MapCanvas, { MapDisplayMode } from '../components/map/MapCanvas';
import CreateActivityModal from '../components/modals/CreateActivityModal';
import AiChatbotDrawer from '../components/chatbot/AiChatbotDrawer';
import InfoModal from '../components/modals/InfoModal';
import { useLocations, useActivities } from '../hooks/useDifaMap';
import { saringLokasi } from '../data/filterParameter';
import { bacaSurveiEkonomi, cariTitikEkonomi } from '../data/surveiEkonomi';
import type { RuteDigambar } from '../data/rute';
import { difaMapApi } from '../lib/api';
import { useIsMobile } from '../hooks/useIsMobile';

export default function HomePage() {
  const isMobile = useIsMobile(768);
  // 1. Navigation Modes: Sidebar (PUBLIC vs URBAN_PLANNER) & Public SubMode (HALTE vs TEMPAT vs NONE)
  // Default on load: Tampilan map biasa (NONE) tanpa marker bertumpuk
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('PUBLIC');
  const [publicSubMode, setPublicSubMode] = useState<PublicSubMode>('NONE');
  // Bawaannya menampilkan seluruh titik ekonomi, bukan hanya properti -
  // sejalan dengan mode bawaan di sisi disabilitas.
  const [urbanFilter, setUrbanFilter] = useState<UrbanPlannerFilter>('NONE');
  const [bufferRadius, setBufferRadius] = useState<number>(500);
  const [isBufferVisible, setIsBufferVisible] = useState<boolean>(true);

  // Effective Mode for Map Canvas
  const currentMapMode: MapDisplayMode = useMemo(() => {
    if (sidebarMode === 'PUBLIC') {
      return publicSubMode;
    }
    return 'URBAN_PLANNER';
  }, [sidebarMode, publicSubMode]);

  // 2. Search Query
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 3. Selected Item for Detail Drawer (Opens automatically on marker click)
  const [selectedItem, setSelectedItem] = useState<SelectedItemState | null>(null);

  // 4. Modals & Drawers States
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);

  // 5. Map Coordinate Picking State
  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [isPickingAnalysisTarget, setIsPickingAnalysisTarget] = useState(false);
  /** Mode memilih titik KEDUA untuk dibandingkan dengan titik analisis. */
  const [isPickingCompareTarget, setIsPickingCompareTarget] = useState(false);

  /**
   * Menunggu pengguna menunjuk sebuah titik untuk dinilai aksesibilitasnya.
   *
   * Pencarian tempat tidak akan pernah lengkap. Basisnya OpenStreetMap, dan
   * kafe atau toko yang belum didaftarkan siapa pun di sana memang tidak akan
   * ketemu - "janji jiwa" misalnya, nol hasil. Jalan ini selalu berhasil:
   * apa pun tujuannya, titiknya bisa ditunjuk langsung di peta, dan penilaian
   * disusun dari survei di sekitarnya seperti biasa.
   */
  const [isPickingTempatManual, setIsPickingTempatManual] = useState(false);

  /**
   * Penyaring parameter aksesibilitas yang sedang aktif, digabung dengan DAN.
   * Kosong berarti tidak menyaring apa pun.
   */
  const [filterAktif, setFilterAktif] = useState<string[]>([]);

  /** Radius jangkauan yang sedang ditampilkan panel tempat, untuk digambar peta. */
  const [radiusTempat, setRadiusTempat] = useState<number>(500);

  /** Jalur rute yang sedang dibahas Difa AI, untuk digambar di peta. */
  const [rute, setRute] = useState<RuteDigambar | null>(null);
  const [pickedCoordinate, setPickedCoordinate] = useState<{ latitude: number; longitude: number } | null>(null);
  const [analysisTarget, setAnalysisTarget] = useState<{ lat: number; lng: number; name?: string } | null>(null);
  const [compareTarget, setCompareTarget] = useState<{ lat: number; lng: number } | null>(null);
  /** Titik Properti Go / Menu Go yang sedang dibuka panel surveinya. */
  const [titikEkonomi, setTitikEkonomi] = useState<any>(null);
  const [isochronePembanding, setIsochronePembanding] = useState<any>(null);
  /** Koordinat titik yang sedang dianalisis, untuk ditandai sebagai "A". */
  const [titikAnalisisAktif, setTitikAnalisisAktif] = useState<{ latitude: number; longitude: number } | null>(null);

  // 6. Lapisan Site Selection & Site Analysis Difa AI
  const [isSiniGridVisible, setIsSiniGridVisible] = useState(false);
  const [siniGridSize, setSiniGridSize] = useState<number>(1000);
  const [siniGridModa, setSiniGridModa] = useState<string>('AKSESIBILITAS');
  /** Sel grid yang sedang disorot dari daftar prioritas Site Selection. */
  const [selSorotan, setSelSorotan] = useState<string | null>(null);
  const [ringkasanGrid, setRingkasanGrid] = useState<string | null>(null);
  const [isochroneGeoJSON, setIsochroneGeoJSON] = useState<any>(null);

  // 7. Reset map camera trigger
  const [resetMapTrigger, setResetMapTrigger] = useState<number>(0);

  // Fungsi untuk kembali ke tampilan normal (default) DifaMap
  const handleResetToDefault = useCallback(() => {
    setSidebarMode('PUBLIC');
    setPublicSubMode('NONE');
    setUrbanFilter('NONE');
    setBufferRadius(500);
    setIsBufferVisible(true);
    setSearchQuery('');
    setSelectedItem(null);
    setIsAiChatOpen(false);
    setIsCreateModalOpen(false);
    setIsInfoModalOpen(false);
    setIsPickingLocation(false);
    setIsPickingAnalysisTarget(false);
    setPickedCoordinate(null);
    setAnalysisTarget(null);
    setIsochroneGeoJSON(null);
    setIsSiniGridVisible(false);
    setResetMapTrigger((prev) => prev + 1);
  }, []);

  // 7. Data Fetching Hooks (Reactive to search & filters)
  const { locations, isLoading: isLoadingLocations, refetch: refetchLocations } = useLocations({
    search: searchQuery,
    limit: 300,
  });

  const { activities, isLoading: isLoadingActivities, refetch: refetchActivities } = useActivities();

  // 8. Filtered Items based on search
  const filteredActivities = useMemo(() => {
    if (!searchQuery.trim()) return activities;
    const q = searchQuery.toLowerCase();
    return activities.filter(
      (a) =>
        a.title?.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q) ||
        a.specificLocation?.toLowerCase().includes(q)
    );
  }, [activities, searchQuery]);

  const filteredLocations = useMemo(() => {
    // Penyaring parameter berlaku lebih dulu, lalu pencarian teks.
    const tersaring = saringLokasi(locations, filterAktif);

    if (!searchQuery.trim()) return tersaring;
    const q = searchQuery.toLowerCase();
    return tersaring.filter(
      (l) =>
        l.name?.toLowerCase().includes(q) ||
        l.specificLocation?.toLowerCase().includes(q) ||
        l.category?.toLowerCase().includes(q)
    );
  }, [locations, filterAktif, searchQuery]);

  // Dynamic Economic Points from MAPID (Menu Go & Properti Go - khusus Urban Planner Mode)
  const [economicPoints, setEconomicPoints] = useState<any[]>([]);

  useEffect(() => {
    if (sidebarMode === 'URBAN_PLANNER') {
      difaMapApi.getEconomicPoints()
        .then((res) => {
          if (res?.data && Array.isArray(res.data)) {
            setEconomicPoints(res.data);
          }
        })
        .catch(() => {
          // Gracefully fallback to empty array
        });
    }
  }, [sidebarMode]);

  /**
   * Panel kanan mengikuti sidebar yang dipilih.
   *
   * Di sidebar Urban Planner, Site Selection dan Site Analysis langsung
   * tertera tanpa perlu ditekan lebih dulu - keduanya memang satu-satunya
   * alasan orang masuk ke sidebar itu. Di sidebar disabilitas, panelnya
   * kembali tertutup sampai tombol Difa AI ditekan, sebab di sana petanyalah
   * yang utama, bukan percakapan.
   */
  useEffect(() => {
    setTitikEkonomi(null);
    setIsAiChatOpen(sidebarMode === 'URBAN_PLANNER');
    if (sidebarMode !== 'URBAN_PLANNER') {
      setIsochroneGeoJSON(null);
      setAnalysisTarget(null);
    }
  }, [sidebarMode]);

  /**
   * POI yang sedang dibuka, dilengkapi hasil survei bila titiknya memang titik
   * ekonomi kami.
   *
   * Panel POI bisa terbuka lewat dua jalan: menekan pin Properti Go / Menu Go,
   * atau menekan label basemap MAPID yang kebetulan menempati bangunan yang
   * sama. Jalan pertama membawa data surveinya, jalan kedua tidak - sehingga
   * foto menu Kedai Lawas muncul atau hilang tergantung piksel mana yang
   * kebetulan tertekan. Dicocokkan ulang di sini supaya jalannya tidak lagi
   * menentukan isinya.
   */
  const poiDenganSurvei = useMemo(() => {
    if (selectedItem?.type !== 'POI') return null;

    const data = selectedItem.data;
    if (data?.survei) return data;

    const eko = cariTitikEkonomi(data, economicPoints);
    return eko ? { ...data, survei: bacaSurveiEkonomi(eko) } : data;
  }, [selectedItem, economicPoints]);

  // Handlers for Map Marker Interactions
  const handleSelectActivity = (activity: any) => {
    setIsAiChatOpen(false);
    setIsochroneGeoJSON(null);
    setSelectedItem({
      type: 'ACTIVITY',
      data: activity,
    });
  };

  const handleSelectLocation = (location: any) => {
    setIsAiChatOpen(false);
    setIsochroneGeoJSON(null);
    setSelectedItem({
      type: 'LOCATION',
      data: location,
    });
    setAnalysisTarget({
      lat: location.latitude,
      lng: location.longitude,
      name: location.name,
    });
    setIsBufferVisible(true);
  };

  const handleMapClick = () => {
    if (selectedItem) {
      setSelectedItem(null);
    }
    if (titikEkonomi) {
      setTitikEkonomi(null);
    }
    if (isAiChatOpen) {
      setIsAiChatOpen(false);
      setIsPickingAnalysisTarget(false);
    }
    // Hapus lingkaran site analysis (isokron spasial) saat peta ditekan
    if (isochroneGeoJSON) {
      setIsochroneGeoJSON(null);
    }
    if (analysisTarget) {
      setAnalysisTarget(null);
    }
  };

  const handlePickCoordinate = (coord: { latitude: number; longitude: number }) => {
    if (isPickingTempatManual) {
      setIsPickingTempatManual(false);
      setSelectedItem({
        type: 'POI',
        data: {
          nama: 'Titik pilihan Anda',
          kategori: 'OTHER',
          latitude: coord.latitude,
          longitude: coord.longitude,
          // Kunci komentar dari koordinatnya, bukan dari namanya: seluruh titik
          // manual bernama sama, dan tanpa ini komentarnya akan bercampur.
          kunci: `titik-${coord.latitude.toFixed(5)}-${coord.longitude.toFixed(5)}`,
        },
      });
      return;
    }

    if (isPickingLocation) {
      setPickedCoordinate(coord);
      setIsPickingLocation(false);
      setIsCreateModalOpen(true);
    } else if (isPickingAnalysisTarget) {
      setAnalysisTarget({
        lat: coord.latitude,
        lng: coord.longitude,
        name: `Titik Terpilih (${coord.latitude.toFixed(4)}, ${coord.longitude.toFixed(4)})`,
      });
      setIsPickingAnalysisTarget(false);
      setIsAiChatOpen(true);
    } else if (isPickingCompareTarget) {
      // Titik pembanding tidak menggantikan titik analisis - keduanya hidup
      // berdampingan, sebab itulah inti fiturnya.
      setCompareTarget({ lat: coord.latitude, lng: coord.longitude });
      setIsPickingCompareTarget(false);
      setIsAiChatOpen(true);
    }
  };

  // Run Isochrone on Map
  const handleRunIsochrone = async (lat: number, lng: number, mode: 'walking' | 'wheelchair' = 'wheelchair') => {
    try {
      const res = await difaMapApi.getIsochrone(lat, lng, [5, 10, 15], mode);
      if (res.data) {
        setIsochroneGeoJSON(res.data);
      }
    } catch (err) {
      console.error('Failed to get isochrone:', err);
    }
  };

  /**
   * Isokron titik pembanding diambil terpisah.
   *
   * Endpoint perbandingan hanya mengembalikan angkanya, bukan poligonnya -
   * cukup untuk tabel, tetapi peta perlu bentuknya. Kalau panggilan ini gagal,
   * yang hilang hanya bayangan jangkauan B; penandanya tetap tergambar.
   */
  useEffect(() => {
    if (!compareTarget) {
      setIsochronePembanding(null);
      return;
    }

    let batal = false;

    difaMapApi
      .getIsochrone(compareTarget.lat, compareTarget.lng, [5, 10, 15], 'wheelchair')
      .then((res) => {
        if (!batal) setIsochronePembanding(res?.data ?? null);
      })
      .catch(() => {
        if (!batal) setIsochronePembanding(null);
      });

    return () => {
      batal = true;
    };
  }, [compareTarget]);

  // Global ESC key handler: navigasi ke langkah/halaman sebelumnya & menutup popup/drawer yang sedang aktif
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 1. Tutup Info Modal jika terbuka
        if (isInfoModalOpen) {
          setIsInfoModalOpen(false);
          return;
        }
        // 2. Tutup Create Modal / batalkan pemilihan titik jika terbuka
        if (isCreateModalOpen) {
          setIsCreateModalOpen(false);
          setIsPickingLocation(false);
          return;
        }
        // 3. Batalkan mode petunjuk pemilihan koordinat analisis
        if (isPickingAnalysisTarget) {
          setIsPickingAnalysisTarget(false);
          setIsAiChatOpen(true);
          return;
        }
        if (isPickingLocation) {
          setIsPickingLocation(false);
          return;
        }
        // 4. Tutup drawer AI Chatbot jika terbuka
        if (isAiChatOpen) {
          setIsAiChatOpen(false);
          setIsochroneGeoJSON(null);
          setAnalysisTarget(null);
          return;
        }
        // 5. Tutup Detail Drawer (item yang dipilih)
        if (selectedItem) {
          setSelectedItem(null);
          setIsochroneGeoJSON(null);
          setAnalysisTarget(null);
          return;
        }
        // 6. Jika kolom pencarian ada teks, bersihkan
        if (searchQuery) {
          setSearchQuery('');
          return;
        }
        // 7. Jika submode aktif (misal filter TEMPAT / HALTE), kembalikan ke NONE
        if (publicSubMode !== 'NONE') {
          setPublicSubMode('NONE');
          return;
        }
        // 8. Jika di Urban Planner mode, kembalikan ke normal
        if (sidebarMode !== 'PUBLIC') {
          handleResetToDefault();
          return;
        }
        // 9. Reset view peta ke koordinat awal
        handleResetToDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isInfoModalOpen,
    isCreateModalOpen,
    isPickingAnalysisTarget,
    isPickingLocation,
    isAiChatOpen,
    selectedItem,
    searchQuery,
    publicSubMode,
    sidebarMode,
    handleResetToDefault,
  ]);

  return (
    <main
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#FFFFFF',
      }}
    >
      {/* 1. Left Sidebar Navigation (Unified Public mode + Urban Planner mode) */}
      <AppSidebar
        currentMode={sidebarMode}
        onSelectMode={(mode) => setSidebarMode(mode)}
        onOpenInfoModal={() => setIsInfoModalOpen(true)}
        onResetToDefault={handleResetToDefault}
      />

      {/* 2. Top Floating Header & Filter Bar */}
      <TopSearchBar
        sidebarMode={sidebarMode}
        publicSubMode={publicSubMode}
        onSelectPublicSubMode={setPublicSubMode}
        urbanFilter={urbanFilter}
        onChangeUrbanFilter={(f) => {
          // Panel survei menutup saat berpindah antara Properti Go dan Menu Go:
          // titik yang sedang dibuka tidak lagi tergambar di peta setelahnya.
          setTitikEkonomi(null);
          setUrbanFilter(f);
        }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        locations={locations}
        activities={activities}
        onResetToDefault={handleResetToDefault}
        onSelectTempatLuar={(poi) => setSelectedItem({ type: 'POI', data: poi })}
        onMintaTunjukPeta={() => setIsPickingTempatManual(true)}
        semuaLokasi={
          // Hanya hasil survei sungguhan. Empat belas baris data seed karangan
          // sudah disaring dari peta, jadi menghitungnya di panel penyaring
          // membuat panel menjanjikan titik yang tidak akan pernah muncul:
          // "Ada toilet difabel: 7 titik", padahal ketujuhnya seed dan petanya
          // berakhir kosong saat penyaring itu dicentang.
          locations.filter((l: any) => l.aiConfidence != null)
        }
        filterAktif={filterAktif}
        onFilterChange={setFilterAktif}
        onSelectSuggestion={(item) => {
          if (item.type === 'LOCATION') {
            handleSelectLocation(item.data);
          } else {
            handleSelectActivity(item.data);
          }
        }}
        onOpenAiAssistant={() => {
          setSelectedItem(null);
          setIsAiChatOpen(true);
        }}
        onOpenCreateModal={() => setIsCreateModalOpen(true)}
        bufferRadius={bufferRadius}
        onChangeBufferRadius={setBufferRadius}
        isBufferVisible={isBufferVisible}
        onToggleBufferVisible={setIsBufferVisible}
      />

      {/* Legenda dan ringkasan grid, melayang di atas peta.
          Warnanya selama ini tidak pernah dijelaskan di mana pun - pembaca
          harus menebak sendiri apa arti merah, dan tidak ada yang memberi tahu
          bahwa petak yang tidak berwarna sama sekali berarti belum disurvei,
          bukan berarti baik. */}
      {isSiniGridVisible && !isMobile && (
        <div
          style={{
            position: 'fixed',
            left: '96px',
            bottom: '28px',
            zIndex: 30,
            width: '330px',
            maxWidth: 'calc(100vw - 620px)',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '12px',
            boxShadow: '0 8px 28px rgba(0,0,0,0.16)',
            padding: '12px 14px',
          }}
        >
          <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#0F172A', marginBottom: '7px' }}>
            Prioritas Perbaikan
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '9px' }}>
            {[
              ['rgba(239, 68, 68, 0.75)', 'Mendesak (70-100)'],
              ['rgba(245, 158, 11, 0.75)', 'Menengah (45-69)'],
              ['rgba(16, 185, 129, 0.7)', 'Rendah (di bawah 45)'],
            ].map(([warna, label]) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                <span style={{ width: '13px', height: '13px', borderRadius: '3px', backgroundColor: warna, border: '1px solid #334155', flexShrink: 0 }} />
                <span style={{ fontSize: '11px', color: '#475569' }}>{label}</span>
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <span style={{ width: '13px', height: '13px', borderRadius: '3px', backgroundColor: 'transparent', border: '1px dashed #94A3B8', flexShrink: 0 }} />
              <span style={{ fontSize: '11px', color: '#475569' }}>Tidak digambar: belum disurvei</span>
            </div>
          </div>

          {ringkasanGrid && (
            <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '9px' }}>
              <div style={{ fontSize: '10.5px', fontWeight: 800, color: '#D97706', marginBottom: '4px' }}>
                WAWASAN DIFA AI
              </div>
              <div style={{ fontSize: '11px', color: '#475569', lineHeight: '16px', maxHeight: '132px', overflowY: 'auto' }}>
                {ringkasanGrid}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Penanda saat memilih titik pembanding. */}
      {isPickingCompareTarget && (
        <div
          style={{
            position: 'fixed',
            top: isMobile ? '118px' : '84px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 60,
            backgroundColor: '#0F766E',
            color: '#FFFFFF',
            padding: isMobile ? '8px 14px' : '10px 20px',
            borderRadius: '50px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: isMobile ? '12px' : '13px',
            fontWeight: '600',
            maxWidth: '92vw',
            width: 'max-content',
          }}
        >
          <span>Klik titik KEDUA di peta untuk dibandingkan</span>
          <button
            onClick={() => {
              setIsPickingCompareTarget(false);
              setIsAiChatOpen(true);
            }}
            style={{
              backgroundColor: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '20px',
              padding: '4px 12px',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Batal
          </button>
        </div>
      )}

      {/* Floating Indicator: Mode Pilih Titik Analisis Spasial Difa AI */}
      {isPickingAnalysisTarget && (
        <div
          style={{
            position: 'fixed',
            top: isMobile ? '118px' : '84px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 60,
            backgroundColor: '#1E293B',
            color: '#FFFFFF',
            padding: isMobile ? '8px 14px' : '10px 20px',
            borderRadius: '50px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: isMobile ? '12px' : '13px',
            fontWeight: '600',
            maxWidth: '92vw',
            width: 'max-content',
          }}
        >
          <span>📍 Klik lokasi di peta untuk Site Analysis</span>
          <button
            onClick={() => {
              setIsPickingAnalysisTarget(false);
              setIsAiChatOpen(true);
            }}
            style={{
              backgroundColor: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '20px',
              padding: '4px 12px',
              color: '#FFFFFF',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
            }}
          >
            Batal
          </button>
        </div>
      )}

      {/* 3. Interactive Map Canvas (MapLibre GL + penanda lokasi + lapisan grid prioritas) */}
      <MapCanvas
        locations={filteredLocations}
        activities={filteredActivities}
        economicPoints={economicPoints}
        currentMode={currentMapMode}
        urbanFilter={urbanFilter}
        bufferRadius={bufferRadius}
        isBufferVisible={isBufferVisible}
        selectedLocationId={selectedItem?.type === 'LOCATION' ? selectedItem.data?.id : undefined}
        selectedActivityId={selectedItem?.type === 'ACTIVITY' ? selectedItem.data?.id : undefined}
        isSiniGridVisible={isSiniGridVisible}
        siniGridSize={siniGridSize}
        siniGridModa={siniGridModa}
        selSorotan={selSorotan}
        isochroneGeoJSON={isochroneGeoJSON}
        isochronePembanding={isochronePembanding}
        titikBanding={
          compareTarget
            ? {
                a: titikAnalisisAktif,
                b: { latitude: compareTarget.lat, longitude: compareTarget.lng },
              }
            : null
        }
        titikFokus={
          selectedItem?.type === 'POI'
            ? {
                nama: selectedItem.data.nama,
                kategori: selectedItem.data.kategori,
                latitude: selectedItem.data.latitude,
                longitude: selectedItem.data.longitude,
              }
            : null
        }
        radiusTempat={radiusTempat}
        rute={rute}
        onTutupRute={() => setRute(null)}
        onSelectPoi={(poi) => setSelectedItem({ type: 'POI', data: poi })}
        onSelectTitikEkonomi={(t) => {
          // Panel POI ditutup supaya keduanya tidak tampil bertumpuk.
          setSelectedItem(null);
          setTitikEkonomi(t);
        }}
        onSelectLocation={handleSelectLocation}
        onSelectActivity={handleSelectActivity}
        onPickCoordinate={handlePickCoordinate}
        onMapClick={handleMapClick}
        isPickingLocation={isPickingLocation || isPickingAnalysisTarget || isPickingCompareTarget || isPickingTempatManual}
        resetMapTrigger={resetMapTrigger}
      />

      {/* 4. Left Detail Drawer (Automatically slides in when a pin / polaroid is clicked) */}
      {/* Panel tempat MAPID - dipakai saat yang diklik adalah POI basemap,
          bukan baris di basis data DifaMap. */}
      {titikEkonomi && (
        <PanelSurvei titik={titikEkonomi} onClose={() => setTitikEkonomi(null)} />
      )}

      {selectedItem?.type === 'POI' && !titikEkonomi && (
        <PanelTempat
          poi={poiDenganSurvei}
          onClose={() => setSelectedItem(null)}
          onRadiusChange={setRadiusTempat}
        />
      )}

      <DetailDrawer
        selectedItem={selectedItem?.type === 'POI' ? null : selectedItem}
        onClose={() => setSelectedItem(null)}
        onOpenCreateModalWithLocation={(loc) => {
          setPickedCoordinate({ latitude: loc.latitude, longitude: loc.longitude });
          setIsCreateModalOpen(true);
        }}
      />

      {/* 5. Panel Difa AI (Spatial RAG + Site Selection + Site Analysis) */}
      <AiChatbotDrawer
        isOpen={isAiChatOpen}
        onClose={() => {
          setIsAiChatOpen(false);
          setIsochroneGeoJSON(null);
          setAnalysisTarget(null);
        }}
        selectedLocationId={selectedItem?.type === 'LOCATION' ? selectedItem.data?.id : undefined}
        onToggleSiniGrid={(show, size, moda) => {
          setIsSiniGridVisible(show);
          if (size) setSiniGridSize(size);
          if (moda) setSiniGridModa(moda);
          if (!show) setSelSorotan(null);
        }}
        onSorotSel={setSelSorotan}
        onWawasanGrid={setRingkasanGrid}
        onRunIsochroneAnalysis={handleRunIsochrone}
        onClearAnalysis={() => {
          setIsochroneGeoJSON(null);
          setAnalysisTarget(null);
          setCompareTarget(null);
          setTitikAnalisisAktif(null);
        }}
        onSelectLocation={(lokasi) => {
          setIsAiChatOpen(false);
          handleSelectLocation(lokasi);
        }}
        onRuteDitemukan={setRute}
        tampilan={sidebarMode === 'URBAN_PLANNER' ? 'PERENCANA' : 'CHAT'}
        onSelectCoordinateForAnalysis={() => {
          setIsPickingAnalysisTarget(true);
          setIsAiChatOpen(false);
        }}
        analysisTarget={analysisTarget}
        compareTarget={compareTarget}
        onSelectCoordinateForCompare={() => {
          setIsPickingCompareTarget(true);
          setIsAiChatOpen(false);
        }}
        onClearCompare={() => setCompareTarget(null)}
        onTitikAnalisis={setTitikAnalisisAktif}
      />

      {/* 6. Create Activity / Report Modal (Community Crowdsource) */}
      <CreateActivityModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        pickedCoordinate={pickedCoordinate}
        onStartPickCoordinate={() => {
          setIsPickingLocation(true);
        }}
        onSuccessCreated={(newAct) => {
          refetchActivities();
          refetchLocations();
          // Koordinat ikut dilepas: tanpa ini laporan berikutnya terbuka dengan
          // titik laporan sebelumnya sudah terpilih, dan pelapor yang lupa
          // menggantinya akan menaruh pengamatan baru di tempat yang lama.
          setPickedCoordinate(null);
          setSelectedItem({
            type: 'ACTIVITY',
            data: newAct,
          });
        }}
      />

      {/* 7. Info Modal (DifaMap Overview & MAPID Formula) */}
      <InfoModal
        isOpen={isInfoModalOpen}
        onClose={() => setIsInfoModalOpen(false)}
      />

      {/* 8. Elegant Loading Indicator Bar (Top Center) */}
      {(isLoadingLocations || isLoadingActivities) && (
        <div
          style={{
            position: 'fixed',
            top: isMobile ? '118px' : '96px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 35,
            backgroundColor: '#FFFFFF',
            padding: '6px 16px',
            borderRadius: '20px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            fontWeight: '600',
            color: '#539BA9',
            maxWidth: '90vw',
          }}
        >
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#FDC323',
              animation: 'pulse 1.2s infinite',
            }}
          />
          <span>Memuat data spasial aksesibilitas...</span>
        </div>
      )}
    </main>
  );
}
