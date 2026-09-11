'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X, MapPin, Accessibility, Users, AlertTriangle } from 'lucide-react';
import { difaMapApi } from '../../lib/api';
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

/** Hambatan yang dicari pada pengamatan di sekitar tempat. */
const HAMBATAN: Array<{ kolom: string; buruk: string[]; label: string }> = [
  { kolom: 'rampStatus', buruk: ['NONE', 'DAMAGED'], label: 'Ramp kursi roda' },
  { kolom: 'guidingBlockStatus', buruk: ['NONE', 'DAMAGED'], label: 'Ubin pemandu' },
  { kolom: 'sidewalkCondition', buruk: ['DAMAGED', 'BLOCKED', 'NARROW'], label: 'Kondisi trotoar' },
  { kolom: 'surfaceCondition', buruk: ['POTHOLE', 'UNEVEN', 'SLIPPERY'], label: 'Permukaan jalan' },
  { kolom: 'toiletAccessibility', buruk: ['NOT_AVAILABLE'], label: 'Toilet difabel' },
  { kolom: 'lightingLevel', buruk: ['DARK', 'DIM'], label: 'Penerangan jalan' },
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

  const ringkasan = useMemo(() => {
    const semua = pengamatan;

    const berskor = semua
      .map((x) => (typeof x.overallScore === 'number' ? x.overallScore : x.aiScore))
      .filter((s) => typeof s === 'number');

    const skorRata = berskor.length
      ? berskor.reduce((a: number, b: number) => a + b, 0) / berskor.length
      : null;

    const hambatan = HAMBATAN.map((h) => {
      let bermasalah = 0;
      let teramati = 0;
      for (const x of semua) {
        const nilai = parameterDari(x)[h.kolom];
        if (!nilai || nilai === 'NOT_VISIBLE' || nilai === 'NOT_APPLICABLE') continue;
        teramati++;
        if (h.buruk.includes(nilai)) bermasalah++;
      }
      return { ...h, bermasalah, teramati };
    });

    const keramaian: Record<string, number> = {};
    for (const x of semua) {
      const nilai = parameterDari(x).crowdLevel;
      if (nilai && nilai !== 'NOT_VISIBLE') keramaian[nilai] = (keramaian[nilai] ?? 0) + 1;
    }

    return { jumlah: semua.length, skorRata, hambatan, keramaian };
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

          {/* Hambatan tercatat */}
          <div style={kartu}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
              <Accessibility size={15} />
              <span>Hambatan yang tercatat</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
              {ringkasan.hambatan.map((h) => (
                <div key={h.kolom}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: 600, marginBottom: '3px' }}>
                    <span>{h.label}</span>
                    <span style={{ color: h.teramati === 0 ? '#94A3B8' : h.bermasalah > 0 ? '#EF4444' : '#16A34A' }}>
                      {h.teramati === 0 ? 'belum teramati' : `${h.bermasalah} dari ${h.teramati}`}
                    </span>
                  </div>
                  <div style={{ height: '6px', width: '100%', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: h.teramati === 0 ? '0%' : `${(h.bermasalah / h.teramati) * 100}%`,
                        backgroundColor: h.bermasalah > 0 ? '#EF4444' : '#16A34A',
                        borderRadius: '4px',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '10.5px', color: '#94A3B8', marginTop: '9px', lineHeight: '15px' }}>
              "Belum teramati" berarti parameter itu tidak terlihat di foto survei — bukan berarti
              fasilitasnya tidak ada.
            </div>
          </div>

          {/* Keramaian - sering kosong, dan itu disebutkan apa adanya */}
          <div style={kartu}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <Users size={15} />
              <span>Pola keramaian</span>
            </div>
            {Object.keys(ringkasan.keramaian).length === 0 ? (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '11.5px', color: '#64748B', lineHeight: '17px' }}>
                <AlertTriangle size={15} color="#94A3B8" style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>
                  Belum ada data. Keramaian tidak bisa disimpulkan dari satu foto survei, dan DifaMap
                  belum punya sumber data kunjungan. Bagian ini menunggu sumber tersebut.
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Object.entries(ringkasan.keramaian).map(([nilai, jml]) => (
                  <div key={nilai}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: 600, marginBottom: '3px' }}>
                      <span>{LABEL_KERAMAIAN[nilai] ?? nilai}</span>
                      <span>{jml} pengamatan</span>
                    </div>
                    <div style={{ height: '6px', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${(jml / ringkasan.jumlah) * 100}%`,
                          backgroundColor: '#539BA9',
                          borderRadius: '4px',
                        }}
                      />
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: '10.5px', color: '#94A3B8', lineHeight: '15px' }}>
                  Dari {ringkasan.jumlah} pengamatan, hanya{' '}
                  {Object.values(ringkasan.keramaian).reduce((a, b) => a + b, 0)} yang keramaiannya
                  sempat teramati.
                </div>
              </div>
            )}
          </div>

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

      <div style={{ fontSize: '10.5px', color: '#94A3B8', lineHeight: '15px' }}>
        Nama dan letak tempat berasal dari basemap MAPID. Seluruh penilaian di panel ini dihitung
        dari hasil survei DifaMap yang berada dalam radius terpilih.
      </div>
    </aside>
  );
}
