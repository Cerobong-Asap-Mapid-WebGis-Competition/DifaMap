'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import AppSidebar, { SidebarMode } from '../components/layout/AppSidebar';
import TopSearchBar, { PublicSubMode, UrbanPlannerFilter } from '../components/layout/TopSearchBar';
import DetailDrawer, { SelectedItemState } from '../components/drawer/DetailDrawer';
import PanelTempat from '../components/drawer/PanelTempat';
import MapCanvas, { MapDisplayMode } from '../components/map/MapCanvas';
import CreateActivityModal from '../components/modals/CreateActivityModal';
import AiChatbotDrawer from '../components/chatbot/AiChatbotDrawer';
import InfoModal from '../components/modals/InfoModal';
import { useLocations, useActivities } from '../hooks/useDifaMap';
import { difaMapApi } from '../lib/api';
import { useIsMobile } from '../hooks/useIsMobile';

export default function HomePage() {
  const isMobile = useIsMobile(768);
  // 1. Navigation Modes: Sidebar (PUBLIC vs URBAN_PLANNER) & Public SubMode (HALTE vs TEMPAT vs NONE)
  // Default on load: Tampilan map biasa (NONE) tanpa marker bertumpuk
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('PUBLIC');
  const [publicSubMode, setPublicSubMode] = useState<PublicSubMode>('NONE');
  const [urbanFilter, setUrbanFilter] = useState<UrbanPlannerFilter>('PROPERTI_GO');
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
  const [pickedCoordinate, setPickedCoordinate] = useState<{ latitude: number; longitude: number } | null>(null);
  const [analysisTarget, setAnalysisTarget] = useState<{ lat: number; lng: number; name?: string } | null>(null);

  // 6. SINI AI Site Selection & Site Analysis Layers
  const [isSiniGridVisible, setIsSiniGridVisible] = useState(false);
  const [siniGridSize, setSiniGridSize] = useState<number>(1000);
  const [isochroneGeoJSON, setIsochroneGeoJSON] = useState<any>(null);

  // 7. Reset map camera trigger
  const [resetMapTrigger, setResetMapTrigger] = useState<number>(0);

  // Fungsi untuk kembali ke tampilan normal (default) DifaMap
  const handleResetToDefault = useCallback(() => {
    setSidebarMode('PUBLIC');
    setPublicSubMode('NONE');
    setUrbanFilter('PROPERTI_GO');
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
    if (!searchQuery.trim()) return locations;
    const q = searchQuery.toLowerCase();
    return locations.filter(
      (l) =>
        l.name?.toLowerCase().includes(q) ||
        l.specificLocation?.toLowerCase().includes(q) ||
        l.category?.toLowerCase().includes(q)
    );
  }, [locations, searchQuery]);

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
        onChangeUrbanFilter={setUrbanFilter}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        locations={locations}
        activities={activities}
        onResetToDefault={handleResetToDefault}
        onSelectTempatLuar={(poi) => setSelectedItem({ type: 'POI', data: poi })}
        onMintaTunjukPeta={() => setIsPickingTempatManual(true)}
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

      {/* Floating Indicator: Mode Pilih Titik Analisis Spasial SINI AI */}
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

      {/* 3. Interactive Map Canvas (MapLibre GL + Polaroid Pins & Location Badges + SINI Grid Layer) */}
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
        isochroneGeoJSON={isochroneGeoJSON}
        onSelectPoi={(poi) => setSelectedItem({ type: 'POI', data: poi })}
        onSelectLocation={handleSelectLocation}
        onSelectActivity={handleSelectActivity}
        onPickCoordinate={handlePickCoordinate}
        onMapClick={handleMapClick}
        isPickingLocation={isPickingLocation || isPickingAnalysisTarget || isPickingTempatManual}
        resetMapTrigger={resetMapTrigger}
      />

      {/* 4. Left Detail Drawer (Automatically slides in when a pin / polaroid is clicked) */}
      {/* Panel tempat MAPID - dipakai saat yang diklik adalah POI basemap,
          bukan baris di basis data DifaMap. */}
      {selectedItem?.type === 'POI' && (
        <PanelTempat poi={selectedItem.data} onClose={() => setSelectedItem(null)} />
      )}

      <DetailDrawer
        selectedItem={selectedItem?.type === 'POI' ? null : selectedItem}
        onClose={() => setSelectedItem(null)}
        onOpenCreateModalWithLocation={(loc) => {
          setPickedCoordinate({ latitude: loc.latitude, longitude: loc.longitude });
          setIsCreateModalOpen(true);
        }}
      />

      {/* 5. AI Assistant Chatbot Drawer (Spatial RAG + SINI AI Site Selection + Site Analysis) */}
      <AiChatbotDrawer
        isOpen={isAiChatOpen}
        onClose={() => {
          setIsAiChatOpen(false);
          setIsochroneGeoJSON(null);
          setAnalysisTarget(null);
        }}
        selectedLocationId={selectedItem?.type === 'LOCATION' ? selectedItem.data?.id : undefined}
        onToggleSiniGrid={(show, size) => {
          setIsSiniGridVisible(show);
          if (size) setSiniGridSize(size);
        }}
        onRunIsochroneAnalysis={handleRunIsochrone}
        onClearAnalysis={() => {
          setIsochroneGeoJSON(null);
          setAnalysisTarget(null);
        }}
        onSelectCoordinateForAnalysis={() => {
          setIsPickingAnalysisTarget(true);
          setIsAiChatOpen(false);
        }}
        analysisTarget={analysisTarget}
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
