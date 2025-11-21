const fs = require('fs');
const path = require('path');

// Créer le dossier icons s'il n'existe pas
const iconsDir = path.join(__dirname, 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Fonction pour créer un PNG minimal
function createMinimalPNG(size) {
  // PNG header et chunks pour une image violette simple
  // Format: PNG signature + IHDR chunk + IDAT chunk + IEND chunk

  const width = size;
  const height = size;

  // PNG Signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type (RGB)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdr = createChunk('IHDR', ihdrData);

  // Create simple gradient pixel data (purple gradient)
  const pixelData = [];
  for (let y = 0; y < height; y++) {
    pixelData.push(0); // filter type
    for (let x = 0; x < width; x++) {
      // Gradient from #667eea to #764ba2
      const t = (x + y) / (width + height);
      const r = Math.floor(102 + (118 - 102) * t);
      const g = Math.floor(126 + (75 - 126) * t);
      const b = Math.floor(234 + (162 - 234) * t);
      pixelData.push(r, g, b);
    }
  }

  const zlib = require('zlib');
  const compressed = zlib.deflateSync(Buffer.from(pixelData));
  const idat = createChunk('IDAT', compressed);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');

  const crc32 = require('zlib').crc32;
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

// Générer les icônes
console.log('Génération des icônes...');

try {
  const icon16 = createMinimalPNG(16);
  fs.writeFileSync(path.join(iconsDir, 'icon16.png'), icon16);
  console.log('✅ icon16.png créé');

  const icon48 = createMinimalPNG(48);
  fs.writeFileSync(path.join(iconsDir, 'icon48.png'), icon48);
  console.log('✅ icon48.png créé');

  const icon128 = createMinimalPNG(128);
  fs.writeFileSync(path.join(iconsDir, 'icon128.png'), icon128);
  console.log('✅ icon128.png créé');

  console.log('\n✨ Toutes les icônes ont été générées avec succès!');
  console.log('📁 Emplacement: public/icons/');
  console.log('\nRelancez "npm run build" pour inclure les icônes.');
} catch (error) {
  console.error('❌ Erreur:', error.message);
  process.exit(1);
}
