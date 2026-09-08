'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';
import { difaMapApi } from '../../lib/api';
import { UrbanPlannerFilter, PublicSubMode } from '../layout/TopSearchBar';
import { MapPin, Layers } from 'lucide-react';

export type MapDisplayMode = 'AKTIVITAS' | 'TEMPAT' | 'URBAN_PLANNER';

interface MapCanvasProps {
  locations?: any[];
  activities?: any[];
  economicPoints?: any[];
  currentMode: MapDisplayMode;
  urbanFilter?: UrbanPlannerFilter;
  bufferRadius?: number;
  selectedLocationId?: string;
  selectedActivityId?: string;
  isSiniGridVisible?: boolean;
  siniGridSize?: number;
  isochroneGeoJSON?: any;
  onSelectLocation?: (location: any) => void;
  onSelectActivity?: (activity: any) => void;
  onPickCoordinate?: (coord: { latitude: number; longitude: number }) => void;
  isPickingLocation?: boolean;
}

export default function MapCanvas({
  locations = [],
  activities = [],
  economicPoints = [],
  currentMode,
  urbanFilter = 'PROPERTI_GO',
  bufferRadius = 500,
  selectedLocationId,
  selectedActivityId,
  isSiniGridVisible = false,
  siniGridSize = 1000,
  isochroneGeoJSON = null,
  onSelectLocation,
  onSelectActivity,
  onPickCoordinate,
  isPickingLocation = false,
}: MapCanvasProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [styleId, setStyleId] = useState<string>('dark');

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

    const styleUrl = difaMapApi.getMapStyleUrl(styleId);

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: styleUrl,
      center: [119.4500, -5.1700], // Wilayah Makassar & Gowa
      zoom: 13,
      pitch: 30,
      bearing: -5,
    });

    // Pasang error handler untuk fallback style jika backend proxy/MAPID offline
    map.on('error', (e) => {
      if (e.error && (e.error as any).status === 502) {
        map.setStyle(fallbackStyle);
      }
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    map.on('load', () => {
      setIsMapLoaded(true);
      setupCustomLayers(map);
    });

    // Setiap kali basemap style di-load ulang (misal ganti Street ke Dark Mode), pasang kembali layer custom
    map.on('style.load', () => {
      setupCustomLayers(map);
    });

    map.on('click', (e: any) => {
      if (onPickCoordinate && e.lngLat) {
        onPickCoordinate({ latitude: e.lngLat.lat, longitude: e.lngLat.lng });
      }
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [setupCustomLayers]);

  // 2. Render Markers Berdasarkan Mode (Aktivitas vs Tempat vs Urban Planner)
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return;

    // Bersihkan semua marker sebelumnya
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // =========================================================================
    // MODE 1: AKTIVITAS (Render Polaroid Photo Markers - Single & Multi-card)
    // =========================================================================
    if (currentMode === 'AKTIVITAS') {
      activities.forEach((act, index) => {
        const el = document.createElement('div');
        el.className = 'polaroid-pin-wrapper';

        const isSelected = act.id === selectedActivityId;
        const photoUrl = act.mediaUrls && act.mediaUrls[0]
          ? act.mediaUrls[0]
          : 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=160&q=80';

        const isMultiCard = index % 2 === 1; // Alternating multi-photo badge for visual richness

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
                <img src="${photoUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 4px; filter: grayscale(20%);" />
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
              <img src="${photoUrl}" style="width: 100%; height: 75%; object-fit: cover; border-radius: 3px;" />
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
    // =========================================================================
    if (currentMode === 'TEMPAT') {
      locations.forEach((loc) => {
        const el = document.createElement('div');
        el.className = 'place-pin-wrapper';

        const isSelected = loc.id === selectedLocationId;
        const isTransit = loc.entityType === 'TRANSIT_HUB' || loc.category === 'BUS_STOP';

        el.innerHTML = `
          <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            cursor: pointer;
          ">
            <div style="
              background: ${isSelected ? '#FDC323' : '#151515'};
              color: ${isSelected ? '#000000' : '#FFFFFF'};
              border: 2px solid #FFFFFF;
              padding: 6px 10px;
              border-radius: 20px;
              display: flex;
              align-items: center;
              gap: 6px;
              font-size: 12px;
              font-weight: 700;
              box-shadow: 0 4px 12px rgba(0,0,0,0.3);
              transform: ${isSelected ? 'scale(1.15)' : 'scale(1)'};
              transition: all 0.2s ease;
            ">
              <span>${isTransit ? '🚏' : '🏢'}</span>
              <span>${loc.name}</span>
              <span style="color: ${isSelected ? '#000000' : '#FDC323'}">${loc.overallScore ? loc.overallScore.toFixed(1) : '4.0'}★</span>
            </div>
            
            <div style="
              width: 0;
              height: 0;
              border-left: 6px solid transparent;
              border-right: 6px solid transparent;
              border-top: 8px solid ${isSelected ? '#FDC323' : '#151515'};
              margin-top: -2px;
            "></div>
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

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([loc.longitude, loc.latitude])
          .addTo(mapRef.current!);

        markersRef.current.push(marker);
      });
    }

    // =========================================================================
    // MODE 3: URBAN PLANNER (Render Buffer Catchment & Economic POIs)
    // =========================================================================
    if (currentMode === 'URBAN_PLANNER') {
      const targetLoc = locations.find((l) => l.id === selectedLocationId) || locations[0];

      if (targetLoc && mapRef.current) {
        // 1. Draw Turf Circle Buffer on MapLibre Layer
        const center = [targetLoc.longitude, targetLoc.latitude];
        const circlePolygon = turf.circle(center, bufferRadius / 1000, {
          steps: 64,
          units: 'kilometers',
        });

        const source = mapRef.current.getSource('buffer-source') as maplibregl.GeoJSONSource;
        if (source) {
          source.setData({
            type: 'FeatureCollection',
            features: [circlePolygon],
          });
        }

        // 2. Render Target Transit Hub Pin
        const hubEl = document.createElement('div');
        hubEl.innerHTML = `
          <div style="
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: #151515;
            border: 3px solid #FFFFFF;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            cursor: pointer;
          ">
            🚏
          </div>
        `;
        hubEl.addEventListener('click', () => {
          if (onSelectLocation) onSelectLocation(targetLoc);
        });

        const hubMarker = new maplibregl.Marker({ element: hubEl })
          .setLngLat([targetLoc.longitude, targetLoc.latitude])
          .addTo(mapRef.current);

        markersRef.current.push(hubMarker);

        // 3. Render Economic Points (Menu Go or Properti Go POIs)
        economicPoints.forEach((pt) => {
          const ptEl = document.createElement('div');
          const isMenuGo = pt.type === 'MENU_GO';

          // Filter by active tab
          if (urbanFilter === 'MENU_GO' && !isMenuGo) return;
          if (urbanFilter === 'PROPERTI_GO' && isMenuGo) return;

          ptEl.innerHTML = `
            <div style="
              background: ${isMenuGo ? '#FDC323' : '#539BA9'};
              color: ${isMenuGo ? '#000000' : '#FFFFFF'};
              border: 1.5px solid #FFFFFF;
              padding: 3px 8px;
              border-radius: 12px;
              font-size: 11px;
              font-weight: 700;
              box-shadow: 0 2px 8px rgba(0,0,0,0.25);
              cursor: pointer;
            ">
              ${isMenuGo ? '🍴' : '🏢'} ${pt.name}
            </div>
          `;

          const ptMarker = new maplibregl.Marker({ element: ptEl })
            .setLngLat([pt.longitude, pt.latitude])
            .addTo(mapRef.current!);

          markersRef.current.push(ptMarker);
        });
      }
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
          bottom: '24px',
          right: '72px', // Next to navigation control
          zIndex: 20,
          backgroundColor: '#FFFFFF',
          borderRadius: '24px',
          padding: '6px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          fontSize: '12px',
          fontWeight: '600',
        }}
      >
        <Layers size={15} color="#539BA9" />
        <span style={{ color: '#767676' }}>Gaya:</span>
        <select
          value={styleId}
          onChange={(e) => {
            const nextStyle = e.target.value;
            setStyleId(nextStyle);
            if (mapRef.current) {
              mapRef.current.setStyle(difaMapApi.getMapStyleUrl(nextStyle));
            }
          }}
          style={{
            border: 'none',
            outline: 'none',
            backgroundColor: 'transparent',
            fontWeight: '700',
            fontSize: '12px',
            color: '#000000',
            cursor: 'pointer',
          }}
        >
          <option value="dark">Dark Mode (MAPID)</option>
          <option value="light">Street Light (MAPID)</option>
          <option value="satellite">Satelit (MAPID)</option>
        </select>
      </div>

      {/* Picking Location Indicator */}
      {isPickingLocation && (
        <div
          style={{
            position: 'absolute',
            bottom: '32px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 30,
            backgroundColor: '#FDC323',
            color: '#000000',
            padding: '10px 20px',
            borderRadius: '50px',
            fontWeight: '700',
            fontSize: '14px',
            boxShadow: '0 6px 20px rgba(253, 195, 35, 0.5)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
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
