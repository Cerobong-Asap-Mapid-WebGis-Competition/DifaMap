'use client';

import React from 'react';

/**
 * PENANDA AREA DESAIN
 *
 * Komponen ini sengaja tampil "mentah" supaya jelas mana bagian yang masih
 * menunggu desain final dari UI/UX designer. Saat desain sudah siap:
 * hapus <Placeholder /> di dalam panel terkait, isi dengan markup final,
 * dan JANGAN ubah props/data yang sudah mengalir ke panel tersebut.
 */
export interface PlaceholderProps {
  /** Nama area desain, mis. "Panel Filter Aksesibilitas" */
  label: string;
  /** Penjelasan singkat isi area ini menurut PRD (§9 / §10 DEVELOPMENT.md) */
  description?: string;
  /** Daftar elemen yang harus ada di desain final */
  checklist?: string[];
  /** Referensi ke dokumen, mis. "DEVELOPMENT.md §9 Lapis 2" */
  docRef?: string;
  children?: React.ReactNode;
}

export function Placeholder({ label, description, checklist, docRef, children }: PlaceholderProps) {
  return (
    <div className="ph-box">
      <div className="ph-head">
        <span className="ph-tag">AREA DESAIN</span>
        <strong className="ph-label">{label}</strong>
        {docRef && <span className="ph-ref">{docRef}</span>}
      </div>

      {description && <p className="ph-desc">{description}</p>}

      {checklist && checklist.length > 0 && (
        <ul className="ph-list">
          {checklist.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}

      {children && <div className="ph-body">{children}</div>}
    </div>
  );
}

/** Status kosong / loading / error yang dipakai berulang di banyak panel. */
export function PanelState({
  state,
  message,
}: {
  state: 'loading' | 'empty' | 'error';
  message?: string;
}) {
  const defaults = {
    loading: 'Memuat data…',
    empty: 'Belum ada data untuk ditampilkan.',
    error: 'Gagal memuat data. Pastikan backend berjalan di port 4000.',
  };

  return (
    <p className="panel-state" role={state === 'error' ? 'alert' : 'status'} data-state={state}>
      {message || defaults[state]}
    </p>
  );
}
