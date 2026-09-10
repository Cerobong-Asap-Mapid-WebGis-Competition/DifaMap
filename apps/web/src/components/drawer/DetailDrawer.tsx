'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Star,
  Plus,
  Send,
  MapPin,
  Camera,
  MessageSquare,
  Sparkles,
  Layers,
  Eye,
  Sun,
  Accessibility,
  ZoomIn,
  ShieldCheck,
  AlertCircle,
  Footprints,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { difaMapApi } from '../../lib/api';
import ImageLightboxModal from '../modals/ImageLightboxModal';
import { useIsMobile } from '../../hooks/useIsMobile';

export interface SelectedItemState {
  type: 'ACTIVITY' | 'LOCATION';
  data: any;
}

interface DetailDrawerProps {
  selectedItem: SelectedItemState | null;
  onClose: () => void;
  onOpenCreateModalWithLocation?: (location: any) => void;
}

export default function DetailDrawer({
  selectedItem,
  onClose,
  onOpenCreateModalWithLocation,
}: DetailDrawerProps) {
  const isMobile = useIsMobile(768);
  const [comments, setComments] = useState<any[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [authorName, setAuthorName] = useState('');
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);

  // Lightbox Pop-up State
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // Reset photo index when selected item changes
  useEffect(() => {
    setSelectedPhotoIndex(0);
    setIsLightboxOpen(false);
  }, [selectedItem?.data?.id]);

  // Handle ESC key: close comment box first, or close drawer
  useEffect(() => {
    if (!selectedItem) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // If lightbox is open, let ImageLightboxModal handle it
        if (isLightboxOpen) return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (showCommentInput) {
          setShowCommentInput(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItem, showCommentInput, isLightboxOpen, onClose]);

  // Fetch comments when selected item changes
  useEffect(() => {
    if (!selectedItem) return;

    const fetchComments = async () => {
      try {
        setIsLoadingComments(true);
        if (selectedItem.type === 'LOCATION') {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/comments/location/${selectedItem.data.id}`);
          const json = await res.json();
          setComments(json.data || []);
        } else {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/comments/activity/${selectedItem.data.id}`);
          const json = await res.json();
          setComments(json.data || []);
        }
      } catch (err) {
        console.error('Failed to load comments:', err);
      } finally {
        setIsLoadingComments(false);
      }
    };

    fetchComments();
  }, [selectedItem]);

  if (!selectedItem) return null;

  const { type, data } = selectedItem;
  const isLocation = type === 'LOCATION';

  // Extract title & address
  const title = isLocation ? data.name : (data.title || data.specificLocation || 'Laporan Lapangan');
  const address = isLocation
    ? (data.specificLocation || data.description || 'Kota Makassar, Sulawesi Selatan')
    : (data.specificLocation || (data.location ? data.location.name : 'Titik Survei Lapangan'));

  // Ekstraksi parameter observasi AI secara dinamis (tanpa hardcode)
  const observedParams = isLocation
    ? {
        rampStatus: data.rampStatus,
        guidingBlockStatus: data.guidingBlockStatus,
        sidewalkCondition: data.sidewalkCondition,
        surfaceCondition: data.surfaceCondition,
        seatingAvailability: data.seatingAvailability,
        toiletAccessibility: data.toiletAccessibility,
        lightingLevel: data.lightingLevel,
        crowdLevel: data.crowdLevel,
      }
    : (data.observedParameters || data.aiAnalysis?.observedParameters || {
        rampStatus: data.rampStatus,
        guidingBlockStatus: data.guidingBlockStatus,
        sidewalkCondition: data.sidewalkCondition,
        surfaceCondition: data.surfaceCondition,
        seatingAvailability: data.seatingAvailability,
        toiletAccessibility: data.toiletAccessibility,
        lightingLevel: data.lightingLevel,
        crowdLevel: data.crowdLevel,
      });

  // Skor resmi terobservasi
  const overallScore = isLocation
    ? (data.overallScore || 4.0)
    : (data.aiScore || (data.aiAnalysis?.overallScore) || 3.5);

  const starCount = Math.round(overallScore);
  const totalReviews = isLocation ? (data.totalComments || comments.length || 1) : (comments.length || 1);
  const aiConfidence = isLocation ? data.aiConfidence : (data.aiConfidence || data.aiAnalysis?.aiConfidence);

  // Helper fungsi untuk format fasilitas secara dinamis dan jujur sesuai fakta foto
  const getFacilityInfo = (field: 'ramp' | 'guiding' | 'lighting' | 'sidewalk' | 'surface' | 'toilet', value?: string) => {
    if (field === 'ramp') {
      if (value === 'GOOD' || value === 'AVAILABLE' || value === 'AVAILABLE_GOOD') {
        return { label: 'Ramp Kursi Roda', status: 'Tersedia & Landai', bg: '#DCFCE7', color: '#166534', border: '#BBF7D0' };
      }
      if (value === 'DAMAGED' || value === 'STEEP') {
        return { label: 'Ramp Kursi Roda', status: 'Curam / Rusak', bg: '#FEF3C7', color: '#B45309', border: '#FDE68A' };
      }
      if (value === 'NONE' || value === 'NOT_AVAILABLE') {
        return { label: 'Ramp Kursi Roda', status: 'Tidak Ada Ramp', bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' };
      }
      return { label: 'Ramp Kursi Roda', status: 'Belum Teramati di Foto', bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' };
    }

    if (field === 'guiding') {
      if (value === 'GOOD' || value === 'AVAILABLE' || value === 'AVAILABLE_GOOD') {
        return { label: 'Ubin Pemandu (Taktil)', status: 'Terpasang Baik', bg: '#DCFCE7', color: '#166534', border: '#BBF7D0' };
      }
      if (value === 'DAMAGED') {
        return { label: 'Ubin Pemandu (Taktil)', status: 'Rusak / Paving Lepas', bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' };
      }
      if (value === 'BLOCKED') {
        return { label: 'Ubin Pemandu (Taktil)', status: 'Terhalang Parkir/PKL', bg: '#FEF3C7', color: '#B45309', border: '#FDE68A' };
      }
      if (value === 'NONE' || value === 'NOT_AVAILABLE') {
        return { label: 'Ubin Pemandu (Taktil)', status: 'Belum Terpasang', bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' };
      }
      return { label: 'Ubin Pemandu (Taktil)', status: 'Belum Teramati di Foto', bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' };
    }

    if (field === 'lighting') {
      if (value === 'BRIGHT' || value === 'GOOD' || value === 'AVAILABLE') {
        return { label: 'Penerangan Jalan', status: 'Terang & Jelas', bg: '#DCFCE7', color: '#166534', border: '#BBF7D0' };
      }
      if (value === 'DIM') {
        return { label: 'Penerangan Jalan', status: 'Cukup Terang / Redup', bg: '#FEF3C7', color: '#B45309', border: '#FDE68A' };
      }
      if (value === 'DARK' || value === 'NONE') {
        return { label: 'Penerangan Jalan', status: 'Gelap / Tanpa Lampu', bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' };
      }
      return { label: 'Penerangan Jalan', status: 'Belum Teramati (Foto Siang)', bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' };
    }

    if (field === 'sidewalk') {
      if (value === 'GOOD' || value === 'WIDE' || value === 'SMOOTH' || value === 'AVAILABLE') {
        return { label: 'Kondisi Trotoar', status: 'Lebar & Nyaman', bg: '#DCFCE7', color: '#166534', border: '#BBF7D0' };
      }
      if (value === 'NARROW') {
        return { label: 'Kondisi Trotoar', status: 'Sempit (< 1.2m)', bg: '#FEF3C7', color: '#B45309', border: '#FDE68A' };
      }
      if (value === 'DAMAGED') {
        return { label: 'Kondisi Trotoar', status: 'Berlubang / Rusak', bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' };
      }
      if (value === 'BLOCKED') {
        return { label: 'Kondisi Trotoar', status: 'Terhalang Rintangan', bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' };
      }
      if (value === 'NOT_APPLICABLE') {
        return { label: 'Kondisi Trotoar', status: 'Bukan Area Trotoar', bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' };
      }
      return { label: 'Kondisi Trotoar', status: 'Belum Terpotret di Foto', bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' };
    }

    if (field === 'surface') {
      if (value === 'SMOOTH') {
        return { label: 'Permukaan Jalan', status: 'Rata & Halus', bg: '#DCFCE7', color: '#166534', border: '#BBF7D0' };
      }
      if (value === 'SLIPPERY') {
        return { label: 'Permukaan Jalan', status: 'Licin Saat Basah', bg: '#FEF3C7', color: '#B45309', border: '#FDE68A' };
      }
      if (value === 'POTHOLE' || value === 'UNEVEN') {
        return { label: 'Permukaan Jalan', status: 'Bergelombang / Lubang', bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' };
      }
      return { label: 'Permukaan Jalan', status: 'Belum Terpotret', bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' };
    }

    // Toilet
    if (value === 'AVAILABLE_GOOD') {
      return { label: 'Toilet Disabilitas', status: 'Tersedia Layak', bg: '#DCFCE7', color: '#166534', border: '#BBF7D0' };
    }
    if (value === 'AVAILABLE_DAMAGED') {
      return { label: 'Toilet Disabilitas', status: 'Ada (Perlu Perbaikan)', bg: '#FEF3C7', color: '#B45309', border: '#FDE68A' };
    }
    if (value === 'NOT_AVAILABLE') {
      return { label: 'Toilet Disabilitas', status: 'Tidak Ada Toilet Difabel', bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' };
    }
    return { label: 'Toilet Disabilitas', status: 'Belum Teramati di Foto', bg: '#F8FAFC', color: '#64748B', border: '#E2E8F0' };
  };

  // Status Colors for Indicator Dots
  const getStatusColor = (status?: string) => {
    if (!status || status === 'NOT_VISIBLE') return '#94A3B8'; // Abu-abu
    if (status === 'GOOD' || status === 'AVAILABLE' || status === 'AVAILABLE_GOOD' || status === 'BRIGHT' || status === 'SMOOTH') return '#16A34A'; // Hijau
    if (status === 'DAMAGED' || status === 'NONE' || status === 'NOT_AVAILABLE' || status === 'DARK' || status === 'BLOCKED' || status === 'POTHOLE') return '#EF4444'; // Merah
    return '#F59E0B'; // Kuning / Oranye
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    try {
      setIsSubmittingComment(true);
      const payload = {
        locationId: isLocation ? data.id : undefined,
        activityId: !isLocation ? data.id : undefined,
        content: commentText.trim(),
        photoUrls: [],
      };

      await difaMapApi.createComment(payload);
      
      const newComment = {
        id: Math.random().toString(),
        content: commentText,
        createdAt: new Date().toISOString(),
        user: {
          name: authorName.trim() || 'Kontributor Komunitas',
          avatarUrl: null,
        },
      };

      setComments([newComment, ...comments]);
      setCommentText('');
      setShowCommentInput(false);
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  return (
    <aside
      className={isMobile ? 'animate-slide-up' : 'animate-slide-in'}
      // Hentikan seluruh event mouse, drag, dan touch agar peta di bawah TIDAK ikut bergeser saat pop-up disentuh
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: isMobile ? 0 : '96px',
        right: isMobile ? 0 : 'auto',
        top: isMobile ? 'auto' : '20px',
        bottom: isMobile ? 0 : '20px',
        width: isMobile ? '100%' : '440px',
        maxWidth: isMobile ? '100vw' : 'calc(100vw - 116px)',
        maxHeight: isMobile ? '86vh' : 'calc(100vh - 40px)',
        backgroundColor: '#FFFFFF',
        borderRadius: isMobile ? '24px 24px 0 0' : '20px',
        boxShadow: isMobile ? '0px -8px 36px rgba(0, 0, 0, 0.3)' : '0px 14px 44px rgba(0, 0, 0, 0.16)',
        border: '1px solid rgba(0, 0, 0, 0.08)',
        borderBottom: isMobile ? 'none' : undefined,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: 'text',
      }}
    >
      {/* 1. Header Toolbar with Close Button */}
      <div
        style={{
          padding: isMobile ? '14px 18px' : '16px 20px',
          borderBottom: '1px solid #F1F5F9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#FFFFFF',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span
            style={{
              backgroundColor: isLocation ? '#539BA9' : '#FDC323',
              color: isLocation ? '#FFFFFF' : '#000000',
              padding: '4px 10px',
              borderRadius: '20px',
              fontSize: '11.5px',
              fontWeight: '800',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {isLocation ? 'Detail Tempat' : 'Detail Aktivitas'}
          </span>
          {data.category && (
            <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: '600' }}>
              • {data.category}
            </span>
          )}
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          title="Tutup Panel"
          style={{
            background: isMobile ? '#F1F5F9' : 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '6px 10px',
            borderRadius: '12px',
            color: '#0F172A',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '13px',
            fontWeight: '700',
            transition: 'background-color 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#E2E8F0')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = isMobile ? '#F1F5F9' : 'transparent')}
        >
          <X size={20} strokeWidth={2.5} />
        </button>
      </div>

      {/* 2. Scrollable Body Content (Terkunci secara horizontal agar tidak bisa tergeser ke samping) */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          width: '100%',
          boxSizing: 'border-box',
          padding: isMobile ? '16px 18px' : '18px 22px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Title & Address */}
        <div style={{ width: '100%' }}>
          <h2
            style={{
              fontSize: '20px',
              fontWeight: '800',
              color: '#0F172A',
              lineHeight: '26px',
              marginBottom: '6px',
              wordBreak: 'break-word',
            }}
          >
            {title}
          </h2>
          <p
            style={{
              fontSize: '13px',
              color: '#64748B',
              lineHeight: '18px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '6px',
            }}
          >
            <MapPin size={16} color="#539BA9" style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>{address}</span>
          </p>
        </div>

        {/* Photo Gallery & Preview */}
        {(() => {
          const rawMedias: string[] = data.mediaUrls && data.mediaUrls.length > 0
            ? data.mediaUrls
            : (data.coverImageUrl ? [data.coverImageUrl] : []);
          
          if (rawMedias.length === 0) return null;

          // Urutkan foto agar foto kamera survei asli berada di depan
          const mediaList = [...rawMedias].sort((a, b) => {
            const isMapA = a.includes('_map_') || a.toLowerCase().endsWith('.png');
            const isMapB = b.includes('_map_') || b.toLowerCase().endsWith('.png');
            if (isMapA && !isMapB) return 1;
            if (!isMapA && isMapB) return -1;
            return 0;
          });

          const currentPhoto = mediaList[selectedPhotoIndex] || mediaList[0];
          const isCurrentMap = currentPhoto.includes('_map_') || currentPhoto.toLowerCase().endsWith('.png');

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
              <div
                onClick={() => {
                  setLightboxImages(mediaList);
                  setLightboxIndex(selectedPhotoIndex);
                  setIsLightboxOpen(true);
                }}
                title="Klik untuk melihat foto resolusi penuh"
                style={{
                  position: 'relative',
                  borderRadius: '14px',
                  overflow: 'hidden',
                  height: '210px',
                  width: '100%',
                  backgroundColor: '#0F172A',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.1)',
                  cursor: 'pointer',
                }}
              >
                <img
                  src={currentPhoto}
                  alt={title}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = '/photos/default-accessibility.jpg';
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transition: 'transform 0.3s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.04)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                />

                {/* Badge tipe media */}
                <div
                  style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: '700',
                    backgroundColor: 'rgba(0, 0, 0, 0.75)',
                    color: '#ffffff',
                    backdropFilter: 'blur(6px)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  {isCurrentMap ? (
                    <>
                      <MapPin size={12} color="#FDC323" />
                      <span>Peta GPS</span>
                    </>
                  ) : (
                    <>
                      <Camera size={12} color="#34D399" />
                      <span>Foto Lapangan</span>
                    </>
                  )}
                </div>

                {/* Bottom Affordance */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '10px',
                    right: '10px',
                    padding: '4px 10px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: '700',
                    backgroundColor: 'rgba(0, 0, 0, 0.75)',
                    color: '#ffffff',
                    backdropFilter: 'blur(6px)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <ZoomIn size={13} color="#FDC323" />
                  <span>Perbesar Foto</span>
                </div>
              </div>

              {/* Thumbnails Row (Jika foto lebih dari 1) */}
              {mediaList.length > 1 && (
                <div
                  style={{
                    display: 'flex',
                    gap: '8px',
                    overflowX: 'auto',
                    scrollbarWidth: 'none',
                    paddingBottom: '2px',
                    width: '100%',
                  }}
                >
                  {mediaList.map((url, idx) => {
                    const isMap = url.includes('_map_') || url.toLowerCase().endsWith('.png');
                    const isSelected = idx === selectedPhotoIndex;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedPhotoIndex(idx)}
                        title={`Pilih Foto #${idx + 1}`}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 8px',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid #FDC323' : '1px solid #E2E8F0',
                          backgroundColor: isSelected ? '#FFFBEB' : '#FFFFFF',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        <img
                          src={url}
                          alt={`Thumb ${idx + 1}`}
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = '/photos/default-accessibility.jpg';
                          }}
                          style={{ width: '28px', height: '28px', borderRadius: '4px', objectFit: 'cover' }}
                        />
                        <span style={{ fontSize: '11px', fontWeight: isSelected ? 700 : 500, color: '#1E293B' }}>
                          {isMap ? 'Peta GPS' : `Foto #${idx + 1}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* Rating & 5 Status Indicators */}
        <div
          style={{
            backgroundColor: '#F8FAFC',
            borderRadius: '14px',
            padding: '14px 16px',
            border: '1px solid #E2E8F0',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            width: '100%',
            boxSizing: 'border-box',
          }}
        >
          {/* Rating Summary Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#64748B', marginBottom: '2px' }}>
                {isLocation ? 'Skor Aksesibilitas Resmi' : 'Penilaian Aksesibilitas Citra AI'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '24px', fontWeight: '800', color: '#0F172A' }}>
                  {overallScore.toFixed(1)}
                </span>
                
                {/* 5 Stars */}
                <div style={{ display: 'flex', gap: '2px' }}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      size={18}
                      fill={star <= starCount ? '#FDC323' : 'none'}
                      color={star <= starCount ? '#FDC323' : '#CBD5E1'}
                      strokeWidth={star <= starCount ? 0 : 2}
                    />
                  ))}
                </div>

                <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: '500' }}>
                  ({totalReviews} ulasan)
                </span>
              </div>
            </div>

            {/* AI Confidence Badge */}
            {aiConfidence && (
              <div
                style={{
                  backgroundColor: '#ECFDF5',
                  border: '1px solid #A7F3D0',
                  padding: '4px 8px',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Sparkles size={13} color="#059669" />
                <span style={{ fontSize: '11px', fontWeight: '700', color: '#065F46' }}>
                  {(aiConfidence * 100).toFixed(0)}% Akurat
                </span>
              </div>
            )}
          </div>

          {/* 5 Status Indicators Row with Tooltip Explanations */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '10px',
              borderTop: '1px solid #E2E8F0',
            }}
          >
            {/* 1. Ramp Kursi Roda */}
            <div
              title={`Ramp: ${getFacilityInfo('ramp', observedParams?.rampStatus).status}`}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'help' }}
            >
              <Accessibility size={17} color="#334155" />
              <div
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  backgroundColor: getStatusColor(observedParams?.rampStatus),
                }}
              />
            </div>

            {/* 2. Ubin Pemandu (Tunanetra) */}
            <div
              title={`Ubin Pemandu: ${getFacilityInfo('guiding', observedParams?.guidingBlockStatus).status}`}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'help' }}
            >
              <Eye size={17} color="#334155" />
              <div
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  backgroundColor: getStatusColor(observedParams?.guidingBlockStatus),
                }}
              />
            </div>

            {/* 3. Penerangan Jalan */}
            <div
              title={`Penerangan: ${getFacilityInfo('lighting', observedParams?.lightingLevel).status}`}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'help' }}
            >
              <Sun size={17} color="#334155" />
              <div
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  backgroundColor: getStatusColor(observedParams?.lightingLevel),
                }}
              />
            </div>

            {/* 4. Kondisi Trotoar */}
            <div
              title={`Trotoar: ${getFacilityInfo('sidewalk', observedParams?.sidewalkCondition).status}`}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'help' }}
            >
              <Footprints size={17} color="#334155" />
              <div
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  backgroundColor: getStatusColor(observedParams?.sidewalkCondition),
                }}
              />
            </div>

            {/* 5. Permukaan Jalan */}
            <div
              title={`Permukaan: ${getFacilityInfo('surface', observedParams?.surfaceCondition).status}`}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'help' }}
            >
              <Layers size={17} color="#334155" />
              <div
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  backgroundColor: getStatusColor(observedParams?.surfaceCondition),
                }}
              />
            </div>
          </div>
        </div>

        {/* AI Insight Summary (Evaluasi Citra Nyata OpenAI Vision) */}
        {(data.aiAnalysis || data.aiSummary) && (
          <div
            style={{
              backgroundColor: 'rgba(83, 155, 169, 0.08)',
              border: '1.5px solid rgba(83, 155, 169, 0.25)',
              borderRadius: '14px',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#0E7490', fontWeight: '800', fontSize: '12.5px' }}>
                <Sparkles size={15} color="#0E7490" />
                <span>EVALUASI CITRA AI (GPT-4O VISION)</span>
              </div>
              <span style={{ fontSize: '11px', color: '#0E7490', fontWeight: '700' }}>
                Kondisi Lapangan
              </span>
            </div>

            <p style={{ fontSize: '13px', color: '#1E293B', lineHeight: '19px', margin: 0 }}>
              {data.aiAnalysis?.summary || data.aiSummary || data.description}
            </p>

            {data.aiAnalysis?.barrierType && data.aiAnalysis.barrierType !== 'NONE' && (
              <div
                style={{
                  backgroundColor: '#FEF2F2',
                  border: '1px solid #FECACA',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  fontSize: '12px',
                  color: '#991B1B',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '6px',
                }}
              >
                <AlertCircle size={15} color="#DC2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span><strong>Hambatan:</strong> {data.aiAnalysis.barrierType}</span>
              </div>
            )}

            {data.aiAnalysis?.actionRecommendation && (
              <div
                style={{
                  backgroundColor: '#F0FDF4',
                  border: '1px solid #BBF7D0',
                  borderRadius: '8px',
                  padding: '8px 10px',
                  fontSize: '12px',
                  color: '#166534',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '6px',
                }}
              >
                <CheckCircle2 size={15} color="#16A34A" style={{ flexShrink: 0, marginTop: '2px' }} />
                <span><strong>Rekomendasi:</strong> {data.aiAnalysis.actionRecommendation}</span>
              </div>
            )}
          </div>
        )}

        {/* Status Fasilitas Aksesibilitas (Dinamis dari Hasil Pengamatan Citra AI) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '12.5px', fontWeight: '800', color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Fasilitas Aksesibilitas
            </h3>
            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: '600' }}>
              Pengamatan AI Lapangan
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            {/* Card 1: Ramp Kursi Roda */}
            {(() => {
              const info = getFacilityInfo('ramp', observedParams?.rampStatus);
              return (
                <div
                  style={{
                    backgroundColor: info.bg,
                    border: `1.5px solid ${info.border}`,
                    borderRadius: '10px',
                    padding: '9px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Accessibility size={18} color={info.color} strokeWidth={2.4} />
                    <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#0F172A' }}>
                      {info.label}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '11.5px',
                      fontWeight: '800',
                      color: info.color,
                      textAlign: 'right',
                    }}
                  >
                    {info.status}
                  </span>
                </div>
              );
            })()}

            {/* Card 2: Guiding Block */}
            {(() => {
              const info = getFacilityInfo('guiding', observedParams?.guidingBlockStatus);
              return (
                <div
                  style={{
                    backgroundColor: info.bg,
                    border: `1.5px solid ${info.border}`,
                    borderRadius: '10px',
                    padding: '9px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Eye size={18} color={info.color} strokeWidth={2.4} />
                    <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#0F172A' }}>
                      {info.label}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '11.5px',
                      fontWeight: '800',
                      color: info.color,
                      textAlign: 'right',
                    }}
                  >
                    {info.status}
                  </span>
                </div>
              );
            })()}

            {/* Card 3: Penerangan Jalan */}
            {(() => {
              const info = getFacilityInfo('lighting', observedParams?.lightingLevel);
              return (
                <div
                  style={{
                    backgroundColor: info.bg,
                    border: `1.5px solid ${info.border}`,
                    borderRadius: '10px',
                    padding: '9px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sun size={18} color={info.color} strokeWidth={2.4} />
                    <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#0F172A' }}>
                      {info.label}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '11.5px',
                      fontWeight: '800',
                      color: info.color,
                      textAlign: 'right',
                    }}
                  >
                    {info.status}
                  </span>
                </div>
              );
            })()}

            {/* Card 4: Kondisi Trotoar */}
            {(() => {
              const info = getFacilityInfo('sidewalk', observedParams?.sidewalkCondition);
              return (
                <div
                  style={{
                    backgroundColor: info.bg,
                    border: `1.5px solid ${info.border}`,
                    borderRadius: '10px',
                    padding: '9px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Footprints size={18} color={info.color} strokeWidth={2.4} />
                    <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#0F172A' }}>
                      {info.label}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '11.5px',
                      fontWeight: '800',
                      color: info.color,
                      textAlign: 'right',
                    }}
                  >
                    {info.status}
                  </span>
                </div>
              );
            })()}

            {/* Card 5: Kondisi Permukaan (Jika teramati) */}
            {observedParams?.surfaceCondition && observedParams.surfaceCondition !== 'NOT_VISIBLE' && (() => {
              const info = getFacilityInfo('surface', observedParams.surfaceCondition);
              return (
                <div
                  style={{
                    backgroundColor: info.bg,
                    border: `1.5px solid ${info.border}`,
                    borderRadius: '10px',
                    padding: '9px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Layers size={18} color={info.color} strokeWidth={2.4} />
                    <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#0F172A' }}>
                      {info.label}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '11.5px',
                      fontWeight: '800',
                      color: info.color,
                      textAlign: 'right',
                    }}
                  >
                    {info.status}
                  </span>
                </div>
              );
            })()}

            {/* Card 6: Toilet Disabilitas (Jika teramati) */}
            {observedParams?.toiletAccessibility && observedParams.toiletAccessibility !== 'NOT_VISIBLE' && (() => {
              const info = getFacilityInfo('toilet', observedParams.toiletAccessibility);
              return (
                <div
                  style={{
                    backgroundColor: info.bg,
                    border: `1.5px solid ${info.border}`,
                    borderRadius: '10px',
                    padding: '9px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '8px',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ShieldCheck size={18} color={info.color} strokeWidth={2.4} />
                    <span style={{ fontSize: '12.5px', fontWeight: '700', color: '#0F172A' }}>
                      {info.label}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '11.5px',
                      fontWeight: '800',
                      color: info.color,
                      textAlign: 'right',
                    }}
                  >
                    {info.status}
                  </span>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Action Button: "Bagikan ulasan..." */}
        {!showCommentInput ? (
          <button
            onClick={() => setShowCommentInput(true)}
            style={{
              width: '100%',
              height: '48px',
              borderRadius: '50px',
              border: '1.5px solid #CBD5E1',
              backgroundColor: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 18px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxSizing: 'border-box',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#0F172A')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#CBD5E1')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Plus size={18} color="#0F172A" />
              <span style={{ fontSize: '14px', color: '#64748B', fontWeight: '600' }}>
                Bagikan ulasan lapangan...
              </span>
            </div>
            <Send size={16} color="#539BA9" />
          </button>
        ) : (
          /* Inline Comment Input Box */
          <form
            onSubmit={handlePostComment}
            style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #CBD5E1',
              borderRadius: '12px',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              width: '100%',
              boxSizing: 'border-box',
            }}
          >
            <input
              type="text"
              placeholder="Nama Anda (opsional)"
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                fontSize: '13px',
                outline: 'none',
                backgroundColor: '#FFFFFF',
                boxSizing: 'border-box',
              }}
            />

            <textarea
              rows={3}
              placeholder="Tuliskan pengalaman atau kondisi aksesibilitas di titik ini..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                fontSize: '13.5px',
                outline: 'none',
                fontFamily: 'inherit',
                resize: 'none',
                backgroundColor: '#FFFFFF',
                boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setShowCommentInput(false)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '20px',
                  border: '1px solid #CBD5E1',
                  background: 'transparent',
                  cursor: 'pointer',
                  fontSize: '12.5px',
                }}
              >
                Batal
              </button>

              <button
                type="submit"
                disabled={isSubmittingComment || !commentText.trim()}
                className="btn-yellow-pill"
                style={{
                  height: '34px',
                  padding: '0 16px',
                  fontSize: '12.5px',
                }}
              >
                {isSubmittingComment ? 'Mengirim...' : 'Kirim Ulasan'}
              </button>
            </div>
          </form>
        )}

        {/* Community Reviews Feed List */}
        <div style={{ width: '100%' }}>
          <h3
            style={{
              fontSize: '14.5px',
              fontWeight: '800',
              color: '#0F172A',
              marginBottom: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <MessageSquare size={17} color="#539BA9" />
            <span>Feed Ulasan Komunitas ({comments.length})</span>
          </h3>

          {isLoadingComments ? (
            /* Skeleton Loading */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div className="skeleton" style={{ height: '90px', width: '100%' }} />
              <div className="skeleton" style={{ height: '90px', width: '100%' }} />
            </div>
          ) : comments.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #F1F5F9',
                    borderRadius: '12px',
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        backgroundColor: '#64748B',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#FFFFFF',
                        fontWeight: '700',
                        fontSize: '14px',
                        overflow: 'hidden',
                        flexShrink: 0,
                      }}
                    >
                      {comment.user?.avatarUrl ? (
                        <img src={comment.user.avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%' }} />
                      ) : (
                        (comment.user?.name || 'K')[0].toUpperCase()
                      )}
                    </div>

                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: '700', color: '#0F172A' }}>
                        {comment.user?.name || 'Kontributor Komunitas'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#94A3B8' }}>
                        {new Date(comment.createdAt).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </div>
                    </div>
                  </div>

                  <p
                    style={{
                      fontSize: '13px',
                      color: '#334155',
                      lineHeight: '18px',
                      margin: 0,
                      wordBreak: 'break-word',
                    }}
                  >
                    {comment.content}
                  </p>

                  {comment.photoUrls && comment.photoUrls.length > 0 && (
                    <div
                      onClick={() => {
                        setLightboxImages(comment.photoUrls);
                        setLightboxIndex(0);
                        setIsLightboxOpen(true);
                      }}
                      title="Klik untuk memperbesar foto ulasan"
                      style={{
                        borderRadius: '8px',
                        overflow: 'hidden',
                        maxHeight: '140px',
                        cursor: 'pointer',
                        marginTop: '4px',
                      }}
                    >
                      <img
                        src={comment.photoUrls[0]}
                        alt="Foto Ulasan"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div
              style={{
                textAlign: 'center',
                padding: '24px 16px',
                color: '#64748B',
                fontSize: '13px',
                backgroundColor: '#F8FAFC',
                borderRadius: '12px',
                border: '1px dashed #CBD5E1',
              }}
            >
              Belum ada ulasan untuk titik ini. Jadilah orang pertama yang membagikan laporan aksesibilitas!
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Pop-up Modal untuk melihat foto spesifik */}
      <ImageLightboxModal
        isOpen={isLightboxOpen}
        onClose={() => setIsLightboxOpen(false)}
        images={lightboxImages}
        initialIndex={lightboxIndex}
        locationName={title}
        specificLocation={address}
      />
    </aside>
  );
}
