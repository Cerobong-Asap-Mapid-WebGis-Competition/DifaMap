'use client';

import React, { useEffect, useState } from 'react';
import {
  X,
  Sparkles,
  Accessibility,
  Footprints,
  Route,
  Waves,
  Armchair,
  Droplet,
  Lightbulb,
} from 'lucide-react';
import { bacaSurveiEkonomi } from '../../data/surveiEkonomi';
import { difaMapApi } from '../../lib/api';
import { useIsMobile } from '../../hooks/useIsMobile';
import MemuatAI from '../common/MemuatAI';

/**
 * Lambang tiap parameter disabilitas.
 *
 * Ditampilkan sebagai deretan lambang, bukan tabel: di panel ini yang menjadi
 * pokok adalah hasil survei tempatnya, dan aksesibilitas sekitar hanyalah
 * keterangan pendamping. Tabel penuh akan menuntut perhatian yang tidak
 * seharusnya ia dapatkan di sini - untuk itu sudah ada panel Tempat.
 */
const LAMBANG: Record<string, any> = {
  ramp: Accessibility,
  ubin: Footprints,
  trotoar: Route,
  permukaan: Waves,
  duduk: Armchair,
  toilet: Droplet,
  terang: Lightbulb,
};

const WARNA: Record<string, { garis: string; isi: string; teks: string; kata: string }> = {
  ada: { garis: '#BBF7D0', isi: '#F0FDF4', teks: '#15803D', kata: 'terpantau layak' },
  tiada: { garis: '#FECACA', isi: '#FEF2F2', teks: '#B91C1C', kata: 'terpantau bermasalah' },
  belum: { garis: '#E2E8F0', isi: '#F8FAFC', teks: '#94A3B8', kata: 'belum teramati di foto survei' },
};

interface WawasanTempat {
  radiusMeter: number;
  jumlahTitik: number;
  skorRata: number | null;
  parameter: Array<{ kunci: string; label: string; status: 'ada' | 'tiada' | 'belum'; jumlah: number }>;
  wawasan: { ringkasan: string; temuan: string[]; catatan: string } | null;
}

/**
 * Panel hasil survei Properti Go dan Menu Go.
 *
 *
 * KENAPA PANEL SENDIRI
 *
 * Sebelumnya titik ekonomi menumpang panel POI, dan isinya terus berganti
 * sendiri: panel terbuka dengan foto menunya, lalu seketika berganti menjadi
 * panel parameter tanpa hasil survei. Penyebabnya satu titik data yang
 * diperebutkan beberapa jalur klik - penanda titik ekonomi, label basemap
 * MAPID, dan penanda tempat - yang semuanya menulis ke state yang sama.
 *
 * Dua kali menambal urutan peristiwanya tidak menyelesaikan apa pun, jadi
 * ketergantungan itu diputus: panel ini punya state sendiri yang tidak bisa
 * ditimpa siapa pun. Klik pada label basemap boleh mengubah panel POI sesuka
 * hatinya; panel ini tetap menampilkan titik yang dipilih pengguna.
 *
 * Pokoknya tetap hasil survei lapangan - foto, menu, harga, kondisi. Parameter
 * disabilitas menyusul di bawahnya sebagai deretan lambang saja, bukan tabel:
 * ia keterangan pendamping, bukan sorotan utama, dan tabel penuh akan menuntut
 * perhatian yang tidak seharusnya ia dapatkan di sini. Untuk pembacaan lengkap
 * per parameter sudah ada panel Tempat.
 */

interface Props {
  /** Baris titik ekonomi apa adanya dari API, beserta metadata surveinya. */
  titik: any;
  onClose: () => void;
}

export default function PanelSurvei({ titik, onClose }: Props) {
  const isMobile = useIsMobile(768);
  const survei = bacaSurveiEkonomi(titik);
  const [analisis, setAnalisis] = useState<WawasanTempat | null>(null);
  const [sedangMemuat, setSedangMemuat] = useState(false);

  useEffect(() => {
    if (!titik?.id) return;

    let batal = false;
    setAnalisis(null);
    setSedangMemuat(true);

    difaMapApi
      .getTempatInsight(titik.id, 500)
      .then((r) => {
        if (!batal) setAnalisis(r?.data ?? null);
      })
      .catch(() => {
        if (!batal) setAnalisis(null);
      })
      .finally(() => {
        if (!batal) setSedangMemuat(false);
      });

    return () => {
      batal = true;
    };
  }, [titik?.id]);
  const isMenuGo = titik?.type === 'MENU_GO';

  const judul =
    isMenuGo ? 'MENU GO · SURVEI LAPANGAN'
    : titik?.type === 'PROPERTI_GO' ? 'PROPERTI GO · SURVEI LAPANGAN'
    : 'SURVEI LAPANGAN MAPID';

  const nama =
    survei.rincian.find((r) => r.label === 'Nama tempat')?.nilai ?? titik?.name ?? 'Titik survei';

  return (
    <aside
      style={{
        // Di layar sempit menjadi lembar bawah selebar layar, sama seperti panel
        // Tempat. Tata letak meja - digeser 96 piksel dari kiri dan selebar 420
        // - menyisakan panel 255 piksel yang terdorong ke tepi pada ponsel 375
        // piksel, terlalu sempit untuk foto menu yang menjadi isi utamanya.
        position: 'fixed',
        top: isMobile ? 'auto' : '96px',
        bottom: isMobile ? 0 : 'auto',
        left: isMobile ? 0 : '96px',
        right: isMobile ? 0 : 'auto',
        width: isMobile ? '100%' : '420px',
        maxWidth: isMobile ? '100vw' : 'calc(100vw - 120px)',
        maxHeight: isMobile ? '62vh' : 'calc(100vh - 130px)',
        overflowY: 'auto',
        backgroundColor: '#FFFFFF',
        borderRadius: isMobile ? '16px 16px 0 0' : '16px',
        border: '1px solid rgba(0,0,0,0.08)',
        boxShadow: isMobile ? '0 -8px 32px rgba(0,0,0,0.22)' : '0 8px 32px rgba(0,0,0,0.18)',
        zIndex: 45,
        padding: isMobile ? '14px 16px 20px 16px' : '16px 18px 18px 18px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px' }}>
        <div>
          <span
            style={{
              fontSize: '10px',
              fontWeight: 800,
              letterSpacing: '0.04em',
              color: isMenuGo ? '#B45309' : '#0F766E',
              backgroundColor: isMenuGo ? '#FEF3C7' : '#CCFBF1',
              padding: '3px 8px',
              borderRadius: '10px',
            }}
          >
            {judul}
          </span>
          <h3 style={{ fontSize: '19px', fontWeight: 800, color: '#0F172A', margin: '8px 0 2px 0' }}>
            {nama}
          </h3>
          <div style={{ fontSize: '11px', color: '#94A3B8', fontFamily: 'var(--font-mono)' }}>
            {Number(titik?.latitude).toFixed(5)}, {Number(titik?.longitude).toFixed(5)}
          </div>
        </div>

        <button
          onClick={onClose}
          title="Tutup panel"
          style={{
            border: 'none',
            background: '#F1F5F9',
            borderRadius: '50%',
            width: '30px',
            height: '30px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: '#334155',
            flexShrink: 0,
          }}
        >
          <X size={17} strokeWidth={2.5} />
        </button>
      </div>

      {survei.foto.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', margin: '14px 0 4px 0' }}>
          {survei.foto.map((f) => (
            <a
              key={f.url}
              href={f.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ flexShrink: 0, width: '150px', textDecoration: 'none' }}
              title={`Buka ${f.label} ukuran penuh`}
            >
              <img
                src={f.url}
                alt={f.label}
                loading="lazy"
                style={{
                  width: '150px',
                  height: '112px',
                  objectFit: 'cover',
                  borderRadius: '10px',
                  border: '1px solid #E2E8F0',
                  display: 'block',
                }}
                onError={(e) => {
                  // Tautan foto MAPID bisa kedaluwarsa. Bingkai kosong yang rusak
                  // lebih buruk daripada tidak ada foto sama sekali.
                  const bungkus = e.currentTarget.parentElement;
                  if (bungkus) bungkus.style.display = 'none';
                }}
              />
              <div style={{ fontSize: '10px', color: '#64748B', marginTop: '4px', textAlign: 'center' }}>
                {f.label}
              </div>
            </a>
          ))}
        </div>
      )}

      {survei.rincian.length > 0 ? (
        <div style={{ marginTop: '12px', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
          {survei.rincian.map((r, i) => (
            <div
              key={r.label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '12px',
                fontSize: '12px',
                padding: '9px 12px',
                backgroundColor: i % 2 === 0 ? '#F8FAFC' : '#FFFFFF',
              }}
            >
              <span style={{ color: '#64748B', flexShrink: 0 }}>{r.label}</span>
              <span style={{ color: '#0F172A', fontWeight: 600, textAlign: 'right' }}>{r.nilai}</span>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            marginTop: '12px',
            padding: '14px',
            border: '1px dashed #CBD5E1',
            borderRadius: '10px',
            fontSize: '12px',
            color: '#64748B',
            lineHeight: '18px',
          }}
        >
          Titik ini belum punya catatan survei - hanya koordinat dan namanya yang
          tercatat. Empat belas dari dua puluh lima titik ekonomi berada dalam
          keadaan ini.
        </div>
      )}

      {/* Parameter disabilitas di sekitarnya - lambang saja. */}
      {analisis && analisis.jumlahTitik > 0 && (
        <div style={{ marginTop: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#475569' }}>
              Aksesibilitas di sekitar
            </span>
            <span style={{ fontSize: '10.5px', color: '#94A3B8' }}>
              {analisis.skorRata != null ? `skor ${analisis.skorRata} \u00b7 ` : ''}
              {analisis.jumlahTitik} titik dalam {analisis.radiusMeter} m
            </span>
          </div>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '7px' }}>
            {analisis.parameter.map((p) => {
              const Ikon = LAMBANG[p.kunci] ?? Accessibility;
              const w = WARNA[p.status];
              return (
                <div
                  key={p.kunci}
                  title={`${p.label}: ${w.kata}${p.jumlah > 0 ? ` (${p.jumlah} titik teramati)` : ''}`}
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '9px',
                    border: `1px solid ${w.garis}`,
                    backgroundColor: w.isi,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: w.teks,
                  }}
                >
                  <Ikon size={17} strokeWidth={2.2} />
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: '10px', color: '#94A3B8', marginTop: '6px', lineHeight: '14px' }}>
            Hijau layak, merah bermasalah, abu-abu belum teramati. Arahkan kursor ke
            lambang untuk namanya.
          </div>
        </div>
      )}

      {/* Tidak ada satu pun titik survei dalam jangkauan.
          Dikatakan terus terang: deretan lambang yang hilang tanpa keterangan
          akan terbaca sebagai gagal memuat, padahal ketiadaannya justru
          temuan - kawasan ini memang belum pernah didatangi surveyor. */}
      {analisis && analisis.jumlahTitik === 0 && (
        <div
          style={{
            marginTop: '14px',
            padding: '11px',
            border: '1px dashed #CBD5E1',
            borderRadius: '9px',
            fontSize: '11.5px',
            color: '#64748B',
            lineHeight: '17px',
          }}
        >
          Belum ada satu pun titik survei DifaMap dalam radius {analisis.radiusMeter} m
          dari sini, jadi kondisi aksesibilitas sekitarnya belum bisa dinilai.
        </div>
      )}

      {/* Wawasan Difa AI */}
      {sedangMemuat && (
        <div style={{ marginTop: '12px' }}>
          <MemuatAI pesan="Difa AI membaca sekitar tempat ini" />
        </div>
      )}

      {analisis?.wawasan && (
        <div style={{ marginTop: '12px', backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '10px', padding: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
            <Sparkles size={14} color="#D97706" />
            <span style={{ fontSize: '12px', fontWeight: 800, color: '#000000' }}>Wawasan Difa AI</span>
          </div>
          <div style={{ fontSize: '11.5px', color: '#475569', lineHeight: '17px' }}>
            {analisis.wawasan.ringkasan}
          </div>
          {analisis.wawasan.temuan.length > 0 && (
            <ul style={{ margin: '7px 0 0 0', paddingLeft: '16px', fontSize: '11.5px', color: '#475569', lineHeight: '17px' }}>
              {analisis.wawasan.temuan.map((t, i) => (
                <li key={i} style={{ marginTop: '2px' }}>{t}</li>
              ))}
            </ul>
          )}
          <div style={{ fontSize: '10.5px', color: '#92400E', marginTop: '7px', paddingTop: '6px', borderTop: '1px solid #FDE68A' }}>
            {analisis.wawasan.catatan}
          </div>
        </div>
      )}

      <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '12px', lineHeight: '15px' }}>
        Rincian dan foto di atas berasal dari survei lapangan tim lewat aplikasi MAPID.
        Titik ekonomi tidak mencatat parameter aksesibilitas, jadi lambang di atas
        menggambarkan SEKITAR tempat ini - bukan tempatnya sendiri.
      </div>
    </aside>
  );
}
