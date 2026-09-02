'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { distance } from '@turf/turf';

import Sidebar, { AppMode } from './layout/Sidebar';
import FilterPanel from './panels/FilterPanel';
import LocationDetailPanel from './panels/LocationDetailPanel';
import PlannerPanel from './panels/PlannerPanel';
import ChatPanel from './panels/ChatPanel';
import LocationListView from './a11y/LocationListView';
import { Placeholder } from './ui/Placeholder';
import { useLocations } from '../hooks/useDifaMap';

// MapLibre menyentuh `window` saat diimpor, jadi harus dimuat khusus di browser.
const MapCanvas = dynamic(() => import('./map/MapCanvas'), {
  ssr: false,
  loading: () => <div className="map-loading">Memuat peta…</div>,
});

export default function AppShell() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Mode disimpan di URL supaya bisa di-share & tahan refresh.
  // Default = Mode Disabilitas (DEVELOPMENT.md §3).
  const mode: AppMode = searchParams.get('mode') === 'planner' ? 'planner' : 'disabilitas';

  const setMode = (next: AppMode) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('mode', next);
    router.replace(`/?${params.toString()}`, { scroll: false });
  };

  const { locations, isLoading, error, filters, setFilters } = useLocations({ limit: 100 });

  const [selected, setSelected] = useState<any | null>(null);
  const [radiusMeters, setRadiusMeters] = useState(0);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | undefined>();
  const [geoError, setGeoError] = useState<string | null>(null);

  // Ambil posisi pengguna hanya saat radius diaktifkan, bukan saat halaman dibuka,
  // supaya prompt izin lokasi tidak muncul tanpa alasan yang jelas bagi pengguna.
  useEffect(() => {
    if (radiusMeters === 0 || userLocation) return;

    if (!('geolocation' in navigator)) {
      setGeoError('Perangkat ini tidak mendukung geolokasi. Pilih titik tujuan di peta sebagai gantinya.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setGeoError(null);
      },
      () => {
        setGeoError('Izin lokasi ditolak. Filter radius dinonaktifkan — pilih titik tujuan di peta sebagai gantinya.');
        setRadiusMeters(0);
      }
    );
  }, [radiusMeters, userLocation]);

  // Filter radius dihitung di sisi klien (Haversine via Turf.js), TIDAK menyentuh
  // logika clustering backend — sesuai DEVELOPMENT.md §9.
  const visibleLocations = useMemo(() => {
    if (radiusMeters === 0 || !userLocation) return locations;

    const from: [number, number] = [userLocation.longitude, userLocation.latitude];
    return locations.filter((loc) => {
      const meters = distance(from, [loc.longitude, loc.latitude], { units: 'meters' });
      return meters <= radiusMeters;
    });
  }, [locations, radiusMeters, userLocation]);

  return (
    <div className="app-shell">
      <Sidebar mode={mode} onModeChange={setMode} />

      <main id="konten-utama" className="app-main">
        <div className="map-area">
          <MapCanvas
            locations={visibleLocations}
            onSelectLocation={setSelected}
            selectedLocationId={selected?.id}
          />
        </div>

        {/* Padanan peta berbasis teks — selalu tampil, bukan fitur opsional. */}
        <section aria-labelledby="judul-daftar" className="panel list-area">
          <h2 id="judul-daftar" className="panel-title">
            Daftar Titik ({visibleLocations.length})
          </h2>
          <LocationListView
            locations={visibleLocations}
            isLoading={isLoading}
            error={error}
            selectedId={selected?.id}
            onSelect={setSelected}
          />
        </section>
      </main>

      <aside className="app-aside" aria-label="Panel informasi">
        {geoError && (
          <p className="panel-state" role="alert">
            {geoError}
          </p>
        )}

        {mode === 'disabilitas' ? (
          <>
            <FilterPanel
              filters={filters}
              onChange={setFilters}
              radiusMeters={radiusMeters}
              onRadiusChange={setRadiusMeters}
              resultCount={visibleLocations.length}
            />
            <LocationDetailPanel location={selected} onClose={() => setSelected(null)} />
          </>
        ) : (
          <>
            <PlannerPanel locations={locations} isLoading={isLoading} onSelect={setSelected} />
            <LocationDetailPanel location={selected} onClose={() => setSelected(null)} />
            <Placeholder
              label="Layer Analisis Peta"
              docRef="DEVELOPMENT.md §9 Mode Urban Planner"
              description="Heatmap KDE, choropleth kecamatan, dan lingkaran radius 200m belum dirender di MapCanvas — semuanya menunggu endpoint backend."
            />
          </>
        )}

        <ChatPanel selectedLocationId={selected?.id} userLocation={userLocation} />
      </aside>
    </div>
  );
}
