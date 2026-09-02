import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../context/AuthContext';

export const metadata: Metadata = {
  title: 'DifaMap — Peta Cerdas Aksesibilitas Transportasi Massal Inklusif',
  description:
    'WebGIS Berbasis AI memetakan aksesibilitas infrastruktur untuk disabilitas (ramp, guiding block, trotoar) di sekitar rute transportasi massal Kota Makassar dan Kabupaten Gowa (7 Zona Kecamatan). MAPID WebGIS Competition 2026.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>
        {/* Skip link: wajib ada supaya pengguna keyboard/screen reader bisa
            melompati sidebar langsung ke konten peta & daftar titik. */}
        <a href="#konten-utama" className="skip-link">
          Lompat ke konten utama
        </a>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
