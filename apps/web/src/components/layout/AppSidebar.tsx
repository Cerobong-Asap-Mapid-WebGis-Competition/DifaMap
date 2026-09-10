'use client';

import React from 'react';
import { Settings, HelpCircle, Map, Compass } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';

export type SidebarMode = 'PUBLIC' | 'URBAN_PLANNER';

interface AppSidebarProps {
  currentMode: SidebarMode;
  onSelectMode: (mode: SidebarMode) => void;
  onOpenInfoModal: () => void;
  onResetToDefault?: () => void;
}

export default function AppSidebar({
  currentMode,
  onSelectMode,
  onOpenInfoModal,
  onResetToDefault,
}: AppSidebarProps) {
  const isMobile = useIsMobile(768);

  // SVG Icon: Mode Publik (Dashboard Grid)
  const renderPublicIcon = (color: string, size = 30) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        flexShrink: 0,
      }}
    >
      <rect x="2.5" y="3.5" width="19" height="7" rx="2.5" />
      <rect x="2.5" y="13.5" width="8.5" height="7" rx="2.5" />
      <rect x="13" y="13.5" width="8.5" height="7" rx="2.5" />
    </svg>
  );

  // SVG Icon: Urban Planner (Skyline & Mountain)
  const renderUrbanIcon = (color: string, cutoutColor: string, size = 32) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        flexShrink: 0,
      }}
    >
      <path d="M13 6.5C13 5.67 13.67 5 14.5 5H15.5C16.33 5 17 5.67 17 6.5V20H13V6.5Z" />
      <rect x="14.2" y="7.5" width="1.6" height="1.6" rx="0.3" fill={cutoutColor} />
      <rect x="14.2" y="10.5" width="1.6" height="1.6" rx="0.3" fill={cutoutColor} />

      <path d="M17.5 10.5C17.5 9.67 18.17 9 19 9H19.5C20.33 9 21 9.67 21 10.5V20H17.5V10.5Z" />
      <rect x="18.5" y="11.5" width="1.6" height="1.6" rx="0.3" fill={cutoutColor} />
      <rect x="18.5" y="14.5" width="1.6" height="1.6" rx="0.3" fill={cutoutColor} />

      <path d="M2.5 19.5C2.1 19.5 1.8 19 2.1 18.6L7.8 7.6C8.2 6.8 9.3 6.8 9.7 7.6L15.4 18.6C15.7 19 15.4 19.5 15 19.5H2.5Z" />
      <path d="M8.75 7.8L10.6 11.2L9.6 12L8.75 10.8L7.9 12L6.9 11.2L8.75 7.8Z" fill={cutoutColor} />
    </svg>
  );

  // =========================================================================
  // MOBILE / TABLET VIEW: Bottom Navigation Bar (Very friendly for elderly & thumbs)
  // =========================================================================
  if (isMobile) {
    return (
      <nav
        aria-label="Navigasi Utama Mobile"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '66px',
          backgroundColor: '#FFFFFF',
          borderTop: '1.5px solid #E2E8F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          padding: '4px 8px env(safe-area-inset-bottom, 4px) 8px',
          zIndex: 45,
          boxShadow: '0 -3px 16px rgba(0, 0, 0, 0.08)',
        }}
      >
        {/* Nav 1: Mode Peta Publik */}
        <button
          onClick={() => onSelectMode('PUBLIC')}
          style={{
            flex: 1,
            height: '52px',
            backgroundColor: currentMode === 'PUBLIC' ? '#FEF9C3' : 'transparent',
            borderRadius: '12px',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            color: currentMode === 'PUBLIC' ? '#854D0E' : '#64748B',
          }}
        >
          {renderPublicIcon(currentMode === 'PUBLIC' ? '#CA8A04' : '#64748B', 22)}
          <span
            style={{
              fontSize: '12px',
              fontWeight: currentMode === 'PUBLIC' ? '800' : '600',
              lineHeight: 1,
            }}
          >
            Peta Publik
          </span>
        </button>

        {/* Nav 2: Mode Perencana Kota */}
        <button
          onClick={() => onSelectMode('URBAN_PLANNER')}
          style={{
            flex: 1,
            height: '52px',
            backgroundColor: currentMode === 'URBAN_PLANNER' ? '#E0F2FE' : 'transparent',
            borderRadius: '12px',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            color: currentMode === 'URBAN_PLANNER' ? '#0369A1' : '#64748B',
          }}
        >
          {renderUrbanIcon(
            currentMode === 'URBAN_PLANNER' ? '#0284C7' : '#64748B',
            currentMode === 'URBAN_PLANNER' ? '#FFFFFF' : '#F1F5F9',
            24
          )}
          <span
            style={{
              fontSize: '12px',
              fontWeight: currentMode === 'URBAN_PLANNER' ? '800' : '600',
              lineHeight: 1,
            }}
          >
            Perencana Kota
          </span>
        </button>

        {/* Nav 3: Bantuan & Panduan */}
        <button
          onClick={onOpenInfoModal}
          style={{
            flex: 1,
            height: '52px',
            backgroundColor: 'transparent',
            borderRadius: '12px',
            border: 'none',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            color: '#64748B',
          }}
        >
          <HelpCircle size={22} color="#64748B" strokeWidth={2.2} />
          <span
            style={{
              fontSize: '12px',
              fontWeight: '600',
              lineHeight: 1,
            }}
          >
            Bantuan
          </span>
        </button>
      </nav>
    );
  }

  // =========================================================================
  // DESKTOP VIEW: Sleek Left Sidebar Rail
  // =========================================================================
  return (
    <aside
      aria-label="Navigasi Utama Desktop"
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        width: '80px',
        backgroundColor: '#FFFFFF',
        borderRight: '1px solid #EFEFEF',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 0',
        zIndex: 40,
        boxShadow: '2px 0 12px rgba(0, 0, 0, 0.03)',
      }}
    >
      {/* 1. Top Logo DifaMap (Brand Logo) */}
      <div
        title="Kembali ke Tampilan Normal (DifaMap)"
        role="button"
        tabIndex={0}
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: '#FFFFFF',
          border: '1.5px solid #F0F0F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '36px',
          cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
          transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
        onClick={() => {
          if (onResetToDefault) {
            onResetToDefault();
          } else {
            onSelectMode('PUBLIC');
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (onResetToDefault) onResetToDefault();
          }
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.08)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        <img
          src="/difamap-icon.png"
          alt="DifaMap"
          style={{
            width: '40px',
            height: '40px',
            objectFit: 'contain',
            filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.06))',
          }}
        />
      </div>

      {/* 2. Main Navigation Rail with Animated Sliding Teal Circle (#539BA9) */}
      <nav
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '24px',
          width: '100%',
        }}
      >
        {/* Animated Sliding Teal Circle Indicator */}
        <div
          style={{
            position: 'absolute',
            top: currentMode === 'PUBLIC' ? '0px' : '80px',
            left: 'calc(50% - 28px)',
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: '#539BA9',
            boxShadow: '0 6px 16px rgba(83, 155, 169, 0.38)',
            transition: 'top 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)',
            zIndex: 1,
            pointerEvents: 'none',
          }}
        />

        {/* Nav 1: Mode Publik */}
        <button
          onClick={() => onSelectMode('PUBLIC')}
          title="Mode Publik (Aktivitas & Tempat)"
          style={{
            position: 'relative',
            zIndex: 2,
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: 'transparent',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'transform 0.15s ease',
          }}
          onMouseEnter={(e) => {
            if (currentMode !== 'PUBLIC') {
              e.currentTarget.style.transform = 'scale(1.1)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          {renderPublicIcon(currentMode === 'PUBLIC' ? '#FDC323' : '#539BA9', 32)}
        </button>

        {/* Nav 2: Mode Urban Planner */}
        <button
          onClick={() => onSelectMode('URBAN_PLANNER')}
          title="Mode Urban Planner (Properti Go, Menu Go, & Analisis MAPID)"
          style={{
            position: 'relative',
            zIndex: 2,
            width: '56px',
            height: '56px',
            borderRadius: '50%',
            backgroundColor: 'transparent',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'transform 0.15s ease',
          }}
          onMouseEnter={(e) => {
            if (currentMode !== 'URBAN_PLANNER') {
              e.currentTarget.style.transform = 'scale(1.1)';
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          {renderUrbanIcon(
            currentMode === 'URBAN_PLANNER' ? '#FDC323' : '#539BA9',
            currentMode === 'URBAN_PLANNER' ? '#539BA9' : '#FFFFFF',
            34
          )}
        </button>
      </nav>

      {/* 3. Bottom Settings / Info Button */}
      <div style={{ marginTop: 'auto' }}>
        <button
          onClick={onOpenInfoModal}
          title="Tentang DifaMap & Bantuan"
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            backgroundColor: 'transparent',
            color: '#767676',
            border: '1px solid #EFEFEF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#F8FAFC';
            e.currentTarget.style.color = '#000000';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#767676';
          }}
        >
          <Settings size={22} />
        </button>
      </div>
    </aside>
  );
}
