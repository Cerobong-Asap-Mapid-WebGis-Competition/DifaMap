'use client';

import React, { useState } from 'react';
import {
  Search,
  SlidersHorizontal,
  X,
  Sparkles,
  Plus,
  Building,
  UtensilsCrossed,
  Activity,
  MapPin
} from 'lucide-react';
import { SidebarMode } from './AppSidebar';

export type PublicSubMode = 'AKTIVITAS' | 'TEMPAT';
export type UrbanPlannerFilter = 'PROPERTI_GO' | 'MENU_GO';

interface TopSearchBarProps {
  sidebarMode: SidebarMode;
  publicSubMode: PublicSubMode;
  onSelectPublicSubMode: (mode: PublicSubMode) => void;
  urbanFilter: UrbanPlannerFilter;
  onChangeUrbanFilter: (filter: UrbanPlannerFilter) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenAiAssistant: () => void;
  onOpenCreateModal: () => void;
  bufferRadius: number;
  onChangeBufferRadius: (radius: number) => void;
}

export default function TopSearchBar({
  sidebarMode,
  publicSubMode,
  onSelectPublicSubMode,
  urbanFilter,
  onChangeUrbanFilter,
  searchQuery,
  onSearchChange,
  onOpenAiAssistant,
  onOpenCreateModal,
  bufferRadius,
  onChangeBufferRadius,
}: TopSearchBarProps) {
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);

  return (
    <header
      style={{
        position: 'fixed',
        top: '24px',
        left: '104px', // 80px sidebar + 24px gap
        right: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        zIndex: 30,
        pointerEvents: 'none', // Allow clicking map through empty spaces
      }}
    >
      {/* 1. Search Bar Container (464px) */}
      <div
        style={{
          width: '464px',
          maxWidth: '100%',
          height: '60px',
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          boxShadow: '0px 4px 14px rgba(0, 0, 0, 0.08)',
          border: '1px solid rgba(0, 0, 0, 0.06)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: '12px',
          pointerEvents: 'auto',
          transition: 'box-shadow 0.2s ease',
        }}
      >
        <Search size={22} color="#000000" style={{ flexShrink: 0 }} />

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={
            sidebarMode === 'PUBLIC'
              ? publicSubMode === 'AKTIVITAS'
                ? 'Cari laporan kondisi jalan, halte, trotoar...'
                : 'Cari Halte Bus, RS Grestelina, Mall...'
              : 'Cari titik analisis spasial (Halte / Hub)...'
          }
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            fontSize: '15px',
            color: '#000000',
            fontWeight: '500',
            backgroundColor: 'transparent',
          }}
        />

        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: '#767676',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={18} />
          </button>
        )}

        {/* Separator Line */}
        <div style={{ width: '1px', height: '28px', backgroundColor: '#EFEFEF' }} />

        {/* Filter / Category Quick Toggle */}
        <button
          onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
          title="Opsi Filter"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            color: isFilterDropdownOpen ? '#FDC323' : '#539BA9',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            transition: 'color 0.2s ease',
          }}
        >
          <SlidersHorizontal size={20} />
        </button>
      </div>

      {/* 2. Floating Filter & Action Tabs (Right Side) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          pointerEvents: 'auto',
          flexWrap: 'wrap',
        }}
      >
        {/* PUBLIC MODE (Aktivitas & Tempat Tabs inside the same public sidebar mode) */}
        {sidebarMode === 'PUBLIC' ? (
          <>
            {/* Tab: Aktivitas */}
            <button
              onClick={() => onSelectPublicSubMode('AKTIVITAS')}
              className={publicSubMode === 'AKTIVITAS' ? 'btn-yellow-pill' : 'btn-white-pill'}
              style={{
                backgroundColor: publicSubMode === 'AKTIVITAS' ? '#FDC323' : '#FFFFFF',
              }}
            >
              <Activity size={18} strokeWidth={2.4} />
              <span>Aktivitas</span>
            </button>

            {/* Tab: Tempat */}
            <button
              onClick={() => onSelectPublicSubMode('TEMPAT')}
              className={publicSubMode === 'TEMPAT' ? 'btn-yellow-pill' : 'btn-white-pill'}
              style={{
                backgroundColor: publicSubMode === 'TEMPAT' ? '#FDC323' : '#FFFFFF',
              }}
            >
              <Building size={18} strokeWidth={2.4} />
              <span>Tempat</span>
            </button>
          </>
        ) : (
          /* URBAN PLANNER MODE (Properti Go & Menu Go Tabs + Radius) */
          <>
            {/* Tab: Properti Go */}
            <button
              onClick={() => onChangeUrbanFilter('PROPERTI_GO')}
              className={urbanFilter === 'PROPERTI_GO' ? 'btn-yellow-pill' : 'btn-white-pill'}
              style={{
                backgroundColor: urbanFilter === 'PROPERTI_GO' ? '#FDC323' : '#FFFFFF',
              }}
            >
              <Building size={18} strokeWidth={2.4} />
              <span>Properti Go</span>
            </button>

            {/* Tab: Menu Go */}
            <button
              onClick={() => onChangeUrbanFilter('MENU_GO')}
              className={urbanFilter === 'MENU_GO' ? 'btn-yellow-pill' : 'btn-white-pill'}
              style={{
                backgroundColor: urbanFilter === 'MENU_GO' ? '#FDC323' : '#FFFFFF',
              }}
            >
              <UtensilsCrossed size={18} strokeWidth={2.4} />
              <span>Menu Go</span>
            </button>

            {/* Radius Buffer Selector */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '50px',
                height: '48px',
                padding: '0 16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: 'var(--shadow-md)',
                fontSize: '13px',
                fontWeight: '600',
              }}
            >
              <span style={{ color: '#767676' }}>Radius:</span>
              {[300, 500].map((r) => (
                <button
                  key={r}
                  onClick={() => onChangeBufferRadius(r)}
                  style={{
                    backgroundColor: bufferRadius === r ? '#539BA9' : 'transparent',
                    color: bufferRadius === r ? '#FFFFFF' : '#000000',
                    border: 'none',
                    borderRadius: '20px',
                    padding: '4px 10px',
                    cursor: 'pointer',
                    fontWeight: bufferRadius === r ? '700' : '500',
                    fontSize: '12px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {r}m
                </button>
              ))}
            </div>
          </>
        )}

        {/* 3. AI Sparkle Bot Trigger Button (garden:bot-sparkle-fill-16) */}
        <button
          onClick={onOpenAiAssistant}
          className="btn-circle-action"
          title="Tanya Asisten AI DifaMap (Spatial RAG & SINI AI)"
          style={{
            position: 'relative',
          }}
        >
          <Sparkles size={22} color="#000000" />
          <span
            style={{
              position: 'absolute',
              top: '4px',
              right: '4px',
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#FDC323',
            }}
          />
        </button>

        {/* 4. Bagikan Laporan / Ulasan Button */}
        <button
          onClick={onOpenCreateModal}
          className="btn-yellow-pill"
          title="Laporkan Aksesibilitas Baru"
          style={{
            padding: '0 20px',
          }}
        >
          <Plus size={18} strokeWidth={3} />
          <span>Bagikan Laporan</span>
        </button>
      </div>
    </header>
  );
}
