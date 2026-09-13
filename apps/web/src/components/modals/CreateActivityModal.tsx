'use client';

import React, { useState } from 'react';
import {
  X,
  Camera,
  MapPin,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Layers,
  Accessibility
} from 'lucide-react';
import { difaMapApi, CreateActivityPayload } from '../../lib/api';
import { useIsMobile } from '../../hooks/useIsMobile';

interface CreateActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  pickedCoordinate: { latitude: number; longitude: number } | null;
  onStartPickCoordinate: () => void;
  onSuccessCreated: (newActivity: any) => void;
}

export default function CreateActivityModal({
  isOpen,
  onClose,
  pickedCoordinate,
  onStartPickCoordinate,
  onSuccessCreated,
}: CreateActivityModalProps) {
  const isMobile = useIsMobile(768);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [specificLocation, setSpecificLocation] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [pratinjau, setPratinjau] = useState<string | null>(null);
  const [sedangUnggah, setSedangUnggah] = useState(false);
  const [galatFoto, setGalatFoto] = useState<string | null>(null);
  const [authorName, setAuthorName] = useState('');
  
  // Physical Observed Hints
  const [rampStatus, setRampStatus] = useState<'GOOD' | 'DAMAGED' | 'NONE' | 'NOT_VISIBLE'>('NOT_VISIBLE');
  const [guidingBlockStatus, setGuidingBlockStatus] = useState<'GOOD' | 'DAMAGED' | 'NONE' | 'NOT_VISIBLE'>('NOT_VISIBLE');
  const [lightingLevel, setLightingLevel] = useState<'BRIGHT' | 'DIM' | 'DARK' | 'NOT_VISIBLE'>('NOT_VISIBLE');
  const [sidewalkCondition, setSidewalkCondition] = useState<'GOOD' | 'NARROW' | 'DAMAGED' | 'BLOCKED' | 'NOT_VISIBLE'>('NOT_VISIBLE');

  /**
   * Waktu pelapor berada di lokasi, dan seberapa ramai saat itu.
   *
   * Keduanya tidak bisa disimpulkan AI dari foto: sebuah jepretan tidak memberi
   * tahu hari apa, dan keramaian sesaat bukan pola. Hanya orang yang berdiri di
   * sana yang tahu - dan menjawabnya butuh lima detik.
   *
   * Inilah yang mengisi grafik pola keramaian mingguan, yang sampai sekarang
   * kosong karena tidak ada satu pun laporan berwaktu.
   */
  const [waktuKunjungan, setWaktuKunjungan] = useState(() => {
    const n = new Date();
    const pad = (x: number) => String(x).padStart(2, '0');
    return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}T${pad(n.getHours())}:${pad(n.getMinutes())}`;
  });
  const [tingkatKeramaian, setTingkatKeramaian] = useState<'QUIET' | 'MODERATE' | 'CROWDED' | 'NOT_VISIBLE'>('NOT_VISIBLE');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Handle ESC key to close CreateActivityModal
  React.useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  /**
   * Memilih foto dari perangkat, lalu mengunggahnya saat itu juga.
   *
   * Diunggah seketika, bukan saat laporan dikirim: pelapor jadi tahu fotonya
   * berhasil masuk sebelum menekan kirim, dan bila gagal ia masih di halaman
   * yang sama dengan seluruh isian utuh. Mengunggah bersamaan dengan pengiriman
   * berarti satu kegagalan jaringan menjatuhkan keduanya sekaligus.
   */
  const pilihFoto = async (berkas: File | null) => {
    if (!berkas) return;

    setGalatFoto(null);
    setSedangUnggah(true);

    try {
      const url = await difaMapApi.uploadFotoLaporan(berkas);
      setImageUrl(url);
      setPratinjau(URL.createObjectURL(berkas));
    } catch (err: any) {
      setGalatFoto(err.message || 'Foto gagal diunggah.');
      setImageUrl('');
      setPratinjau(null);
    } finally {
      setSedangUnggah(false);
    }
  };

  /** Mengembalikan seluruh isian ke keadaan awal. */
  const kosongkanIsian = () => {
    setTitle('');
    setDescription('');
    setSpecificLocation('');
    setImageUrl('');
    setAuthorName('');
    setGalatFoto(null);
    setErrorMsg(null);

    // Alamat objek dilepas supaya berkas yang sudah tidak dipakai tidak terus
    // tertahan di memori peramban.
    setPratinjau((lama) => {
      if (lama) URL.revokeObjectURL(lama);
      return null;
    });

    setRampStatus('NOT_VISIBLE');
    setGuidingBlockStatus('NOT_VISIBLE');
    setLightingLevel('NOT_VISIBLE');
    setSidewalkCondition('NOT_VISIBLE');
    setTingkatKeramaian('NOT_VISIBLE');

    const n = new Date();
    const pad = (x: number) => String(x).padStart(2, '0');
    setWaktuKunjungan(
      `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}T${pad(n.getHours())}:${pad(n.getMinutes())}`
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      setErrorMsg('Nama laporan dan deskripsi wajib diisi.');
      return;
    }

    const lat = pickedCoordinate ? pickedCoordinate.latitude : -5.1700;
    const lng = pickedCoordinate ? pickedCoordinate.longitude : 119.4500;

    try {
      setIsSubmitting(true);
      setErrorMsg(null);

      const payload: CreateActivityPayload = {
        title: title.trim(),
        description: description.trim(),
        specificLocation: specificLocation.trim() || undefined,
        latitude: lat,
        longitude: lng,
        /**
         * Tanpa foto berarti tanpa foto - bukan foto Losari.
         *
         * Sebelumnya kolom kosong diisi '/photos/losari.jpg', dan itu membuat
         * SELURUH laporan tanpa foto ditolak server: skemanya menuntut URL
         * lengkap, dan jalur itulah yang paling sering ditempuh karena
         * kolomnya sendiri menulis "atau kosongkan untuk foto default".
         *
         * Memakai URL Losari yang absolut juga bukan jawabannya: AI membaca
         * foto yang dilampirkan untuk menilai, dan melampirkan foto tempat
         * lain membuatnya menilai lokasi yang salah dengan penuh keyakinan.
         */
        mediaUrls: imageUrl.trim() ? [imageUrl.trim()] : [],
        userObservedHints: {
          rampStatus,
          guidingBlockStatus,
          lightingLevel,
          sidewalkCondition,
          crowdLevel: tingkatKeramaian,
          // Diubah ke ISO lengkap dengan zona waktu. Input datetime-local
          // memberi waktu lokal tanpa zona, dan tanpa pengubahan ini server
          // menolaknya - grafik mingguan lalu tetap kosong tanpa pesan apa pun.
          ...(waktuKunjungan ? { visitedAt: new Date(waktuKunjungan).toISOString() } : {}),
        },
      };

      const res = await difaMapApi.createActivity(payload);

      /**
       * Isian dikosongkan SETELAH berhasil, bukan saat modal ditutup.
       *
       * Komponennya tetap terpasang ketika ditutup - `isOpen` hanya membuatnya
       * mengembalikan null - jadi seluruh isian bertahan sampai halaman dimuat
       * ulang, dan laporan berikutnya dibuka dengan isi laporan sebelumnya.
       *
       * Melepas komponennya saat ditutup memang menyelesaikan itu, tetapi
       * menimbulkan yang lebih buruk: tombol "Pilih di Peta" ikut menutup modal,
       * sehingga judul dan deskripsi yang sudah diketik akan lenyap setiap kali
       * pelapor memilih titiknya di peta.
       */
      kosongkanIsian();
      onSuccessCreated(res.data);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mengirim laporan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
        /**
         * Di atas bilah atas, bukan di bawahnya.
         *
         * Bilah pencarian berlapis 70 sementara modal ini 60, sehingga tombol
         * Tempat, Halte, Difa AI, dan Lapor menembus ke depan dan menindih
         * judul modalnya - paling parah di layar sempit, tempat keduanya
         * berebut ruang yang sama. Modal adalah tugas yang menuntut perhatian
         * penuh: selama ia terbuka, tidak ada yang boleh tampil di atasnya,
         * termasuk daftar saran pencarian yang berlapis 100.
         */
        zIndex: 110,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: isMobile ? '12px' : '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: isMobile ? '20px' : '16px',
          width: '100%',
          maxWidth: '560px',
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
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                backgroundColor: '#FDC323',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '700',
              }}
            >
              <Camera size={18} color="#000000" />
            </div>
            <div>
              <h2 style={{ fontSize: isMobile ? '16px' : '18px', fontWeight: '800', color: '#000000' }}>
                Bagikan Laporan Aksesibilitas
              </h2>
              <p style={{ fontSize: '12px', color: '#64748B' }}>
                AI Orchestrator menganalisis kelayakan & perbaikan
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: isMobile ? '#F1F5F9' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: '8px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: isMobile ? '16px' : '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {errorMsg && (
            <div
              style={{
                backgroundColor: '#FEF2F2',
                border: '1px solid #F87171',
                borderRadius: '8px',
                padding: '10px 14px',
                fontSize: '13px',
                color: '#B91C1C',
              }}
            >
              {errorMsg}
            </div>
          )}

          {/* Title / Name */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#000000', marginBottom: '6px' }}>
              Nama Titik / Judul Laporan *
            </label>
            <input
              type="text"
              required
              placeholder="Contoh: Guiding block terputus di Halte Karebosi"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>

          {/* Specific Location / Address */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#000000', marginBottom: '6px' }}>
              Alamat Lengkap / Patokan
            </label>
            <input
              type="text"
              placeholder="Contoh: Jl. Letjen Hertasning No.51, Panakkukang, Makassar"
              value={specificLocation}
              onChange={(e) => setSpecificLocation(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#000000', marginBottom: '6px' }}>
              Deskripsi Kondisi Lapangan *
            </label>
            <textarea
              rows={3}
              required
              placeholder="Jelaskan kondisi trotoar, ramp, ubin taktil pemandu, penerangan, atau rintangan yang dialami disabilitas..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '14px',
                outline: 'none',
                fontFamily: 'inherit',
                resize: 'none',
              }}
            />
          </div>

          {/* Coordinate Picker Trigger */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              padding: '12px 14px',
            }}
          >
            <div>
              <div style={{ fontSize: '13px', fontWeight: '700', color: '#000000' }}>
                Koordinat Titik Peta
              </div>
              <div style={{ fontSize: '12px', color: '#767676' }}>
                {pickedCoordinate
                  ? `Lat: ${pickedCoordinate.latitude.toFixed(5)}, Lng: ${pickedCoordinate.longitude.toFixed(5)}`
                  : 'Makassar Pusat (Klik tombol untuk memilih titik di peta)'}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                onStartPickCoordinate();
                onClose();
              }}
              style={{
                backgroundColor: '#539BA9',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '20px',
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <MapPin size={14} />
              <span>Pilih di Peta</span>
            </button>
          </div>

          {/* Photo URL */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '700', color: '#000000', marginBottom: '6px' }}>
              Foto Dokumentasi Lapangan
            </label>

            {/* Berkas, bukan tautan.
                Pelapor di lapangan memegang foto di galeri ponselnya - untuk
                mengisi kolom URL ia harus mengunggahnya dulu ke layanan lain,
                menyalin tautannya, lalu kembali. Praktis tidak ada yang
                melakukannya, dan laporan pun selalu datang tanpa foto. */}
            {pratinjau ? (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <img
                  src={pratinjau}
                  alt="Pratinjau foto laporan"
                  style={{
                    width: '104px',
                    height: '78px',
                    objectFit: 'cover',
                    borderRadius: '8px',
                    border: '1px solid #E2E8F0',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#15803D' }}>
                    Foto berhasil diunggah
                  </div>
                  <div style={{ fontSize: '11px', color: '#94A3B8', marginTop: '2px', lineHeight: '15px' }}>
                    Difa AI akan ikut melihat foto ini saat menilai.
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setImageUrl('');
                      setPratinjau(null);
                      setGalatFoto(null);
                    }}
                    style={{
                      marginTop: '6px',
                      border: '1px solid #CBD5E1',
                      background: '#FFFFFF',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      color: '#334155',
                      cursor: 'pointer',
                    }}
                  >
                    Ganti foto
                  </button>
                </div>
              </div>
            ) : (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '18px 14px',
                  borderRadius: '10px',
                  border: '1px dashed #CBD5E1',
                  backgroundColor: sedangUnggah ? '#F8FAFC' : '#FFFFFF',
                  cursor: sedangUnggah ? 'wait' : 'pointer',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#475569',
                }}
              >
                <Camera size={17} />
                <span>{sedangUnggah ? 'Mengunggah foto...' : 'Pilih foto dari perangkat'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={sedangUnggah}
                  onChange={(e) => {
                    pilihFoto(e.target.files?.[0] ?? null);
                    // Dikosongkan supaya memilih berkas yang sama dua kali
                    // tetap memicu perubahan - tanpa ini, mencoba ulang setelah
                    // gagal tidak melakukan apa-apa sama sekali.
                    e.target.value = '';
                  }}
                  style={{ display: 'none' }}
                />
              </label>
            )}

            {galatFoto && (
              <div role="alert" style={{ fontSize: '11.5px', color: '#B91C1C', marginTop: '6px' }}>
                {galatFoto} Laporan tetap bisa dikirim tanpa foto.
              </div>
            )}
            {/* Konsekuensinya disebutkan, bukan sekadar "boleh dikosongkan".
                Difa AI menilai dengan MELIHAT fotonya; tanpa foto ia hanya
                punya deskripsi dan isian parameter, dan penilaiannya wajar
                saja lebih ragu. Pelapor berhak tahu itu sebelum memutuskan. */}
            <div id="catatan-foto" style={{ fontSize: '11px', color: '#64748B', marginTop: '6px', lineHeight: '16px' }}>
              Boleh dikosongkan. JPG, PNG, atau WebP, maksimal 5 MB. Bila diisi, Difa AI
              ikut melihat fotonya untuk menilai kondisi lapangan - tanpa foto, penilaian
              hanya bersandar pada deskripsi dan isian parameter di bawah.
            </div>
          </div>

          {/* Quick Facility Indicators Toggle */}
          <div style={{ backgroundColor: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#000000', marginBottom: '10px' }}>
              Parameter Fasilitas yang Teramati:
            </div>

            {/* Waktu kunjungan & keramaian - dua hal yang hanya diketahui
                orang yang berdiri di sana, dan tidak bisa disimpulkan dari
                foto. Diletakkan paling atas karena paling cepat dijawab. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div>
                <label style={{ fontSize: '12px', color: '#767676', display: 'block', marginBottom: '4px' }}>
                  Kapan Anda di sini?
                </label>
                <input
                  type="datetime-local"
                  value={waktuKunjungan}
                  onChange={(e) => setWaktuKunjungan(e.target.value)}
                  style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px', fontFamily: 'inherit' }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', color: '#767676', display: 'block', marginBottom: '4px' }}>
                  Seberapa ramai saat itu?
                </label>
                <select
                  value={tingkatKeramaian}
                  onChange={(e: any) => setTingkatKeramaian(e.target.value)}
                  style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                >
                  <option value="NOT_VISIBLE">Tidak saya perhatikan</option>
                  <option value="QUIET">Sepi</option>
                  <option value="MODERATE">Sedang</option>
                  <option value="CROWDED">Ramai</option>
                </select>
              </div>
            </div>

            <div style={{ fontSize: '10.5px', color: '#94A3B8', marginBottom: '12px', lineHeight: '15px' }}>
              Dua isian di atas mengisi grafik pola keramaian mingguan. Keramaian tidak bisa
              disimpulkan dari foto, jadi tanpa jawaban Anda bagian itu tetap kosong.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {/* Ramp */}
              <div>
                <label style={{ fontSize: '12px', color: '#767676', display: 'block', marginBottom: '4px' }}>Ramp / Kelandaian:</label>
                <select
                  value={rampStatus}
                  onChange={(e: any) => setRampStatus(e.target.value)}
                  style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                >
                  <option value="NOT_VISIBLE">Belum Teramati / Tidak Terlihat</option>
                  <option value="GOOD">Baik & Ramah Kursi Roda</option>
                  <option value="DAMAGED">Rusak / Curam / Tanpa Pegangan</option>
                  <option value="NONE">Tidak Ada Ramp</option>
                </select>
              </div>

              {/* Guiding Block */}
              <div>
                <label style={{ fontSize: '12px', color: '#767676', display: 'block', marginBottom: '4px' }}>Ubin Taktil Pemandu:</label>
                <select
                  value={guidingBlockStatus}
                  onChange={(e: any) => setGuidingBlockStatus(e.target.value)}
                  style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                >
                  <option value="NOT_VISIBLE">Belum Teramati / Tidak Terlihat</option>
                  <option value="GOOD">Tersambung Baik</option>
                  <option value="DAMAGED">Terputus / Terhalang PKL</option>
                  <option value="NONE">Tidak Tersedia</option>
                </select>
              </div>

              {/* Sidewalk */}
              <div>
                <label style={{ fontSize: '12px', color: '#767676', display: 'block', marginBottom: '4px' }}>Kondisi Trotoar:</label>
                <select
                  value={sidewalkCondition}
                  onChange={(e: any) => setSidewalkCondition(e.target.value)}
                  style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                >
                  <option value="NOT_VISIBLE">Belum Teramati / Tidak Terlihat</option>
                  <option value="GOOD">Lebar & Rata</option>
                  <option value="NARROW">Sempit (&lt;1.2m)</option>
                  <option value="DAMAGED">Paving Rusak / Berlubang</option>
                  <option value="BLOCKED">Terblokir Parkir / PKL</option>
                </select>
              </div>

              {/* Lighting */}
              <div>
                <label style={{ fontSize: '12px', color: '#767676', display: 'block', marginBottom: '4px' }}>Penerangan Malam:</label>
                <select
                  value={lightingLevel}
                  onChange={(e: any) => setLightingLevel(e.target.value)}
                  style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '12px' }}
                >
                  <option value="NOT_VISIBLE">Belum Teramati / Tidak Terlihat</option>
                  <option value="BRIGHT">Terang & Nyaman</option>
                  <option value="DIM">Redup / Kurang Lampu</option>
                  <option value="DARK">Gelap / Berbahaya</option>
                </select>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                borderRadius: '50px',
                border: '1px solid #CBD5E1',
                backgroundColor: 'transparent',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Batal
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-yellow-pill"
              style={{ padding: '0 24px' }}
            >
              <Sparkles size={16} />
              <span>{isSubmitting ? 'Menganalisis AI & Mengunggah...' : 'Publikasikan Laporan'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
