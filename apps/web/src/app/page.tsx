'use client';

import React, { useState, useMemo } from 'react';
import AppSidebar, { SidebarMode } from '../components/layout/AppSidebar';
import TopSearchBar, { PublicSubMode, UrbanPlannerFilter } from '../components/layout/TopSearchBar';
import DetailDrawer, { SelectedItemState } from '../components/drawer/DetailDrawer';
import MapCanvas, { MapDisplayMode } from '../components/map/MapCanvas';
import CreateActivityModal from '../components/modals/CreateActivityModal';
import AiChatbotDrawer from '../components/chatbot/AiChatbotDrawer';
import InfoModal from '../components/modals/InfoModal';
import { useLocations, useActivities } from '../hooks/useDifaMap';
import { difaMapApi } from '../lib/api';

export default function HomePage() {
  // 1. Navigation Modes: Sidebar (PUBLIC vs URBAN_PLANNER) & Public SubMode (AKTIVITAS vs TEMPAT)
  // Default on load: Public mode with Aktivitas open
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('PUBLIC');
  const [publicSubMode, setPublicSubMode] = useState<PublicSubMode>('AKTIVITAS');
  const [urbanFilter, setUrbanFilter] = useState<UrbanPlannerFilter>('PROPERTI_GO');
  const [bufferRadius, setBufferRadius] = useState<number>(500);

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
  const [pickedCoordinate, setPickedCoordinate] = useState<{ latitude: number; longitude: number } | null>(null);
  const [analysisTarget, setAnalysisTarget] = useState<{ lat: number; lng: number; name?: string } | null>(null);

  // 6. SINI AI Site Selection & Site Analysis Layers
  const [isSiniGridVisible, setIsSiniGridVisible] = useState(false);
  const [siniGridSize, setSiniGridSize] = useState<number>(1000);
  const [isochroneGeoJSON, setIsochroneGeoJSON] = useState<any>(null);

  // 7. Data Fetching Hooks (Reactive to search & filters)
  const { locations, isLoading: isLoadingLocations, refetch: refetchLocations } = useLocations({
    search: searchQuery,
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

  // Sample Economic Points for Urban Planner mode (Around Makassar corridors)
  const sampleEconomicPoints = useMemo(
    () => [
      { id: 'ep-1', name: 'Coto Nusantara', type: 'MENU_GO', latitude: -5.1685, longitude: 119.4520 },
      { id: 'ep-2', name: 'Pallubasa Serigala', type: 'MENU_GO', latitude: -5.1720, longitude: 119.4480 },
      { id: 'ep-3', name: 'Kopi Kenangan Panakkukang', type: 'MENU_GO', latitude: -5.1690, longitude: 119.4465 },
      { id: 'ep-4', name: 'Mie Titi Hertasning', type: 'MENU_GO', latitude: -5.1710, longitude: 119.4540 },
      { id: 'ep-5', name: 'Gedung Graha Pena', type: 'PROPERTI_GO', latitude: -5.1670, longitude: 119.4510 },
      { id: 'ep-6', name: 'Menara Bosowa', type: 'PROPERTI_GO', latitude: -5.1735, longitude: 119.4470 },
      { id: 'ep-7', name: 'Panakkukang Square', type: 'PROPERTI_GO', latitude: -5.1695, longitude: 119.4530 },
      { id: 'ep-8', name: 'Kantor Bappeda', type: 'PROPERTI_GO', latitude: -5.1715, longitude: 119.4495 },
    ],
    []
  );

  // Handlers for Map Marker Interactions
  const handleSelectActivity = (activity: any) => {
    setSelectedItem({
      type: 'ACTIVITY',
      data: activity,
    });
  };

  const handleSelectLocation = (location: any) => {
    setSelectedItem({
      type: 'LOCATION',
      data: location,
    });
    setAnalysisTarget({
      lat: location.latitude,
      lng: location.longitude,
      name: location.name,
    });
  };

  const handlePickCoordinate = (coord: { latitude: number; longitude: number }) => {
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
        onOpenAiAssistant={() => setIsAiChatOpen(true)}
        onOpenCreateModal={() => setIsCreateModalOpen(true)}
        bufferRadius={bufferRadius}
        onChangeBufferRadius={setBufferRadius}
      />

      {/* 3. Interactive Map Canvas (MapLibre GL + Polaroid Pins & Location Badges + SINI Grid Layer) */}
      <MapCanvas
        locations={filteredLocations}
        activities={filteredActivities}
        economicPoints={sampleEconomicPoints}
        currentMode={currentMapMode}
        urbanFilter={urbanFilter}
        bufferRadius={bufferRadius}
        selectedLocationId={selectedItem?.type === 'LOCATION' ? selectedItem.data?.id : undefined}
        selectedActivityId={selectedItem?.type === 'ACTIVITY' ? selectedItem.data?.id : undefined}
        isSiniGridVisible={isSiniGridVisible}
        siniGridSize={siniGridSize}
        isochroneGeoJSON={isochroneGeoJSON}
        onSelectLocation={handleSelectLocation}
        onSelectActivity={handleSelectActivity}
        onPickCoordinate={handlePickCoordinate}
        isPickingLocation={isPickingLocation || isPickingAnalysisTarget}
      />

      {/* 4. Left Detail Drawer (Automatically slides in when a pin / polaroid is clicked) */}
      <DetailDrawer
        selectedItem={selectedItem}
        onClose={() => setSelectedItem(null)}
        onOpenCreateModalWithLocation={(loc) => {
          setPickedCoordinate({ latitude: loc.latitude, longitude: loc.longitude });
          setIsCreateModalOpen(true);
        }}
      />

      {/* 5. AI Assistant Chatbot Drawer (Spatial RAG + SINI AI Site Selection + Site Analysis) */}
      <AiChatbotDrawer
        isOpen={isAiChatOpen}
        onClose={() => setIsAiChatOpen(false)}
        selectedLocationId={selectedItem?.type === 'LOCATION' ? selectedItem.data?.id : undefined}
        onToggleSiniGrid={(show, size) => {
          setIsSiniGridVisible(show);
          if (size) setSiniGridSize(size);
        }}
        onRunIsochroneAnalysis={handleRunIsochrone}
        onSelectCoordinateForAnalysis={() => {
          setIsPickingAnalysisTarget(true);
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
            top: '96px',
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
