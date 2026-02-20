#!/usr/bin/env node
/**
 * Build repository from existing CSV data
 * Uses helenabeckmann-scraped.csv to populate outfits/scenes
 */

import 'dotenv/config';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { SocksProxyAgent } from 'socks-proxy-agent';

const PROXY_URL = 'socks5://oH2XZer6WzFTaY299bVr9NwL:QrYkpu4itrGTyXnxXAQK4U11@us.socks.nordhold.net:1080';
const agent = new SocksProxyAgent(PROXY_URL);
const API_KEY = process.env.GEMINI_API_KEY;

const CSV_PATH = './data/helenabeckmann-scraped.csv';
const REPO_DIR = './repository';
const OUTFITS_DIR = path.join(REPO_DIR, 'outfits', 'helenabeckmann');
const SCENES_DIR = path.join(REPO_DIR, 'scenes', 'helenabeckmann');

// Create directories
[OUTFITS_DIR, SCENES_DIR].forEach(dir => {
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

function parseCSV(csvPath) {
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.trim().split('\n');
  const posts = [];
  
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length < 7) continue;
    
    const imageUrls = parts[6].split('|').filter(u => u && u.startsWith('http'));
    
    posts.push({
      shortcode: parts[1],
      caption: parts[2],
      date: parts[3],
      images: imageUrls
    });
  }
  return posts;
}

async function main() {
  console.log('📦 Building repository from helenabeckmann CSV...\n');
  
  const posts = parseCSV(CSV_PATH);
  console.log(`Found ${posts.length} posts\n`);
  
  let outfitCount = 0;
  let sceneCount = 0;
  
  for (const post of posts) {
    console.log(`Post: ${post.shortcode}`);
    console.log(`Images: ${post.images.length}`);
    
    if (post.images.length === 0) {
      console.log('⚠️  No images, skipping\n');
      continue;
    }
    
    // Create scene folder
    const postScenesDir = path.join(SCENES_DIR, post.shortcode);
    if (!fs.existsSync(postScenesDir)) fs.mkdirSync(postScenesDir, { recursive: true });
    
    try {
      // Extract outfit from first image
      console.log('  📸 Extracting outfit...');
      const img1B64 = await downloadImage(post.images[0]);
      const outfit = await extractOutfit(img1B64);
      
      fs.writeFileSync(
        path.join(OUTFITS_DIR, `${post.shortcode}.json`),
        JSON.stringify({
          handle: 'helenabeckmann',
          shortcode: post.shortcode,
          source_url: post.images[0],
          extracted_at: new Date().toISOString(),
          outfit
        }, null, 2)
      );
      outfitCount++;
      console.log('  ✅ Outfit saved');
      
      // Extract scenes from all images
      for (let i = 0; i < post.images.length && i < 5; i++) {
        console.log(`  📸 Extracting scene img${i+1}...`);
        const imgB64 = await downloadImage(post.images[i]);
        const scene = await extractScene(imgB64);
        
        fs.writeFileSync(
          path.join(postScenesDir, `img${i+1}.json`),
          JSON.stringify({
            handle: 'helenabeckmann',
            shortcode: post.shortcode,
            image_index: i + 1,
            source_url: post.images[i],
            extracted_at: new Date().toISOString(),
            scene
          }, null, 2)
        );
        sceneCount++;
        console.log(`  ✅ Scene img${i+1} saved`);
        
        await new Promise(r => setTimeout(r, 1000));
      }
      
    } catch (err) {
      console.log(`  ❌ Error: ${err.message}`);
    }
    
    console.log('');
  }
  
  console.log('='.repeat(50));
  console.log('✅ Repository built!');
  console.log(`Outfits: ${outfitCount}`);
  console.log(`Scenes: ${sceneCount}`);
  console.log('='.repeat(50));
}

main().catch(console.error);
