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

  // Handle ESC key to close InfoModal
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

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(5px)',
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
            {/* Nama tombol disalin PERSIS dari bilah atas.
                Panduan sebelumnya menyuruh menekan tombol "Aktivitas" yang sudah
                lama diganti "Halte", dan "Tanya AI" yang kini bertuliskan "Tanya
                Difa AI" - panduan yang menyuruh mencari tombol tak ada lebih
                buruk daripada tidak ada panduan sama sekali. */}
            <ul style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li>
                <strong>Peta bawaan:</strong> tanpa menekan tombol apa pun, seluruh titik survei
                sudah tampil &mdash; trotoar, halte, dan tempat umum.
              </li>
              <li>
                <strong>Tempat:</strong> menyaring ke mall, rumah sakit, kampus, dan tempat umum
                lain. Menekannya lagi kembali ke peta bawaan.
              </li>
              <li>
                <strong>Halte:</strong> menyaring ke titik transit saja.
              </li>
              <li>
                <strong>Cari Tujuan:</strong> ketik nama tempat di kolom pencarian. Tempat di luar
                data survei pun tetap ditemukan dari basemap MAPID.
              </li>
              <li>
                <strong>Tanya Difa AI:</strong> tanyakan rute kursi roda, kondisi sebuah jalan, atau
                halte paling ramah &mdash; dijawab dari titik survei, bukan tebakan.
              </li>
              <li>
                <strong>Bagikan Laporan:</strong> kirim temuan Anda sendiri beserta fotonya. Titik
                baru langsung muncul di peta.
              </li>
            </ul>
          </div>

          {/* Mode Urban Planner.
              Separuh aplikasi ini tidak pernah disebut di panduan lama. */}
          <div
            style={{
              backgroundColor: '#F0F9FB',
              borderRadius: '14px',
              padding: '16px',
              border: '1.5px solid #BAE1E8',
            }}
          >
            <h3
              style={{
                fontSize: '15px',
                fontWeight: '800',
                color: '#0F5661',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Layers size={18} color="#0F5661" />
              <span>Mode Perencana Kota</span>
            </h3>
            <p style={{ margin: '0 0 8px 0' }}>
              Lambang kedua di sisi kiri layar membuka mode untuk dinas, pengembang perumahan,
              dan pemilik usaha. Panel analisisnya terbuka sendiri di sebelah kanan.
            </p>
            <ul style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li>
                <strong>Site Selection</strong> menjawab <em>&ldquo;di mana?&rdquo;</em> &mdash; peta
                dibagi petak, tiap petak dinilai dari kondisi aksesibilitas dikali keramaian
                kegiatan. Bisa dibaca dari tiga sudut: keramaian, hunian, atau komersial.
              </li>
              <li>
                <strong>Site Analysis</strong> menjawab <em>&ldquo;titik ini bagaimana?&rdquo;</em>{' '}
                &mdash; jangkauan 5, 10, dan 15 menit kursi roda mengikuti jalan yang benar-benar
                bisa dilalui, apa saja yang terjangkau, dan mana yang di luar jangkauan.
              </li>
              <li>
                <strong>Bandingkan dua titik</strong> menyandingkan dua calon lokasi berdampingan,
                lengkap dengan putusan Difa AI.
              </li>
              <li>
                <strong>Bila satu titik diperbaiki</strong> menghitung titik mana yang paling
                mengubah keadaan &mdash; berguna saat anggaran hanya cukup untuk satu.
              </li>
              <li>
                <strong>Properti</strong> dan <strong>Restoran &amp; Kafe</strong> menampilkan titik
                survei MAPID beserta foto dan harga rata-ratanya.
              </li>
            </ul>
          </div>

          {/* Visi & Inovasi DifaMap */}
          <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
            <img
              src="/difamap-icon.png"
              alt="DifaMap"
              style={{
                width: '46px',
                height: '46px',
                objectFit: 'contain',
                flexShrink: 0,
                borderRadius: '8px',
                padding: '2px',
                background: '#FFFFFF',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
                border: '1px solid #F1F5F9',
              }}
            />
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', marginBottom: '6px' }}>
                Tentang DifaMap WebGIS
              </h3>
              <p style={{ margin: 0 }}>
                <strong>DifaMap</strong> adalah platform WebGIS ramah inklusivitas yang memetakan aksesibilitas fasilitas pejalan kaki (ramp kursi roda, ubin pemandu tunanetra, penerangan, dan trotoar) di sekitar koridor transportasi massal <strong>Kota Makassar & Kabupaten Gowa</strong>.
              </p>
            </div>
          </div>

          {/* Arti Warna Status.
              Ambangnya disalin dari warnaSkor() di MapCanvas supaya keterangan
              di sini tidak pernah berbeda dari yang digambar peta. Legenda lama
              menyebut warna sebagai kondisi ramp, padahal warnanya mengikuti
              skor gabungan - dan sama sekali tidak menyebut abu-abu. */}
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: '800', color: '#0F172A', marginBottom: '4px' }}>
              Arti Warna Pin di Peta
            </h3>
            <p style={{ margin: '0 0 10px 0', fontSize: '12.5px', color: '#64748B' }}>
              Warna mengikuti skor aksesibilitas keseluruhan titik itu, dari skala 1 sampai 5 &mdash;
              bukan kondisi satu fasilitas saja.
            </p>
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
                <span style={{ color: '#166534', fontWeight: '700' }}>Hijau: skor 3,5 ke atas</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: '#FEE2E2', borderRadius: '8px', border: '1px solid #FECACA' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#991B1B', flexShrink: 0 }} />
                <span style={{ color: '#991B1B', fontWeight: '700' }}>Merah: skor di bawah 2,5</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: '#FEF3C7', borderRadius: '8px', border: '1px solid #FDE68A' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#B45309', flexShrink: 0 }} />
                <span style={{ color: '#B45309', fontWeight: '700' }}>Jingga: skor 2,5 sampai 3,5</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: '#F1F5F9', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#94A3B8', flexShrink: 0 }} />
                <span style={{ color: '#334155', fontWeight: '700' }}>Abu-abu: belum dinilai AI</span>
              </div>
            </div>
          </div>

          {/* Cara membaca kejujuran datanya.
              Sikap ini sudah tertanam di seluruh panel - "belum teramati" tidak
              pernah disimpulkan menjadi "tidak ada", petak tanpa survei tidak
              diwarnai, tingkat keyakinan AI ikut ditampilkan - tetapi tidak
              pernah dinyatakan di satu tempat. Pembaca yang menemukannya
              tersebar satu per satu mudah mengiranya kekurangan; dinyatakan di
              muka, ia terbaca sebagai pendirian. */}
          <div
            style={{
              backgroundColor: '#F8FAFC',
              borderRadius: '14px',
              padding: '16px',
              border: '1.5px solid #E2E8F0',
            }}
          >
            <h3
              style={{
                fontSize: '15px',
                fontWeight: '800',
                color: '#0F172A',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <ShieldCheck size={18} color="#0F172A" />
              <span>Cara Membaca Datanya</span>
            </h3>

            <ul style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <li>
                <strong>&ldquo;Belum teramati&rdquo; bukan berarti tidak ada.</strong> Itu berarti
                parameternya tidak terlihat di foto survei. DifaMap tidak pernah menyimpulkannya
                menjadi ada maupun tidak ada &mdash; termasuk Difa AI.
              </li>
              <li>
                <strong>Wilayah yang belum disurvei dibiarkan kosong.</strong> Petak tanpa satu pun
                titik survei tidak diberi nilai dan tidak diwarnai. Kosong berarti belum didatangi,
                bukan berarti baik.
              </li>
              <li>
                <strong>Skor berasal dari foto lapangan.</strong> Dinilai AI dari foto surveyor,
                dan tingkat keyakinannya ikut ditampilkan di panel. Laporan tanpa foto berskor
                keyakinan lebih rendah &mdash; memang seharusnya begitu.
              </li>
              <li>
                <strong>Setiap angka menyebut dasarnya.</strong> Panel selalu menuliskan berapa
                titik survei yang mendasari sebuah kesimpulan. Skor bagus dari dua pengamatan
                tidak sama kuatnya dengan skor bagus dari dua belas.
              </li>
              <li>
                <strong>Survei masih berjalan.</strong> Cakupannya belum menyentuh seluruh Makassar
                dan Gowa, dan persentasenya bisa Anda tanyakan langsung ke Difa AI.
              </li>
            </ul>
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
