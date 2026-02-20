#!/usr/bin/env node
/**
 * Repository Builder - Scrape and extract outfits + scenes
 * Usage: node build-repository.js <instagram-handle>
 */

import 'dotenv/config';
import { SocksProxyAgent } from 'socks-proxy-agent';
import https from 'https';
import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

const PROXY_URL = 'socks5://oH2XZer6WzFTaY299bVr9NwL:QrYkpu4itrGTyXnxXAQK4U11@us.socks.nordhold.net:1080';
const agent = new SocksProxyAgent(PROXY_URL);
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error('❌ GEMINI_API_KEY not found');
  process.exit(1);
}

const PROFILES = ['linda.sza', 'lara_bsmnn', 'sina.anjulie', 'whatgigiwears', 'sofiamcoelho'];
const REPO_DIR = './repository';
const OUTFITS_DIR = path.join(REPO_DIR, 'outfits');
const SCENES_DIR = path.join(REPO_DIR, 'scenes');

// Create directories
[REPO_DIR, OUTFITS_DIR, SCENES_DIR].forEach(dir => {
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
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(payload));
    req.end();
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
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
    }).on('error', reject).setTimeout(30000, function() {
      this.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

async function extractOutfit(imageB64) {
  const prompt = `Analyze this fashion photo and extract ONLY the outfit details. Return as JSON:

{
  "outfit": {
    "top": {
      "type": "shirt/blouse/sweater/etc",
      "color": "specific color",
      "material": "fabric type",
      "fit": "loose/tight/oversized/etc",
      "details": "patterns, textures, special features"
    },
    "bottom": {
      "type": "pants/skirt/shorts/etc",
      "color": "specific color",
      "material": "fabric type",
      "fit": "loose/tight/etc",
      "details": "patterns, textures"
    },
    "outerwear": {
      "type": "jacket/coat/blazer/etc or null",
      "color": "specific color",
      "material": "fabric type"
    },
    "accessories": ["list of jewelry, bags, belts, etc"],
    "footwear": {
      "type": "shoes/boots/etc or null",
      "color": "specific color",
      "style": "casual/formal/etc"
    },
    "overall_style": "casual/formal/streetwear/etc"
  }
}

Focus only on clothing and accessories. Be very specific about colors, materials, and fit.`;

  const response = await callGemini({
    contents: [{
      parts: [
        { inline_data: { mime_type: "image/jpeg", data: imageB64 } },
        { text: prompt }
      ]
    }]
  }, 'gemini-2.5-flash');

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  // Extract JSON
  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || [null, text];
    return JSON.parse(jsonMatch[1].trim());
  } catch (e) {
    return { raw: text, error: 'Failed to parse JSON' };
  }
}

async function extractScene(imageB64) {
  const prompt = `Analyze this fashion photo and extract the scene details. Return as JSON:

{
  "scene": {
    "location": {
      "type": "indoor/outdoor",
      "setting": "street/studio/nature/home/cafe/etc",
      "description": "detailed description of the environment",
      "background_elements": ["list of visible elements"]
    },
    "lighting": {
      "type": "natural/artificial/mixed",
      "quality": "soft/harsh/dramatic/etc",
      "direction": "front/side/back/top/etc",
      "time_of_day": "morning/afternoon/golden hour/night/etc",
      "mood": "warm/cool/bright/dark/etc"
    },
    "pose": {
      "body_position": "standing/sitting/walking/etc",
      "orientation": "front/side/back/three-quarter",
      "angle": "eye level/low angle/high angle",
      "expression": "neutral/smiling/serious/etc",
      "gesture": "hands position, what they're doing",
      "overall_vibe": "confident/relaxed/playful/etc"
    },
    "composition": {
      "framing": "full body/mid shot/close up",
      "camera_distance": "wide/medium/close",
      "depth_of_field": "sharp/blurred background"
    }
  }
}

Focus on location, lighting, and pose - NOT the outfit.`;

  const response = await callGemini({
    contents: [{
      parts: [
        { inline_data: { mime_type: "image/jpeg", data: imageB64 } },
        { text: prompt }
      ]
    }]
  }, 'gemini-2.5-flash');

  const text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  try {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || [null, text];
    return JSON.parse(jsonMatch[1].trim());
  } catch (e) {
    return { raw: text, error: 'Failed to parse JSON' };
  }
}

async function scrapeProfile(handle) {
  console.log(`\n🔍 Scraping @${handle}...`);
  
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      `--proxy-server=${PROXY_URL}`
    ]
  });
  
  const page = await browser.newPage();
  await page.goto(`https://www.instagram.com/${handle}/`, { waitUntil: 'networkidle2', timeout: 60000 });
  
  // Wait for posts to load
  await page.waitForSelector('article a[href*="/p/"]', { timeout: 30000 });
  
  // Get post links
  const postLinks = await page.evaluate(() => {
    const links = [];
    document.querySelectorAll('article a[href*="/p/"]').forEach(a => {
      const href = a.getAttribute('href');
      if (href && !links.includes(href)) links.push(href);
    });
    return links.slice(0, 20); // Limit to 20 posts
  });
  
  console.log(`   Found ${postLinks.length} posts`);
  
  const posts = [];
  
  for (const link of postLinks.slice(0, 10)) { // Process max 10 posts
    try {
      const shortcode = link.split('/p/')[1]?.replace('/', '');
      if (!shortcode) continue;
      
      console.log(`   Processing post: ${shortcode}`);
      
      await page.goto(`https://www.instagram.com${link}`, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForTimeout(2000);
      
      // Get image URLs
      const images = await page.evaluate(() => {
        const imgs = [];
        document.querySelectorAll('article img').forEach(img => {
          const src = img.src;
          if (src && src.includes('instagram.com') && !imgs.includes(src)) {
            imgs.push(src);
          }
        });
        return imgs;
      });
      
      posts.push({ shortcode, images: images.slice(0, 5) }); // Max 5 images per post
      
    } catch (err) {
      console.log(`   ⚠️  Error processing post: ${err.message}`);
    }
  }
  
  await browser.close();
  return posts;
}

async function processProfile(handle) {
  const posts = await scrapeProfile(handle);
  
  console.log(`\n📊 Processing ${posts.length} posts for @${handle}...`);
  
  // Create handle-specific directories
  const handleOutfitsDir = path.join(OUTFITS_DIR, handle);
  const handleScenesDir = path.join(SCENES_DIR, handle);
  [handleOutfitsDir, handleScenesDir].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
  
  for (const post of posts) {
    console.log(`\n   Post: ${post.shortcode}`);
    
    if (post.images.length === 0) {
      console.log('   ⚠️  No images, skipping');
      continue;
    }
    
    // Create scene folder for this post
    const postScenesDir = path.join(handleScenesDir, post.shortcode);
    if (!fs.existsSync(postScenesDir)) fs.mkdirSync(postScenesDir, { recursive: true });
    
    try {
      // Process first image for outfit
      console.log('   📸 Extracting outfit from img1...');
      const img1B64 = await downloadImage(post.images[0]);
      const outfit = await extractOutfit(img1B64);
      
      const outfitPath = path.join(handleOutfitsDir, `${post.shortcode}.json`);
      fs.writeFileSync(outfitPath, JSON.stringify({
        handle,
        shortcode: post.shortcode,
        source_url: post.images[0],
        extracted_at: new Date().toISOString(),
        outfit
      }, null, 2));
      console.log('   ✅ Outfit saved');
      
      // Process all images for scenes
      for (let i = 0; i < post.images.length; i++) {
        console.log(`   📸 Extracting scene from img${i+1}...`);
        const imgB64 = await downloadImage(post.images[i]);
        const scene = await extractScene(imgB64);
        
        const scenePath = path.join(postScenesDir, `img${i+1}.json`);
        fs.writeFileSync(scenePath, JSON.stringify({
          handle,
          shortcode: post.shortcode,
          image_index: i + 1,
          source_url: post.images[i],
          extracted_at: new Date().toISOString(),
          scene
        }, null, 2));
        console.log(`   ✅ Scene img${i+1} saved`);
        
        // Wait between API calls
        await new Promise(r => setTimeout(r, 1000));
      }
      
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
    }
  }
  
  console.log(`\n✅ @${handle} complete!`);
}

async function main() {
  console.log('🏗️  Building Repository...\n');
  console.log('='.repeat(70));
  
  for (const handle of PROFILES) {
    await processProfile(handle);
    
    // Wait between profiles
    if (handle !== PROFILES[PROFILES.length - 1]) {
      console.log('\n⏳ Waiting 10s before next profile...');
      await new Promise(r => setTimeout(r, 10000));
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('🎉 Repository Build Complete!');
  console.log('='.repeat(70));
  console.log(`\nOutfits: ${OUTFITS_DIR}/`);
  console.log(`Scenes: ${SCENES_DIR}/`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
