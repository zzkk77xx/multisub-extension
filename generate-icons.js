const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Paths
const logoPath = path.join(__dirname, 'public', 'icons', 'logo.png');
const iconsDir = path.join(__dirname, 'public', 'icons');

// Check if logo exists
if (!fs.existsSync(logoPath)) {
  console.error('❌ Logo file not found:', logoPath);
  console.error('Please add logo.png to public/icons/ first');
  process.exit(1);
}

// Create icons directory if it doesn't exist
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Icon sizes needed for Chrome extension
const sizes = [
  { size: 16, name: 'icon16.png' },
  { size: 48, name: 'icon48.png' },
  { size: 128, name: 'icon128.png' }
];

console.log('Generating icons from logo.png...\n');

// Generate each icon size
Promise.all(
  sizes.map(async ({ size, name }) => {
    const outputPath = path.join(iconsDir, name);

    await sharp(logoPath)
      .resize(size, size, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 0 } // Transparent background
      })
      .png()
      .toFile(outputPath);

    console.log(`✅ ${name} created (${size}x${size})`);
  })
)
.then(() => {
  console.log('\n✨ All icons generated successfully!');
  console.log('📁 Location: public/icons/');
  console.log('\nRun "npm run build" to include the icons in your extension.');
})
.catch(error => {
  console.error('❌ Error generating icons:', error.message);
  process.exit(1);
});
