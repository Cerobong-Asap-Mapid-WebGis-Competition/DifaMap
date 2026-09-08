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
  MapPin
} from 'lucide-react';

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InfoModal({ isOpen, onClose }: InfoModalProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '600px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid #EFEFEF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: '#539BA9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#FDC323',
              }}
            >
              <Info size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '800', color: '#000000' }}>
                Tentang DifaMap WebGIS
              </h2>
              <span style={{ fontSize: '12px', color: '#767676' }}>
                MAPID WebGIS Competition 2026
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', fontSize: '14px', lineHeight: '22px', color: '#334155' }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#000000', marginBottom: '6px' }}>
              Visi & Inovasi DifaMap
            </h3>
            <p>
              <strong>DifaMap</strong> adalah platform WebGIS interaktif berbasis AI yang memetakan aksesibilitas infrastruktur bagi penyandang disabilitas (tunanetra, tunadaksa/pengguna kursi roda, lansia) di sekitar koridor transportasi massal di <strong>Kota Makassar & Kabupaten Gowa (7 Zona Kecamatan)</strong>.
            </p>
          </div>

          <div style={{ backgroundColor: '#F8FAFC', borderRadius: '12px', padding: '16px', border: '1px solid #E2E8F0' }}>
            <h4 style={{ fontSize: '14px', fontWeight: '700', color: '#000000', marginBottom: '8px' }}>
              📐 Formula Indeks Prioritas Spasial
            </h4>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: '#539BA9', fontWeight: '700', marginBottom: '6px' }}>
              Indeks Prioritas = 0.6 × Skor Kerusakan + 0.4 × Kepadatan Ekonomi (Buffer 500m)
            </div>
            <p style={{ fontSize: '12.5px', color: '#64748B' }}>
              Menggabungkan data partisipatif warga dengan dataset MAPID (Menu Go & Properti Go) untuk membantu perencana kota menentukan titik intervensi paling krusial.
            </p>
          </div>

          <div>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#000000', marginBottom: '10px' }}>
              Simbol & Indikator Aksesibilitas
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#5FD300' }} />
                <span><strong>Hijau:</strong> Kondisi Baik & Ramah</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#EF0004' }} />
                <span><strong>Merah:</strong> Rusak / Terputus / Bahaya</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#FFBB00' }} />
                <span><strong>Kuning:</strong> Perlu Perhatian / Moderat</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🖼️ <strong>Polaroid:</strong> Foto Laporan Komunitas</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '10px', borderTop: '1px solid #EFEFEF' }}>
            <button
              onClick={onClose}
              className="btn-yellow-pill"
              style={{ height: '40px', padding: '0 20px', fontSize: '13px' }}
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
