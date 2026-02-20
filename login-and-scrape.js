import { chromium } from 'playwright';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { SocksProxyAgent } from 'socks-proxy-agent';

const PROXY_URL = 'socks5://oH2XZer6WzFTaY299bVr9NwL:QrYkpu4itrGTyXnxXAQK4U11@us.socks.nordhold.net:1080';
const agent = new SocksProxyAgent(PROXY_URL);
const API_KEY = process.env.GEMINI_API_KEY;

const EMAIL = 'eitanjtwd@gmail.com';
const PASSWORD = 'Queseyo123123!a';
const PROFILES = ['linda.sza', 'lara_bsmnn', 'sina.anjulie', 'whatgigiwears', 'sofiamcoelho'];

const REPO_DIR = './repository';
const OUTFITS_DIR = path.join(REPO_DIR, 'outfits');
const SCENES_DIR = path.join(REPO_DIR, 'scenes');
const RAW_DIR = path.join(REPO_DIR, 'raw');

[REPO_DIR, OUTFITS_DIR, SCENES_DIR, RAW_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

async function callGemini(payload, model) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${model}:generateContent?key=${API_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      agent
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

async function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { agent }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
    }).on('error', reject);
  });
}

async function extractOutfit(imageB64) {
  const prompt = `Analyze this fashion photo and extract ONLY the outfit details. Return as JSON with fields: outfit.top, outfit.bottom, outfit.outerwear, outfit.accessories, outfit.footwear, outfit.overall_style. Be specific about colors and materials.`;
  
  const response = await callGemini({
    contents: [{ parts: [{ inline_data: { mime_type: "image/jpeg", data: imageB64 } }, { text: prompt }] }]
  }, 'gemini-2.5-flash');

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || [null, text];
    return JSON.parse(jsonMatch[1].trim());
  } catch (e) {
    return { raw: text };
  }
}

async function extractScene(imageB64) {
  const prompt = `Analyze this fashion photo and extract scene details. Return as JSON with fields: scene.location, scene.lighting, scene.pose, scene.composition. Focus on location, lighting, and pose - NOT the outfit.`;
  
  const response = await callGemini({
    contents: [{ parts: [{ inline_data: { mime_type: "image/jpeg", data: imageB64 } }, { text: prompt }] }]
  }, 'gemini-2.5-flash');

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || [null, text];
    return JSON.parse(jsonMatch[1].trim());
  } catch (e) {
    return { raw: text };
  }
}

console.log('🔐 Instagram Login + Scraper\n');
console.log('='.repeat(70));

const context = await chromium.launchPersistentContext('./user_data', {
  headless: false,
  viewport: { width: 1280, height: 800 },

const page = await context.newPage();

// LOGIN
console.log('\n📱 Logging in...');
await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000);

// Click Log in
const loginLink = await page.locator('text=Log in').first();
if (await loginLink.isVisible().catch(() => false)) {
  await loginLink.click();
  await page.waitForTimeout(3000);
}

// Fill form
await page.waitForSelector('input[name="email"], input[name="username"]', { timeout: 30000 });
const usernameField = await page.locator('input[name="email"], input[name="username"]').first();
const passwordField = await page.locator('input[name="pass"], input[type="password"]').first();

await usernameField.fill(EMAIL);
await passwordField.fill(PASSWORD);
await passwordField.press('Enter');

await page.waitForTimeout(8000);

if (page.url().includes('/accounts/login/')) {
  console.log('❌ Login failed');
  await context.close();
  process.exit(1);
}

console.log('✅ Logged in!\n');

// SCRAPE PROFILES
for (const handle of PROFILES) {
  console.log(`${'='.repeat(70)}`);
  console.log(`🔍 Scraping @${handle}...`);
  
  const handleOutfitsDir = path.join(OUTFITS_DIR, handle);
  const handleScenesDir = path.join(SCENES_DIR, handle);
  const handleRawDir = path.join(RAW_DIR, handle);
  [handleOutfitsDir, handleScenesDir, handleRawDir].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
  
  try {
    await page.goto(`https://www.instagram.com/${handle}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    if (page.url().includes('/accounts/login/')) {
      console.log('   ❌ Session expired, re-logging...');
      break; // Stop scraping
    }
    
    // Scroll
    console.log('   📜 Scrolling...');
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);
    }
    
    // Get posts
    const links = await page.locator(`a[href*="/${handle}/p/"]`).all();
    const hrefs = await Promise.all(links.map(l => l.getAttribute('href')));
    const postLinks = [...new Set(hrefs.filter(h => h && h.includes('/p/')))].slice(0, 15);
    
    console.log(`   📊 Found ${postLinks.length} posts`);
    
    const posts = [];
    for (const link of postLinks) {
      const shortcode = link.split('/p/')[1]?.replace('/', '');
      if (!shortcode) continue;
      
      console.log(`   Post: ${shortcode}`);
      
      await page.goto(`https://www.instagram.com${link}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);
      
      const imageUrls = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('img'))
          .filter(img => img.src && img.src.includes('cdninstagram.com') && img.src.includes('.jpg') && img.width > 300)
          .map(img => img.src);
      });
      
      posts.push({ shortcode, url: `https://www.instagram.com${link}`, images: imageUrls.slice(0, 5) });
    }
    
    fs.writeFileSync(path.join(handleRawDir, 'posts.json'), JSON.stringify(posts, null, 2));
    
    // Extract outfits and scenes
    for (const post of posts) {
      if (post.images.length === 0) continue;
      
      const postScenesDir = path.join(handleScenesDir, post.shortcode);
      if (!fs.existsSync(postScenesDir)) fs.mkdirSync(postScenesDir, { recursive: true });
      
      console.log(`\n   Processing ${post.shortcode}...`);
      
      try {
        // Outfit from img1
        console.log('   📸 Outfit...');
        const img1B64 = await downloadImage(post.images[0]);
        const outfit = await extractOutfit(img1B64);
        fs.writeFileSync(path.join(handleOutfitsDir, `${post.shortcode}.json`), JSON.stringify({ handle, shortcode: post.shortcode, source_url: post.images[0], outfit }, null, 2));
        console.log('   ✅ Outfit saved');
        
        // Scenes from all images
        for (let i = 0; i < post.images.length; i++) {
          console.log(`   📸 Scene img${i+1}...`);
          const imgB64 = await downloadImage(post.images[i]);
          const scene = await extractScene(imgB64);
          fs.writeFileSync(path.join(postScenesDir, `img${i+1}.json`), JSON.stringify({ handle, shortcode: post.shortcode, image_index: i+1, source_url: post.images[i], scene }, null, 2));
          console.log('   ✅ Scene saved');
          await new Promise(r => setTimeout(r, 1000));
        }
      } catch (e) {
        console.log(`   ❌ Error: ${e.message}`);
      }
    }
    
    console.log(`   ✅ @${handle} complete!\n`);
    
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}\n`);
  }
}

await context.close();
console.log('='.repeat(70));
console.log('🎉 DONE!');
