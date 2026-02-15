import sharp from 'sharp';
import fs from 'fs';

const inputImage = './test-watermark/google-generated.jpg';
const outputDir = './crop-demos';

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// Get image dimensions
const metadata = await sharp(inputImage).metadata();
const width = metadata.width;
const height = metadata.height;

console.log(`Original: ${width}x${height}`);
console.log('');

// 4:5 from TOP (keep top, remove bottom)
const targetRatio = 4/5; // 0.8
const newHeight = Math.floor(width / targetRatio);

await sharp(inputImage)
  .extract({ left: 0, top: 0, width: width, height: newHeight })
  .toFile(`${outputDir}/crop-4-5-from-top.jpg`);

console.log(`✅ 4:5 from TOP: ${width}x${newHeight}`);
console.log(`   Kept: Top portion`);
console.log(`   Removed: Bottom ${height - newHeight}px`);
console.log(`   (Removes watermark + extra bottom)`);
