import { chromium } from 'playwright';

const TARGET = 'linda.sza';

console.log('🔍 Debug Image Extraction\n');
console.log('Opening browser to see what images are found...\n');

const context = await chromium.launchPersistentContext('./user_data', {
  headless: false,
  viewport: { width: 1280, height: 800 }
});

const page = await context.newPage();

// Go to profile
console.log(`Going to @${TARGET} profile...`);
await page.goto(`https://www.instagram.com/${TARGET}/`, { 
  waitUntil: 'domcontentloaded',
  timeout: 30000 
});

await page.waitForTimeout(3000);

console.log('Current URL:', page.url());

if (page.url().includes('/accounts/login/')) {
  console.log('❌ Not logged in! Please login manually in the browser.');
  console.log('Then press Ctrl+C to stop and re-run.\n');
  // Keep browser open so user can login
  await new Promise(() => {});
}

// Scroll to load posts
console.log('\nScrolling to load posts...');
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(2000);
  console.log(`  Scroll ${i + 1}/3`);
}

// Get post links - same as working scraper
const links = await page.locator('a[href*="/p/"]').all();
const hrefs = await Promise.all(links.map(l => l.getAttribute('href')));
const postLinks = [...new Set(hrefs.filter(h => h && h.includes('/p/')))].slice(0, 5);

console.log(`\n✅ Found ${postLinks.length} posts`);
console.log('First post:', postLinks[0]);

// Go to first post
console.log('\nGoing to first post to extract images...');
await page.goto(`https://www.instagram.com${postLinks[0]}`, { 
  waitUntil: 'domcontentloaded',
  timeout: 20000 
});
await page.waitForTimeout(3000);

// Method 1: Get all img src (what the current broken script uses)
console.log('\n--- METHOD 1: All img src ---');
const method1 = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('img'))
    .filter(img => img.src && img.src.includes('cdninstagram.com') && img.width > 300)
    .map(img => ({ src: img.src.substring(0, 80), width: img.width }));
});
console.log(`Found ${method1.length} images:`);
method1.forEach((img, i) => console.log(`  ${i+1}. ${img.width}px - ${img.src}...`));

// Method 2: Working scraper method
console.log('\n--- METHOD 2: Working scraper method ---');
const method2 = await page.evaluate(() => {
  const urls = [];
  document.querySelectorAll('img').forEach(img => {
    const src = img.src;
    if (src && (src.includes('instagram.com') || src.includes('fbcdn.net'))) {
      // Filter out profile pictures
      if (!src.includes('/t51.2885-19/') && !src.includes('s150x150')) {
        urls.push(src);
      }
    }
  });
  return [...new Set(urls)];
});
console.log(`Found ${method2.length} images:`);
method2.forEach((url, i) => console.log(`  ${i+1}. ${url.substring(0, 80)}...`));

console.log('\n✅ Debug complete! Check which method found images.');
console.log('Press Ctrl+C to close browser when done.\n');

// Keep browser open
await new Promise(() => {});
