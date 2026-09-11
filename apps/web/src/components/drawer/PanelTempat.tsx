'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, MapPin, Accessibility, Users, AlertTriangle, Camera, MessageSquare, Send } from 'lucide-react';
import { difaMapApi, getPrimaryPhotoUrl } from '../../lib/api';
import { useIsMobile } from '../../hooks/useIsMobile';

/**
 * Panel untuk tempat yang berasal dari basemap MAPID - misalnya "Trans Studio
 * Mall".
 *
 * DifaMap tidak menyimpan tempat semacam ini. Tabel locations berisi PENGAMATAN
 * survei: "Toilet Cinema XXI Trans Studio Mall" adalah satu pengamatan di dalam
 * mall, bukan mall itu sendiri. Panel ini membalik hubungannya - nama tempat
 * diambil dari MAPID, lalu pengamatan kita di sekitarnya ditampilkan sebagai
 * bukti tentang tempat tersebut.
 *
 * Seluruh angka di sini dihitung dari baris yang benar-benar ada dalam radius.
 * Tidak ada nilai bawaan yang mengisi kekosongan.
 */

export interface PoiTerpilih {
  nama: string;
  kategori?: string;
  latitude: number;
  longitude: number;
}

interface Props {
  poi: PoiTerpilih;
  onClose: () => void;
}

const PILIHAN_RADIUS = [150, 300, 500, 800];

/**
 * Fasilitas yang diperiksa pada pengamatan di sekitar tempat.
 *
 * Panel ini menjawab "ada, tidak ada, atau belum teramati" - bukan "berapa dari
 * berapa". Bagi orang yang hendak berangkat, yang menentukan adalah apakah
 * fasilitasnya ada sama sekali di kawasan itu; perbandingan jumlah pengamatan
 * lebih menyerupai laporan audit daripada jawaban.
 *
 * `ada` memuat nilai yang berarti fasilitasnya hadir, meski kondisinya buruk -
 * ramp yang rusak tetap ramp yang ada, dan itu kabar berbeda dari tidak ada
 * ramp sama sekali. Untuk parameter yang menyatakan kondisi, bukan keberadaan
 * (trotoar, permukaan, penerangan), label digantikan lewat `kataAda`/`kataTiada`.
 */
const FASILITAS: Array<{
  kolom: string;
  ada: string[];
  tiada: string[];
  label: string;
  kataAda: string;
  kataTiada: string;
}> = [
  { kolom: 'rampStatus', ada: ['GOOD', 'DAMAGED'], tiada: ['NONE'], label: 'Ramp kursi roda', kataAda: 'Ada', kataTiada: 'Tidak ada' },
  { kolom: 'guidingBlockStatus', ada: ['GOOD', 'DAMAGED'], tiada: ['NONE'], label: 'Ubin pemandu', kataAda: 'Ada', kataTiada: 'Tidak ada' },
  { kolom: 'toiletAccessibility', ada: ['AVAILABLE', 'AVAILABLE_GOOD', 'AVAILABLE_POOR'], tiada: ['NOT_AVAILABLE'], label: 'Toilet difabel', kataAda: 'Ada', kataTiada: 'Tidak ada' },
  { kolom: 'seatingAvailability', ada: ['AVAILABLE', 'AVAILABLE_GOOD', 'AVAILABLE_POOR'], tiada: ['NOT_AVAILABLE'], label: 'Tempat duduk', kataAda: 'Ada', kataTiada: 'Tidak ada' },
  { kolom: 'sidewalkCondition', ada: ['GOOD'], tiada: ['NARROW', 'DAMAGED', 'BLOCKED'], label: 'Kondisi trotoar', kataAda: 'Layak', kataTiada: 'Bermasalah' },
  { kolom: 'surfaceCondition', ada: ['SMOOTH'], tiada: ['SLIPPERY', 'POTHOLE', 'UNEVEN'], label: 'Permukaan jalan', kataAda: 'Layak', kataTiada: 'Bermasalah' },
  { kolom: 'lightingLevel', ada: ['BRIGHT'], tiada: ['DIM', 'DARK'], label: 'Penerangan jalan', kataAda: 'Memadai', kataTiada: 'Kurang' },
];

const LABEL_KERAMAIAN: Record<string, string> = {
  QUIET: 'Sepi',
  MODERATE: 'Sedang',
  CROWDED: 'Ramai',
};

function jarakMeter(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Penanda tempat untuk komentar.
 *
 * Tempat tidak punya baris sendiri di basis data, jadi komentarnya ditandai
 * slug dari namanya. Slug dipakai apa adanya sebagai kunci, sehingga dua tempat
 * bernama sama akan berbagi komentar - dapat diterima karena daftar tempat
 * dikelola tim di src/data/tempatPilihan.ts dan namanya dijaga unik.
 */
function slugTempat(nama: string): string {
  return nama
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

const HARI_PENDEK = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

/** Tingkat keramaian dipetakan ke angka supaya bisa dirata-rata dan digambar. */
const NILAI_KERAMAIAN: Record<string, number> = { QUIET: 1, MODERATE: 2, CROWDED: 3 };

/**
 * Menyusun pola keramaian per hari dari pengamatan di sekitar tempat.
 *
 * Dasarnya `observedParameters.visitedAt` - waktu pelapor benar-benar berada di
 * lokasi, diisi lewat formulir laporan. Kolom `createdAt` SENGAJA tidak dipakai
 * meski selalu terisi: untuk 94 pengamatan yang ada sekarang, nilainya adalah
 * waktu impor dari MAPID, bukan waktu kunjungan. Memakainya akan menghasilkan
 * grafik yang seluruh datanya menumpuk di satu hari - hari impor - dan terbaca
 * seolah itu pola keramaian tempatnya.
 *
 * Selama belum ada laporan berwaktu, fungsi ini mengembalikan tujuh hari kosong,
 * dan grafiknya menyatakan kekosongan itu apa adanya.
 */
function susunMingguan(pengamatan: any[]): { hari: Array<{ nama: string; rata: number | null; jumlah: number }>; totalLaporan: number } {
  const ember: number[][] = [[], [], [], [], [], [], []];

  for (const x of pengamatan) {
    const par = x.observedParameters ?? {};
    const waktu = par.visitedAt;
    const tingkat = par.crowdLevel ?? x.crowdLevel;
    if (!waktu || !tingkat || !(tingkat in NILAI_KERAMAIAN)) continue;

    const t = new Date(waktu);
    if (Number.isNaN(t.getTime())) continue;

    // getDay(): 0 = Minggu. Digeser agar Senin menjadi indeks 0.
    const indeks = (t.getDay() + 6) % 7;
    ember[indeks].push(NILAI_KERAMAIAN[tingkat]);
  }

  const hari = ember.map((nilai, i) => ({
    nama: HARI_PENDEK[i],
    rata: nilai.length ? nilai.reduce((a, b) => a + b, 0) / nilai.length : null,
    jumlah: nilai.length,
  }));

  return { hari, totalLaporan: ember.reduce((n, e) => n + e.length, 0) };
}

/** Parameter hasil pengamatan ada di tempat berbeda untuk lokasi dan aktivitas. */
function parameterDari(item: any): Record<string, string> {
  return item.observedParameters ?? item;
}

export default function PanelTempat({ poi, onClose }: Props) {
  const isMobile = useIsMobile(768);
  const [radius, setRadius] = useState<number>(300);
  const [sedangMuat, setSedangMuat] = useState(true);
  const [gagal, setGagal] = useState<string | null>(null);
  const [lokasiSekitar, setLokasiSekitar] = useState<any[]>([]);
  const [aktivitasSekitar, setAktivitasSekitar] = useState<any[]>([]);

  const [komentar, setKomentar] = useState<any[]>([]);
  const [teksKomentar, setTeksKomentar] = useState('');
  const [namaPengirim, setNamaPengirim] = useState('');
  const [sedangKirim, setSedangKirim] = useState(false);
  const [gagalKirim, setGagalKirim] = useState<string | null>(null);

  useEffect(() => {
    let dibatalkan = false;

    const muat = async () => {
      setSedangMuat(true);
      setGagal(null);
      try {
        const [lokasi, aktivitas] = await Promise.all([
          difaMapApi.getNearbyLocations(poi.latitude, poi.longitude, radius, 100),
          // Aktivitas belum punya endpoint radius di server. Jumlahnya puluhan
          // dan sudah dimuat ke browser, jadi disaring di sini saja.
          difaMapApi.getActivities({ limit: 200 }),
        ]);
        if (dibatalkan) return;

        setLokasiSekitar(lokasi?.data ?? []);
        setAktivitasSekitar(
          (aktivitas?.data ?? [])
            .filter((a: any) => typeof a.latitude === 'number' && typeof a.longitude === 'number')
            .map((a: any) => ({
              ...a,
              jarak: jarakMeter(poi.latitude, poi.longitude, a.latitude, a.longitude),
            }))
            .filter((a: any) => a.jarak <= radius)
            .sort((a: any, b: any) => a.jarak - b.jarak)
        );
      } catch (err) {
        if (!dibatalkan) setGagal('Gagal mengambil data survei di sekitar tempat ini.');
      } finally {
        if (!dibatalkan) setSedangMuat(false);
      }
    };

    muat();
    return () => {
      dibatalkan = true;
    };
  }, [poi.latitude, poi.longitude, radius]);

  /**
   * Satu kunjungan survei tersimpan di DUA tabel: sebagai baris locations dan
   * sebagai baris activities yang menunjuk balik lewat locationId - seluruh 94
   * aktivitas punya pasangannya, dengan judul yang sama persis. Menggabungkan
   * keduanya begitu saja membuat setiap pengamatan terhitung dua kali, sehingga
   * "2 pengamatan" dilaporkan sebagai 4.
   *
   * Lokasi dipertahankan karena skor resminya ada di sana; aktivitas hanya
   * dipakai bila lokasinya tidak ikut terjaring radius.
   */
  const pengamatan = useMemo(() => {
    const idLokasi = new Set(lokasiSekitar.map((l) => l.id));
    const aktivitasLepas = aktivitasSekitar.filter((a) => !a.locationId || !idLokasi.has(a.locationId));
    return [...lokasiSekitar, ...aktivitasLepas];
  }, [lokasiSekitar, aktivitasSekitar]);

  /**
   * Aktivitas yang punya foto dan catatan lapangan, untuk ditampilkan sebagai
   * bukti visual. Dibatasi empat teratas menurut jarak: panel ini dibaca di
   * telepon genggam, dan gulungan foto tanpa batas membuat bagian di bawahnya
   * - komentar - tidak pernah tercapai.
   */
  const aktivitasBerfoto = useMemo(
    () =>
      aktivitasSekitar
        .filter((a) => Array.isArray(a.mediaUrls) && a.mediaUrls.length > 0)
        .slice(0, 4),
    [aktivitasSekitar]
  );

  /**
   * Komentar menempel pada TEMPAT lewat placeKey, bukan pada pengamatan.
   *
   * Sebelumnya komentar disauhkan ke pengamatan terdekat, sehingga komentar
   * tentang Trans Studio Mall tercatat sebagai komentar tentang lobinya - dan
   * berpindah induk begitu radius diubah atau pengamatan baru ditambahkan.
   * Kolom place_key ditambahkan lewat migrations_manual/02_komentar_tempat.sql.
   */
  const kunciTempat = useMemo(() => slugTempat(poi.nama), [poi.nama]);

  const muatKomentar = async () => {
    try {
      const j = await difaMapApi.getPlaceComments(kunciTempat);
      setKomentar(j?.data ?? []);
    } catch {
      setKomentar([]);
    }
  };

  useEffect(() => {
    let dibatalkan = false;
    difaMapApi
      .getPlaceComments(kunciTempat)
      .then((j: any) => {
        if (!dibatalkan) setKomentar(j?.data ?? []);
      })
      .catch(() => {
        if (!dibatalkan) setKomentar([]);
      });
    return () => {
      dibatalkan = true;
    };
  }, [kunciTempat]);

  const kirimKomentar = async () => {
    const isi = teksKomentar.trim();
    if (!isi || sedangKirim) return;

    setSedangKirim(true);
    setGagalKirim(null);
    try {
      const nama = namaPengirim.trim();
      await difaMapApi.createComment({
        placeKey: kunciTempat,
        content: nama ? `${nama}: ${isi}` : isi,
      });
      setTeksKomentar('');
      // Dimuat ulang dari server, bukan ditambahkan langsung ke layar. Menambah
      // ke layar lebih dulu membuat komentar yang gagal tersimpan tetap terlihat
      // seolah berhasil - dan penulisnya baru tahu setelah memuat ulang halaman.
      await muatKomentar();
    } catch (err: any) {
      setGagalKirim('Komentar gagal dikirim. Coba lagi sebentar.');
    } finally {
      setSedangKirim(false);
    }
  };

  const mingguan = useMemo(() => susunMingguan(pengamatan), [pengamatan]);

  const ringkasan = useMemo(() => {
    const semua = pengamatan;

    const berskor = semua
      .map((x) => (typeof x.overallScore === 'number' ? x.overallScore : x.aiScore))
      .filter((s) => typeof s === 'number');

    const skorRata = berskor.length
      ? berskor.reduce((a: number, b: number) => a + b, 0) / berskor.length
      : null;

    // Satu pengamatan yang melihat fasilitasnya sudah cukup untuk menyebut "ada"
    // di kawasan itu. "Tidak ada" hanya dipakai bila setiap pengamatan yang
    // sempat melihat parameter tersebut melaporkan ketiadaannya.
    const fasilitas = FASILITAS.map((f) => {
      let adaJml = 0;
      let tiadaJml = 0;
      for (const x of semua) {
        const nilai = parameterDari(x)[f.kolom];
        if (!nilai || nilai === 'NOT_VISIBLE' || nilai === 'NOT_APPLICABLE') continue;
        if (f.ada.includes(nilai)) adaJml++;
        else if (f.tiada.includes(nilai)) tiadaJml++;
      }
      const status: 'ADA' | 'TIADA' | 'BELUM' =
        adaJml > 0 ? 'ADA' : tiadaJml > 0 ? 'TIADA' : 'BELUM';
      return { ...f, status };
    });

    const keramaian: Record<string, number> = {};
    for (const x of semua) {
      const nilai = parameterDari(x).crowdLevel;
      if (nilai && nilai !== 'NOT_VISIBLE') keramaian[nilai] = (keramaian[nilai] ?? 0) + 1;
    }

    return { jumlah: semua.length, skorRata, fasilitas, keramaian };
  }, [pengamatan]);

  const warnaSkor = (s: number) => (s < 2.5 ? '#EF4444' : s < 3.5 ? '#F59E0B' : '#16A34A');

  const kartu: React.CSSProperties = {
    backgroundColor: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: '12px',
    padding: '14px',
  };

  return (
    <aside
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: isMobile ? 'auto' : '16px',
        bottom: isMobile ? 0 : '16px',
        // Sidebar kiri selebar 80px dan berposisi fixed. Panel harus mulai
        // setelahnya, bukan menimpanya - kalau tidak, tombol mode peta dan
        // tombol laporan ikut tertutup dan tidak bisa ditekan.
        left: isMobile ? 0 : '96px',
        right: isMobile ? 0 : 'auto',
        width: isMobile ? '100%' : '420px',
        maxHeight: isMobile ? '72vh' : 'calc(100% - 32px)',
        overflowY: 'auto',
        backgroundColor: '#F8FAFC',
        borderRadius: isMobile ? '16px 16px 0 0' : '16px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
        zIndex: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px',
      }}
    >
      {/* Kepala */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
        <div>
          <span
            style={{
              fontSize: '10.5px',
              fontWeight: 800,
              letterSpacing: '0.04em',
              color: '#539BA9',
              backgroundColor: '#E0F2F5',
              padding: '3px 8px',
              borderRadius: '20px',
            }}
          >
            TEMPAT · BASEMAP MAPID
          </span>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0F172A', margin: '8px 0 2px' }}>
            {poi.nama}
          </h2>
          <div style={{ fontSize: '11.5px', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <MapPin size={13} />
            <span>
              {poi.kategori ? `${poi.kategori} · ` : ''}
              {poi.latitude.toFixed(5)}, {poi.longitude.toFixed(5)}
            </span>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Tutup panel tempat"
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748B', padding: '4px' }}
        >
          <X size={20} />
        </button>
      </div>

      {/* Pemilih radius */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '11.5px', color: '#64748B', marginRight: '2px' }}>Radius:</span>
        {PILIHAN_RADIUS.map((r) => (
          <button
            key={r}
            onClick={() => setRadius(r)}
            style={{
              padding: '4px 10px',
              borderRadius: '14px',
              border: `1px solid ${radius === r ? '#539BA9' : '#CBD5E1'}`,
              backgroundColor: radius === r ? '#539BA9' : '#FFFFFF',
              color: radius === r ? '#FFFFFF' : '#334155',
              fontSize: '11.5px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {r} m
          </button>
        ))}
      </div>

      {sedangMuat ? (
        <div style={{ ...kartu, color: '#64748B', fontSize: '12px' }}>Mengambil data survei di sekitar…</div>
      ) : gagal ? (
        <div role="alert" style={{ ...kartu, backgroundColor: '#FEE2E2', borderColor: '#FECACA', color: '#991B1B', fontSize: '12px' }}>
          {gagal}
        </div>
      ) : ringkasan.jumlah === 0 ? (
        <div style={{ ...kartu, borderStyle: 'dashed', color: '#64748B', fontSize: '12.5px', lineHeight: '18px' }}>
          <strong style={{ color: '#0F172A' }}>Belum ada data survei dalam radius {radius} m.</strong>
          <div style={{ marginTop: '4px' }}>
            Tempat ini ada di peta MAPID, tetapi tim belum pernah mensurvei aksesibilitas di
            sekitarnya. Coba perbesar radius, atau jadikan tempat ini sasaran survei berikutnya.
          </div>
        </div>
      ) : (
        <>
          {/* Skor sekitar */}
          <div style={kartu}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>
              Aksesibilitas di sekitar
            </div>
            {ringkasan.skorRata != null ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '30px', fontWeight: 800, color: warnaSkor(ringkasan.skorRata) }}>
                  {ringkasan.skorRata.toFixed(1)}
                </span>
                <span style={{ fontSize: '12px', color: '#64748B' }}>
                  dari 5 · rata-rata {ringkasan.jumlah} pengamatan dalam {radius} m
                </span>
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: '#64748B' }}>
                {ringkasan.jumlah} pengamatan ditemukan, tetapi belum ada yang punya skor.
              </div>
            )}
          </div>

          {/* Fasilitas: ada / tidak ada / belum teramati */}
          <div style={kartu}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <Accessibility size={15} />
              <span>Fasilitas aksesibilitas</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {ringkasan.fasilitas.map((f) => {
                const gaya =
                  f.status === 'ADA'
                    ? { teks: f.kataAda, warna: '#166534', latar: '#DCFCE7' }
                    : f.status === 'TIADA'
                      ? { teks: f.kataTiada, warna: '#991B1B', latar: '#FEE2E2' }
                      : { teks: 'Belum teramati', warna: '#64748B', latar: '#F1F5F9' };
                return (
                  <div
                    key={f.kolom}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '7px 0',
                      borderBottom: '1px solid #F1F5F9',
                    }}
                  >
                    <span style={{ fontSize: '12px', color: '#334155' }}>{f.label}</span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        color: gaya.warna,
                        backgroundColor: gaya.latar,
                        padding: '3px 9px',
                        borderRadius: '20px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {gaya.teks}
                    </span>
                  </div>
                );
              })}
            </div>
            <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '9px', lineHeight: '15px' }}>
              &quot;Belum teramati&quot; berarti parameter itu tidak terlihat di foto survei &mdash; bukan
              berarti fasilitasnya tidak ada.
            </div>
          </div>

          {/* Pola keramaian mingguan */}
          <div style={kartu}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users size={15} />
                <span>Pola keramaian</span>
              </div>
              <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748B' }}>Mingguan</span>
            </div>

            {(() => {
              const L = 34;   // ruang kiri untuk label sumbu
              const A = 8;    // jarak atas
              const B = 22;   // ruang bawah untuk nama hari
              const T = 118;  // tinggi keseluruhan
              const W = 300;  // lebar acuan; digambar responsif lewat viewBox
              const tinggiPlot = T - A - B;
              const xDari = (i: number) => L + (i * (W - L - 6)) / 6;
              // Nilai 1 (sepi) di bawah, 3 (ramai) di atas.
              const yDari = (v: number) => A + tinggiPlot - ((v - 1) / 2) * tinggiPlot;

              const titik = mingguan.hari
                .map((h, i) => (h.rata == null ? null : { x: xDari(i), y: yDari(h.rata), h, i }))
                .filter(Boolean) as Array<{ x: number; y: number; h: any; i: number }>;

              const garis = titik.map((t) => `${t.x},${t.y}`).join(' ');

              return (
                <div style={{ position: 'relative' }}>
                  <svg viewBox={`0 0 ${W} ${T}`} width="100%" height={T} role="img"
                       aria-label="Grafik pola keramaian mingguan">
                    {/* Garis bantu dan label tingkat */}
                    {[3, 2, 1].map((v) => (
                      <g key={v}>
                        <line x1={L} y1={yDari(v)} x2={W - 6} y2={yDari(v)} stroke="#E2E8F0" strokeWidth="1" />
                        <text x={L - 6} y={yDari(v) + 3.5} textAnchor="end" fontSize="9" fill="#94A3B8">
                          {v === 3 ? 'Ramai' : v === 2 ? 'Sedang' : 'Sepi'}
                        </text>
                      </g>
                    ))}

                    {/* Nama hari */}
                    {mingguan.hari.map((h, i) => (
                      <text key={h.nama} x={xDari(i)} y={T - 6} textAnchor="middle" fontSize="9.5"
                            fill={h.jumlah > 0 ? '#334155' : '#CBD5E1'}>
                        {h.nama}
                      </text>
                    ))}

                    {titik.length > 1 && (
                      <polyline points={garis} fill="none" stroke="#539BA9" strokeWidth="2"
                                strokeLinejoin="round" strokeLinecap="round" />
                    )}
                    {titik.map((t) => (
                      <circle key={t.i} cx={t.x} cy={t.y} r="3.5" fill="#539BA9" stroke="#FFFFFF" strokeWidth="1.5">
                        <title>{`${t.h.nama}: ${t.h.jumlah} laporan`}</title>
                      </circle>
                    ))}
                  </svg>

                  {mingguan.totalLaporan === 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 12px',
                      }}
                    >
                      <span
                        style={{
                          backgroundColor: 'rgba(248, 250, 252, 0.94)',
                          border: '1px dashed #CBD5E1',
                          borderRadius: '10px',
                          padding: '8px 12px',
                          fontSize: '11px',
                          color: '#64748B',
                          textAlign: 'center',
                          lineHeight: '16px',
                        }}
                      >
                        Belum ada laporan berwaktu untuk tempat ini.
                        <br />
                        Grafik terisi sendiri begitu ada yang melapor sambil mencatat waktu kunjungan.
                      </span>
                    </div>
                  )}
                </div>
              );
            })()}

            <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '8px', lineHeight: '15px' }}>
              {mingguan.totalLaporan === 0 ? (
                <span>
                  Keramaian tidak bisa disimpulkan dari satu foto, dan waktu impor data bukan waktu
                  kunjungan — jadi tidak ada yang bisa digambar sekarang.
                </span>
              ) : (
                <span>
                  Berdasarkan {mingguan.totalLaporan} laporan berwaktu. Hari tanpa titik berarti belum
                  ada laporan pada hari itu, bukan berarti sepi.
                </span>
              )}
            </div>

            {/* Keramaian yang sempat teramati, tanpa dimensi hari */}
            {(() => {
              const urut = ['QUIET', 'MODERATE', 'CROWDED'];
              const warna: Record<string, string> = { QUIET: '#16A34A', MODERATE: '#F59E0B', CROWDED: '#EF4444' };
              const total = urut.reduce((n, k) => n + (ringkasan.keramaian[k] ?? 0), 0);
              if (total === 0) return null;
              return (
                <div style={{ display: 'flex', gap: '6px', marginTop: '10px', flexWrap: 'wrap' }}>
                  {urut.map((k) => {
                    const n = ringkasan.keramaian[k] ?? 0;
                    if (n === 0) return null;
                    return (
                      <span
                        key={k}
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          color: '#FFFFFF',
                          backgroundColor: warna[k],
                          padding: '3px 9px',
                          borderRadius: '20px',
                        }}
                      >
                        {LABEL_KERAMAIAN[k]}: {n}
                      </span>
                    );
                  })}
                  <span style={{ fontSize: '10.5px', color: '#94A3B8', alignSelf: 'center' }}>
                    tercatat tanpa keterangan hari
                  </span>
                </div>
              );
            })()}
          </div>

          {/* Foto dan catatan lapangan dari aktivitas dalam radius */}
          {aktivitasBerfoto.length > 0 && (
            <div style={kartu}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                <Camera size={15} />
                <span>Foto &amp; catatan lapangan</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {aktivitasBerfoto.map((a: any) => (
                  <div key={a.id}>
                    <img
                      src={getPrimaryPhotoUrl(a.mediaUrls)}
                      alt={a.title || 'Foto survei lapangan'}
                      loading="lazy"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                      style={{
                        width: '100%',
                        height: '150px',
                        objectFit: 'cover',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        display: 'block',
                      }}
                    />
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', marginTop: '7px' }}>
                      {a.title}
                    </div>
                    <div style={{ fontSize: '10.5px', color: '#94A3B8', margin: '1px 0 4px' }}>
                      {Math.round(a.jarak)} m dari titik tempat
                      {typeof a.aiScore === 'number' ? ` \u00b7 skor ${a.aiScore.toFixed(1)}` : ''}
                    </div>
                    {a.description && (
                      <div style={{ fontSize: '11.5px', color: '#475569', lineHeight: '17px' }}>
                        {a.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Daftar pengamatan */}
          <div style={kartu}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>
              Pengamatan di sekitar ({ringkasan.jumlah})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
              {pengamatan
                .map((x) => ({
                  id: x.id,
                  nama: x.name ?? x.title ?? 'Tanpa nama',
                  skor: typeof x.overallScore === 'number' ? x.overallScore : x.aiScore,
                  jarak: x.jarak ?? x.distanceMeters ?? x.distance,
                  jenis: x.name ? 'Lokasi' : 'Aktivitas',
                }))
                .sort((a, b) => (a.jarak ?? 9e9) - (b.jarak ?? 9e9))
                .map((x) => (
                  <div
                    key={`${x.jenis}-${x.id}`}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: '10px',
                      fontSize: '11.5px',
                      paddingBottom: '6px',
                      borderBottom: '1px solid #F1F5F9',
                    }}
                  >
                    <span style={{ color: '#334155', flex: 1 }}>{x.nama}</span>
                    <span style={{ color: typeof x.skor === 'number' ? warnaSkor(x.skor) : '#94A3B8', fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {typeof x.skor === 'number' ? `${x.skor.toFixed(1)}★` : 'belum dinilai'}
                    </span>
                    <span style={{ color: '#94A3B8', whiteSpace: 'nowrap' }}>
                      {typeof x.jarak === 'number' ? `${Math.round(x.jarak)} m` : ''}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}

      {/* Komentar */}
      {(
        <div style={kartu}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <MessageSquare size={15} />
            <span>Komentar ({komentar.length})</span>
          </div>

          {komentar.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '12px' }}>
              {komentar.map((k: any) => (
                <div key={k.id} style={{ borderBottom: '1px solid #F1F5F9', paddingBottom: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#334155' }}>
                    {k.user?.name || 'Kontributor'}
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#475569', lineHeight: '17px', marginTop: '2px' }}>
                    {k.content}
                  </div>
                </div>
              ))}
            </div>
          )}

          <input
            value={namaPengirim}
            onChange={(e) => setNamaPengirim(e.target.value)}
            placeholder="Nama (boleh dikosongkan)"
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '12px',
              fontFamily: 'inherit',
              marginBottom: '6px',
            }}
          />
          <textarea
            value={teksKomentar}
            onChange={(e) => setTeksKomentar(e.target.value)}
            rows={3}
            placeholder="Bagaimana pengalaman Anda di tempat ini?"
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              fontSize: '12px',
              fontFamily: 'inherit',
              resize: 'none',
            }}
          />

          {gagalKirim && (
            <div role="alert" style={{ fontSize: '11px', color: '#991B1B', marginTop: '6px' }}>
              {gagalKirim}
            </div>
          )}

          <button
            onClick={kirimKomentar}
            disabled={!teksKomentar.trim() || sedangKirim}
            style={{
              marginTop: '8px',
              width: '100%',
              padding: '9px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: !teksKomentar.trim() || sedangKirim ? '#CBD5E1' : '#539BA9',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 700,
              cursor: !teksKomentar.trim() || sedangKirim ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <Send size={14} />
            <span>{sedangKirim ? 'Mengirim...' : 'Kirim komentar'}</span>
          </button>

          <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '8px', lineHeight: '15px' }}>
            Komentar tersimpan untuk tempat ini, bukan untuk satu titik survei di dalamnya, dan tetap
            ada walau radius diubah. Bersifat indikatif dan tidak mengubah skor resmi survei.
          </div>
        </div>
      )}

      <div style={{ fontSize: '10.5px', color: '#94A3B8', lineHeight: '15px' }}>
        Nama dan letak tempat berasal dari basemap MAPID. Seluruh penilaian di panel ini dihitung
        dari hasil survei DifaMap yang berada dalam radius terpilih.
      </div>
    </aside>
  );
}
