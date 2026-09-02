'use client';

import React from 'react';
import { Placeholder } from '../ui/Placeholder';
import type { LocationFilterParams } from '../../lib/api';

export interface FilterPanelProps {
  filters: LocationFilterParams;
  onChange: (next: LocationFilterParams) => void;
  /** Radius pencarian dari posisi pengguna, dalam meter (0 = nonaktif) */
  radiusMeters: number;
  onRadiusChange: (meters: number) => void;
  resultCount: number;
}

/**
 * Lapis 2 Mode Disabilitas — panel filter.
 * Kontrol di bawah ini sudah TERSAMBUNG ke backend, jadi desainer cukup
 * mengganti tampilannya tanpa menyentuh handler onChange.
 */
export default function FilterPanel({
  filters,
  onChange,
  radiusMeters,
  onRadiusChange,
  resultCount,
}: FilterPanelProps) {
  const toggle = (key: 'wheelchairOnly' | 'visuallyImpairedOnly') => {
    onChange({ ...filters, [key]: !filters[key] });
  };

  return (
    <section aria-labelledby="judul-filter" className="panel">
      <h2 id="judul-filter" className="panel-title">
        Filter Aksesibilitas
      </h2>

      <Placeholder
        label="Panel Filter Aksesibilitas"
        docRef="DEVELOPMENT.md §9 Lapis 2"
        description="Desain final: chip kecamatan, pemilih radius, dan toggle parameter berbasis ikon yang bisa ditekan."
        checklist={[
          'Chip pilihan kecamatan (7 zona) — MENUNGGU kolom district di database',
          'Toggle parameter: ramp, guiding block, trotoar, pencahayaan, keramaian',
          'Pemilih radius 500m / 1km dari posisi atau tujuan pengguna',
          'Target sentuh minimal 44px & label teks, bukan ikon saja',
        ]}
      />

      {/* --- Kontrol sementara: fungsional, tampilan seadanya --- */}
      <fieldset className="ph-controls">
        <legend>Kebutuhan aksesibilitas</legend>

        <label className="ph-check">
          <input
            type="checkbox"
            checked={Boolean(filters.wheelchairOnly)}
            onChange={() => toggle('wheelchairOnly')}
          />
          Hanya titik ramah kursi roda (ramp baik)
        </label>

        <label className="ph-check">
          <input
            type="checkbox"
            checked={Boolean(filters.visuallyImpairedOnly)}
            onChange={() => toggle('visuallyImpairedOnly')}
          />
          Hanya titik dengan guiding block baik
        </label>
      </fieldset>

      <fieldset className="ph-controls">
        <legend>Radius dari posisi saya</legend>
        {[0, 500, 1000].map((meters) => (
          <label key={meters} className="ph-check">
            <input
              type="radio"
              name="radius"
              checked={radiusMeters === meters}
              onChange={() => onRadiusChange(meters)}
            />
            {meters === 0 ? 'Semua titik' : `${meters} meter`}
          </label>
        ))}
      </fieldset>

      <p className="panel-state" role="status">
        {resultCount} titik ditampilkan.
      </p>
    </section>
  );
}
