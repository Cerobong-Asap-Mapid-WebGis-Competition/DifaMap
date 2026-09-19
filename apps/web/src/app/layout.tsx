import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'DifaMap — Peta Cerdas Aksesibilitas Transportasi Massal Inklusif',
  description:
    'WebGIS Berbasis AI memetakan aksesibilitas infrastruktur untuk disabilitas (ramp, guiding block, trotoar) di sekitar rute transportasi massal Kota Makassar dan Kabupaten Gowa (7 Zona Kecamatan). MAPID WebGIS Competition 2026.',
  icons: {
    icon: [
      { url: '/difamap-icon.png', sizes: '256x256', type: 'image/png' },
      { url: '/favicon.ico' },
    ],
    shortcut: '/difamap-icon.png',
    apple: '/difamap-icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
