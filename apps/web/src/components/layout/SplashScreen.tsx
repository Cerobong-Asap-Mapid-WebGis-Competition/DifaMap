'use client';

import React, { useState, useEffect } from 'react';

interface SplashScreenProps {
  /** Durasi tampil sebelum mulai fade out (dalam milidetik). Default: 1800ms (1.8 detik). */
  duration?: number;
  /** Callback opsional saat animasi splash selesai sepenuhnya */
  onFinish?: () => void;
}

export default function SplashScreen({
  duration = 1800,
  onFinish,
}: SplashScreenProps) {
  // State: tampil di layar atau tidak
  const [isVisible, setIsVisible] = useState(true);
  // State: transisi fade-out sedang berlangsung
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    // 1. Tahan splash screen selama durasi yang ditentukan (1.8 detik)
    const fadeTimer = setTimeout(() => {
      setIsFadingOut(true);
    }, duration);

    // 2. Beri waktu transisi fade out (500ms) sebelum unmount dari DOM
    const removeTimer = setTimeout(() => {
      setIsVisible(false);
      if (onFinish) onFinish();
    }, duration + 500);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, [duration, onFinish]);

  if (!isVisible) return null;

  return (
    <div
      role="status"
      aria-label="Memuat DifaMap"
      aria-live="polite"
      className={`difamap-splash-container ${isFadingOut ? 'fade-out' : ''}`}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 99999,
        backgroundColor: '#F8F9FA',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: isFadingOut ? 'none' : 'auto',
        userSelect: 'none',
        transition: 'opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1), transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
        opacity: isFadingOut ? 0 : 1,
        transform: isFadingOut ? 'scale(1.02)' : 'scale(1)',
      }}
    >
      {/* Ghost Header ala Google Maps di pojok kiri atas (sesuai screenshot referensi) */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          height: '48px',
          width: 'min(380px, calc(100vw - 32px))',
          backgroundColor: '#FFFFFF',
          borderRadius: '24px',
          boxShadow: '0 2px 6px rgba(60,64,67,0.15)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: '12px',
          opacity: 0.85,
        }}
      >
        <div
          style={{
            width: '20px',
            height: '20px',
            borderRadius: '50%',
            backgroundColor: '#DADCE0',
          }}
        />
        <div
          style={{
            height: '14px',
            width: '140px',
            borderRadius: '7px',
            backgroundColor: '#E8EAED',
          }}
        />
      </div>

      {/* Konten Utama Animasi Splash (Tengah Layar) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '20px',
          padding: '24px',
          textAlign: 'center',
        }}
      >
        {/* Logo DifaMap dengan efek Pop & Pulse Halus */}
        <div
          className="difamap-splash-logo-wrapper"
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Cincin radar/sonar lembut di belakang logo */}
          <div
            className="difamap-splash-sonar"
            style={{
              position: 'absolute',
              width: '110px',
              height: '110px',
              borderRadius: '50%',
              backgroundColor: 'rgba(83, 155, 169, 0.12)',
              zIndex: 0,
            }}
          />

          <img
            src="/difamap-logo.png"
            alt="DifaMap Logo"
            className="difamap-splash-logo"
            style={{
              width: '92px',
              height: '92px',
              objectFit: 'contain',
              position: 'relative',
              zIndex: 1,
              filter: 'drop-shadow(0 8px 20px rgba(83, 155, 169, 0.28))',
            }}
          />
        </div>

        {/* Teks Identitas DifaMap */}
        <div
          className="difamap-splash-text"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          <h1
            style={{
              fontSize: '26px',
              fontWeight: 800,
              letterSpacing: '-0.5px',
              color: '#1E293B',
              margin: 0,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
            }}
          >
            <span>Difa</span>
            <span style={{ color: '#539BA9' }}>Map</span>
          </h1>
          <p
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: '#64748B',
              margin: 0,
              letterSpacing: '0.2px',
            }}
          >
            Peta Cerdas Aksesibilitas Spasial
          </p>
        </div>

        {/* 3 Bouncing Dots ala Google Maps */}
        <div
          className="difamap-splash-dots"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '8px',
          }}
        >
          <span
            className="difamap-dot dot-1"
            style={{
              width: '9px',
              height: '9px',
              borderRadius: '50%',
              backgroundColor: '#539BA9',
              display: 'inline-block',
            }}
          />
          <span
            className="difamap-dot dot-2"
            style={{
              width: '9px',
              height: '9px',
              borderRadius: '50%',
              backgroundColor: '#FDC323',
              display: 'inline-block',
            }}
          />
          <span
            className="difamap-dot dot-3"
            style={{
              width: '9px',
              height: '9px',
              borderRadius: '50%',
              backgroundColor: '#3E7B87',
              display: 'inline-block',
            }}
          />
        </div>
      </div>

      {/* Footer Minimalist ala Google Maps */}
      <div
        style={{
          position: 'absolute',
          bottom: '24px',
          fontSize: '11px',
          fontWeight: 600,
          color: '#94A3B8',
          letterSpacing: '0.4px',
          textTransform: 'uppercase',
        }}
      >
        Makassar & Gowa • MAPID WebGIS
      </div>
    </div>
  );
}
