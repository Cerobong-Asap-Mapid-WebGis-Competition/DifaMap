import React from 'react';
import {
  Cpu,
  Layers,
  ShieldCheck,
  Zap,
  Database,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';

/**
 * Halaman rujukan arsitektur teknis DifaMap.
 *
 * Halaman ini sengaja hanya memuat hal yang benar-benar sudah berjalan.
 * Versi sebelumnya memuat dua hal yang menyesatkan dan sudah dihapus:
 *
 *  1. Simulator "Live AI Orchestrator" yang sebenarnya setTimeout dengan
 *     hasil hardcoded — skor 1.8, indeks prioritas 82.4, 38 titik Menu Go.
 *     Semua angka itu karangan, tapi ditampilkan seolah hasil perhitungan.
 *  2. Klaim bahwa proxy backend menyembunyikan MAPID_API_KEY dari client.
 *     Style JSON basemap dibentuk MAPID dengan key tertanam di URL tile-nya,
 *     jadi proxy hanya meneruskan dokumen yang memuat key tersebut.
 */

const STATUS_HIJAU = 'sudah berjalan';
const STATUS_KUNING = 'sebagian';

type Status = typeof STATUS_HIJAU | typeof STATUS_KUNING;

const komponen: Array<{
  ikon: React.ReactNode;
  judul: string;
  status: Status;
  deskripsi: string;
  tag: string[];
}> = [
  {
    ikon: <Layers size={22} style={{ color: '#38bdf8' }} />,
    judul: 'Frontend WebGIS',
    status: STATUS_KUNING,
    deskripsi:
      'Next.js App Router di apps/web. Kerangka aplikasi, pemilih mode, dan peta MapLibre sudah tersambung ke data. Tampilan masih placeholder, menunggu desain final.',
    tag: ['Next.js 15', 'MapLibre GL', 'TypeScript'],
  },
  {
    ikon: <Database size={22} style={{ color: '#34d399' }} />,
    judul: 'PostGIS & Supabase',
    status: STATUS_KUNING,
    deskripsi:
      'Skema Prisma, trigger geometri, dan RPC skor ekonomi sudah ditulis dan lolos typecheck. Belum dijalankan di database sungguhan.',
    tag: ['PostGIS 4326', 'Prisma ORM', 'Trigger'],
  },
  {
    ikon: <Cpu size={22} style={{ color: '#f59e0b' }} />,
    judul: 'AI Orchestrator',
    status: STATUS_KUNING,
    deskripsi:
      'Ekstraksi teks dan klasifikasi foto lewat OpenAI dengan keluaran JSON terstruktur. Prompt belum dikalibrasi terhadap foto survei asli.',
    tag: ['OpenAI API', 'Structured JSON'],
  },
  {
    ikon: <ShieldCheck size={22} style={{ color: '#ec4899' }} />,
    judul: 'MAPID Competition API',
    status: STATUS_KUNING,
    deskripsi:
      'Client untuk Community Maps, Menu Go, dan Properti Go lewat server.mapid.io. Kode siap; belum pernah dipanggil ke server sungguhan.',
    tag: ['Activities', 'Menu Go', 'Properti Go'],
  },
];

function LencanaStatus({ status }: { status: Status }) {
  const gaya =
    status === STATUS_HIJAU
      ? { kelas: 'badge badge-emerald', ikon: <CheckCircle2 size={12} /> }
      : { kelas: 'badge badge-amber', ikon: <AlertTriangle size={12} /> };

  return (
    <span className={gaya.kelas}>
      {gaya.ikon} {status}
    </span>
  );
}

export default function ArsitekturPage() {
  return (
    <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 24px' }}>
      <header style={{ marginBottom: '40px' }}>
        <span className="badge badge-blue">
          <Zap size={13} /> MAPID WebGIS Competition 2026
        </span>
        <h1
          style={{
            fontSize: '2.25rem',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            lineHeight: 1.2,
            marginTop: '12px',
          }}
        >
          Arsitektur <span className="gradient-text">DifaMap</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem', marginTop: '8px' }}>
          Rujukan teknis internal. Status di tiap kartu menyatakan kondisi kode saat ini apa adanya,
          bukan rencana.
        </p>
      </header>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '20px',
          marginBottom: '40px',
        }}
      >
        {komponen.map((k) => (
          <div key={k.judul} className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              {k.ikon}
              <h2 style={{ fontSize: '1.05rem', fontWeight: 600 }}>{k.judul}</h2>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <LencanaStatus status={k.status} />
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '14px', lineHeight: 1.6 }}>
              {k.deskripsi}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {k.tag.map((t) => (
                <span key={t} className="badge badge-blue">
                  {t}
                </span>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="glass-panel" style={{ padding: '28px', marginBottom: '32px' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '8px' }}>
          Accessibility Priority Index
        </h2>
        <div className="code-block" style={{ marginBottom: '16px' }}>
          API = (0.6 × Skor Kerusakan) + (0.4 × Skor Ekonomi)
        </div>
        <dl className="ph-dl">
          <div>
            <dt>Skor Kerusakan</dt>
            <dd>Kebalikan skor aksesibilitas (1–5) dinormalisasi ke 0–100</dd>
          </div>
          <div>
            <dt>Skor Ekonomi</dt>
            <dd>Kepadatan Menu Go / Properti Go dalam radius 200m</dd>
          </div>
          <div>
            <dt>Arah pembacaan</dt>
            <dd>Indeks tinggi = kondisi buruk, prioritas perbaikan tinggi</dd>
          </div>
        </dl>
        <p
          style={{
            marginTop: '16px',
            padding: '12px 14px',
            borderRadius: '8px',
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.25)',
            fontSize: '0.85rem',
            lineHeight: 1.6,
          }}
        >
          <strong>Belum terkalibrasi.</strong> Bobot 0.6/0.4 serta pembobotan kepadatan ekonomi masih
          angka sementara yang belum diuji terhadap data lapangan. Keduanya wajib dikalibrasi ulang
          setelah data survei dan data Menu Go / Properti Go asli masuk, lalu didokumentasikan.
        </p>
      </section>

      <section className="glass-panel" style={{ padding: '28px' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '16px' }}>
          Perintah Monorepo
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
          {[
            ['Jalankan web + api', 'npm run dev'],
            ['Bangkitkan Prisma Client', 'npm run db:generate'],
            ['Dorong skema ke Supabase', 'npm run db:push'],
          ].map(([label, cmd]) => (
            <div key={cmd}>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '4px' }}>{label}</div>
              <div className="code-block">{cmd}</div>
            </div>
          ))}
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '16px', lineHeight: 1.6 }}>
          Setelah <code>db:push</code>, jalankan{' '}
          <code>apps/api/prisma/migrations_manual/01_postgis_triggers_rpc.sql</code> di Supabase SQL
          Editor untuk memasang ekstensi PostGIS, index spasial, trigger, dan RPC.
        </p>
      </section>
    </main>
  );
}
