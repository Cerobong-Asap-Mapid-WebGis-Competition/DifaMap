'use client';

import React, { useState } from 'react';
import {
  MapPin,
  Cpu,
  Layers,
  ShieldCheck,
  Zap,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Navigation,
  Database,
  ArrowRight
} from 'lucide-react';

export default function HomePage() {
  const [description, setDescription] = useState('Guiding block di depan Halte Karebosi terputus akibat galian kabel, ramp masuk terlalu curam tanpa pegangan tangan.');
  const [userScore, setUserScore] = useState(2);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);

  const runAiSimulation = () => {
    setIsSimulating(true);
    setTimeout(() => {
      setIsSimulating(false);
      setSimulationResult({
        facilityType: 'GUIDING_BLOCK',
        damageSeverity: 'SEVERE',
        accessibilityScore: 1.8,
        tags: ['guiding-block-terputus', 'ramp-curam', 'tanpa-handrail', 'bahaya-tunanetra'],
        barrierType: 'Physical Disruption & Steep Slope',
        actionRecommendation: 'Prioritas Tinggi: Perbaikan ubin taktil pemandu rute halte Karebosi dan modifikasi kelandaian ramp < 8%.',
        priorityIndex: 82.4, // (0.6 * ((5 - 1.8)/4 * 100)) + (0.4 * 86.0)
        economicCatchment: {
          radius: '500m',
          menuGoCount: 38,
          propertiGoCount: 14,
          score: 86.0
        }
      });
    }, 700);
  };

  return (
    <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 24px' }}>
      {/* Header */}
      <header style={{ marginBottom: '48px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
            <span className="badge badge-blue">
              <Zap size={13} /> MAPID WebGIS Competition 2026
            </span>
            <span className="badge badge-emerald">
              <ShieldCheck size={13} /> Monorepo Active
            </span>
          </div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: '800', letterSpacing: '-0.03em', lineHeight: 1.2 }}>
            <span className="gradient-text">DifaMap</span> Architecture
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', marginTop: '6px' }}>
            Peta Cerdas Aksesibilitas Disabilitas di Sekitar Rute Transportasi Massal (Makassar & Gowa — 7 Zona Kecamatan)
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <div className="glass-panel" style={{ padding: '12px 18px', textAlign: 'right' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Formula Prioritas
            </div>
            <div style={{ fontSize: '1rem', fontWeight: '700', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
              0.6 × Kerusakan + 0.4 × Ekonomi
            </div>
          </div>
        </div>
      </header>

      {/* Tech Stack Bento Grid */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px', marginBottom: '40px' }}>
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <Layers style={{ color: '#38bdf8' }} size={22} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>Frontend WebGIS</h3>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px' }}>
            Next.js App Router terisolasi di <code className="code-block" style={{ padding: '2px 6px' }}>apps/web</code>.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <span className="badge badge-blue">Next.js 15</span>
            <span className="badge badge-blue">MapLibre / MAPID</span>
            <span className="badge badge-blue">TypeScript</span>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <Database style={{ color: '#34d399' }} size={22} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>PostGIS & Supabase</h3>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px' }}>
            Database PostgreSQL + PostGIS dengan auto-trigger & ST_DWithin RPC.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <span className="badge badge-emerald">PostGIS 4326</span>
            <span className="badge badge-emerald">Prisma ORM</span>
            <span className="badge badge-emerald">DB Triggers</span>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <Cpu style={{ color: '#f59e0b' }} size={22} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>AI Orchestrator</h3>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px' }}>
            Ekstraksi teks laporan menjadi JSON terstruktur & skor kerusakan otomatis.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <span className="badge badge-amber">OpenAI API</span>
            <span className="badge badge-amber">Structured JSON</span>
            <span className="badge badge-amber">Auto-Scoring</span>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <ShieldCheck style={{ color: '#ec4899' }} size={22} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600' }}>MAPID API Proxy</h3>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '16px' }}>
            Express proxy wrapper menyembunyikan MAPID_API_KEY dari client frontend.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            <span className="badge badge-blue">Secure Gateway</span>
            <span className="badge badge-blue">Cache Control</span>
            <span className="badge badge-blue">Layer Proxy</span>
          </div>
        </div>
      </section>

      {/* Interactive AI Orchestrator & Priority Scoring Simulator */}
      <section className="glass-panel" style={{ padding: '32px', marginBottom: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: '700' }}>Live AI Orchestrator & Scoring Preview</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Uji alur pemrosesan laporan komunitas menjadi indeks prioritas perbaikan infrastruktur.
            </p>
          </div>
          <button
            onClick={runAiSimulation}
            disabled={isSimulating}
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '10px 20px',
              fontWeight: '600',
              fontSize: '0.95rem',
              cursor: isSimulating ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: isSimulating ? 0.7 : 1,
              transition: 'all 0.2s ease',
            }}
          >
            {isSimulating ? <Zap size={16} className="animate-spin" /> : <Cpu size={16} />}
            {isSimulating ? 'Menganalisis AI...' : 'Uji Ekstraksi AI & Scoring'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: '500' }}>
              Deskripsi Laporan Komunitas:
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{
                width: '100%',
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                padding: '12px',
                color: '#fff',
                fontFamily: 'inherit',
                fontSize: '0.9rem',
                resize: 'vertical',
                marginBottom: '16px',
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Skor Pengguna Awal:</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[1, 2, 3, 4, 5].map((score) => (
                  <button
                    key={score}
                    onClick={() => setUserScore(score)}
                    style={{
                      background: userScore === score ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                      color: '#fff',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: userScore === score ? '700' : '400',
                    }}
                  >
                    {score} ⭐
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border-color)' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: '600', marginBottom: '12px', color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={16} /> Output Ekstraksi AI & Spatial Index
            </h4>

            {simulationResult ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.88rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Tipe Fasilitas:</span>
                  <span style={{ fontWeight: '600', color: '#fcd34d' }}>{simulationResult.facilityType}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Tingkat Kerusakan:</span>
                  <span style={{ fontWeight: '600', color: '#f87171' }}>{simulationResult.damageSeverity}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Skor AI Aksesibilitas:</span>
                  <span style={{ fontWeight: '600', color: '#38bdf8' }}>{simulationResult.accessibilityScore} / 5.0</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Kepadatan Ekonomi (500m Buffer):</span>
                  <span style={{ fontWeight: '600', color: '#34d399' }}>{simulationResult.economicCatchment.score} (Menu/Properti Go)</span>
                </div>
                <div style={{ marginTop: '6px', padding: '8px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '6px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#fca5a5', textTransform: 'uppercase' }}>Accessibility Priority Index</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#f87171' }}>{simulationResult.priorityIndex} / 100</div>
                </div>
              </div>
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '30px 0' }}>
                Klik tombol <strong>"Uji Ekstraksi AI & Scoring"</strong> untuk melihat demo respons terstruktur & indeks prioritas spasial.
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Directory & Quick Start Info */}
      <section className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '16px' }}>Monorepo Quick Start Commands</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '4px' }}>1. Jalankan Semua Aplikasi Sekaligus:</div>
            <div className="code-block">npm run dev</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '4px' }}>2. Generate Prisma Client:</div>
            <div className="code-block">npm run db:generate</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '4px' }}>3. Sync Skema ke Supabase:</div>
            <div className="code-block">npm run db:push</div>
          </div>
        </div>
      </section>
    </main>
  );
}
