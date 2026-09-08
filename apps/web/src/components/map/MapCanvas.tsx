'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { difaMapApi } from '../../lib/api';
import { MapPin, Navigation, Layers, Compass, Zap, CheckCircle2 } from 'lucide-react';

interface MapCanvasProps {
  locations?: any[];
  activities?: any[];
  onSelectLocation?: (location: any) => void;
  onSelectActivity?: (activity: any) => void;
  onPickCoordinate?: (coord: { latitude: number; longitude: number }) => void;
  isPickingLocation?: boolean;
  selectedLocationId?: string;
}

export default function MapCanvas({
  locations = [],
  activities = [],
  onSelectLocation,
  onSelectActivity,
  onPickCoordinate,
  isPickingLocation = false,
  selectedLocationId,
}: MapCanvasProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [styleId, setStyleId] = useState<string>('basic');
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  /**
   * Kegagalan pemuatan peta.
   *
   * Tanpa ini, peta yang gagal memuat tampil sebagai kotak abu-abu polos tanpa
   * penjelasan apa pun - pengguna tidak punya cara tahu apakah wilayah itu
   * memang kosong, koneksinya putus, atau aplikasinya rusak.
   *
   *   'style' = berkas gaya peta gagal diambil; tidak ada yang bisa digambar
   *   'tile'  = gaya berhasil, tapi sebagian petak data gagal diunduh
   *
   * Perbedaan itu penting: gaya gagal berarti peta pasti kosong, sedangkan
   * petak gagal berarti peta tampil sebagian. Tile vector berukuran ratusan
   * kilobyte per petak, jadi jauh lebih rentan putus daripada petak raster -
   * itulah sebabnya basemap satelit bisa tetap tampil saat yang lain kosong.
   */
  const [mapError, setMapError] = useState<{ kind: 'style' | 'tile'; count: number } | null>(null);

  // 1. Inisialisasi Peta MapLibre dengan Basemap MAPID
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const styleUrl = difaMapApi.getMapStyleUrl(styleId);

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: styleUrl,
      center: [119.4500, -5.1700], // Pusat Geografis Survei Makassar & Gowa
      zoom: 12,
      pitch: 35, // Kemiringan 3D
      bearing: -10,
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');

    map.on('load', () => {
      setIsMapLoaded(true);
    });

    map.on('error', (e: any) => {
      // MapLibre memakai satu event untuk segala kesalahan. Kehadiran sourceId
      // membedakan gagalnya satu petak data dari gagalnya berkas gaya.
      const gagalPetak = Boolean(e?.sourceId);
      console.error(
        '[MapCanvas]',
        gagalPetak ? 'petak peta gagal dimuat' : 'gaya peta gagal dimuat',
        e?.error || e
      );

      setMapError((sebelumnya) => {
        if (!gagalPetak) return { kind: 'style', count: 1 };
        // Kegagalan gaya lebih parah; jangan diturunkan derajatnya oleh petak.
        if (sebelumnya?.kind === 'style') return sebelumnya;
        return { kind: 'tile', count: (sebelumnya?.count ?? 0) + 1 };
      });
    });

    // Begitu ada sumber data yang benar-benar selesai dimuat, peringatan
    // sebelumnya tidak lagi relevan - jangan biarkan menggantung.
    map.on('sourcedata', (e: any) => {
      if (e?.isSourceLoaded) setMapError(null);
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
  }, []);

  /** Memuat ulang gaya yang sedang dipakai. Cukup untuk kegagalan sementara. */
  const cobaMuatUlangPeta = () => {
    setMapError(null);
    mapRef.current?.setStyle(difaMapApi.getMapStyleUrl(styleId));
  };

  // 2. Render Pin Marker untuk Lokasi (Places & Sidewalks) dan Aktivitas
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return;

    // Bersihkan marker sebelumnya
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Render Markers Tempat & Trotoar
    locations.forEach((loc) => {
      const el = document.createElement('div');
      el.className = 'custom-map-pin';
      el.style.cursor = 'pointer';

      const isSidewalk = loc.entityType === 'SIDEWALK';
      const isSelected = loc.id === selectedLocationId;
      const scoreColor = loc.overallScore >= 4.0 ? '#10b981' : loc.overallScore >= 3.0 ? '#f59e0b' : '#ef4444';

      el.innerHTML = `
        <div style="
          background: ${isSelected ? '#38bdf8' : '#0f172a'};
          border: 2px solid ${scoreColor};
          color: white;
          padding: 5px 8px;
          border-radius: 20px;
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 11px;
          font-weight: 700;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
          transform: scale(${isSelected ? 1.15 : 1});
          transition: transform 0.2s ease;
        ">
          <span>${isSidewalk ? '🚶' : '🏢'}</span>
          <span>${loc.overallScore ? loc.overallScore.toFixed(1) : '3.5'}★</span>
        </div>
      `;

      el.addEventListener('click', () => {
        if (onSelectLocation) onSelectLocation(loc);
        mapRef.current?.flyTo({ center: [loc.longitude, loc.latitude], zoom: 15, duration: 1000 });
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([loc.longitude, loc.latitude])
        .addTo(mapRef.current!);

      markersRef.current.push(marker);
    });

    // Render Markers Aktivitas Komunitas (Foto Thumbnail)
    activities.forEach((act) => {
      const el = document.createElement('div');
      el.style.cursor = 'pointer';

      const thumbnail = act.mediaUrls && act.mediaUrls[0] ? act.mediaUrls[0] : 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=100';

      el.innerHTML = `
        <div style="
          width: 38px;
          height: 38px;
          border-radius: 50%;
          border: 2px solid #ec4899;
          overflow: hidden;
          box-shadow: 0 4px 10px rgba(236,72,153,0.5);
          background-size: cover;
          background-position: center;
          background-image: url('${thumbnail}');
        "></div>
      `;

      el.addEventListener('click', () => {
        if (onSelectActivity) onSelectActivity(act);
        mapRef.current?.flyTo({ center: [act.longitude, act.latitude], zoom: 16, duration: 1000 });
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([act.longitude, act.latitude])
        .addTo(mapRef.current!);

      markersRef.current.push(marker);
    });
  }, [locations, activities, isMapLoaded, selectedLocationId]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '500px', borderRadius: '16px', overflow: 'hidden' }}>
      {/* Canvas MapLibre Container */}
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%', minHeight: '500px' }} />

      {/*
        Peringatan kegagalan peta. Sengaja ditaruh di dalam area peta dan bukan
        di panel lain, supaya penjelasannya berada tepat di tempat masalahnya
        terlihat. role="alert" membuat pembaca layar ikut mengumumkannya, karena
        pengguna tunanetra tidak akan pernah menyadari peta yang kosong.
      */}
      {mapError && (
        <div className="map-error" role="alert">
          <strong>
            {mapError.kind === 'style'
              ? 'Peta gagal dimuat'
              : 'Sebagian peta gagal dimuat'}
          </strong>
          <p>
            {mapError.kind === 'style'
              ? 'Server basemap MAPID tidak merespons, jadi tidak ada yang bisa digambar. Koneksi internet Anda sendiri kemungkinan baik-baik saja.'
              : `${mapError.count} petak peta gagal diunduh. Bagian yang kosong bukan berarti wilayahnya tidak ada data.`}
          </p>
          <div className="map-error-actions">
            <button type="button" onClick={cobaMuatUlangPeta}>
              Coba muat ulang
            </button>
            {/* Satelit memakai petak raster kecil yang jauh lebih tahan koneksi
                buruk daripada tile vector yang ratusan kilobyte per petak. */}
            {styleId !== 'satellite' && (
              <button
                type="button"
                onClick={() => {
                  setStyleId('satellite');
                  setMapError(null);
                  mapRef.current?.setStyle(difaMapApi.getMapStyleUrl('satellite'));
                }}
              >
                Pakai basemap Satelit
              </button>
            )}
          </div>
        </div>
      )}

      {/* Floating Basemap Style Switcher (MAPID Styles) */}
      <div style={{
        position: 'absolute',
        top: '16px',
        right: '16px',
        zIndex: 10,
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.1)',
        padding: '6px 12px',
        borderRadius: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        color: '#e2e8f0',
        fontSize: '12px',
      }}>
        <Layers size={14} color="#38bdf8" />
        <span>Basemap:</span>
        <select
          value={styleId}
          onChange={(e) => {
            const newStyle = e.target.value;
            setStyleId(newStyle);
            setMapError(null);
            if (mapRef.current) {
              mapRef.current.setStyle(difaMapApi.getMapStyleUrl(newStyle));
            }
          }}
          style={{
            background: 'rgba(30, 41, 59, 0.9)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: 'white',
            borderRadius: '6px',
            padding: '2px 6px',
            fontSize: '12px',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="basic">Street 3D (MAPID)</option>
          <option value="dark">Dark Mode</option>
          <option value="light">Light Mode</option>
          <option value="street-2d-building">Street 2D</option>
          <option value="satellite">Satelit</option>
        </select>
      </div>

      {isPickingLocation && (
        <div style={{
          position: 'absolute',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 10,
          background: '#ec4899',
          color: 'white',
          padding: '8px 16px',
          borderRadius: '20px',
          fontWeight: '600',
          fontSize: '13px',
          boxShadow: '0 4px 14px rgba(236,72,153,0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <MapPin size={16} /> Klik titik pada peta untuk memilih lokasi aktivitas
        </div>
      )}
    </div>
  );
}
