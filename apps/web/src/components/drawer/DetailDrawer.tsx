'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Star,
  Plus,
  Send,
  ArrowLeft,
  MapPin,
  Camera,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Sparkles,
  Layers,
  ChevronRight,
  Eye,
  Sun,
  Accessibility,
  ZoomIn,
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

  const getFacilityInfo = (field: 'ramp' | 'guiding' | 'lighting' | 'sidewalk', value?: string) => {
    if (field === 'ramp') {
      if (!value || value === 'AVAILABLE' || value === 'AVAILABLE_GOOD' || value === 'GOOD') {
        return { label: 'Ramp Kursi Roda', status: 'Tersedia & Landai', bg: '#DCFCE7', color: '#166534', border: '#BBF7D0' };
      }
      if (value === 'DAMAGED' || value === 'STEEP') {
        return { label: 'Ramp Kursi Roda', status: 'Curam / Perlu Bantuan', bg: '#FEF3C7', color: '#B45309', border: '#FDE68A' };
      }
      return { label: 'Ramp Kursi Roda', status: 'Tidak Ada Ramp', bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' };
    }
    if (field === 'guiding') {
      if (value === 'GOOD' || value === 'AVAILABLE' || value === 'AVAILABLE_GOOD') {
        return { label: 'Ubin Pemandu (Tunanetra)', status: 'Terpasang Baik', bg: '#DCFCE7', color: '#166534', border: '#BBF7D0' };
      }
      if (value === 'DAMAGED' || value === 'BLOCKED') {
        return { label: 'Ubin Pemandu (Tunanetra)', status: 'Rusak / Terhalang', bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' };
      }
      return { label: 'Ubin Pemandu (Tunanetra)', status: 'Belum Terpasang', bg: '#F1F5F9', color: '#475569', border: '#E2E8F0' };
    }
    if (field === 'lighting') {
      if (value === 'BRIGHT' || value === 'GOOD' || value === 'AVAILABLE') {
        return { label: 'Penerangan Jalan', status: 'Terang & Jelas', bg: '#DCFCE7', color: '#166534', border: '#BBF7D0' };
      }
      if (value === 'MODERATE' || value === 'DIM') {
        return { label: 'Penerangan Jalan', status: 'Cukup Terang', bg: '#FEF3C7', color: '#B45309', border: '#FDE68A' };
      }
      return { label: 'Penerangan Jalan', status: 'Kurang Terang / Gelap', bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' };
    }
    if (value === 'GOOD' || value === 'WIDE' || value === 'SMOOTH' || value === 'AVAILABLE') {
      return { label: 'Kondisi Trotoar', status: 'Lebar & Nyaman', bg: '#DCFCE7', color: '#166534', border: '#BBF7D0' };
    }
    if (value === 'DAMAGED' || value === 'NARROW' || value === 'OBSTACLE') {
      return { label: 'Kondisi Trotoar', status: 'Sempit / Berlubang', bg: '#FEE2E2', color: '#991B1B', border: '#FECACA' };
    }
    return { label: 'Kondisi Trotoar', status: 'Standar Pejalan', bg: '#F8FAFC', color: '#334155', border: '#E2E8F0' };
  };
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

  // Extract common fields
  const title = isLocation ? data.name : (data.title || data.specificLocation || 'Laporan Lapangan');
  const address = isLocation
    ? (data.specificLocation || data.description || 'Kota Makassar, Sulawesi Selatan')
    : (data.specificLocation || (data.location ? data.location.name : 'Titik Survei Lapangan'));

  const overallScore = isLocation
    ? (data.overallScore || 4.0)
    : (data.aiScore || 4.0);

  const starCount = Math.round(overallScore);
  const totalReviews = isLocation ? (data.totalComments || comments.length || 1) : (comments.length || 1);

  // Status Colors for Main Accessibility Features
  const getStatusColor = (status?: string) => {
    if (!status || status === 'NOT_VISIBLE') return '#94A3B8'; // Slate/Gray (Belum Teramati)
    if (status === 'GOOD' || status === 'AVAILABLE' || status === 'AVAILABLE_GOOD' || status === 'BRIGHT') return '#5FD300'; // Green
    if (status === 'DAMAGED' || status === 'NONE' || status === 'NOT_AVAILABLE' || status === 'DARK' || status === 'BLOCKED') return '#EF0004'; // Red
    return '#FFBB00'; // Yellow (Warning/Moderate)
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
      
      // Optimistic update
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
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        left: isMobile ? 0 : '104px',
        right: isMobile ? 0 : 'auto',
        top: isMobile ? 'auto' : '24px',
        bottom: isMobile ? 0 : '24px',
        width: isMobile ? '100%' : '464px',
        maxWidth: isMobile ? '100vw' : 'calc(100vw - 128px)',
        maxHeight: isMobile ? '84vh' : 'calc(100vh - 48px)',
        backgroundColor: '#FFFFFF',
        borderRadius: isMobile ? '24px 24px 0 0' : '16px',
        boxShadow: isMobile ? '0px -8px 36px rgba(0, 0, 0, 0.25)' : '0px 8px 30px rgba(0, 0, 0, 0.15)',
        border: '1px solid rgba(0, 0, 0, 0.08)',
        borderBottom: isMobile ? 'none' : undefined,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Mobile Top Drag Handle Bar */}
      {isMobile && <div className="bottom-sheet-drag-handle" />}

      {/* 1. Header Toolbar with Close Button */}
      <div
        style={{
          padding: isMobile ? '12px 18px' : '16px 20px',
          borderBottom: '1px solid #EFEFEF',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#FFFFFF',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              backgroundColor: isLocation ? '#539BA9' : '#FDC323',
              color: isLocation ? '#FFFFFF' : '#000000',
              padding: '4px 10px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '800',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {isLocation ? 'Detail Tempat' : 'Detail Aktivitas'}
          </span>
          {data.category && (
            <span style={{ fontSize: '13px', color: '#64748B', fontWeight: '600' }}>
              • {data.category}
            </span>
          )}
        </div>

        {/* Elderly-friendly large Close Button */}
        <button
          onClick={onClose}
          title="Tutup Panel"
          style={{
            background: isMobile ? '#F1F5F9' : 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: isMobile ? '6px 14px' : '6px',
            borderRadius: isMobile ? '20px' : '50%',
            color: '#0F172A',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: isMobile ? '13.5px' : '13px',
            fontWeight: '700',
            minHeight: isMobile ? '38px' : undefined,
            transition: 'background-color 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#E2E8F0')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = isMobile ? '#F1F5F9' : 'transparent')}
        >
          <X size={isMobile ? 18 : 20} strokeWidth={2.5} />
          {isMobile && <span>Tutup</span>}
        </button>
      </div>

      {/* 2. Scrollable Body Content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        {/* Title & Address (Frame 16) */}
        <div>
          <h2
            style={{
              fontSize: '22px',
              fontWeight: '700',
              color: '#000000',
              lineHeight: '28px',
              marginBottom: '6px',
            }}
          >
            {title}
          </h2>
          <p
            style={{
              fontSize: '13.5px',
              color: '#767676',
              lineHeight: '18px',
              fontWeight: '400',
            }}
          >
            {address}
          </p>
        </div>

        {/* Photo Gallery & Preview (Clickable to open high-res pop-up) */}
        {(() => {
          const rawMedias: string[] = data.mediaUrls && data.mediaUrls.length > 0
            ? data.mediaUrls
            : (data.coverImageUrl ? [data.coverImageUrl] : []);
          
          if (rawMedias.length === 0) return null;

          // Urutkan agar foto kamera survei selalu di awal
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
                title="Klik untuk melihat foto lebih spesifik (Pop-up Modal)"
                style={{
                  position: 'relative',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  height: '220px',
                  width: '100%',
                  backgroundColor: '#0F172A',
                  boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
                  cursor: 'pointer',
                }}
              >
                <img
                  src={currentPhoto}
                  alt={title}
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transition: 'transform 0.3s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                />

                {/* Badge tipe media */}
                <div
                  style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    padding: '5px 12px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: '700',
                    backgroundColor: 'rgba(0, 0, 0, 0.75)',
                    color: '#ffffff',
                    backdropFilter: 'blur(6px)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  }}
                >
                  {isCurrentMap ? (
                    <>
                      <MapPin size={13} color="#FDC323" />
                      <span>Cuplikan Peta MAPID</span>
                    </>
                  ) : (
                    <>
                      <Camera size={13} color="#34D399" />
                      <span>Foto Survei Lapangan</span>
                    </>
                  )}
                </div>

                {/* Hover affordance: Klik untuk memperbesar */}
                <div
                  style={{
                    position: 'absolute',
                    bottom: '10px',
                    left: '10px',
                    padding: '5px 12px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: '700',
                    backgroundColor: 'rgba(0, 0, 0, 0.75)',
                    color: '#ffffff',
                    backdropFilter: 'blur(6px)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  }}
                >
                  <ZoomIn size={14} color="#FDC323" />
                  <span>Klik untuk melihat foto lebih spesifik</span>
                </div>
              </div>

              {/* Thumbnails Row (Jika ada lebih dari 1 media) */}
              {mediaList.length > 1 && (
                <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                  {mediaList.map((url, idx) => {
                    const isMap = url.includes('_map_') || url.toLowerCase().endsWith('.png');
                    const isSelected = idx === selectedPhotoIndex;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedPhotoIndex(idx)}
                        onDoubleClick={() => {
                          setLightboxImages(mediaList);
                          setLightboxIndex(idx);
                          setIsLightboxOpen(true);
                        }}
                        title="Klik untuk memilih, klik 2x untuk perbesar"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 8px',
                          borderRadius: '8px',
                          border: isSelected ? '2px solid #FDC323' : '1px solid #E2E8F0',
                          backgroundColor: isSelected ? '#FFFBEB' : '#FFFFFF',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                          flexShrink: 0,
                        }}
                      >
                        <img
                          src={url}
                          alt={`Thumbnail ${idx + 1}`}
                          style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover' }}
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

        {/* Rating & 5 Status Indicators (Frame 40 & Frame 24) */}
        <div
          style={{
            backgroundColor: '#F8FAFC',
            borderRadius: '12px',
            padding: '16px',
            border: '1px solid #EFEFEF',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          {/* Rating Summary Row */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '13px', fontWeight: '700', color: '#000000' }}>
                {isLocation ? 'Skor Resmi (Survei Lapangan)' : 'Penilaian Aksesibilitas'}
              </span>
              {isLocation && data.communityScore !== null && data.communityScore !== undefined && (
                <span style={{ fontSize: '11px', color: '#539BA9', fontWeight: '700', backgroundColor: '#EBF5F7', padding: '2px 8px', borderRadius: '12px' }}>
                  Komunitas: {Number(data.communityScore).toFixed(1)}★ ({data.communityReportCount || 0} lap.)
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '24px', fontWeight: '800', color: '#000000' }}>
                {overallScore.toFixed(1)}
              </span>
              
              {/* 5 Stars */}
              <div style={{ display: 'flex', gap: '3px' }}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star
                    key={star}
                    size={20}
                    fill={star <= starCount ? '#FDC323' : 'none'}
                    color={star <= starCount ? '#FDC323' : '#CBD5E1'}
                    strokeWidth={star <= starCount ? 0 : 2}
                  />
                ))}
              </div>

              <span style={{ fontSize: '14px', color: '#767676', fontWeight: '500' }}>
                ({totalReviews} ulasan)
              </span>
            </div>
          </div>

          {/* 5 Indicator Icons Row (Ramp, Shelter, Lampu, Guiding Block, Tangga) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: '10px',
              borderTop: '1px solid #E2E8F0',
            }}
          >
            {/* 1. Ramp / Kelandaian */}
            <div
              title={`Ramp: ${data.rampStatus || 'Tersedia'}`}
              style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Accessibility size={18} color="#000000" />
              <div
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  backgroundColor: getStatusColor(data.rampStatus),
                }}
              />
            </div>

            {/* 2. Shelter / Kanopi */}
            <div
              title={`Kanopi/Atap: ${data.sidewalkCondition || 'Kondisi Baik'}`}
              style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <ShieldAlert size={18} color="#000000" />
              <div
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  backgroundColor: getStatusColor(data.seatingAvailability === 'AVAILABLE' ? 'GOOD' : 'DAMAGED'),
                }}
              />
            </div>

            {/* 3. Lampu Penerangan */}
            <div
              title={`Penerangan: ${data.lightingLevel || 'Terang'}`}
              style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Sun size={18} color="#000000" />
              <div
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  backgroundColor: getStatusColor(data.lightingLevel || 'BRIGHT'),
                }}
              />
            </div>

            {/* 4. Guiding Block / Tunanetra */}
            <div
              title={`Ubin Taktil Pemandu: ${data.guidingBlockStatus || 'Ada'}`}
              style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Eye size={18} color="#000000" />
              <div
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  backgroundColor: getStatusColor(data.guidingBlockStatus || 'DAMAGED'),
                }}
              />
            </div>

            {/* 5. Akses Tangga / Lift */}
            <div
              title={`Akses Tingkat: ${data.surfaceCondition || 'Rata'}`}
              style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Layers size={18} color="#000000" />
              <div
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  backgroundColor: getStatusColor(data.surfaceCondition === 'SMOOTH' ? 'GOOD' : 'WARNING'),
                }}
              />
            </div>
          </div>
        </div>

        {/* Status Aksesibilitas Fasilitas Lengkap (Ramah Lansia & Awam Teknologi) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '13px', fontWeight: '800', color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Fasilitas Aksesibilitas
            </h3>
            <span style={{ fontSize: '11px', color: '#64748B', fontWeight: '600' }}>
              Panduan Ramah Lansia & Difabel
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
              gap: '8px',
            }}
          >
            {/* Card 1: Ramp Kursi Roda */}
            {(() => {
              const info = getFacilityInfo('ramp', data.rampStatus);
              return (
                <div
                  style={{
                    backgroundColor: info.bg,
                    border: `1.5px solid ${info.border}`,
                    borderRadius: '12px',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Accessibility size={20} color={info.color} strokeWidth={2.4} />
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>
                      {info.label}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: '800',
                      color: info.color,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {info.status}
                  </span>
                </div>
              );
            })()}

            {/* Card 2: Guiding Block */}
            {(() => {
              const info = getFacilityInfo('guiding', data.guidingBlockStatus);
              return (
                <div
                  style={{
                    backgroundColor: info.bg,
                    border: `1.5px solid ${info.border}`,
                    borderRadius: '12px',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Eye size={20} color={info.color} strokeWidth={2.4} />
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>
                      {info.label}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: '800',
                      color: info.color,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {info.status}
                  </span>
                </div>
              );
            })()}

            {/* Card 3: Lighting */}
            {(() => {
              const info = getFacilityInfo('lighting', data.lightingLevel);
              return (
                <div
                  style={{
                    backgroundColor: info.bg,
                    border: `1.5px solid ${info.border}`,
                    borderRadius: '12px',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sun size={20} color={info.color} strokeWidth={2.4} />
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>
                      {info.label}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: '800',
                      color: info.color,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {info.status}
                  </span>
                </div>
              );
            })()}

            {/* Card 4: Sidewalk */}
            {(() => {
              const info = getFacilityInfo('sidewalk', data.sidewalkCondition || data.surfaceCondition);
              return (
                <div
                  style={{
                    backgroundColor: info.bg,
                    border: `1.5px solid ${info.border}`,
                    borderRadius: '12px',
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Layers size={20} color={info.color} strokeWidth={2.4} />
                    <span style={{ fontSize: '13px', fontWeight: '700', color: '#0F172A' }}>
                      {info.label}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: '800',
                      color: info.color,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {info.status}
                  </span>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Action Button: "Bagikan ulasan..." (Frame 24 / Frame 30) */}
        {!showCommentInput ? (
          <button
            onClick={() => setShowCommentInput(true)}
            style={{
              width: '100%',
              height: '52px',
              borderRadius: '50px',
              border: '1.5px solid #767676',
              backgroundColor: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 20px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#000000')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#767676')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Plus size={20} color="#000000" />
              <span style={{ fontSize: '15px', color: '#767676', fontWeight: '600' }}>
                Bagikan ulasan...
              </span>
            </div>
            <Send size={18} color="#000000" />
          </button>
        ) : (
          /* Inline Comment Input Box */
          <form
            onSubmit={handlePostComment}
            style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #CBD5E1',
              borderRadius: '12px',
              padding: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
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
              }}
            />

            <textarea
              rows={3}
              placeholder="Tuliskan pengalaman atau kendala aksesibilitas di lokasi ini..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #E2E8F0',
                fontSize: '14px',
                outline: 'none',
                fontFamily: 'inherit',
                resize: 'none',
                backgroundColor: '#FFFFFF',
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
                  fontSize: '13px',
                }}
              >
                Batal
              </button>

              <button
                type="submit"
                disabled={isSubmittingComment || !commentText.trim()}
                className="btn-yellow-pill"
                style={{
                  height: '36px',
                  padding: '0 16px',
                  fontSize: '13px',
                }}
              >
                {isSubmittingComment ? 'Mengirim...' : 'Kirim Ulasan'}
              </button>
            </div>
          </form>
        )}

        {/* AI Insight Summary (If available) */}
        {data.aiSummary && (
          <div
            style={{
              backgroundColor: 'rgba(83, 155, 169, 0.08)',
              border: '1px solid rgba(83, 155, 169, 0.25)',
              borderRadius: '10px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#539BA9', fontWeight: '700', fontSize: '13px' }}>
              <Sparkles size={16} />
              <span>AI Spatial Synthesis & Rekomendasi</span>
            </div>
            <p style={{ fontSize: '13px', color: '#334155', lineHeight: '18px' }}>
              {data.aiSummary}
            </p>
          </div>
        )}

        {/* Community Reviews Feed List (Frame 20 / Frame 25) */}
        <div>
          <h3
            style={{
              fontSize: '16px',
              fontWeight: '700',
              color: '#000000',
              marginBottom: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <MessageSquare size={18} color="#539BA9" />
            <span>Feed Ulasan Komunitas ({comments.length})</span>
          </h3>

          {isLoadingComments ? (
            /* Skeleton Loading */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="skeleton" style={{ height: '120px', width: '100%' }} />
              <div className="skeleton" style={{ height: '120px', width: '100%' }} />
            </div>
          ) : comments.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  style={{
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #EFEFEF',
                    borderRadius: '10px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  {/* Author Header (Frame 21) */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        backgroundColor: '#767676',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#FFFFFF',
                        fontWeight: '700',
                        fontSize: '15px',
                        overflow: 'hidden',
                      }}
                    >
                      {comment.user?.avatarUrl ? (
                        <img src={comment.user.avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%' }} />
                      ) : (
                        (comment.user?.name || 'R')[0].toUpperCase()
                      )}
                    </div>

                    <div>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: '#000000' }}>
                        {comment.user?.name || 'Randy Muflih'}
                      </div>
                      <div style={{ fontSize: '12px', color: '#767676' }}>
                        {new Date(comment.createdAt).toLocaleDateString('id-ID', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Comment Content */}
                  <p
                    style={{
                      fontSize: '13.5px',
                      color: '#000000',
                      lineHeight: '19px',
                      textAlign: 'justify',
                    }}
                  >
                    {comment.content}
                  </p>

                  {/* Comment Photo if attached */}
                  {comment.photoUrls && comment.photoUrls.length > 0 && (
                    <div
                      onClick={() => {
                        setLightboxImages(comment.photoUrls);
                        setLightboxIndex(0);
                        setIsLightboxOpen(true);
                      }}
                      title="Klik untuk melihat foto lebih spesifik (Pop-up Modal)"
                      style={{
                        borderRadius: '8px',
                        overflow: 'hidden',
                        maxHeight: '160px',
                        cursor: 'pointer',
                        position: 'relative',
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
                padding: '30px 16px',
                color: '#767676',
                fontSize: '13.5px',
                backgroundColor: '#F8FAFC',
                borderRadius: '10px',
                border: '1px dashed #CBD5E1',
              }}
            >
              Belum ada ulasan untuk titik ini. Jadilah orang pertama yang membagikan ulasan aksesibilitas!
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Pop-up Modal untuk melihat foto survei lapangan lebih spesifik */}
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
