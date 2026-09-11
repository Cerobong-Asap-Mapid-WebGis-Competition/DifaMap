'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import * as turf from '@turf/turf';
import { difaMapApi, getPrimaryPhotoUrl } from '../../lib/api';
import { UrbanPlannerFilter, PublicSubMode } from '../layout/TopSearchBar';
import { MapPin, Layers } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { susunTempat } from '../../data/tempatPilihan';
import type { RuteDigambar } from '../../data/rute';

export type MapDisplayMode = 'HALTE' | 'TEMPAT' | 'URBAN_PLANNER' | 'NONE';

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
  /**
   * Dipanggil saat pengguna mengklik label POI milik basemap MAPID - misalnya
   * "Trans Studio Mall". POI ini berasal dari tile MAPID, bukan dari basis data
   * DifaMap, dan dipakai sebagai nama tempat kanonik: hasil survei kita di
   * sekitarnya lalu ditampilkan sebagai buktinya.
   */
  /**
   * Titik yang sedang dibuka panelnya, untuk didekati peta.
   *
   * Lokasi dan aktivitas sudah didekati lewat selectedLocationId dan
   * selectedActivityId, tetapi TEMPAT tidak punya id - ia bukan baris basis
   * data. Tanpa prop ini, memilih tempat dari pencarian membuka panelnya
   * sementara petanya diam di tempat lain, dan pengguna harus mencari sendiri
   * di mana letaknya.
   */
  titikFokus?: { nama?: string; kategori?: string; latitude: number; longitude: number } | null;
  /** Radius jangkauan yang sedang dipakai panel tempat, dalam meter. */
  radiusTempat?: number;
  /**
   * Jalur rute yang sedang dibahas Difa AI, [lng, lat].
   *
   * Dikirim terpisah dari teks jawaban karena keduanya untuk mata yang berbeda:
   * kalimat menjelaskan hambatannya, garis di peta memperlihatkan jalurnya.
   * Membaca "1,7 kilometer" tidak sama dengan melihat jalan mana yang dilewati.
   */
  /**
   * Jalur yang direkomendasikan beserta pembandingnya. Yang tidak terpilih
   * digambar samar, supaya terlihat bahwa pilihan itu memang dibuat dan bukan
   * satu-satunya jalan yang ada.
   */
  rute?: RuteDigambar | null;
  /** Menutup jalur rute yang sedang tergambar. */
  onTutupRute?: () => void;
  onSelectPoi?: (poi: { nama: string; kategori?: string; latitude: number; longitude: number }) => void;
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
  titikFokus = null,
  radiusTempat = 500,
  rute = null,
  onTutupRute,
  onSelectPoi,
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
  // Dipantau khusus untuk petunjuk POI: lapisan poi_* pada tile MAPID baru ada
  // mulai zoom 14, jadi di bawah itu tidak ada tempat yang bisa diklik sama
  // sekali - dan tanpa penjelasan, keadaan itu terbaca sebagai fitur rusak.
  const [zoomSekarang, setZoomSekarang] = useState<number>(13);
  // Dinaikkan setiap peta selesai bergeser, sebagai pemicu hitung ulang penanda.
  const [petaBergeser, setPetaBergeser] = useState(0);

  // Basemap MAPID kadang lambat menjawab. Saat itu terjadi peta berpindah ke
  // OpenStreetMap, dan tanpa pemberitahuan pengguna hanya melihat peta yang
  // "tiba-tiba berbeda" tanpa tahu sebabnya maupun cara kembali.
  const [pakaiCadangan, setPakaiCadangan] = useState(false);
  const [cobaLagiPeta, setCobaLagiPeta] = useState(0);

  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  const onSelectPoiRef = useRef(onSelectPoi);
  onSelectPoiRef.current = onSelectPoi;

  const onPickCoordinateRef = useRef(onPickCoordinate);
  onPickCoordinateRef.current = onPickCoordinate;

  const isPickingLocationRef = useRef(isPickingLocation);
  isPickingLocationRef.current = isPickingLocation;

  // Helper untuk mendaftarkan semua GeoJSON sources dan layers custom (Buffer, grid prioritas, jangkauan)
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

    // 2. Lapisan grid prioritas Difa AI (sel 250 / 500 / 1000 m)
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

    // 4. Lingkaran jangkauan tempat yang sedang dibuka.
    //
    // Bukan sekadar hiasan: lingkaran ini menggambar radius yang SAMA dengan
    // yang dipakai panel untuk menghitung skor dan mengumpulkan pengamatan.
    // Orang jadi bisa melihat titik survei mana saja yang masuk hitungan,
    // alih-alih memercayai angka tanpa tahu dari mana asalnya.
    if (!map.getSource('radius-tempat-source')) {
      map.addSource('radius-tempat-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'radius-tempat-fill',
        type: 'fill',
        source: 'radius-tempat-source',
        paint: {
          'fill-color': '#FDC323',
          'fill-opacity': 0.14,
        },
      });

      map.addLayer({
        id: 'radius-tempat-line',
        type: 'line',
        source: 'radius-tempat-source',
        paint: {
          'line-color': '#FDC323',
          'line-width': 2.5,
          'line-opacity': 0.9,
        },
      });
    }

    // Cincin denyut - lingkaran kedua yang membesar berulang lalu memudar,
    // memberi kesan jangkauan yang hidup tanpa menutupi peta.
    if (!map.getSource('denyut-tempat-source')) {
      map.addSource('denyut-tempat-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'denyut-tempat-line',
        type: 'line',
        source: 'denyut-tempat-source',
        paint: {
          'line-color': '#FDC323',
          'line-width': 2,
          'line-opacity': 0.5,
        },
      });
    }

    // 5. Jalur rute kursi roda.
    //
    // Digambar dua lapis: garis putih tebal di bawah sebagai tepi, garis
    // berwarna di atasnya. Tanpa tepi putih, jalur berwarna tenggelam di atas
    // peta yang juga berwarna - terutama di kawasan padat jalan.
    // Jalur alternatif ditambahkan LEBIH DULU supaya tertumpuk di bawah jalur
    // utama. Urutan penambahan lapisan menentukan urutan tumpukan, dan jalur
    // yang direkomendasikan harus tetap yang paling jelas terbaca.
    if (!map.getSource('rute-alternatif-source')) {
      map.addSource('rute-alternatif-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'rute-alternatif-garis',
        type: 'line',
        source: 'rute-alternatif-source',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#94A3B8',
          'line-width': 4,
          'line-opacity': 0.7,
          'line-dasharray': [2, 1.6],
        },
      });
    }

    if (!map.getSource('rute-source')) {
      map.addSource('rute-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'rute-tepi',
        type: 'line',
        source: 'rute-source',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#FFFFFF', 'line-width': 9, 'line-opacity': 0.95 },
      });

      map.addLayer({
        id: 'rute-garis',
        type: 'line',
        source: 'rute-source',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#2563EB', 'line-width': 5 },
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
      setPakaiCadangan(true);
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

    // Jaring pengaman waktu.
    //
    // Sebelumnya 4 detik, dan itu terlalu ketat: isStyleLoaded() baru bernilai
    // benar setelah sprite, glyph huruf, DAN indeks tile ikut termuat. Pada
    // pengukuran, mapidtiles.json saja pernah memakan 10,3 detik - sehingga peta
    // hampir selalu menyerah lebih dulu dan diam-diam pindah ke OpenStreetMap,
    // walaupun MAPID sebenarnya menjawab dengan benar.
    const timeoutId = setTimeout(() => {
      if (!map.isStyleLoaded()) {
        triggerFallback();
      }
    }, 20000);

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
      if (!hasFallenBack) setPakaiCadangan(false);
      setupCustomLayers(map);
    });

    map.on('moveend', () => {
      setZoomSekarang(map.getZoom());
      setPetaBergeser((n) => n + 1);
    });

    // Setiap kali basemap style di-load ulang (misal ganti Street ke Dark Mode), pasang kembali layer custom
    map.on('style.load', () => {
      setupCustomLayers(map);
    });

    // Lapisan POI milik basemap MAPID. Hanya ada mulai zoom 14, dan poi_z16
    // bahkan baru muncul di zoom 16 - jadi pada tampilan se-kota tidak ada yang
    // bisa diklik. Itu ditangani lewat petunjuk zoom di bawah peta.
    const LAPISAN_POI = ['poi_z16', 'poi_z15', 'poi_z14'];

    const poiDiTitik = (titik: any) => {
      const tersedia = LAPISAN_POI.filter((id) => map.getLayer(id));
      if (tersedia.length === 0) return null;
      // Kotak kecil di sekitar kursor: label POI kecil dan sulit dikenai tepat.
      const kotak: any = [
        [titik.x - 8, titik.y - 8],
        [titik.x + 8, titik.y + 8],
      ];
      const fitur = map.queryRenderedFeatures(kotak, { layers: tersedia });
      return fitur.find((f: any) => f.properties?.name) ?? null;
    };

    map.on('click', (e: any) => {
      if (isPickingLocationRef.current && onPickCoordinateRef.current && e.lngLat) {
        onPickCoordinateRef.current({ latitude: e.lngLat.lat, longitude: e.lngLat.lng });
        return;
      }

      const poi = poiDiTitik(e.point);
      if (poi && onSelectPoiRef.current) {
        const geom: any = poi.geometry;
        const [lng, lat] = geom?.type === 'Point' ? geom.coordinates : [e.lngLat.lng, e.lngLat.lat];
        onSelectPoiRef.current({
          nama: poi.properties.name,
          kategori: poi.properties.class ?? poi.properties.subclass,
          latitude: lat,
          longitude: lng,
        });
        return;
      }

      if (onMapClickRef.current) {
        onMapClickRef.current();
      }
    });

    // Kursor berubah di atas POI supaya ketahuan bisa diklik - tanpa ini,
    // tidak ada isyarat apa pun bahwa label basemap punya fungsi.
    map.on('mousemove', (e: any) => {
      if (isPickingLocationRef.current) return;
      map.getCanvas().style.cursor = poiDiTitik(e.point) ? 'pointer' : '';
    });

    mapRef.current = map;

    return () => {
      clearTimeout(timeoutId);
      map.remove();
      mapRef.current = null;
    };
  }, [setupCustomLayers, styleId, cobaLagiPeta]);

  // Auto-fly map to selected location or activity (termasuk saat dipilih dari autocomplete search)
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return;
    // Tempat didahulukan: ia yang paling sering dibuka lewat pencarian, dan
    // koordinatnya sudah di tangan tanpa perlu dicari di daftar mana pun.
    // Panel detail menutupi sisi kiri layar - 96 piksel sidebar ditambah 420
    // piksel panel. Tanpa pergeseran, titik yang didekati mendarat tepat di
    // baliknya, dan pengguna melihat peta bergerak ke tempat yang justru tidak
    // bisa dilihatnya. Pusat karena itu dipindah ke kanan separuh lebar panel.
    //
    // Di layar sempit panel menempati bagian bawah, jadi yang digeser tingginya.
    const gesekan: [number, number] = isMobile ? [0, -110] : [258, 0];

    if (titikFokus) {
      mapRef.current.flyTo({
        center: [titikFokus.longitude, titikFokus.latitude],
        zoom: 16,
        duration: 900,
        offset: gesekan,
      });
      return;
    }

    if (selectedLocationId) {
      const loc = locations.find((l) => l.id === selectedLocationId);
      if (loc && typeof loc.longitude === 'number' && typeof loc.latitude === 'number') {
        mapRef.current.flyTo({
          center: [loc.longitude, loc.latitude],
          zoom: 16.5,
          duration: 900,
          offset: gesekan,
        });
      }
    } else if (selectedActivityId) {
      const act = activities.find((a) => a.id === selectedActivityId);
      if (act && typeof act.longitude === 'number' && typeof act.latitude === 'number') {
        mapRef.current.flyTo({
          center: [act.longitude, act.latitude],
          zoom: 16,
          duration: 900,
          offset: gesekan,
        });
      }
    }
  }, [titikFokus?.latitude, titikFokus?.longitude, selectedLocationId, selectedActivityId, isMapLoaded, isMobile, locations, activities]);

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

  /**
   * Menggambar dan menganimasikan lingkaran jangkauan tempat yang sedang dibuka.
   *
   * Dua gerakan, keduanya punya alasan:
   *
   * - Lingkaran utama tumbuh dari titiknya sampai radius penuh dalam 700 ms.
   *   Gerakan itu menjelaskan asal-usulnya - jangkauan ini berpusat DI SINI -
   *   yang tidak tersampaikan bila lingkaran muncul begitu saja.
   *
   * - Cincin denyut membesar berulang tiap 2,4 detik lalu memudar, menandai
   *   bahwa titik itu yang sedang aktif di antara puluhan pin lain.
   *
   * Keduanya berhenti dan dibersihkan saat panel ditutup.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const sumberUtama = map.getSource('radius-tempat-source') as maplibregl.GeoJSONSource;
    const sumberDenyut = map.getSource('denyut-tempat-source') as maplibregl.GeoJSONSource;
    if (!sumberUtama || !sumberDenyut) return;

    const kosong = { type: 'FeatureCollection' as const, features: [] };

    if (!titikFokus || typeof titikFokus.latitude !== 'number') {
      sumberUtama.setData(kosong);
      sumberDenyut.setData(kosong);
      return;
    }

    const pusat: [number, number] = [titikFokus.longitude, titikFokus.latitude];
    const lingkaran = (meter: number) =>
      turf.circle(pusat, Math.max(meter, 1) / 1000, { steps: 64, units: 'kilometers' });

    let frame = 0;
    const mulai = performance.now();
    const DURASI_TUMBUH = 700;
    const PERIODE_DENYUT = 2400;

    const gambar = (sekarang: number) => {
      const berlalu = sekarang - mulai;

      // Melambat di akhir: gerakan terasa mendarat, bukan terpotong.
      const majuTumbuh = Math.min(1, berlalu / DURASI_TUMBUH);
      const pelan = 1 - Math.pow(1 - majuTumbuh, 3);
      sumberUtama.setData(lingkaran(radiusTempat * pelan) as any);

      if (berlalu > DURASI_TUMBUH) {
        const fase = ((berlalu - DURASI_TUMBUH) % PERIODE_DENYUT) / PERIODE_DENYUT;
        sumberDenyut.setData(lingkaran(radiusTempat * fase) as any);
        try {
          map.setPaintProperty('denyut-tempat-line', 'line-opacity', 0.55 * (1 - fase));
        } catch {
          // Gaya peta bisa sedang dimuat ulang; denyut boleh dilewati.
        }
      }

      frame = requestAnimationFrame(gambar);
    };

    frame = requestAnimationFrame(gambar);

    return () => {
      cancelAnimationFrame(frame);
      try {
        sumberUtama.setData(kosong);
        sumberDenyut.setData(kosong);
      } catch {
        // Peta mungkin sudah dilepas.
      }
    };
  }, [titikFokus?.latitude, titikFokus?.longitude, radiusTempat, isMapLoaded, styleId]);

  /**
   * Menggambar jalur rute, lalu mengatur pandangan agar seluruh jalur terlihat.
   *
   * Mendekati salah satu ujungnya saja tidak cukup: yang ingin dilihat justru
   * keseluruhan jalannya - di mana ia berbelok, seberapa jauh memutar, dan
   * titik survei mana yang dilaluinya.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMapLoaded) return;

    const sumber = map.getSource('rute-source') as maplibregl.GeoJSONSource;
    const sumberLain = map.getSource('rute-alternatif-source') as maplibregl.GeoJSONSource;
    if (!sumber) return;

    const ruteJalur = rute?.jalur ?? null;

    if (!ruteJalur || ruteJalur.length < 2) {
      sumber.setData({ type: 'FeatureCollection', features: [] });
      sumberLain?.setData({ type: 'FeatureCollection', features: [] });
      return;
    }

    sumber.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: ruteJalur },
        },
      ],
    } as any);

    // Jalur yang tidak terpilih, digambar putus-putus abu-abu.
    const jalurLain = (rute?.pilihan ?? []).filter(
      (x) => !x.direkomendasikan && x.jalur.length > 1
    );

    sumberLain?.setData({
      type: 'FeatureCollection',
      features: jalurLain.map((x) => ({
        type: 'Feature',
        properties: { jarakMeter: x.jarakMeter },
        geometry: { type: 'LineString', coordinates: x.jalur },
      })),
    } as any);

    // Pandangan harus memuat semua jalur, bukan hanya yang terpilih. Kalau
    // hanya yang terpilih yang masuk bingkai, pembandingnya terpotong di tepi
    // layar dan justru terlihat seperti garis nyasar.
    const batas = [ruteJalur, ...jalurLain.map((x) => x.jalur)]
      .flat()
      .reduce(
        (b, [lng, lat]) => b.extend([lng, lat] as [number, number]),
        new maplibregl.LngLatBounds(ruteJalur[0], ruteJalur[0])
      );

    map.fitBounds(batas, {
      // Ruang kiri disisakan untuk panel Difa AI yang sedang terbuka; tanpa itu
      // separuh jalur mendarat di baliknya.
      padding: isMobile
        ? { top: 110, bottom: 320, left: 40, right: 40 }
        : { top: 120, bottom: 60, left: 80, right: 520 },
      duration: 1100,
      maxZoom: 16.5,
    });
  }, [rute, isMapLoaded, isMobile]);

  // 2. Render Markers Berdasarkan Mode (Aktivitas vs Tempat vs Urban Planner)
  useEffect(() => {
    // Lambang per kategori tempat, digambar sebagai garis putih di dalam pin.
    //
    // Sebelumnya dipakai emoji. Pada ukuran penanda peta, emoji tampil kecil,
    // berwarna-warni, dan bentuknya berbeda antar sistem operasi - justru sulit
    // dikenali sekilas. Bentuk garis satu warna jauh lebih terbaca di atas peta.
    const JALUR_IKON: Record<string, string> = {
      // Tas belanja
      MALL: 'M6 8h12l-1 12H7L6 8zm3 0V6a3 3 0 0 1 6 0v2',
      // Palang rumah sakit
      HEALTHCARE: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6V4z',
      // Topi wisuda
      EDUCATION: 'M12 4 2 9l10 5 10-5-10-5zM6 12v4c0 1.7 2.7 3 6 3s6-1.3 6-3v-4',
      // Payung pantai
      TOURISM: 'M12 3c5 0 9 4 9 8H3c0-4 4-8 9-8zm0 8v10',
      // Ranjang hotel
      HOTEL: 'M3 8v11m0-5h18m0 5v-7a3 3 0 0 0-3-3h-7v5M7 9.5a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2z',
      // Gedung kantor berjendela
      OFFICE: 'M5 21V4h9v17M14 10h5v11M8 8h3M8 12h3M8 16h3M17 14h1',
      // Rambu halte
      BUS_STOP: 'M6 5h12v9H6V5zm0 9v4m12-4v4M9 18v2m6-2v2M8.5 9.5h.01M15.5 9.5h.01',
      // Pejalan kaki
      PEDESTRIAN_PATH: 'M12 3.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM12 8v6m0 0-2.5 6m2.5-6 2.5 6M8 11l4-2 4 2',
      OTHER: 'M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z',
    };

    const kunciIkon = (loc: any): string => {
      if (loc.entityType === 'TRANSIT_HUB') return 'BUS_STOP';
      if (loc.entityType === 'SIDEWALK') return 'PEDESTRIAN_PATH';
      return JALUR_IKON[loc.category] ? loc.category : 'OTHER';
    };

    const ikonSvg = (kunci: string, px: number, warna: string): string =>
      `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="${warna}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${JALUR_IKON[kunci] ?? JALUR_IKON.OTHER}"/></svg>`;

    // Warna mengikuti skor aksesibilitas resmi. Lokasi yang belum pernah dinilai
    // AI (aiConfidence kosong) diberi abu-abu, bukan hijau: skornya ada di basis
    // data tetapi tidak berasal dari pengamatan foto, jadi belum layak dibaca
    // sebagai kabar baik.
    const warnaSkor = (loc: any): string => {
      if (loc.aiConfidence == null) return '#94A3B8';
      const s = loc.overallScore;
      if (typeof s !== 'number') return '#94A3B8';
      if (s < 2.5) return '#EF4444';
      if (s < 3.5) return '#F59E0B';
      return '#16A34A';
    };

    if (!mapRef.current || !isMapLoaded) return;

    // Bersihkan semua marker sebelumnya
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Aktivitas tidak lagi punya lapisannya sendiri. Setiap aktivitas menunjuk
    // balik ke sebuah lokasi dengan judul yang sama persis, jadi menggambar
    // keduanya berarti menumpuk dua pin di titik yang sama. Yang tersisa hanya
    // aktivitas yang sedang dipilih, supaya pilihan pengguna tetap terlihat.
    const actsToRender =
      currentMode === 'NONE' && selectedActivityId
        ? activities.filter((a) => a.id === selectedActivityId)
        : [];

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
    //
    // "Tempat" sebelumnya menampilkan seluruh 108 lokasi, termasuk 47 ruas
    // trotoar - sehingga tombolnya tidak menunjukkan tempat, melainkan seluruh
    // hasil survei, dan peta jadi padat tanpa bisa dibaca.
    //
    // Sekarang Tempat hanya berisi tujuan yang orang tuju: 44 PLACE dan 17
    // TRANSIT_HUB. Ruas trotoar pindah ke lapisan dasar, yaitu saat kedua
    // tombol mode dimatikan.
    const adalahTrotoar = (l: any) => l.entityType === 'SIDEWALK';

    // Tempat ditentukan tim lewat src/data/tempatPilihan.ts, bukan disimpulkan
    // dari data. Pendekatan otomatis sudah dicoba dan gagal - kesamaan kata
    // antar pengamatan menghasilkan nama seperti "Unhas Dilengkapi", dan
    // pengelompokan jarak menyatukan halte yang tak berhubungan.
    //
    // Sebelumnya sempat memakai POI basemap MAPID sebagai induk. Itu memberi
    // nama yang benar, tetapi hanya untuk POI yang sedang tampil di layar,
    // sehingga pengelompokan hilang begitu peta diperkecil. Daftar pilihan
    // bekerja di semua tingkat zoom.
    // Tempat adalah lapisan tersendiri, bukan hasil penyaringan pengamatan, jadi
    // digambar di KEDUA mode: bawaan maupun Tempat.
    // Baris tanpa aiConfidence bukan hasil survei: itu 14 data seed karangan yang
    // ringkasannya ditulis tangan di seed.ts, lengkap dengan skor yang tidak
    // pernah diamati siapa pun. Sebelumnya digambar abu-abu sebagai penanda
    // "belum dinilai", tetapi abu-abu tetap mengesankan ada sesuatu di sana -
    // dan di daftar skor tertinggi mereka justru menempati peringkat teratas.
    //
    // Disaring di sini saja, tidak dihapus dari basis data: penghapusan menyentuh
    // Supabase yang dipakai bersama dan menunggu koordinasi tim.
    const hasilSurvei = locations.filter((l: any) => l.aiConfidence != null);

    // Tempat adalah lapisan tersendiri, bukan hasil penyaringan pengamatan, jadi
    // digambar di KEDUA mode: bawaan maupun Tempat.
    const tempatPilihan =
      currentMode === 'TEMPAT' || currentMode === 'NONE' ? susunTempat(hasilSurvei) : [];

    // Mode bawaan - kedua tombol mati - menampilkan SELURUH titik lokasi: tempat,
    // simpul transit, dan ruas trotoar. Itulah gambaran utuh hasil survei.
    //
    // Aktivitas sengaja tidak ikut digambar. Seluruh 94 aktivitas menunjuk balik
    // ke sebuah lokasi lewat locationId, dengan judul yang sama persis, jadi
    // menggambar keduanya berarti menumpuk dua pin di titik yang sama.
    //
    // Tombol Tempat karena itu bukan penambah, melainkan PENYARING: ia menyisakan
    // tujuan saja, dan menampilkannya bernama supaya bisa dibaca sekilas.
    // Kedua tombol adalah PENYARING, bukan penambah: mode bawaan menampilkan
    // seluruh titik survei, Tempat menyisakan tujuan saja, Halte menyisakan
    // simpul transit saja.
    const locsToRender =
      currentMode === 'NONE'
        ? hasilSurvei
        : currentMode === 'HALTE'
          ? hasilSurvei.filter(
              (l: any) => l.entityType === 'TRANSIT_HUB' || l.category === 'BUS_STOP'
            )
          : [];

    // Satu pin per tempat, membawa nama, lambang kategori, jumlah pengamatan,
    // dan warna skor rata-ratanya - sehingga tempat terbaca sebelum diklik.
    tempatPilihan.forEach((t) => {
      const el = document.createElement('div');

      // Badan pin selalu biru supaya tempat terbedakan dari titik survei, yang
      // warnanya mengikuti skor. Skor tempat tetap ditampilkan, tetapi pindah ke
      // lencana kecil - tanpa itu, satu-satunya cara mengetahui kondisi sebuah
      // tempat adalah membuka panelnya satu per satu.
      const BIRU = '#2563EB';
      const warnaSkor =
        t.skorRata == null
          ? '#94A3B8'
          : t.skorRata < 2.5
            ? '#EF4444'
            : t.skorRata < 3.5
              ? '#F59E0B'
              : '#16A34A';

      const judul = `${t.nama.replace(/"/g, '&quot;')} (${
        t.anggota.length === 0 ? 'belum ada survei di sekitarnya' : `${t.anggota.length} pengamatan di sekitarnya`
      })`;

      el.innerHTML =
        currentMode === 'TEMPAT'
          ? `
        <div style="cursor:pointer;display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 3px 8px rgba(0,0,0,0.35));" title="${judul}">
          <div style="display:flex;align-items:center;gap:6px;background:${BIRU};color:#FFFFFF;border:2px solid #FFFFFF;border-radius:20px;padding:5px 10px;font-size:12px;font-weight:800;white-space:nowrap;">
            ${ikonSvg(t.kategori, 15, '#FFFFFF')}
            <span>${t.nama}</span>
            <span style="background:${warnaSkor};border-radius:10px;padding:1px 7px;min-width:8px;text-align:center;">${t.anggota.length}</span>
          </div>
          <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${BIRU};margin-top:-1px;"></div>
        </div>
      `
          : `
        <div style="cursor:pointer;position:relative;display:flex;flex-direction:column;align-items:center;transition:transform 0.15s ease;filter:drop-shadow(0 3px 7px rgba(0,0,0,0.34));"
             onmouseenter="this.style.transform='scale(1.15) translateY(-2px)'" onmouseleave="this.style.transform='scale(1) translateY(0)'"
             title="${judul}">
          <svg width="38" height="50" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 0C5.373 0 0 5.373 0 12C0 20.5 10.5 30.75 11.08 31.33C11.58 31.83 12.42 31.83 12.92 31.33C13.5 30.75 24 20.5 24 12C24 5.373 18.627 0 12 0Z" fill="#FFFFFF"/>
            <path d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12C1.5 19.5 10.6 28.8 11.3 29.5C11.7 29.9 12.3 29.9 12.7 29.5C13.4 28.8 22.5 19.5 22.5 12C22.5 6.2 17.8 1.5 12 1.5Z" fill="${BIRU}"/>
          </svg>
          <span style="position:absolute;top:7px;left:0;right:0;display:flex;justify-content:center;pointer-events:none;">
            ${ikonSvg(t.kategori, 19, '#FFFFFF')}
          </span>
          <span style="position:absolute;top:20px;right:2px;width:11px;height:11px;border-radius:50%;background:${warnaSkor};border:2px solid #FFFFFF;pointer-events:none;"></span>
        </div>
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onSelectPoiRef.current) {
          onSelectPoiRef.current({
            nama: t.nama,
            kategori: t.kategori,
            latitude: t.latitude,
            longitude: t.longitude,
          });
        }
      });

      const m = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([t.longitude, t.latitude])
        .addTo(mapRef.current!);
      markersRef.current.push(m);
    });

    if (locsToRender.length > 0) {
      locsToRender.forEach((loc) => {
        const el = document.createElement('div');
        el.className = 'place-pin-wrapper';

        const isSelected = loc.id === selectedLocationId;
        const isTransit = loc.entityType === 'TRANSIT_HUB' || loc.category === 'BUS_STOP';
        const kunciLambang = kunciIkon(loc);
        const warna = warnaSkor(loc);
        const belumDinilai = loc.aiConfidence == null;
        // Trotoar tampil lebih kecil: ia lapisan dasar, bukan tujuan yang dicari.
        // Di mode bawaan seluruh pin dikecilkan - bukan hanya trotoar - karena
        // 108 titik pada satu layar akan saling menutupi bila seukuran penuh.
        // Dikecilkan di mode bawaan karena 108 titik seukuran penuh pada satu
        // layar akan saling menutupi.
        const ukuran = currentMode === 'NONE' ? 0.74 : 1;

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
              ${ikonSvg(kunciLambang, 15, '#000000')}
              <span>${loc.name}</span>
              <span style="color: #000000">${
                // Lokasi tanpa penilaian AI dulu ditampilkan "4.0★" - angka yang
                // tidak pernah ada dasarnya. Sekarang ketiadaannya disebutkan.
                belumDinilai || typeof loc.overallScore !== 'number'
                  ? 'belum dinilai'
                  : `${loc.overallScore.toFixed(1)}★`
              }</span>
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
          <!--
            SATU bentuk untuk semua titik survei.

            Seluruh 108 baris di tabel locations adalah pengamatan lapangan -
            ruas trotoar, simpul transit, dan yang bertipe PLACE seperti "Toilet
            Cinema XXI Trans Studio Mall". Tidak satu pun mewakili sebuah tempat,
            jadi tidak ada alasan membedakan tampilannya.

            Yang membedakannya dari tempat adalah warna: titik survei mengikuti
            skornya, tempat selalu biru. Lambang di dalamnya tetap menunjukkan
            jenis pengamatan - pejalan kaki untuk trotoar, rambu untuk halte.
          -->
          <div style="
            cursor: pointer;
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            transform: scale(${ukuran});
            transition: transform 0.15s ease;
            filter: drop-shadow(0 2px 5px rgba(0,0,0,0.3));
          " onmouseenter="this.style.transform='scale(${ukuran * 1.25}) translateY(-2px)'" onmouseleave="this.style.transform='scale(${ukuran}) translateY(0)'" title="${loc.name.replace(/"/g, '&quot;')} (${belumDinilai ? 'belum dinilai AI' : `skor ${loc.overallScore?.toFixed(1)}`})">
            <svg width="30" height="40" viewBox="0 0 24 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 0C5.373 0 0 5.373 0 12C0 20.5 10.5 30.75 11.08 31.33C11.58 31.83 12.42 31.83 12.92 31.33C13.5 30.75 24 20.5 24 12C24 5.373 18.627 0 12 0Z" fill="${warna}"/>
              <circle cx="12" cy="11.5" r="8.2" fill="#FFFFFF"/>
            </svg>
            <span style="
              position: absolute;
              top: 6px;
              left: 0;
              right: 0;
              display: flex;
              justify-content: center;
              pointer-events: none;
            ">${ikonSvg(kunciLambang, 15, warna)}</span>
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
    // PENANDA AWAL DAN TUJUAN RUTE
    //
    // Garis rute memperlihatkan jalannya, tetapi tidak arahnya. Tanpa penanda,
    // pengguna harus menebak sendiri ujung mana yang titik berangkat - dan pada
    // rute yang memutar, tebakan itu sering keliru.
    //
    // Dibedakan bentuk maupun warnanya: lingkaran hijau berlubang untuk titik
    // berangkat, bendera merah untuk tujuan. Warna saja tidak cukup bagi
    // pengguna buta warna, yang justru termasuk sasaran aplikasi ini.
    // =========================================================================
    if (rute?.jalur && rute.jalur.length > 1) {
      const ujung: Array<{
        koordinat: [number, number];
        nama: string;
        label: string;
        warna: string;
        isi: string;
      }> = [
        {
          koordinat: rute.jalur[0],
          nama: rute.awal,
          label: 'BERANGKAT',
          warna: '#16A34A',
          isi: `<circle cx="13" cy="13" r="6.5" fill="none" stroke="#FFFFFF" stroke-width="3.5"/>`,
        },
        {
          koordinat: rute.jalur[rute.jalur.length - 1],
          nama: rute.tujuan,
          label: 'TUJUAN',
          warna: '#EF4444',
          isi: `<path d="M9.5 7v12M9.5 7.5h8l-2 2.8 2 2.8h-8" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="1.6" stroke-linejoin="round"/>`,
        },
      ];

      ujung.forEach((u) => {
        const el = document.createElement('div');
        el.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 3px 8px rgba(0,0,0,0.4));">
            <div style="background:${u.warna};color:#FFFFFF;border-radius:6px;padding:2px 7px;font-size:9.5px;font-weight:800;letter-spacing:0.04em;white-space:nowrap;margin-bottom:3px;">
              ${u.label}
            </div>
            <svg width="26" height="26" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">
              <circle cx="13" cy="13" r="11.5" fill="${u.warna}" stroke="#FFFFFF" stroke-width="3"/>
              ${u.isi}
            </svg>
          </div>
        `;
        el.title = `${u.label}: ${String(u.nama).replace(/"/g, '&quot;')}`;

        const m = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat(u.koordinat)
          .addTo(mapRef.current!);
        markersRef.current.push(m);
      });
    }

    // =========================================================================
    // PENANDA TEMPAT YANG SEDANG DIBUKA
    //
    // Peta sudah mendekati titiknya, tetapi tanpa penanda pengguna harus menebak
    // yang mana di antara puluhan pin lain - terutama untuk tempat dari hasil
    // pencarian, yang bukan bagian dari lapisan mana pun.
    //
    // Digambar terakhir supaya berada paling atas, dan sengaja memakai warna
    // kuning merek: ia bukan titik survei (yang berwarna skor) maupun tempat
    // pilihan tim (yang biru), melainkan "yang sedang Anda buka".
    // =========================================================================
    if (titikFokus && typeof titikFokus.latitude === 'number') {
      const el = document.createElement('div');
      const nama = (titikFokus.nama ?? 'Titik terpilih').replace(/"/g, '&quot;');
      const kunci = titikFokus.kategori && JALUR_IKON[titikFokus.kategori]
        ? titikFokus.kategori
        : 'OTHER';

      el.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;filter:drop-shadow(0 4px 10px rgba(0,0,0,0.4));">
          <div style="display:flex;align-items:center;gap:6px;background:#FDC323;color:#000000;border:2px solid #FFFFFF;border-radius:20px;padding:5px 11px;font-size:12px;font-weight:800;white-space:nowrap;">
            ${ikonSvg(kunci, 15, '#000000')}
            <span>${nama}</span>
          </div>
          <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid #FDC323;margin-top:-1px;"></div>
          <div style="width:10px;height:10px;border-radius:50%;background:#FDC323;border:2px solid #FFFFFF;margin-top:-3px;"></div>
        </div>
      `;

      const m = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([titikFokus.longitude, titikFokus.latitude])
        .addTo(mapRef.current!);
      markersRef.current.push(m);
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

    // 4. Perbarui data lapisan grid prioritas Difa AI (Site Selection)
    const siniSource = mapRef.current?.getSource('sini-grid-source') as maplibregl.GeoJSONSource;
    if (siniSource) {
      if (isSiniGridVisible) {
        difaMapApi.getSiniGridPriority(siniGridSize).then((res) => {
          if (res.data) {
            // Sel tanpa satu pun titik survei di bawahnya selalu bernilai 25,
            // hasil dari skor bawaan 3.0 yang dipakai server saat tidak ada data.
            // Sel seperti itu tidak digambar sama sekali: mewarnainya hijau
            // "Baik" membuat wilayah yang belum pernah disurvei terbaca sudah
            // ramah disabilitas, dan jumlahnya mayoritas mutlak di peta.
            const NILAI_SEL_KOSONG = 25;
            const berdata = (res.data.features ?? []).filter(
              (f: any) => (f.properties?.priorityIndex ?? NILAI_SEL_KOSONG) !== NILAI_SEL_KOSONG
            );
            siniSource.setData({ type: 'FeatureCollection', features: berdata });
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
    // Pengelompokan tempat memakai queryRenderedFeatures, yang hanya mengenal
    // POI di layar saat ini. Tanpa ikut memantau pergeseran peta, pin induk
    // tidak pernah dihitung ulang setelah pengguna menggeser atau memperbesar.
    petaBergeser,
    titikFokus?.latitude,
    titikFokus?.longitude,
    titikFokus?.nama,
    rute,
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

      {/* Pemberitahuan saat basemap MAPID gagal dimuat.
          Dulu hanya console.warn, sehingga pengguna melihat peta berubah tanpa
          tahu sebabnya maupun cara mengembalikannya. */}
      {pakaiCadangan && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            top: '76px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#FEF3C7',
            border: '1px solid #FDE68A',
            color: '#92400E',
            padding: '8px 12px',
            borderRadius: '10px',
            fontSize: '12px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
            zIndex: 6,
          }}
        >
          <span>Basemap MAPID lambat menjawab — sementara memakai OpenStreetMap.</span>
          <button
            onClick={() => {
              setPakaiCadangan(false);
              setCobaLagiPeta((n) => n + 1);
            }}
            style={{
              border: 'none',
              borderRadius: '8px',
              padding: '4px 10px',
              backgroundColor: '#92400E',
              color: '#FFFFFF',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Coba lagi
          </button>
        </div>
      )}

      {/* Pita rute dengan tombol tutup.
          Jalur rute bertahan sampai pertanyaan berganti, dan itu memang
          disengaja - tetapi saat pengguna pindah ke fitur lain, garis biru yang
          masih membentang jadi mengganggu tanpa ada cara jelas membuangnya. */}
      {rute?.jalur && rute.jalur.length > 1 && (
        <div
          style={{
            position: 'absolute',
            top: '96px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '22px',
            padding: '7px 8px 7px 14px',
            boxShadow: '0 6px 20px rgba(0,0,0,0.16)',
            zIndex: 25,
            maxWidth: 'min(92vw, 520px)',
          }}
        >
          <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#2563EB', flexShrink: 0 }} />
          <span
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: '#0F172A',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {rute.awal} &rarr; {rute.tujuan}
          </span>
          {/* Keterangan pilihan jalur.
              Ketika jalur yang direkomendasikan bukan yang terpendek, itu
              justru inti jawabannya - dan harus terbaca di peta, bukan hanya
              di dalam percakapan yang bisa saja sudah tergulung ke atas. */}
          {(() => {
            const lain = (rute.pilihan ?? []).filter((x) => !x.direkomendasikan);
            if (lain.length === 0) return null;
            const terpilih = (rute.pilihan ?? []).find((x) => x.direkomendasikan);
            const lebihJauh =
              terpilih && lain.some((x) => x.jarakMeter < terpilih.jarakMeter);
            return (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: lebihJauh ? '#B45309' : '#475569',
                  backgroundColor: lebihJauh ? '#FEF3C7' : '#F1F5F9',
                  borderRadius: '10px',
                  padding: '3px 8px',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
                title={
                  lebihJauh
                    ? 'Jalur terpendek dilewati karena kondisi trotoarnya lebih buruk menurut data survei.'
                    : 'Jalur ini yang terbaik menurut data survei di sepanjangnya.'
                }
              >
                {lebihJauh ? 'bukan terpendek' : 'terbaik'} &middot; {lain.length} jalur lain
              </span>
            );
          })()}
          <button
            onClick={() => onTutupRute?.()}
            title="Tutup jalur rute"
            style={{
              border: 'none',
              background: '#F1F5F9',
              borderRadius: '50%',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              color: '#334155',
            }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Petunjuk POI: muncul hanya saat peta belum cukup dekat */}
      {zoomSekarang < 14 && (
        <div
          style={{
            position: 'absolute',
            bottom: '18px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(15, 23, 42, 0.88)',
            color: '#FFFFFF',
            padding: '8px 14px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 600,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            zIndex: 5,
          }}
        >
          Perbesar peta untuk memilih tempat lain dari basemap MAPID
        </div>
      )}

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
