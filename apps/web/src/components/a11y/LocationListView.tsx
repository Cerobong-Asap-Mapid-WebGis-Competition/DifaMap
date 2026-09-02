'use client';

import React from 'react';
import { PanelState } from '../ui/Placeholder';

export interface LocationListViewProps {
  locations: any[];
  isLoading: boolean;
  error: string | null;
  selectedId?: string;
  onSelect: (location: any) => void;
}

/**
 * PADANAN PETA DALAM BENTUK DAFTAR — BUKAN placeholder, jangan dihapus.
 *
 * Marker MapLibre dirender sebagai <div> tanpa urutan fokus keyboard, sehingga
 * mustahil dijelajahi screen reader. Daftar ini menyajikan data yang sama
 * dalam elemen HTML biasa yang bisa di-Tab. Inilah yang membuat klaim
 * "kompatibel screen reader" (DEVELOPMENT.md §12) benar-benar terpenuhi.
 *
 * Desainer boleh mengubah tampilannya, tapi wajib menjaga:
 * setiap titik = satu <button> yang bisa difokus, dengan nama & skor sebagai teks.
 */
export default function LocationListView({
  locations,
  isLoading,
  error,
  selectedId,
  onSelect,
}: LocationListViewProps) {
  if (isLoading) return <PanelState state="loading" />;
  if (error) return <PanelState state="error" message={error} />;
  if (locations.length === 0) return <PanelState state="empty" />;

  return (
    <ul className="a11y-list">
      {locations.map((loc) => {
        const skor = typeof loc.overallScore === 'number' ? loc.overallScore : 0;
        const kondisi = skor >= 4 ? 'kondisi baik' : skor >= 3 ? 'kondisi sedang' : 'kondisi buruk';

        return (
          <li key={loc.id}>
            <button
              type="button"
              onClick={() => onSelect(loc)}
              aria-current={loc.id === selectedId ? 'true' : undefined}
              className="a11y-item"
            >
              <span className="a11y-item-name">{loc.name}</span>
              {/* Skor ditulis sebagai teks lengkap, tidak hanya warna pin */}
              <span className="a11y-item-meta">
                Skor {skor.toFixed(1)} dari 5, {kondisi}
                {loc.specificLocation ? ` · ${loc.specificLocation}` : ''}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
