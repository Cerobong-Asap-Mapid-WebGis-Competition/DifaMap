import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const outputDir = path.resolve('apps/web/public/markers');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Icon paths from MapCanvas.tsx
const ICONS = {
  plain: '', // Lingkaran putih polos
  trotoar: 'M12 3.4a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM12 8v6m0 0-2.5 6m2.5-6 2.5 6M8 11l4-2 4 2', // PEDESTRIAN_PATH
  halte: 'M6 5h12v9H6V5zm0 9v4m12-4v4M9 18v2m6-2v2M8.5 9.5h.01M15.5 9.5h.01', // BUS_STOP
  kesehatan: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6V4z', // HEALTHCARE
  mall: 'M6 8h12l-1 12H7L6 8zm3 0V6a3 3 0 0 1 6 0v2', // MALL
};

const COLORS = [
  { id: 'biru', name: 'Biru (Fasilitas/Tempat)', hex: '#2563EB' },
  { id: 'hijau', name: 'Hijau (Aksesibel >= 3.5)', hex: '#16A34A' },
  { id: 'kuning', name: 'Kuning (Cukup 2.5-3.5)', hex: '#F59E0B' },
  { id: 'merah', name: 'Merah (Kurang < 2.5)', hex: '#EF4444' },
  { id: 'kuning-brand', name: 'Kuning Brand DifaMap', hex: '#FDC323' },
];

function buildSurveyPinSvg(colorHex, iconKey) {
  const iconPath = ICONS[iconKey];
  const iconMarkup = iconPath
    ? `<g transform="translate(4.5, 4) scale(0.625)">
        <path d="${iconPath}" fill="none" stroke="${colorHex}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      </g>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 32" width="512" height="682">
  <defs>
    <filter id="shadow" x="-20%" y="-10%" width="140%" height="130%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="1" flood-opacity="0.25"/>
    </filter>
  </defs>
  <g filter="url(#shadow)">
    <path d="M12 0C5.373 0 0 5.373 0 12C0 20.5 10.5 30.75 11.08 31.33C11.58 31.83 12.42 31.83 12.92 31.33C13.5 30.75 24 20.5 24 12C24 5.373 18.627 0 12 0Z" fill="${colorHex}"/>
    <circle cx="12" cy="11.5" r="8.2" fill="#FFFFFF"/>
    ${iconMarkup}
  </g>
</svg>`;
}

function buildPlacePinSvg(colorHex, iconKey) {
  const iconPath = ICONS[iconKey] || ICONS.halte;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 32" width="512" height="682">
  <defs>
    <filter id="shadow" x="-20%" y="-10%" width="140%" height="130%">
      <feDropShadow dx="0" dy="1.5" stdDeviation="1" flood-opacity="0.25"/>
    </filter>
  </defs>
  <g filter="url(#shadow)">
    <path d="M12 0C5.373 0 0 5.373 0 12C0 20.5 10.5 30.75 11.08 31.33C11.58 31.83 12.42 31.83 12.92 31.33C13.5 30.75 24 20.5 24 12C24 5.373 18.627 0 12 0Z" fill="#FFFFFF"/>
    <path d="M12 1.5C6.2 1.5 1.5 6.2 1.5 12C1.5 19.5 10.6 28.8 11.3 29.5C11.7 29.9 12.3 29.9 12.7 29.5C13.4 28.8 22.5 19.5 22.5 12C22.5 6.2 17.8 1.5 12 1.5Z" fill="${colorHex}"/>
    <g transform="translate(2.5, 2.5) scale(0.79)">
      <path d="${iconPath}" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    </g>
  </g>
</svg>`;
}

async function run() {
  console.log('Generating markers in:', outputDir);
  const createdFiles = [];

  for (const c of COLORS) {
    for (const iconKey of Object.keys(ICONS)) {
      const fileNameBase = `pin-${c.id}-${iconKey}`;
      const svgContent = buildSurveyPinSvg(c.hex, iconKey);
      
      const svgPath = path.join(outputDir, `${fileNameBase}.svg`);
      fs.writeFileSync(svgPath, svgContent, 'utf-8');

      const pngPath = path.join(outputDir, `${fileNameBase}.png`);
      await sharp(Buffer.from(svgContent))
        .resize(512, 682, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(pngPath);

      createdFiles.push({ svg: svgPath, png: pngPath });
    }
  }

  // Tambahkan juga varian Pin Tempat (solid dengan border putih) khusus biru dan kuning-brand
  for (const c of [COLORS[0], COLORS[4]]) {
    for (const iconKey of ['halte', 'kesehatan', 'mall', 'trotoar']) {
      const fileNameBase = `pin-tempat-${c.id}-${iconKey}`;
      const svgContent = buildPlacePinSvg(c.hex, iconKey);

      const svgPath = path.join(outputDir, `${fileNameBase}.svg`);
      fs.writeFileSync(svgPath, svgContent, 'utf-8');

      const pngPath = path.join(outputDir, `${fileNameBase}.png`);
      await sharp(Buffer.from(svgContent))
        .resize(512, 682, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(pngPath);

      createdFiles.push({ svg: svgPath, png: pngPath });
    }
  }

  console.log(`Successfully generated ${createdFiles.length} marker sets (SVG + PNG)!`);
}

run().catch(console.error);
