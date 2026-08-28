import type { Metadata } from 'next';
import './globals.css';

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
      <body>{children}</body>
    </html>
  );
}
