'use client';

import React from 'react';
import { X } from 'lucide-react';
import { bacaSurveiEkonomi } from '../../data/surveiEkonomi';

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
 * Yang ditampilkan hanya hasil survei lapangan - foto, menu, harga, kondisi.
 * Analisis aksesibilitas per radius tidak ikut, sesuai permintaan: satu hal
 * yang benar-benar bekerja lebih berguna daripada dua hal yang saling
 * menjatuhkan.
 */

interface Props {
  /** Baris titik ekonomi apa adanya dari API, beserta metadata surveinya. */
  titik: any;
  onClose: () => void;
}

export default function PanelSurvei({ titik, onClose }: Props) {
  const survei = bacaSurveiEkonomi(titik);
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
        position: 'fixed',
        top: '96px',
        left: '96px',
        width: '420px',
        maxWidth: 'calc(100vw - 120px)',
        maxHeight: 'calc(100vh - 130px)',
        overflowY: 'auto',
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        border: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        zIndex: 45,
        padding: '16px 18px 18px 18px',
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

      <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '12px', lineHeight: '15px' }}>
        Seluruh isi panel ini berasal dari survei lapangan tim lewat aplikasi MAPID.
        Titik ekonomi tidak mencatat parameter aksesibilitas, jadi tidak ada skor
        disabilitas yang bisa ditampilkan untuk tempat ini sendiri.
      </div>
    </aside>
  );
}
