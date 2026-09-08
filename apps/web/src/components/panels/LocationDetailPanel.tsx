'use client';

import React from 'react';
import { Placeholder, PanelState } from '../ui/Placeholder';

export interface LocationDetailPanelProps {
  location: any | null;
  onClose: () => void;
}

/**
 * Terjemahan nilai enum ke bahasa yang dibaca pengguna.
 *
 * Yang paling penting: NOT_VISIBLE tidak boleh ditampilkan sebagai "tidak ada".
 * "Tidak ada ramp" adalah pernyataan fakta tentang keselamatan; "belum
 * terverifikasi" adalah pengakuan jujur bahwa fotonya tidak memperlihatkan.
 * Yang kedua lebih berguna: pengguna tahu ia perlu memastikan sendiri, bukan
 * mencoret tempat itu berdasarkan informasi yang mungkin keliru.
 */
const LABEL_NILAI: Record<string, string> = {
  NOT_VISIBLE: 'Belum terverifikasi dari foto',
  GOOD: 'Baik',
  DAMAGED: 'Rusak',
  NONE: 'Tidak ada',
  NARROW: 'Sempit',
  BLOCKED: 'Terhalang',
  NOT_APPLICABLE: 'Tidak berlaku',
  SMOOTH: 'Halus / rata',
  SLIPPERY: 'Licin',
  POTHOLE: 'Berlubang',
  UNEVEN: 'Bergelombang',
  AVAILABLE: 'Tersedia',
  NOT_AVAILABLE: 'Tidak tersedia',
  AVAILABLE_GOOD: 'Tersedia, layak pakai',
  AVAILABLE_DAMAGED: 'Tersedia, tapi rusak',
  BRIGHT: 'Terang',
  DIM: 'Redup',
  DARK: 'Gelap',
  QUIET: 'Sepi',
  MODERATE: 'Sedang',
  CROWDED: 'Ramai',
};

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
          'Skor resmi dan skor komunitas harus tetap terbedakan secara visual, jangan digabung',
          'Ikon per parameter dengan status warna (baik / rusak / tidak ada)',
          'Galeri foto survei + deskripsi',
          'Form kontribusi (foto, lokasi, komentar) dengan penanda "tidak mengubah skor resmi"',
          'AccessibilityRadarChart sudah tersedia di components/charts',
        ]}
      />

      {/* --- Ringkasan sementara langsung dari data backend --- */}
      <dl className="ph-dl">
        <div>
          <dt>Skor resmi (survei)</dt>
          <dd>
            {typeof location.overallScore === 'number' ? location.overallScore.toFixed(1) : '—'} / 5.0
            <span className="ph-hint"> (makin tinggi makin baik)</span>
          </dd>
        </div>
        {/*
          Skor komunitas ditampilkan TERPISAH dan diberi label indikatif.
          Menggabungkannya dengan skor resmi akan menghapus perbedaan yang
          justru penting: skor resmi berasal dari survei terverifikasi,
          skor komunitas dari laporan siapa saja.
        */}
        <div>
          <dt>Laporan komunitas</dt>
          <dd>
            {typeof location.communityScore === 'number' ? (
              <>
                {location.communityScore.toFixed(1)} / 5.0
                <span className="ph-hint">
                  {' '}
                  dari {location.communityReportCount ?? 0} laporan · indikatif, tidak mengubah skor resmi
                </span>
              </>
            ) : (
              <span className="ph-hint">Belum ada laporan</span>
            )}
          </dd>
        </div>
        <div>
          <dt>Indeks prioritas</dt>
          <dd>
            {typeof location.priorityIndex === 'number' ? location.priorityIndex.toFixed(1) : '—'} / 100
            <span className="ph-hint"> (makin tinggi makin mendesak diperbaiki)</span>
          </dd>
        </div>

        {Object.entries(LABEL_PARAMETER).map(([key, label]) => {
          const nilai = location[key];
          const belumTerverifikasi = nilai === 'NOT_VISIBLE';
          return (
            <div key={key}>
              <dt>{label}</dt>
              <dd className={belumTerverifikasi ? 'nilai-belum-terverifikasi' : undefined}>
                {nilai ? LABEL_NILAI[nilai] ?? nilai : '—'}
              </dd>
            </div>
          );
        })}
      </dl>

      {/*
        Penanda kelengkapan. Berguna dua arah: pengguna tahu seberapa jauh
        informasi ini bisa diandalkan, dan Mode Urban Planner bisa memakainya
        untuk menemukan titik yang perlu disurvei ulang.
      */}
      {(() => {
        const kunci = Object.keys(LABEL_PARAMETER);
        const belum = kunci.filter((k) => location[k] === 'NOT_VISIBLE').length;
        if (belum === 0) return null;
        return (
          <p className="panel-state" role="status">
            {belum} dari {kunci.length} parameter belum terverifikasi dari foto survei
            {typeof location.aiConfidence === 'number'
              ? ` · keyakinan AI ${Math.round(location.aiConfidence * 100)}%`
              : ''}
            .
          </p>
        );
      })()}

      {location.aiSummary && (
        <p className="ph-summary">
          <strong>Ringkasan AI: </strong>
          {location.aiSummary}
        </p>
      )}
    </section>
  );
}
