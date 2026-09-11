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
   * Komentar di basis data selalu menempel pada satu lokasi atau aktivitas -
   * tidak ada tabel untuk "tempat", karena tempat di panel ini bukan baris basis
   * data. Komentar karena itu disauhkan ke pengamatan terdekat dari titik
   * tempat, dan hal itu disebutkan kepada penulisnya.
   */
  const lokasiSauh = useMemo(
    () =>
      [...lokasiSekitar].sort(
        (a, b) => (a.distanceMeters ?? a.distance ?? 9e9) - (b.distanceMeters ?? b.distance ?? 9e9)
      )[0] ?? null,
    [lokasiSekitar]
  );

  useEffect(() => {
    let dibatalkan = false;
    if (!lokasiSauh?.id) {
      setKomentar([]);
      return;
    }
    const dasar = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    fetch(`${dasar}/api/comments/location/${lokasiSauh.id}`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j) => {
        if (!dibatalkan) setKomentar(j?.data ?? []);
      })
      .catch(() => {
        if (!dibatalkan) setKomentar([]);
      });
    return () => {
      dibatalkan = true;
    };
  }, [lokasiSauh?.id]);

  const kirimKomentar = async () => {
    const isi = teksKomentar.trim();
    if (!isi || !lokasiSauh?.id || sedangKirim) return;

    setSedangKirim(true);
    setGagalKirim(null);
    try {
      const nama = namaPengirim.trim();
      await difaMapApi.createComment({
        locationId: lokasiSauh.id,
        content: nama ? `${nama}: ${isi}` : isi,
      });
      setTeksKomentar('');
      // Dimuat ulang dari server, bukan ditambahkan langsung ke layar. Menambah
      // ke layar lebih dulu membuat komentar yang gagal tersimpan tetap terlihat
      // seolah berhasil - dan penulisnya baru tahu setelah memuat ulang halaman.
      const dasar = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const r = await fetch(`${dasar}/api/comments/location/${lokasiSauh.id}`);
      const j = r.ok ? await r.json() : { data: [] };
      setKomentar(j?.data ?? []);
    } catch (err: any) {
      setGagalKirim('Komentar gagal dikirim. Coba lagi sebentar.');
    } finally {
      setSedangKirim(false);
    }
  };

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

          {/* Pola keramaian - grafik batang tiga tingkat. Tingkat yang kosong
              tetap digambar sebagai batang abu-abu setinggi minimum, supaya
              ketiadaan data terbaca sebagai nol, bukan sebagai kategori hilang. */}
          <div style={kartu}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <Users size={15} />
              <span>Pola keramaian</span>
            </div>
            {(() => {
              const urut = ['QUIET', 'MODERATE', 'CROWDED'];
              const warnaTingkat: Record<string, string> = {
                QUIET: '#16A34A',
                MODERATE: '#F59E0B',
                CROWDED: '#EF4444',
              };
              const nilai = urut.map((k) => ringkasan.keramaian[k] ?? 0);
              const total = nilai.reduce((a, b) => a + b, 0);
              const tertinggi = Math.max(1, ...nilai);

              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '14px', height: '96px', padding: '0 4px' }}>
                    {urut.map((k, i) => (
                      <div key={k} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', height: '100%' }}>
                        <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                          <div
                            style={{
                              width: '100%',
                              height: `${Math.max(3, (nilai[i] / tertinggi) * 100)}%`,
                              backgroundColor: nilai[i] > 0 ? warnaTingkat[k] : '#E2E8F0',
                              borderRadius: '6px 6px 0 0',
                              transition: 'height 0.25s ease',
                            }}
                          />
                        </div>
                        <span style={{ fontSize: '12px', fontWeight: 800, color: nilai[i] > 0 ? '#0F172A' : '#CBD5E1' }}>
                          {nilai[i]}
                        </span>
                        <span style={{ fontSize: '10.5px', color: '#64748B' }}>{LABEL_KERAMAIAN[k]}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '10px', lineHeight: '15px', display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                    {total === 0 ? (
                      <>
                        <AlertTriangle size={14} color="#94A3B8" style={{ flexShrink: 0, marginTop: '1px' }} />
                        <span>
                          Belum ada data. Keramaian tidak bisa disimpulkan dari satu foto survei, dan
                          DifaMap belum punya sumber data kunjungan.
                        </span>
                      </>
                    ) : (
                      <span>
                        Dari {ringkasan.jumlah} pengamatan, {total} yang keramaiannya sempat teramati.
                      </span>
                    )}
                  </div>
                </>
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
      {lokasiSauh && (
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
            Komentar tersimpan pada pengamatan terdekat, &quot;{lokasiSauh.name}&quot;, karena tempat
            di panel ini bukan baris tersendiri di basis data. Komentar bersifat indikatif dan tidak
            mengubah skor resmi survei.
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
