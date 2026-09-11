'use client';

import React from 'react';

/**
 * Penampil jawaban Difa AI.
 *
 * Model menjawab dengan markdown - tebal, judul, butir, penomoran - dan
 * sebelumnya seluruhnya dicetak apa adanya. Yang terbaca pengguna adalah
 * "1. **Jalur 1**: 1854 m" beserta bintang dan pagarnya, pada jawaban yang
 * justru paling ingin diperlihatkan. Isinya benar, tetapi rupanya seperti
 * keluaran mentah yang lupa dirapikan.
 *
 * Ditulis sendiri alih-alih memasang pustaka markdown karena yang dibutuhkan
 * hanya empat hal, dan menambah dependensi berarti seluruh anggota tim harus
 * memasang ulang sebelum bisa menjalankan webnya. Simpul React dibentuk
 * langsung, tidak lewat innerHTML, jadi teks dari model tidak pernah bisa
 * menjadi markup.
 */

/** Menandai tebal, miring, dan kode di dalam satu baris. */
const POLA_SEBARIS = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;

function hiasBaris(teks: string): React.ReactNode[] {
  return teks
    .split(POLA_SEBARIS)
    .filter((bagian) => bagian !== undefined && bagian !== '')
    .map((bagian, i) => {
      if (bagian.startsWith('**') && bagian.endsWith('**') && bagian.length > 4) {
        return <strong key={i}>{bagian.slice(2, -2)}</strong>;
      }

      if (bagian.startsWith('*') && bagian.endsWith('*') && bagian.length > 2) {
        return <em key={i}>{bagian.slice(1, -1)}</em>;
      }

      if (bagian.startsWith('`') && bagian.endsWith('`') && bagian.length > 2) {
        return (
          <code
            key={i}
            style={{
              backgroundColor: '#F1F5F9',
              borderRadius: '4px',
              padding: '1px 4px',
              fontSize: '12px',
            }}
          >
            {bagian.slice(1, -1)}
          </code>
        );
      }

      return <React.Fragment key={i}>{bagian}</React.Fragment>;
    });
}

export default function TeksKaya({ teks }: { teks: string }) {
  const barisan = teks.split('\n');

  return (
    <div>
      {barisan.map((baris, i) => {
        const isi = baris.trimEnd();

        // Baris kosong menjadi jarak, bukan baris kosong setinggi teks penuh.
        if (isi.trim() === '') return <div key={i} style={{ height: '7px' }} />;

        if (/^-{3,}$/.test(isi.trim())) {
          return (
            <hr
              key={i}
              style={{ border: 'none', borderTop: '1px solid #E2E8F0', margin: '8px 0' }}
            />
          );
        }

        const judul = /^(#{1,6})\s+(.*)$/.exec(isi);
        if (judul) {
          return (
            <div
              key={i}
              style={{
                fontWeight: 800,
                fontSize: '13px',
                marginTop: i === 0 ? 0 : '9px',
                marginBottom: '3px',
              }}
            >
              {hiasBaris(judul[2])}
            </div>
          );
        }

        const butir = /^\s*[-*•]\s+(.*)$/.exec(isi);
        if (butir) {
          return (
            <div key={i} style={{ display: 'flex', gap: '7px', marginTop: '3px' }}>
              <span style={{ color: '#94A3B8', flexShrink: 0 }}>&bull;</span>
              <span style={{ flex: 1 }}>{hiasBaris(butir[1])}</span>
            </div>
          );
        }

        const nomor = /^\s*(\d+)\.\s+(.*)$/.exec(isi);
        if (nomor) {
          return (
            <div key={i} style={{ display: 'flex', gap: '7px', marginTop: '4px' }}>
              <span style={{ fontWeight: 700, color: '#0F172A', flexShrink: 0 }}>
                {nomor[1]}.
              </span>
              <span style={{ flex: 1 }}>{hiasBaris(nomor[2])}</span>
            </div>
          );
        }

        return <div key={i}>{hiasBaris(isi)}</div>;
      })}
    </div>
  );
}
