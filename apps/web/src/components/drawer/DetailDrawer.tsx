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
  Accessibility
} from 'lucide-react';
import { difaMapApi } from '../../lib/api';

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
  const [comments, setComments] = useState<any[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [authorName, setAuthorName] = useState('');

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

  // Status Colors for 5 Main Accessibility Features
  const getStatusColor = (status?: string) => {
    if (!status) return '#5FD300';
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
      className="animate-slide-in"
      style={{
        position: 'fixed',
        left: '104px',
        top: '24px',
        bottom: '24px',
        width: '464px',
        maxWidth: 'calc(100vw - 128px)',
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        boxShadow: '0px 8px 30px rgba(0, 0, 0, 0.15)',
        border: '1px solid rgba(0, 0, 0, 0.08)',
        zIndex: 35,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* 1. Header Toolbar with Close Button */}
      <div
        style={{
          padding: '16px 20px',
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
              fontWeight: '700',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {isLocation ? 'Detail Tempat' : 'Detail Aktivitas'}
          </span>
          {data.category && (
            <span style={{ fontSize: '13px', color: '#767676', fontWeight: '500' }}>
              • {data.category}
            </span>
          )}
        </div>

        <button
          onClick={onClose}
          title="Tutup Panel"
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '6px',
            borderRadius: '50%',
            color: '#000000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 0.15s ease',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#F1F5F9')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <X size={20} />
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
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#767676', marginBottom: '6px' }}>
              Ulasan Aksesibilitas:
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
                ({totalReviews})
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

        {/* Main Photo Preview (If Activity or Location has photo) */}
        {(data.mediaUrls?.[0] || data.coverImageUrl) && (
          <div style={{ borderRadius: '10px', overflow: 'hidden', maxHeight: '220px', width: '100%' }}>
            <img
              src={data.mediaUrls?.[0] || data.coverImageUrl}
              alt={title}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </div>
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
                    <div style={{ borderRadius: '8px', overflow: 'hidden', maxHeight: '160px' }}>
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
    </aside>
  );
}
