import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const inputPath = 'C:\\Users\\MyBook Prime\\.gemini\\antigravity-ide\\brain\\0cde8258-db5f-43e3-bc57-94957071ab43\\.user_uploaded\\media_1789040389434.jpg';
const outputDir = path.resolve('apps/web/public');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function main() {
  const image = sharp(inputPath);
  const metadata = await image.metadata();
  console.log('Original image:', metadata.width, 'x', metadata.height);

  // Dapatkan raw pixel data untuk mencari bounding box dari logo mark (di atas teks DIFAMAP)
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const channels = info.channels;

  // Nilai background hampir putih: R > 245, G > 245, B > 245
  function isBackground(x, y) {
    const idx = (y * width + x) * channels;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    return r > 240 && g > 240 && b > 240;
  }

  // Cari di mana teks DIFAMAP dimulai.
  // Dari gambar 1024x558, logo berada di bagian atas (y: ~80 sampai ~350), dan teks DIFAMAP dimulai sekitar y: 380
  // Mari kita scan baris demi baris antara y: 300 dan y: 400 untuk mencari gap putih antara logo dan teks!
  const nonBgPerLine = [];
  for (let y = 0; y < height; y++) {
    let count = 0;
    for (let x = 0; x < width; x++) {
      if (!isBackground(x, y)) count++;
    }
    nonBgPerLine.push(count);
  }

  // Cari batas bawah logo sebelum teks DIFAMAP
  // Di antara y: 300 dan 400, cari baris dengan nonBg paling sedikit (gap horizontal)
  let minNonBg = 999999;
  let gapY = 360;
  for (let y = 320; y < 400; y++) {
    if (nonBgPerLine[y] < minNonBg) {
      minNonBg = nonBgPerLine[y];
      gapY = y;
    }
  }

  console.log(`Batas bawah logo (gap pemisah teks): y = ${gapY}, nonBgCount = ${minNonBg}`);

  // Sekarang cari bounding box logo di area 0 <= y <= gapY
  let minX = width, maxX = 0, minY = gapY, maxY = 0;
  for (let y = 0; y < gapY; y++) {
    for (let x = 0; x < width; x++) {
      if (!isBackground(x, y)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  console.log(`Logo Bounding Box: x=[${minX}, ${maxX}], y=[${minY}, ${maxY}]`);
  console.log(`Logo Dimensions: ${maxX - minX} x ${maxY - minY}`);

  // Tambahkan sedikit padding (misal 10px)
  const padding = 12;
  const cropLeft = Math.max(0, minX - padding);
  const cropTop = Math.max(0, minY - padding);
  const cropWidth = Math.min(width - cropLeft, (maxX - minX) + padding * 2);
  const cropHeight = Math.min(height - cropTop, (maxY - minY) + padding * 2);

  // Buat square crop agar cocok sempurna untuk icon circular
  const size = Math.max(cropWidth, cropHeight) + 16;
  
  // 1. Crop logo asli
  const croppedLogoBuffer = await sharp(inputPath)
    .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();

  // 2. Buat versi dengan background transparan (semua pixel putih menjadi transparan)
  const { data: cropData, info: cropInfo } = await sharp(croppedLogoBuffer)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgbaBuffer = Buffer.alloc(cropInfo.width * cropInfo.height * 4);
  for (let i = 0; i < cropInfo.width * cropInfo.height; i++) {
    const r = cropData[i * cropInfo.channels];
    const g = cropData[i * cropInfo.channels + 1];
    const b = cropData[i * cropInfo.channels + 2];

    // Jika mendekati putih, buat transparan secara halus (anti-aliasing)
    // Nilai kecerahan
    const brightness = (r + g + b) / 3;
    let alpha = 255;
    if (brightness > 248) {
      alpha = 0;
    } else if (brightness > 230) {
      alpha = Math.round((248 - brightness) / (248 - 230) * 255);
    }

    rgbaBuffer[i * 4] = r;
    rgbaBuffer[i * 4 + 1] = g;
    rgbaBuffer[i * 4 + 2] = b;
    rgbaBuffer[i * 4 + 3] = alpha;
  }

  const transparentLogo = await sharp(rgbaBuffer, {
    raw: {
      width: cropInfo.width,
      height: cropInfo.height,
      channels: 4
    }
  }).png().toBuffer();

  // Simpan logo transparan ke apps/web/public/difamap-logo.png
  const logoPath = path.join(outputDir, 'difamap-logo.png');
  fs.writeFileSync(logoPath, transparentLogo);
  console.log(`✅ Saved transparent logo to: ${logoPath}`);

  // Simpan juga versi square icon 256x256 untuk avatar dan favicon
  const squareIcon = await sharp(transparentLogo)
    .resize(256, 256, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(path.join(outputDir, 'difamap-icon.png'));

  console.log(`✅ Saved square icon 256x256 to: ${path.join(outputDir, 'difamap-icon.png')}`);

  // Simpan juga versi dengan background putih melingkar
  const circularIcon = await sharp({
    create: {
      width: 256,
      height: 256,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
    .composite([
      {
        input: await sharp(transparentLogo)
          .resize(200, 200, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
          .png()
          .toBuffer(),
        gravity: 'center'
      }
    ])
    .png()
    .toFile(path.join(outputDir, 'difamap-circle-logo.png'));

  console.log(`✅ Saved circular logo to: ${path.join(outputDir, 'difamap-circle-logo.png')}`);
}

main().catch(console.error);
