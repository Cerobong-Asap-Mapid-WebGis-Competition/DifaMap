import { Suspense } from 'react';
import AppShell from '../components/AppShell';

/**
 * Halaman utama DifaMap.
 * AppShell membaca ?mode= lewat useSearchParams, sehingga wajib berada di
 * dalam <Suspense> agar build Next.js tidak gagal.
 */
export default function HomePage() {
  return (
    <Suspense fallback={<div className="map-loading">Menyiapkan DifaMap…</div>}>
      <AppShell />
    </Suspense>
  );
}
