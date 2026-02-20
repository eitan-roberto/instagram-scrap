import { chromium } from 'playwright';
import fs from 'fs';

const TARGET = 'linda.sza';
const POST = 'DU01hE4jNLk';

const context = await chromium.launchPersistentContext('./user_data', {
  headless: true,
  viewport: { width: 1280, height: 720 },
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await context.newPage();

console.log('Opening post...');
await page.goto(`https://www.instagram.com/${TARGET}/p/${POST}/`, { 
  waitUntil: 'networkidle',
  timeout: 30000 
});

await page.waitForTimeout(3000);

// Debug: get all image sources
const allImages = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('img')).map(img => ({
    src: img.src,
    class: img.className,
    width: img.width,
    height: img.height
  })).filter(img => img.src && img.src.includes('cdn'));
});

console.log('\nAll images found:');
allImages.forEach((img, i) => {
  console.log(`\n${i + 1}. ${img.src.substring(0, 100)}...`);
  console.log(`   Class: ${img.class}`);
  console.log(`   Size: ${img.width}x${img.height}`);
});

fs.writeFileSync('debug-images.json', JSON.stringify(allImages, null, 2));
console.log('\n✅ Saved to debug-images.json');

await context.close();
