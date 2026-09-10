'use client';

import React from 'react';
import {
  X,
  Zap,
  ShieldCheck,
  Building,
  Activity,
  Layers,
  Sparkles,
  Info,
  MapPin,
  HelpCircle,
  CheckCircle2,
} from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InfoModal({ isOpen, onClose }: InfoModalProps) {
  const isMobile = useIsMobile(768);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(5px)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobile ? '12px' : '20px',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: isMobile ? '20px' : '16px',
          width: '100%',
          maxWidth: '620px',
          maxHeight: isMobile ? '94vh' : '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: isMobile ? '14px 18px' : '20px 24px',
            borderBottom: '1px solid #EFEFEF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: '#FFFFFF',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                backgroundColor: '#539BA9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FDC323',
                flexShrink: 0,
              }}
            >
              <Info size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: isMobile ? '16px' : '18px', fontWeight: '800', color: '#0F172A', margin: 0 }}>
                Panduan & Bantuan DifaMap
              </h2>
              <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '500' }}>
                Peta Aksesibilitas Ramah Difabel & Lansia
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Tutup Panduan"
            style={{
              background: isMobile ? '#F1F5F9' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#0F172A',
            }}
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        {/* Content */}
        <div
          style={{
            padding: isMobile ? '16px' : '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px',
            fontSize: '14px',
            lineHeight: '22px',
            color: '#334155',
          }}
        >
          {/* Panduan Cepat Ramah Pengguna Awam & Lansia */}
          <div
            style={{
              backgroundColor: '#FEF9C3',
              borderRadius: '14px',
              padding: '16px',
              border: '1.5px solid #FDE047',
            }}
          >
            <h3
              style={{
                fontSize: '15px',
                fontWeight: '800',
                color: '#854D0E',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <HelpCircle size={18} color="#854D0E" />
              <span>Cara Mudah Menggunakan DifaMap</span>
            </h3>
            <ul style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li>
                <strong>Melihat Lokasi:</strong> Ketuk tombol <em>&ldquo;Tempat&rdquo;</em> di atas untuk melihat halte, rumah sakit, atau mall yang sudah disurvei.
              </li>
              <li>
                <strong>Melihat Kondisi Lapangan:</strong> Ketuk tombol <em>&ldquo;Aktivitas&rdquo;</em> untuk melihat foto langsung laporan trotoar dan jalan dari warga.
              </li>
              <li>
                <strong>Cari Tujuan:</strong> Ketik nama tempat pada kolom pencarian di bagian atas layar.
              </li>
              <li>
                <strong>Tanya Asisten AI:</strong> Ketuk tombol <em>&ldquo;Tanya AI&rdquo;</em> untuk rekomendasi rute landai dan bebas hambatan.
              </li>
            </ul>
          </div>

          {/* Visi & Inovasi DifaMap */}
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', marginBottom: '6px' }}>
              Tentang DifaMap WebGIS
            </h3>
            <p>
              <strong>DifaMap</strong> adalah platform WebGIS ramah inklusivitas yang memetakan aksesibilitas fasilitas pejalan kaki (ramp kursi roda, ubin pemandu tunanetra, penerangan, dan trotoar) di sekitar koridor transportasi massal <strong>Kota Makassar & Kabupaten Gowa</strong>.
            </p>
          </div>

          {/* Arti Warna Status */}
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', marginBottom: '10px' }}>
              Arti Warna Kondisi Fasilitas
            </h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                gap: '8px',
                fontSize: '13px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: '#DCFCE7', borderRadius: '8px', border: '1px solid #BBF7D0' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#166534', flexShrink: 0 }} />
                <span style={{ color: '#166534', fontWeight: '700' }}>Hijau: Aman & Tersedia Landai</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: '#FEE2E2', borderRadius: '8px', border: '1px solid #FECACA' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#991B1B', flexShrink: 0 }} />
                <span style={{ color: '#991B1B', fontWeight: '700' }}>Merah: Rusak / Tidak Ada Ramp</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: '#FEF3C7', borderRadius: '8px', border: '1px solid #FDE68A' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#B45309', flexShrink: 0 }} />
                <span style={{ color: '#B45309', fontWeight: '700' }}>Kuning: Perlu Hati-hati / Curam</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: '#F1F5F9', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <span style={{ fontSize: '15px' }}>🖼️</span>
                <span style={{ color: '#334155', fontWeight: '700' }}>Foto: Survei Bukti Lapangan</span>
              </div>
            </div>
          </div>

          {/* Tombol Tutup Besar */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '12px', borderTop: '1px solid #EFEFEF' }}>
            <button
              onClick={onClose}
              className="btn-yellow-pill"
              style={{
                height: '46px',
                padding: '0 28px',
                fontSize: '14px',
                fontWeight: '800',
                width: isMobile ? '100%' : 'auto',
                justifyContent: 'center',
              }}
            >
              Saya Mengerti (Tutup)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
