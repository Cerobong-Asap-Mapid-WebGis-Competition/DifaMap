'use client';

import React from 'react';
import { Placeholder, PanelState } from '../ui/Placeholder';

export interface PlannerPanelProps {
  locations: any[];
  isLoading: boolean;
  onSelect: (location: any) => void;
}

/**
 * Mode Urban Planner — daftar prioritas + kendali layer analisis.
 *
 * CATATAN: priorityIndex akan bernilai 0 untuk semua titik sampai
 * migrasi SQL (01_postgis_triggers_rpc.sql) diperbaiki. Itu bukan bug frontend.
 */
export default function PlannerPanel({ locations, isLoading, onSelect }: PlannerPanelProps) {
  const urutPrioritas = [...locations].sort(
    (a, b) => (b.priorityIndex ?? 0) - (a.priorityIndex ?? 0)
  );

  return (
    <section aria-labelledby="judul-planner" className="panel">
      <h2 id="judul-planner" className="panel-title">
        Mode Urban Planner
      </h2>

      <Placeholder
        label="Panel Insight Kawasan & Daftar Prioritas"
        docRef="DEVELOPMENT.md §9 Mode Urban Planner / §10 Fitur 7-8"
        description="Desain final: kendali layer (heatmap ekonomi, choropleth kecamatan), tabel prioritas, dan ringkasan naratif AI per kawasan."
        checklist={[
          'Kendali layer: heatmap KDE — MENUNGGU endpoint titik ekonomi di backend',
          'Choropleth kecamatan — MENUNGGU kolom district + GeoJSON batas kecamatan',
          'Radius insight 200m saat pin diklik — MENUNGGU endpoint titik dalam radius',
          'Tabel daftar prioritas + ringkasan rekomendasi AI',
        ]}
      />

      {isLoading && <PanelState state="loading" />}

      {!isLoading && urutPrioritas.length === 0 && <PanelState state="empty" />}

      {!isLoading && urutPrioritas.length > 0 && (
        <ol className="ph-rank">
          {urutPrioritas.slice(0, 10).map((loc) => (
            <li key={loc.id}>
              <button type="button" onClick={() => onSelect(loc)} className="ph-rank-btn">
                <span className="ph-rank-name">{loc.name}</span>
                <span className="ph-rank-score">
                  prioritas {(loc.priorityIndex ?? 0).toFixed(1)} · skor{' '}
                  {(loc.overallScore ?? 0).toFixed(1)}★
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
