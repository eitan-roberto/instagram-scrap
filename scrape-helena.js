import { chromium } from 'playwright';
import fs from 'fs';

const TARGET = 'helenabeckmann';
const LIMIT = 30;
const OUTPUT_DIR = './data';

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const context = await chromium.launchPersistentContext('./user_data', {
  headless: true,
  viewport: { width: 1280, height: 720 },
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await context.newPage();

console.log(`🎯 Scraping: ${TARGET}`);
console.log(`📊 Limit: ${LIMIT} posts\n`);

await page.goto(`https://www.instagram.com/${TARGET}/`, { 
  waitUntil: 'domcontentloaded',
  timeout: 30000 
});

await page.waitForTimeout(3000);

if (page.url().includes('/accounts/login/')) {
  console.log('❌ Not logged in!');
  await context.close();
  process.exit(1);
}

// Collect post links
const links = await page.locator('a[href*="/p/"]').all();
const hrefs = await Promise.all(links.map(l => l.getAttribute('href')));
let postLinks = [...new Set(
  hrefs
    .filter(h => h && h.includes('/p/'))
    .map(h => h.split('?')[0])
)].slice(0, LIMIT);

console.log(`✅ Found ${postLinks.length} posts\n`);

const scrapedData = [];

for (let i = 0; i < postLinks.length; i++) {
  const postUrl = `https://www.instagram.com${postLinks[i]}`;
  const shortcode = postLinks[i].split('/p/')[1]?.replace('/', '');
  console.log(`[${i + 1}/${postLinks.length}] ${shortcode}`);
  
  try {
    await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    
    const data = {
      postUrl,
      shortcode,
      caption: '',
      date: '',
      likes: '',
      imageUrls: [],
      isVideo: false
    };
    
    try {
      const captionEl = await page.locator('article h1, article span[class*="x1lliihq"]').first();
      data.caption = await captionEl.textContent({ timeout: 3000 }) || '';
    } catch (e) {}
    
    try {
      const timeEl = await page.locator('time').first();
      data.date = await timeEl.getAttribute('datetime') || '';
    } catch (e) {}
    
    try {
      const likesEl = await page.locator('section span:has-text("likes"), section span:has-text("like")').first();
      data.likes = await likesEl.textContent({ timeout: 2000 }) || '';
    } catch (e) {}
    
    const images = await page.evaluate(() => {
      const urls = [];
      document.querySelectorAll('img').forEach(img => {
        const src = img.src;
        if (src && (src.includes('instagram.com') || src.includes('fbcdn.net'))) {
          if (!src.includes('/t51.2885-19/') && !src.includes('s150x150')) {
            urls.push(src);
          }
        }
      });
      return [...new Set(urls)];
    });
    
    data.imageUrls = images;
    scrapedData.push(data);
    console.log(`   ✅ ${images.length} image(s)`);
    
  } catch (e) {
    console.log(`   ❌ Error: ${e.message.substring(0, 50)}`);
  }
  
  if (i < postLinks.length - 1) {
    await page.waitForTimeout(2000);
  }
}

// Save CSV
const headers = ['post_url', 'shortcode', 'caption', 'date', 'likes', 'image_count', 'image_urls'];
const rows = scrapedData.map(post => [
  post.postUrl,
  post.shortcode,
  `"${(post.caption || '').replace(/"/g, '""').replace(/\n/g, ' ')}"`,
  post.date,
  post.likes,
  post.imageUrls.length,
  post.imageUrls.join('|')
]);

const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
const outputFile = `${OUTPUT_DIR}/${TARGET}-scraped.csv`;
fs.writeFileSync(outputFile, csv);

console.log(`\n✅ Scraped ${scrapedData.length} posts to ${outputFile}`);
console.log(`📊 Total images: ${scrapedData.reduce((sum, p) => sum + p.imageUrls.length, 0)}`);

await context.close();
