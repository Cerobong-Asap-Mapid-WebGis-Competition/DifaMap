'use client';

import React from 'react';
import { Placeholder, PanelState } from '../ui/Placeholder';

export interface LocationDetailPanelProps {
  location: any | null;
  onClose: () => void;
}

const LABEL_PARAMETER: Record<string, string> = {
  rampStatus: 'Ramp',
  guidingBlockStatus: 'Guiding block',
  sidewalkCondition: 'Kondisi trotoar',
  surfaceCondition: 'Permukaan',
  seatingAvailability: 'Tempat duduk',
  toiletAccessibility: 'Toilet disabilitas',
  lightingLevel: 'Pencahayaan',
  crowdLevel: 'Keramaian',
};

/**
 * Lapis 3 Mode Disabilitas — detail satu titik.
 * Data lengkap ada di prop `location`; desain final tinggal menatanya.
 */
export default function LocationDetailPanel({ location, onClose }: LocationDetailPanelProps) {
  if (!location) {
    return (
      <section aria-labelledby="judul-detail" className="panel">
        <h2 id="judul-detail" className="panel-title">
          Detail Titik
        </h2>
        <PanelState state="empty" message="Pilih salah satu titik di peta atau daftar untuk melihat detailnya." />
      </section>
    );
  }

  return (
    <section aria-labelledby="judul-detail" className="panel">
      <div className="panel-head">
        <h2 id="judul-detail" className="panel-title">
          {location.name}
        </h2>
        <button type="button" onClick={onClose} className="ph-btn">
          Tutup
        </button>
      </div>

      <Placeholder
        label="Kartu Detail Titik"
        docRef="DEVELOPMENT.md §9 Lapis 3 / §10 Fitur 2"
        description="Desain final: skor keseluruhan, rating bintang, ikon per parameter, galeri foto survei, dan form kontribusi."
        checklist={[
          'Rating bintang + skor keseluruhan yang terbaca jelas',
          'Ikon per parameter dengan status warna (baik / rusak / tidak ada)',
          'Galeri foto survei + deskripsi',
          'Form kontribusi (foto, lokasi, komentar) dengan penanda "tidak mengubah skor resmi"',
          'AccessibilityRadarChart sudah tersedia di components/charts',
        ]}
      />

      {/* --- Ringkasan sementara langsung dari data backend --- */}
      <dl className="ph-dl">
        <div>
          <dt>Skor aksesibilitas</dt>
          <dd>
            {typeof location.overallScore === 'number' ? location.overallScore.toFixed(1) : '—'} / 5.0
            <span className="ph-hint"> (makin tinggi makin baik)</span>
          </dd>
        </div>
        <div>
          <dt>Indeks prioritas</dt>
          <dd>
            {typeof location.priorityIndex === 'number' ? location.priorityIndex.toFixed(1) : '—'} / 100
            <span className="ph-hint"> (makin tinggi makin mendesak diperbaiki)</span>
          </dd>
        </div>

        {Object.entries(LABEL_PARAMETER).map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{location[key] ?? '—'}</dd>
          </div>
        ))}
      </dl>

      {location.aiSummary && (
        <p className="ph-summary">
          <strong>Ringkasan AI: </strong>
          {location.aiSummary}
        </p>
      )}
    </section>
  );
}
