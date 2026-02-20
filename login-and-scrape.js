import { chromium } from 'playwright';
import https from 'https';
import fs from 'fs';
import path from 'path';

const API_KEY = process.env.GEMINI_API_KEY;

const EMAIL = 'eitanjtwd@gmail.com';
const PASSWORD = 'Queseyo123123!a';
const PROFILES = ['linda.sza', 'lara_bsmnn', 'sina.anjulie', 'whatgigiwears', 'sofiamcoelho'];

const REPO_DIR = './repository';
const OUTFITS_DIR = path.join(REPO_DIR, 'outfits');
const SCENES_DIR = path.join(REPO_DIR, 'scenes');
const RAW_DIR = path.join(REPO_DIR, 'raw');
const DEBUG_DIR = path.join(REPO_DIR, 'debug');

[REPO_DIR, OUTFITS_DIR, SCENES_DIR, RAW_DIR, DEBUG_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

async function callGemini(payload, model) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${model}:generateContent?key=${API_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
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
    https.get(url, (res) => {
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
  const prompt = `Analyze this fashion photo and describe ONLY the outfit in this exact JSON format:

{
  "outfit": {
    "top": {
      "type": "describe the clothing item (shirt, blouse, sweater, etc)",
      "color": "specific color name",
      "material": "fabric type (cotton, silk, wool, etc)",
      "fit": "tight, loose, oversized, fitted, etc",
      "details": "patterns, textures, buttons, zippers, cutouts, etc"
    },
    "bottom": {
      "type": "pants, skirt, shorts, jeans, etc",
      "color": "specific color",
      "material": "fabric type",
      "fit": "fit description",
      "details": "style details"
    },
    "outerwear": {
      "type": "jacket, coat, blazer, cardigan, or null if none",
      "color": "color",
      "material": "fabric"
    },
    "accessories": ["list visible accessories: jewelry, bags, belts, scarves, hats, etc"],
    "footwear": {
      "type": "shoes, boots, sandals, sneakers, or null if not visible",
      "color": "color",
      "style": "casual, formal, sporty, etc"
    },
    "overall_style": "brief style description (casual, elegant, streetwear, bohemian, etc)"
  }
}

IMPORTANT: Return ONLY the JSON object, no markdown, no code blocks, no extra text.`;

  try {
    const response = await callGemini({
      contents: [{ parts: [{ inline_data: { mime_type: "image/jpeg", data: imageB64 } }, { text: prompt }] }]
    }, 'gemini-2.5-flash');

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Save raw response for debugging
    const rawResponse = {
      fullResponse: text,
      timestamp: new Date().toISOString()
    };

    // Try to extract JSON from code blocks first
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      return { ...JSON.parse(codeBlockMatch[1].trim()), _debug: rawResponse };
    }

    // Try to find JSON object directly
    const jsonMatch = text.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      return { ...JSON.parse(jsonMatch[1].trim()), _debug: rawResponse };
    }

    // If all else fails, return raw text
    return { raw: text.substring(0, 500), _debug: rawResponse };
  } catch (e) {
    return { error: 'Failed to parse', raw: text?.substring(0, 500) || 'No response', _debug: { error: e.message, fullResponse: text } };
  }
}

async function extractScene(imageB64) {
  const prompt = `Analyze this fashion photo and describe the SCENE (location, lighting, pose) in this exact JSON format:

{
  "scene": {
    "location": {
      "type": "indoor or outdoor",
      "setting": "describe the environment: street, studio, nature, home, cafe, beach, city, etc",
      "description": "detailed description of surroundings and background elements",
      "background_elements": ["list visible objects, furniture, nature, buildings, etc"]
    },
    "lighting": {
      "type": "natural, artificial, or mixed",
      "quality": "soft, harsh, dramatic, diffused, golden, etc",
      "direction": "front, side, back, top, bottom lighting",
      "time_of_day": "morning, afternoon, golden hour, evening, night, or unknown",
      "mood": "warm, cool, bright, dark, moody, airy, etc"
    },
    "pose": {
      "body_position": "standing, sitting, walking, leaning, crouching, etc",
      "orientation": "front facing, side profile, back, three-quarter view",
      "angle": "eye level, low angle, high angle shot",
      "expression": "neutral, smiling, serious, laughing, etc",
      "gesture": "what are hands doing, body language",
      "overall_vibe": "confident, relaxed, playful, serious, mysterious, etc"
    },
    "composition": {
      "framing": "full body, mid shot, close up, portrait",
      "camera_distance": "wide, medium, tight",
      "depth_of_field": "sharp focus, blurred background, or all in focus"
    }
  }
}

IMPORTANT: Return ONLY the JSON object, no markdown, no code blocks, no extra text. Focus on WHERE and HOW the photo was taken, not what the person is wearing.`;

  try {
    const response = await callGemini({
      contents: [{ parts: [{ inline_data: { mime_type: "image/jpeg", data: imageB64 } }, { text: prompt }] }]
    }, 'gemini-2.5-flash');

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Save raw response for debugging
    const rawResponse = { 
      fullResponse: text,
      timestamp: new Date().toISOString()
    };
    
    // Try to extract JSON from code blocks first
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      return { ...JSON.parse(codeBlockMatch[1].trim()), _debug: rawResponse };
    }
    
    // Try to find JSON object directly
    const jsonMatch = text.match(/(\{[\s\S]*\})/);
    if (jsonMatch) {
      return { ...JSON.parse(jsonMatch[1].trim()), _debug: rawResponse };
    }
    
    // If all else fails, return raw text
    return { raw: text.substring(0, 500), _debug: rawResponse };
  } catch (e) {
    return { error: 'Failed to parse', raw: text?.substring(0, 500) || 'No response', _debug: { error: e.message, fullResponse: text } };
  }
}

console.log('🔐 Instagram Login + Scraper\n');
console.log('='.repeat(70));

const context = await chromium.launchPersistentContext('./user_data', {
  headless: false,
  viewport: { width: 1280, height: 800 }
});

const page = await context.newPage();

// LOGIN
console.log('\n📱 Checking login status...');
await page.goto('https://www.instagram.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000);

// Check if already logged in (no login link visible)
const loginLink = await page.locator('text=Log in').first();
const needsLogin = await loginLink.isVisible().catch(() => false);

if (!needsLogin && !page.url().includes('/accounts/login/')) {
  console.log('✅ Already logged in!\n');
} else {
  console.log('🔐 Need to login...');

  // Click Log in if link visible
  if (needsLogin) {
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
}

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
        const urls = [];
        document.querySelectorAll('img').forEach(img => {
          const src = img.src;
          if (src && (src.includes('instagram.com') || src.includes('fbcdn.net'))) {
            // Filter out profile pictures and small images
            if (!src.includes('/t51.2885-19/') && !src.includes('s150x150') && img.width > 200) {
              urls.push(src);
            }
          }
        });
        return [...new Set(urls)];
      });

      posts.push({ shortcode, url: `https://www.instagram.com${link}`, images: imageUrls.slice(0, 5) });
    }

    fs.writeFileSync(path.join(handleRawDir, 'posts.json'), JSON.stringify(posts, null, 2));

    // Extract outfits and scenes
    for (const post of posts) {
      if (post.images.length === 0) continue;

      const postScenesDir = path.join(handleScenesDir, post.shortcode);
      const postDebugDir = path.join(DEBUG_DIR, handle, post.shortcode);
      if (!fs.existsSync(postScenesDir)) fs.mkdirSync(postScenesDir, { recursive: true });
      if (!fs.existsSync(postDebugDir)) fs.mkdirSync(postDebugDir, { recursive: true });

      console.log(`\n   Processing ${post.shortcode}...`);

      try {
        // Outfit from img1
        console.log('   📸 Outfit...');
        const img1B64 = await downloadImage(post.images[0]);
        const outfit = await extractOutfit(img1B64);
        
        // Save outfit data
        fs.writeFileSync(path.join(handleOutfitsDir, `${post.shortcode}.json`), JSON.stringify({ handle, shortcode: post.shortcode, source_url: post.images[0], outfit: outfit._debug ? { ...outfit, _debug: undefined } : outfit }, null, 2));
        
        // Save debug raw response
        if (outfit._debug) {
          fs.writeFileSync(path.join(postDebugDir, 'outfit-raw.json'), JSON.stringify(outfit._debug, null, 2));
        }
        console.log('   ✅ Outfit saved');

        // Scenes from all images
        for (let i = 0; i < post.images.length; i++) {
          console.log(`   📸 Scene img${i+1}...`);
          const imgB64 = await downloadImage(post.images[i]);
          const scene = await extractScene(imgB64);
          
          // Save scene data
          fs.writeFileSync(path.join(postScenesDir, `img${i+1}.json`), JSON.stringify({ handle, shortcode: post.shortcode, image_index: i+1, source_url: post.images[i], scene: scene._debug ? { ...scene, _debug: undefined } : scene }, null, 2));
          
          // Save debug raw response
          if (scene._debug) {
            fs.writeFileSync(path.join(postDebugDir, `scene-img${i+1}-raw.json`), JSON.stringify(scene._debug, null, 2));
          }
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
