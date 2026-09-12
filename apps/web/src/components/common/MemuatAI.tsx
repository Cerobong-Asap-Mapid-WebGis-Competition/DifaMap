'use client';

import React, { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

/**
 * Penanda bahwa Difa AI sedang menyusun jawaban.
 *
 *
 * KENAPA HARUS BERGERAK
 *
 * Menyusun wawasan memakan belasan detik: konteks dikumpulkan dari basis data,
 * dikirim ke model, lalu jawabannya ditunggu sampai selesai. Sebelumnya yang
 * tampil hanya satu baris teks diam - dan teks diam selama sepuluh detik tidak
 * bisa dibedakan dari aplikasi yang macet. Pengguna menekan tombolnya lagi,
 * atau menutup panelnya sebelum jawabannya sempat datang.
 *
 *
 * KENAPA DETIKNYA DIHITUNG
 *
 * Bilah yang bergerak memberi tahu ada yang sedang berjalan, tetapi tidak
 * memberi tahu sudah berapa lama. Penghitung detik menjawab pertanyaan yang
 * sebenarnya ada di kepala orang yang menunggu - "ini lama sekali, atau
 * perasaan saya saja?" - dan angka yang naik teratur jauh lebih menenangkan
 * daripada kalimat yang diam.
 *
 * Bilahnya sengaja tak tentu, tidak berpersentase: kita memang tidak tahu
 * berapa lama model akan menjawab, dan bilah palsu yang merangkak ke 90% lalu
 * berhenti di sana lebih buruk daripada tidak ada bilah sama sekali.
 */

interface Props {
  /** Apa yang sedang dikerjakan, misal "membaca pola antar sel". */
  pesan: string;
  /** Ringkas untuk disisipkan di aliran percakapan, tanpa kotak sendiri. */
  ringkas?: boolean;
}

export default function MemuatAI({ pesan, ringkas = false }: Props) {
  const [detik, setDetik] = useState(0);

  useEffect(() => {
    const jam = setInterval(() => setDetik((d) => d + 1), 1000);
    return () => clearInterval(jam);
  }, []);

  const titik = (
    <span style={{ letterSpacing: '1px', color: '#D97706' }}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="difa-titik" style={{ animationDelay: `${i * 0.18}s` }}>
          .
        </span>
      ))}
    </span>
  );

  if (ringkas) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#767676', fontSize: '12px' }}
      >
        <Sparkles size={15} className="difa-denyut" color="#539BA9" />
        <span>
          {pesan}
          {titik}
        </span>
        {detik >= 3 && (
          <span style={{ fontSize: '11px', color: '#94A3B8', fontVariantNumeric: 'tabular-nums' }}>
            {detik}s
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        backgroundColor: '#FFFBEB',
        border: '1px solid #FDE68A',
        borderRadius: '10px',
        padding: '11px 12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Sparkles size={14} className="difa-denyut" color="#D97706" />
        <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#0F172A', flex: 1 }}>
          {pesan}
          {titik}
        </span>
        {detik >= 3 && (
          <span style={{ fontSize: '11px', color: '#B45309', fontVariantNumeric: 'tabular-nums' }}>
            {detik}s
          </span>
        )}
      </div>

      <div
        style={{
          height: '4px',
          borderRadius: '2px',
          backgroundColor: '#FDE68A',
          overflow: 'hidden',
          marginTop: '9px',
        }}
      >
        <div
          className="difa-geser"
          style={{ width: '30%', height: '100%', borderRadius: '2px', backgroundColor: '#D97706' }}
        />
      </div>

      {/* Ditahan sampai sepuluh detik: menyebutkannya terlalu dini justru
          menanamkan gagasan bahwa ini lambat, padahal biasanya tidak. */}
      {detik >= 10 && (
        <div style={{ fontSize: '10px', color: '#B45309', marginTop: '7px', lineHeight: '14px' }}>
          Masih berjalan. Jawaban yang panjang memang butuh waktu lebih lama.
        </div>
      )}
    </div>
  );
}
