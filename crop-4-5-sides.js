import sharp from 'sharp';
import fs from 'fs';

const inputImage = './test-watermark/google-generated.jpg';
const outputDir = './crop-demos';

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

const metadata = await sharp(inputImage).metadata();
const width = metadata.width;
const height = metadata.height;

console.log(`Original: ${width}x${height}`);
console.log('');

// 4:5 from TOP + 1% from each side
const targetRatio = 4/5;
const newHeight = Math.floor(width / targetRatio);

// Calculate side crop (1% from each side = 2% total)
const sideCropPercent = 1;
const newWidth = Math.floor(width * (1 - sideCropPercent * 2 / 100));
const leftOffset = Math.floor((width - newWidth) / 2);

await sharp(inputImage)
  .extract({ 
    left: leftOffset, 
    top: 0, 
    width: newWidth, 
    height: newHeight 
  })
  .toFile(`${outputDir}/crop-4-5-top-sides.jpg`);

console.log(`✅ 4:5 from TOP + ${sideCropPercent}% sides:`);
console.log(`   Original: ${width}x${height}`);
console.log(`   Final: ${newWidth}x${newHeight}`);
console.log(`   Removed: Bottom ${height - newHeight}px + ${leftOffset}px from each side`);
