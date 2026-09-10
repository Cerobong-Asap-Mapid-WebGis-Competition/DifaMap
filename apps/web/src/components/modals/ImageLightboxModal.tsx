'use client';

import React, { useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, ExternalLink, Camera, MapPin, ZoomIn } from 'lucide-react';

export interface LightboxMediaItem {
  url: string;
  title?: string;
  description?: string;
  isMap?: boolean;
}

interface ImageLightboxModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: LightboxMediaItem[] | string[];
  initialIndex?: number;
  locationName?: string;
  specificLocation?: string;
}

export default function ImageLightboxModal({
  isOpen,
  onClose,
  images,
  initialIndex = 0,
  locationName,
  specificLocation,
}: ImageLightboxModalProps) {
  const [currentIndex, setCurrentIndex] = React.useState(initialIndex);

  // Sync initialIndex when modal opens or index changes
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialIndex);
    }
  }, [isOpen, initialIndex]);

  // Normalize images array to LightboxMediaItem[]
  const normalizedImages: LightboxMediaItem[] = React.useMemo(() => {
    if (!images || images.length === 0) return [];
    return images.map((img) => {
      if (typeof img === 'string') {
        const isMap = img.includes('_map_') || img.toLowerCase().endsWith('.png');
        return {
          url: img,
          title: locationName,
          isMap,
        };
      }
      return {
        ...img,
        title: img.title || locationName,
        isMap: img.isMap ?? (img.url.includes('_map_') || img.url.toLowerCase().endsWith('.png')),
      };
    });
  }, [images, locationName]);

  const currentItem = normalizedImages[currentIndex] || normalizedImages[0];

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : normalizedImages.length - 1));
  }, [normalizedImages.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < normalizedImages.length - 1 ? prev + 1 : 0));
  }, [normalizedImages.length]);

  // Keyboard navigation: Escape to close, Left/Right arrow to navigate
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handlePrev, handleNext]);

  if (!isOpen || !currentItem) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.88)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 24px',
        animation: 'fadeIn 0.2s ease-out',
        userSelect: 'none',
      }}
    >
      {/* 1. Header Toolbar */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '1200px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#FFFFFF',
          zIndex: 10,
        }}
      >
        {/* Left: Badge & Title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              padding: '6px 14px',
              borderRadius: '24px',
              fontSize: '12px',
              fontWeight: '700',
              backgroundColor: currentItem.isMap ? 'rgba(253, 195, 35, 0.2)' : 'rgba(16, 185, 129, 0.25)',
              color: currentItem.isMap ? '#FDC323' : '#34D399',
              border: `1px solid ${currentItem.isMap ? 'rgba(253, 195, 35, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {currentItem.isMap ? (
              <>
                <MapPin size={14} />
                <span>Cuplikan Peta Spasial</span>
              </>
            ) : (
              <>
                <Camera size={14} />
                <span>Foto Survei Lapangan Riil</span>
              </>
            )}
          </div>

          <div>
            <h3
              style={{
                fontSize: '16px',
                fontWeight: '700',
                color: '#FFFFFF',
                margin: 0,
                lineHeight: '20px',
              }}
            >
              {currentItem.title || locationName || 'Detail Foto Survei'}
            </h3>
            {specificLocation && (
              <p
                style={{
                  fontSize: '12px',
                  color: '#94A3B8',
                  margin: 0,
                  marginTop: '2px',
                }}
              >
                {specificLocation}
              </p>
            )}
          </div>
        </div>

        {/* Right: Actions (Open Full Res + Close) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Open full resolution in new tab */}
          <a
            href={currentItem.url}
            target="_blank"
            rel="noopener noreferrer"
            title="Buka foto ukuran asli di tab baru"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.12)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#FFFFFF',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              textDecoration: 'none',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.25)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)')}
          >
            <ExternalLink size={18} />
          </a>

          {/* Close button */}
          <button
            onClick={onClose}
            title="Tutup pop-up (Esc)"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              color: '#FFFFFF',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.8)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)')}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* 2. Main Image Canvas & Navigation Controls */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          flex: 1,
          width: '100%',
          maxWidth: '1200px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '16px 0',
          overflow: 'hidden',
        }}
      >
        {/* Previous Button */}
        {normalizedImages.length > 1 && (
          <button
            onClick={handlePrev}
            title="Foto Sebelumnya (Panah Kiri)"
            style={{
              position: 'absolute',
              left: '16px',
              zIndex: 20,
              backgroundColor: 'rgba(0, 0, 0, 0.65)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#FFFFFF',
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              backdropFilter: 'blur(4px)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#FDC323';
              e.currentTarget.style.color = '#000000';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.65)';
              e.currentTarget.style.color = '#FFFFFF';
            }}
          >
            <ChevronLeft size={26} strokeWidth={2.5} />
          </button>
        )}

        {/* High-Resolution Image with Drop Shadow */}
        <div
          style={{
            position: 'relative',
            maxWidth: '100%',
            maxHeight: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <img
            key={currentItem.url}
            src={currentItem.url}
            alt={currentItem.title || 'Foto Survei'}
            style={{
              maxWidth: '92vw',
              maxHeight: '74vh',
              objectFit: 'contain',
              borderRadius: '12px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              transition: 'transform 0.2s ease',
            }}
          />
        </div>

        {/* Next Button */}
        {normalizedImages.length > 1 && (
          <button
            onClick={handleNext}
            title="Foto Selanjutnya (Panah Kanan)"
            style={{
              position: 'absolute',
              right: '16px',
              zIndex: 20,
              backgroundColor: 'rgba(0, 0, 0, 0.65)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#FFFFFF',
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              backdropFilter: 'blur(4px)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#FDC323';
              e.currentTarget.style.color = '#000000';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.65)';
              e.currentTarget.style.color = '#FFFFFF';
            }}
          >
            <ChevronRight size={26} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* 3. Bottom Thumbnail Strip & Counter */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '1200px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
          zIndex: 10,
        }}
      >
        {/* Pagination Counter */}
        {normalizedImages.length > 1 && (
          <div
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.12)',
              padding: '4px 14px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '600',
              color: '#E2E8F0',
              letterSpacing: '0.04em',
            }}
          >
            {currentIndex + 1} dari {normalizedImages.length} Foto
          </div>
        )}

        {/* Mini Thumbnail Row */}
        {normalizedImages.length > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              overflowX: 'auto',
              maxWidth: '100%',
              padding: '6px',
            }}
          >
            {normalizedImages.map((item, idx) => {
              const isSelected = idx === currentIndex;
              return (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  style={{
                    width: '56px',
                    height: '42px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: isSelected ? '2px solid #FDC323' : '2px solid transparent',
                    opacity: isSelected ? 1 : 0.5,
                    cursor: 'pointer',
                    padding: 0,
                    backgroundColor: '#1E293B',
                    transition: 'all 0.15s ease',
                    transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                    flexShrink: 0,
                  }}
                >
                  <img
                    src={item.url}
                    alt={`Thumbnail ${idx + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
