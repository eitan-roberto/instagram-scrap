import sharp from 'sharp';
import fs from 'fs';

const inputImage = './test-watermark/google-generated.jpg';
const outputDir = './crop-demos';

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// Get image dimensions
const metadata = await sharp(inputImage).metadata();
const width = metadata.width;
const height = metadata.height;

console.log(`Original: ${width}x${height} (${(width/height).toFixed(3)} ratio)`);
console.log('');

// Option 1: Bottom crop only (remove watermark)
const bottomCropHeight = Math.floor(height * 0.95);
await sharp(inputImage)
  .extract({ left: 0, top: 0, width: width, height: bottomCropHeight })
  .toFile(`${outputDir}/crop-bottom-only.jpg`);
console.log(`✅ Bottom crop: ${width}x${bottomCropHeight} (removed bottom 5%)`);

// Option 2: Centered 4:5 crop (Instagram feed)
const targetRatio45 = 4/5; // 0.8
const newHeight45 = Math.floor(width / targetRatio45);
const topOffset45 = Math.floor((height - newHeight45) / 2);
await sharp(inputImage)
  .extract({ left: 0, top: topOffset45, width: width, height: newHeight45 })
  .toFile(`${outputDir}/crop-4-5-centered.jpg`);
console.log(`✅ 4:5 centered: ${width}x${newHeight45} (removed top/bottom equally)`);

// Option 3: Centered 1:1 crop (Instagram square)
const squareSize = Math.min(width, height);
const leftOffset = Math.floor((width - squareSize) / 2);
const topOffset = Math.floor((height - squareSize) / 2);
await sharp(inputImage)
  .extract({ left: leftOffset, top: topOffset, width: squareSize, height: squareSize })
  .toFile(`${outputDir}/crop-1-1-square.jpg`);
console.log(`✅ 1:1 square: ${squareSize}x${squareSize} (centered)`);

// Option 4: 9:16 centered ( Stories/Reels )
const targetRatio916 = 9/16; // 0.5625
if (width / height > targetRatio916) {
  // Image is wider than 9:16, crop sides
  const newWidth916 = Math.floor(height * targetRatio916);
  const leftOffset916 = Math.floor((width - newWidth916) / 2);
  await sharp(inputImage)
    .extract({ left: leftOffset916, top: 0, width: newWidth916, height: height })
    .toFile(`${outputDir}/crop-9-16-centered.jpg`);
  console.log(`✅ 9:16 centered: ${newWidth916}x${height} (cropped sides)`);
} else {
  // Image is taller than 9:16, crop top/bottom
  const newHeight916 = Math.floor(width / targetRatio916);
  const topOffset916 = Math.floor((height - newHeight916) / 2);
  await sharp(inputImage)
    .extract({ left: 0, top: topOffset916, width: width, height: newHeight916 })
    .toFile(`${outputDir}/crop-9-16-centered.jpg`);
  console.log(`✅ 9:16 centered: ${width}x${newHeight916} (cropped top/bottom)`);
}

console.log('');
console.log(`📁 Demo images saved to: ${outputDir}/`);
console.log('Compare these to see which crop looks best!');
