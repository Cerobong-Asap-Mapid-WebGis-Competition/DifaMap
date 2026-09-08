'use client';

import React from 'react';
import { Settings } from 'lucide-react';

export type SidebarMode = 'PUBLIC' | 'URBAN_PLANNER';

interface AppSidebarProps {
  currentMode: SidebarMode;
  onSelectMode: (mode: SidebarMode) => void;
  onOpenInfoModal: () => void;
}

export default function AppSidebar({
  currentMode,
  onSelectMode,
  onOpenInfoModal,
}: AppSidebarProps) {
  return (
    <aside
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
        title="DifaMap — Peta Cerdas Aksesibilitas"
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
        onClick={() => onSelectMode('PUBLIC')}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.08)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
          <path
            d="M12 2L2 7L12 12L22 7L12 2Z"
            fill="#FDC323"
          />
          <path
            d="M2 17L12 22L22 17"
            stroke="#539BA9"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M2 12L12 17L22 12"
            stroke="#FDC323"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
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
            top: currentMode === 'PUBLIC' ? '0px' : '80px', // 56px button + 24px gap = 80px
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

        {/* Nav 1: Mode Publik (Aktivitas & Tempat Komunitas - Layout Dashboard Icon) */}
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
            color: currentMode === 'PUBLIC' ? '#FDC323' : '#539BA9',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'color 0.25s ease, transform 0.15s ease',
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
          {/* Custom Layout / Dashboard Grid Icon matching Figma reference */}
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="currentColor"
            style={{
              width: '32px',
              height: '32px',
              flexShrink: 0,
            }}
          >
            {/* Top Wide Horizontal Rounded Bar */}
            <rect x="2.5" y="3.5" width="19" height="7" rx="2.5" />
            {/* Bottom Left Rounded Bar */}
            <rect x="2.5" y="13.5" width="8.5" height="7" rx="2.5" />
            {/* Bottom Right Rounded Bar */}
            <rect x="13" y="13.5" width="8.5" height="7" rx="2.5" />
          </svg>
        </button>

        {/* Nav 2: Mode Urban Planner (Landscape & City Skyline Icon) */}
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
            color: currentMode === 'URBAN_PLANNER' ? '#FDC323' : '#539BA9',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'color 0.25s ease, transform 0.15s ease',
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
          {/* Mountain + City Skyline Vector matching Figma reference */}
          <svg
            width="34"
            height="34"
            viewBox="0 0 24 24"
            fill="currentColor"
            style={{
              width: '34px',
              height: '34px',
              flexShrink: 0,
            }}
          >
            {/* Tall Skyscraper in the background */}
            <path d="M13 6.5C13 5.67 13.67 5 14.5 5H15.5C16.33 5 17 5.67 17 6.5V20H13V6.5Z" />
            {/* Windows on tall skyscraper with stencil cutouts */}
            <rect
              x="14.2"
              y="7.5"
              width="1.6"
              height="1.6"
              rx="0.3"
              fill={currentMode === 'URBAN_PLANNER' ? '#539BA9' : '#FFFFFF'}
            />
            <rect
              x="14.2"
              y="10.5"
              width="1.6"
              height="1.6"
              rx="0.3"
              fill={currentMode === 'URBAN_PLANNER' ? '#539BA9' : '#FFFFFF'}
            />

            {/* Right Medium Skyscraper */}
            <path d="M17.5 10.5C17.5 9.67 18.17 9 19 9H19.5C20.33 9 21 9.67 21 10.5V20H17.5V10.5Z" />
            {/* Windows on right skyscraper */}
            <rect
              x="18.5"
              y="11.5"
              width="1.6"
              height="1.6"
              rx="0.3"
              fill={currentMode === 'URBAN_PLANNER' ? '#539BA9' : '#FFFFFF'}
            />
            <rect
              x="18.5"
              y="14.5"
              width="1.6"
              height="1.6"
              rx="0.3"
              fill={currentMode === 'URBAN_PLANNER' ? '#539BA9' : '#FFFFFF'}
            />

            {/* Mountain Peak in foreground */}
            <path d="M2.5 19.5C2.1 19.5 1.8 19 2.1 18.6L7.8 7.6C8.2 6.8 9.3 6.8 9.7 7.6L15.4 18.6C15.7 19 15.4 19.5 15 19.5H2.5Z" />
            {/* Mountain snow peak notch / cutout */}
            <path
              d="M8.75 7.8L10.6 11.2L9.6 12L8.75 10.8L7.9 12L6.9 11.2L8.75 7.8Z"
              fill={currentMode === 'URBAN_PLANNER' ? '#539BA9' : '#FFFFFF'}
            />
          </svg>
        </button>
      </nav>

      {/* 3. Bottom Settings / Info Button (ant-design:setting-filled) */}
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
