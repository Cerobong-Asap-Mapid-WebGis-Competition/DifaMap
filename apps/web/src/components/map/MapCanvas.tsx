'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';
import { difaMapApi, getPrimaryPhotoUrl } from '../../lib/api';
import { UrbanPlannerFilter, PublicSubMode } from '../layout/TopSearchBar';
import { MapPin, Layers } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';

export type MapDisplayMode = 'AKTIVITAS' | 'TEMPAT' | 'URBAN_PLANNER' | 'NONE';

interface MapCanvasProps {
  locations?: any[];
  activities?: any[];
  economicPoints?: any[];
  currentMode: MapDisplayMode;
  urbanFilter?: UrbanPlannerFilter;
  bufferRadius?: number;
  isBufferVisible?: boolean;
  selectedLocationId?: string;
  selectedActivityId?: string;
  isSiniGridVisible?: boolean;
  siniGridSize?: number;
  isochroneGeoJSON?: any;
  onSelectLocation?: (location: any) => void;
  onSelectActivity?: (activity: any) => void;
  onPickCoordinate?: (coord: { latitude: number; longitude: number }) => void;
  onMapClick?: () => void;
  isPickingLocation?: boolean;
  resetMapTrigger?: number;
}

export default function MapCanvas({
  locations = [],
  activities = [],
  economicPoints = [],
  currentMode,
  urbanFilter = 'PROPERTI_GO',
  bufferRadius = 500,
  isBufferVisible = true,
  selectedLocationId,
  selectedActivityId,
  isSiniGridVisible = false,
  siniGridSize = 1000,
  isochroneGeoJSON = null,
  onSelectLocation,
  onSelectActivity,
  onPickCoordinate,
  onMapClick,
  isPickingLocation = false,
  resetMapTrigger = 0,
}: MapCanvasProps) {
  const isMobile = useIsMobile(768);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [styleId, setStyleId] = useState<string>(process.env.NEXT_PUBLIC_MAPID_STYLE_ID || 'satellite');

  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  const onPickCoordinateRef = useRef(onPickCoordinate);
  onPickCoordinateRef.current = onPickCoordinate;

  const isPickingLocationRef = useRef(isPickingLocation);
  isPickingLocationRef.current = isPickingLocation;

  // Helper untuk mendaftarkan semua GeoJSON sources dan layers custom (Buffer, SINI Grid, Isochrone)
  const setupCustomLayers = useCallback((map: maplibregl.Map) => {
    // 1. Urban Planner Buffer Catchment Zone Layer
    if (!map.getSource('buffer-source')) {
      map.addSource('buffer-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'buffer-fill',
        type: 'fill',
        source: 'buffer-source',
        paint: {
          'fill-color': 'rgba(162, 162, 162, 0.28)',
          'fill-outline-color': '#434343',
        },
      });

      map.addLayer({
        id: 'buffer-line',
        type: 'line',
        source: 'buffer-source',
        paint: {
          'line-color': '#151515',
          'line-width': 2.5,
          'line-dasharray': [2, 1],
        },
      });
    }

    // 2. SINI Grid AI Layer (1000m / 500m Priority Heatmap)
    if (!map.getSource('sini-grid-source')) {
      map.addSource('sini-grid-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'sini-grid-fill',
        type: 'fill',
        source: 'sini-grid-source',
        paint: {
          'fill-color': [
            'case',
            ['>=', ['get', 'priorityIndex'], 70],
            'rgba(239, 68, 68, 0.45)', // Red (Mendesak)
            ['>=', ['get', 'priorityIndex'], 45],
            'rgba(245, 158, 11, 0.40)', // Amber (Sedang)
            'rgba(16, 185, 129, 0.35)', // Green (Baik)
          ],
          'fill-outline-color': '#334155',
        },
      });

      map.addLayer({
        id: 'sini-grid-line',
        type: 'line',
        source: 'sini-grid-source',
        paint: {
          'line-color': '#334155',
          'line-width': 1,
        },
      });
    }

    // 3. Site Analysis Isochrone Layer
    if (!map.getSource('isochrone-source')) {
      map.addSource('isochrone-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'isochrone-fill',
        type: 'fill',
        source: 'isochrone-source',
        paint: {
          'fill-color': 'rgba(83, 155, 169, 0.35)',
          'fill-outline-color': '#539BA9',
        },
      });

      map.addLayer({
        id: 'isochrone-line',
        type: 'line',
        source: 'isochrone-source',
        paint: {
          'line-color': '#539BA9',
          'line-width': 2,
        },
      });
    }
  }, []);

  // 1. Inisialisasi Peta MapLibre
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const fallbackStyle: any = {
      version: 8,
      name: 'OpenStreetMap Standard',
      sources: {
        osm: {
          type: 'raster',
          tiles: [
            'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          ],
          tileSize: 256,
          attribution: '&copy; OpenStreetMap contributors',
        },
      },
      layers: [
        {
          id: 'osm-layer',
          type: 'raster',
          source: 'osm',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    };

    const fallbackSatelliteStyle: any = {
      version: 8,
      name: 'DifaMap Satelit Fallback',
      sources: {
        satellite: {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution: '&copy; Esri World Imagery',
        },
      },
      layers: [
        {
          id: 'satellite-layer',
          type: 'raster',
          source: 'satellite',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    };

    const styleUrl = styleId === 'osm' ? fallbackStyle : difaMapApi.getMapStyleUrl(styleId);

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: styleUrl,
      center: [119.4500, -5.1700], // Wilayah Makassar & Gowa
      zoom: 13,
      pitch: 30,
      bearing: -5,
    });

    let hasFallenBack = false;
    const triggerFallback = () => {
      if (hasFallenBack) return;
      hasFallenBack = true;
      console.warn('[MapCanvas] MAPID basemap service slow or errored; gracefully falling back to resilient tiles.');
      try {
        map.setStyle(styleId === 'satellite' ? fallbackSatelliteStyle : fallbackStyle);
      } catch (err) {
        console.error('[MapCanvas] Failed to set fallback style:', err);
      }
    };

    // Pasang error handler untuk fallback style jika backend proxy/MAPID offline atau tiles error
    map.on('error', (e) => {
      const errStatus = e.error && (e.error as any).status;
      if (errStatus === 502 || errStatus === 500 || errStatus === 401 || errStatus === 403) {
        triggerFallback();
      }
    });

    // Timeout safety net: jika dalam 4 detik peta belum berhasil memuat style (misal MAPID timeout), auto-fallback
    const timeoutId = setTimeout(() => {
      if (!map.isStyleLoaded()) {
        triggerFallback();
      }
    }, 4000);

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'bottom-right'
    );

    map.on('load', () => {
      clearTimeout(timeoutId);
      setIsMapLoaded(true);
      setupCustomLayers(map);
    });

    // Setiap kali basemap style di-load ulang (misal ganti Street ke Dark Mode), pasang kembali layer custom
    map.on('style.load', () => {
      setupCustomLayers(map);
    });

    map.on('click', (e: any) => {
      if (isPickingLocationRef.current && onPickCoordinateRef.current && e.lngLat) {
        onPickCoordinateRef.current({ latitude: e.lngLat.lat, longitude: e.lngLat.lng });
      } else if (onMapClickRef.current) {
        onMapClickRef.current();
      }
    });

    mapRef.current = map;

    return () => {
      clearTimeout(timeoutId);
      map.remove();
      mapRef.current = null;
    };
  }, [setupCustomLayers, styleId]);

  // Auto-fly map to selected location or activity (termasuk saat dipilih dari autocomplete search)
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return;
    if (selectedLocationId) {
      const loc = locations.find((l) => l.id === selectedLocationId);
      if (loc && typeof loc.longitude === 'number' && typeof loc.latitude === 'number') {
        mapRef.current.flyTo({
          center: [loc.longitude, loc.latitude],
          zoom: 16.5,
          duration: 900,
        });
      }
    } else if (selectedActivityId) {
      const act = activities.find((a) => a.id === selectedActivityId);
      if (act && typeof act.longitude === 'number' && typeof act.latitude === 'number') {
        mapRef.current.flyTo({
          center: [act.longitude, act.latitude],
          zoom: 16,
          duration: 900,
        });
      }
    }
  }, [selectedLocationId, selectedActivityId, isMapLoaded, locations, activities]);

  // Reset map camera and basemap style to default Makassar & Gowa overview & satellite mode
  useEffect(() => {
    if (!resetMapTrigger || !mapRef.current || !isMapLoaded) return;
    try {
      if (styleId !== 'satellite') {
        setStyleId('satellite');
        mapRef.current.setStyle(difaMapApi.getMapStyleUrl('satellite'));
      }
      mapRef.current.flyTo({
        center: [119.4500, -5.1700],
        zoom: 13,
        pitch: 30,
        bearing: -5,
        duration: 900,
        essential: true,
      });
    } catch (err) {
      console.warn('[MapCanvas] flyTo reset failed:', err);
    }
  }, [resetMapTrigger, isMapLoaded, styleId]);

  // 2. Render Markers Berdasarkan Mode (Aktivitas vs Tempat vs Urban Planner)
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return;

    // Bersihkan semua marker sebelumnya
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const actsToRender = currentMode === 'AKTIVITAS'
      ? activities
      : (currentMode === 'NONE' && selectedActivityId
          ? activities.filter((a) => a.id === selectedActivityId)
          : []);

    if (actsToRender.length > 0) {
      actsToRender.forEach((act, index) => {
        const el = document.createElement('div');
        el.className = 'polaroid-pin-wrapper';

        const isSelected = act.id === selectedActivityId;
        const photoUrl = getPrimaryPhotoUrl(act.mediaUrls);
        const hasMultiple = Boolean(act.mediaUrls && act.mediaUrls.length > 1);
        const secondPhotoUrl = hasMultiple && act.mediaUrls[1] ? act.mediaUrls[1] : photoUrl;
        const isMultiCard = hasMultiple || index % 2 === 1; // Show stacked polaroid if multiple photos

        el.innerHTML = `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: pointer;">
            ${isMultiCard ? `
              <div style="
                position: absolute;
                top: -6px;
                left: -6px;
                width: ${isSelected ? '86px' : '72px'};
                height: ${isSelected ? '102px' : '86px'};
                background: #FFFFFF;
                border: 4px solid #FFFFFF;
                border-radius: 6px;
                box-shadow: 0 4px 10px rgba(0,0,0,0.3);
                transform: rotate(-8deg);
                z-index: 1;
              ">
                <img src="${secondPhotoUrl}" onerror="this.onerror=null; this.src='/photos/default-accessibility.jpg';" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px; filter: grayscale(20%);" />
              </div>
            ` : ''}

            <div style="
              position: relative;
              z-index: 2;
              width: ${isSelected ? '86px' : '72px'};
              height: ${isSelected ? '102px' : '86px'};
              background: #FFFFFF;
              border: 5px solid ${isSelected ? '#FDC323' : '#FFFFFF'};
              border-radius: 6px;
              box-shadow: 0 6px 16px rgba(0,0,0,0.38);
              display: flex;
              flex-direction: column;
              align-items: center;
              transform: ${isSelected ? 'scale(1.15) rotate(0deg)' : 'rotate(3deg)'};
              transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
            ">
              <img src="${photoUrl}" onerror="this.onerror=null; this.src='/photos/default-accessibility.jpg';" style="width: 100%; height: 75%; object-fit: cover; border-radius: 3px;" />
              <div style="
                width: 100%;
                height: 25%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 10px;
                font-weight: 700;
                color: #000000;
                background: #FFFFFF;
              ">
                ${act.aiScore ? `${act.aiScore.toFixed(1)}★` : '4.2★'}
              </div>
            </div>

            <!-- Bottom pointer triangle -->
            <div style="
              width: 0;
              height: 0;
              border-left: 7px solid transparent;
              border-right: 7px solid transparent;
              border-top: 9px solid ${isSelected ? '#FDC323' : '#FFFFFF'};
              margin-top: -2px;
              z-index: 3;
            "></div>
          </div>
        `;

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (onSelectActivity) onSelectActivity(act);
          mapRef.current?.flyTo({
            center: [act.longitude, act.latitude],
            zoom: 15.5,
            duration: 900,
          });
        });

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([act.longitude, act.latitude])
          .addTo(mapRef.current!);

        markersRef.current.push(marker);
      });
    }

    // =========================================================================
    // MODE 2: TEMPAT (Render Place & Transit Hub Location Pins)
    const locsToRender = currentMode === 'TEMPAT'
      ? locations
      : (currentMode === 'NONE' && selectedLocationId
          ? locations.filter((l) => l.id === selectedLocationId)
          : []);

    if (locsToRender.length > 0) {
      locsToRender.forEach((loc) => {
        const el = document.createElement('div');
        el.className = 'place-pin-wrapper';

        const isSelected = loc.id === selectedLocationId;
        const isTransit = loc.entityType === 'TRANSIT_HUB' || loc.category === 'BUS_STOP';

        el.innerHTML = isSelected ? `
          <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            cursor: pointer;
            transform: scale(1.15);
            transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
            filter: drop-shadow(0 6px 14px rgba(0,0,0,0.4));
          ">
            <div style="
              background: #FDC323;
              color: #000000;
              border: 2px solid #FFFFFF;
              padding: 6px 12px;
              border-radius: 20px;
              display: flex;
              align-items: center;
              gap: 6px;
              font-size: 12px;
              font-weight: 800;
              white-space: nowrap;
            ">
              <span>${isTransit ? '🚏' : '🏢'}</span>
              <span>${loc.name}</span>
              <span style="color: #000000">${loc.overallScore ? loc.overallScore.toFixed(1) : '4.0'}★</span>
            </div>
            
            <div style="
              width: 0;
              height: 0;
              border-left: 6px solid transparent;
              border-right: 6px solid transparent;
              border-top: 8px solid #FDC323;
              margin-top: -2px;
            "></div>
          </div>
        ` : `
          <div style="
            cursor: pointer;
            display: flex;
            flex-direction: column;
            align-items: center;
            transition: transform 0.15s ease;
            filter: drop-shadow(0 2px 5px rgba(0,0,0,0.35));
          " onmouseenter="this.style.transform='scale(1.2) translateY(-2px)'" onmouseleave="this.style.transform='scale(1) translateY(0)'" title="${loc.name}">
            <svg width="24" height="32" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 0C5.373 0 0 5.373 0 12C0 20.5 10.5 30.75 11.08 31.33C11.58 31.83 12.42 31.83 12.92 31.33C13.5 30.75 24 20.5 24 12C24 5.373 18.627 0 12 0Z" fill="#000000"/>
              <circle cx="12" cy="11" r="4.2" fill="#FFFFFF"/>
            </svg>
          </div>
        `;

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          if (onSelectLocation) onSelectLocation(loc);
          mapRef.current?.flyTo({
            center: [loc.longitude, loc.latitude],
            zoom: 16,
            duration: 900,
          });
        });

        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat([loc.longitude, loc.latitude])
          .addTo(mapRef.current!);

        markersRef.current.push(marker);
      });
    }

    // =========================================================================
    // MODE 3: URBAN PLANNER (Render Khusus Titik Properti Go & Menu Go Saja)
    // =========================================================================
    if (currentMode === 'URBAN_PLANNER') {
      // Bersihkan source buffer agar tidak ada lingkaran tersisa
      const source = mapRef.current?.getSource('buffer-source') as maplibregl.GeoJSONSource;
      if (source) {
        source.setData({
          type: 'FeatureCollection',
          features: [],
        });
      }

      // Render HANYA Economic Points sesuai tab aktif (Properti Go / Menu Go)
      economicPoints.forEach((pt) => {
        const isMenuGo = pt.type === 'MENU_GO';

        // Filter ketat sesuai tab yang dipilih
        if (urbanFilter === 'MENU_GO' && !isMenuGo) return;
        if (urbanFilter === 'PROPERTI_GO' && isMenuGo) return;

        const ptEl = document.createElement('div');
        ptEl.className = 'economic-poi-wrapper';

        ptEl.innerHTML = `
          <div style="
            background: ${isMenuGo ? '#FDC323' : '#539BA9'};
            color: ${isMenuGo ? '#000000' : '#FFFFFF'};
            border: 2px solid #FFFFFF;
            padding: 5px 11px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 800;
            display: flex;
            align-items: center;
            gap: 6px;
            box-shadow: 0 4px 14px rgba(0,0,0,0.25);
            cursor: pointer;
            transition: transform 0.15s ease;
          " onmouseenter="this.style.transform='scale(1.1)'" onmouseleave="this.style.transform='scale(1)'">
            <span>${isMenuGo ? '🍴' : '🏢'}</span>
            <span>${pt.name}</span>
          </div>
        `;

        ptEl.addEventListener('click', (e) => {
          e.stopPropagation();
          if (onSelectLocation) {
            onSelectLocation({
              id: pt.id,
              name: pt.name,
              specificLocation: pt.address || 'Kawasan Kota Makassar',
              category: isMenuGo ? 'Kuliner & UMKM (Menu Go)' : 'Properti & Hunian (Properti Go)',
              latitude: pt.latitude,
              longitude: pt.longitude,
              overallScore: 4.5,
              description: pt.description || (isMenuGo ? 'Titik kuliner & sentra ekonomi UMKM terverifikasi MAPID.' : 'Titik kawasan properti dan hunian terverifikasi MAPID.'),
            });
          }
          mapRef.current?.flyTo({
            center: [pt.longitude, pt.latitude],
            zoom: 16,
            duration: 900,
          });
        });

        const ptMarker = new maplibregl.Marker({ element: ptEl })
          .setLngLat([pt.longitude, pt.latitude])
          .addTo(mapRef.current!);

        markersRef.current.push(ptMarker);
      });
    } else {
      const source = mapRef.current?.getSource('buffer-source') as maplibregl.GeoJSONSource;
      if (source) {
        source.setData({ type: 'FeatureCollection', features: [] });
      }
    }

    // 4. Update SINI Grid AI Layer Data (Site Selection)
    const siniSource = mapRef.current?.getSource('sini-grid-source') as maplibregl.GeoJSONSource;
    if (siniSource) {
      if (isSiniGridVisible) {
        difaMapApi.getSiniGridPriority(siniGridSize).then((res) => {
          if (res.data) {
            siniSource.setData(res.data);
          }
        }).catch(console.error);
      } else {
        siniSource.setData({ type: 'FeatureCollection', features: [] });
      }
    }

    // 5. Update Site Analysis Isochrone Layer Data
    const isochroneSource = mapRef.current?.getSource('isochrone-source') as maplibregl.GeoJSONSource;
    if (isochroneSource) {
      if (isochroneGeoJSON) {
        isochroneSource.setData(isochroneGeoJSON);
      } else {
        isochroneSource.setData({ type: 'FeatureCollection', features: [] });
      }
    }
  }, [
    locations,
    activities,
    economicPoints,
    currentMode,
    urbanFilter,
    bufferRadius,
    isBufferVisible,
    selectedLocationId,
    selectedActivityId,
    isSiniGridVisible,
    siniGridSize,
    isochroneGeoJSON,
    isMapLoaded,
    onSelectActivity,
    onSelectLocation,
  ]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* MapLibre Canvas Container */}
      <div
        ref={mapContainerRef}
        style={{
          width: '100%',
          height: '100%',
          cursor: isPickingLocation ? 'crosshair' : 'grab',
        }}
      />

      {/* Floating Style Switcher (MAPID Basemap) */}
      <div
        style={{
          position: 'absolute',
          bottom: isMobile ? '80px' : '24px',
          right: isMobile ? '12px' : '72px',
          zIndex: 20,
          backgroundColor: '#FFFFFF',
          borderRadius: '24px',
          padding: isMobile ? '8px 14px' : '6px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.15)',
          fontSize: '13px',
          fontWeight: '600',
        }}
      >
        <Layers size={16} color="#539BA9" />
        <span style={{ color: '#64748B' }}>Gaya:</span>
        <select
          value={styleId}
          onChange={(e) => {
            const nextStyle = e.target.value;
            setStyleId(nextStyle);
            if (mapRef.current) {
              if (nextStyle === 'osm') {
                mapRef.current.setStyle({
                  version: 8,
                  name: 'OpenStreetMap Standard',
                  sources: {
                    osm: {
                      type: 'raster',
                      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                      tileSize: 256,
                      attribution: '&copy; OpenStreetMap contributors',
                    },
                  },
                  layers: [
                    {
                      id: 'osm-layer',
                      type: 'raster',
                      source: 'osm',
                      minzoom: 0,
                      maxzoom: 19,
                    },
                  ],
                } as any);
              } else {
                mapRef.current.setStyle(difaMapApi.getMapStyleUrl(nextStyle));
              }
            }
          }}
          style={{
            border: 'none',
            outline: 'none',
            backgroundColor: 'transparent',
            fontWeight: '700',
            fontSize: '13px',
            color: '#000000',
            cursor: 'pointer',
          }}
        >
          <option value="satellite">Satelit (Default)</option>
          <option value="basic">Street 3D / Basic (MAPID)</option>
          <option value="light">Street Light (MAPID)</option>
          <option value="dark">Dark Mode (MAPID)</option>
          <option value="osm">OpenStreetMap (Cepat)</option>
        </select>
      </div>

      {/* Picking Location Indicator */}
      {isPickingLocation && (
        <div
          style={{
            position: 'absolute',
            bottom: isMobile ? '82px' : '32px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 30,
            backgroundColor: '#FDC323',
            color: '#000000',
            padding: '10px 20px',
            borderRadius: '50px',
            fontWeight: '700',
            fontSize: isMobile ? '13px' : '14px',
            boxShadow: '0 6px 20px rgba(253, 195, 35, 0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            maxWidth: '90vw',
            textAlign: 'center',
            animation: 'pulse 2s infinite',
          }}
        >
          <MapPin size={18} strokeWidth={2.5} />
          <span>Klik sembarang titik pada peta untuk menandai lokasi</span>
        </div>
      )}
    </div>
  );
}
