'use client';

import React from 'react';
import { Placeholder } from '../ui/Placeholder';
import { useAuth } from '../../context/AuthContext';

export type AppMode = 'disabilitas' | 'planner';

export interface SidebarProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

/**
 * Sidebar + pemilih mode. Mode Disabilitas adalah default (DEVELOPMENT.md §3).
 */
export default function Sidebar({ mode, onModeChange }: SidebarProps) {
  const { user, isLoading, signInWithGoogle, signOut } = useAuth();

  return (
    <nav aria-label="Navigasi utama" className="sidebar">
      <div className="sidebar-brand">
        <strong>DifaMap</strong>
        <span className="ph-hint">Makassar &amp; Gowa</span>
      </div>

      {/* Pemilih mode: radiogroup supaya statusnya terbaca screen reader */}
      <div role="radiogroup" aria-label="Mode tampilan" className="mode-switch">
        {(
          [
            ['disabilitas', 'Mode Disabilitas'],
            ['planner', 'Mode Urban Planner'],
          ] as Array<[AppMode, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={mode === value}
            onClick={() => onModeChange(value)}
            className="mode-btn"
            data-active={mode === value}
          >
            {label}
          </button>
        ))}
      </div>

      <Placeholder
        label="Sidebar / Navigasi"
        docRef="DEVELOPMENT.md §3"
        description="Desain final: identitas produk, pemilih mode, dan status akun."
        checklist={[
          'Pemilih mode harus tetap berupa radiogroup (status terbaca screen reader)',
          'Mode Disabilitas wajib jadi default saat aplikasi dibuka',
          'Status login + tombol kontribusi',
        ]}
      />

      <div className="sidebar-auth">
        {isLoading ? (
          <span className="ph-hint">Memeriksa sesi…</span>
        ) : user ? (
          <>
            <span className="ph-hint">Masuk sebagai {user.email}</span>
            <button type="button" onClick={signOut} className="ph-btn">
              Keluar
            </button>
          </>
        ) : (
          <button type="button" onClick={signInWithGoogle} className="ph-btn">
            Masuk dengan Google
          </button>
        )}
      </div>
    </nav>
  );
}
