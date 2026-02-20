#!/usr/bin/env node
/**
 * Single Post Debug - Process only Post 1 with detailed logging
 */

import 'dotenv/config';
import { SocksProxyAgent } from 'socks-proxy-agent';
import https from 'https';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const PROXY_URL = 'socks5://oH2XZer6WzFTaY299bVr9NwL:QrYkpu4itrGTyXnxXAQK4U11@us.socks.nordhold.net:1080';
const agent = new SocksProxyAgent(PROXY_URL);
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error('❌ GEMINI_API_KEY not found');
  process.exit(1);
}

const identityImagePath = './src/models/israeli-cute.png';
const outputDir = './output/helena-cropped-fixed';
const csvPath = './data/helenabeckmann-scraped.csv';

const TARGET_RATIO = 4/5;
const SIDE_CROP_PERCENT = 5;

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('🔍 DEBUG MODE - Processing ONLY Post 1\n');
console.log('='.repeat(70));

function downloadImage(url) {
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

async function cropTo45FromTop(inputPath, outputPath) {
  try {
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    const sideCrop = Math.round(metadata.width * (SIDE_CROP_PERCENT / 100));
    const croppedWidth = metadata.width - (sideCrop * 2);
    const targetHeight = Math.round(croppedWidth / TARGET_RATIO);
    const cropHeight = Math.min(targetHeight, metadata.height);
    
    await image.extract({ left: sideCrop, top: 0, width: croppedWidth, height: cropHeight }).toFile(outputPath);
    console.log(`   ✂️  Cropped: ${croppedWidth}x${cropHeight}`);
    return true;
  } catch (e) {
    console.log(`   ⚠️  Crop failed: ${e.message}`);
    fs.copyFileSync(inputPath, outputPath);
    return false;
  }
}

async function generateImage(imgUrl, imgIndex, postDir, identityB64, img1B64, sourceIndex, totalSources) {
  console.log(`\n  📸 IMAGE ${imgIndex} (trying source ${sourceIndex}/${totalSources})`);
  console.log('  '.repeat(50));
  
  const imgDir = path.join(postDir, `img${imgIndex}`);
  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
  
  try {
    console.log('  1️⃣  Downloading Instagram reference...');
    const instagramB64 = await downloadImage(imgUrl);
    fs.writeFileSync(path.join(imgDir, 'original-reference.jpg'), Buffer.from(instagramB64, 'base64'));
    console.log('     ✅ Downloaded');
    
    console.log('  2️⃣  Analyzing with Gemini Flash...');
    const describePrompt = `Describe this fashion photo for AI generation: outfit, pose, setting, lighting, camera angle. If there is NO person/model in the image, respond with "NO_MODEL".`;
    const describeResponse = await callGemini({
      contents: [{ parts: [{ inline_data: { mime_type: "image/jpeg", data: instagramB64 } }, { text: describePrompt }] }]
    }, 'gemini-2.5-flash');
    
    const description = describeResponse.candidates?.[0]?.content?.parts?.[0]?.text || '';
    
    // Check if description indicates no model
    const hasModel = description.length > 0 && 
      !description.toUpperCase().includes('NO_MODEL') &&
      (description.toLowerCase().includes('person') || 
       description.toLowerCase().includes('model') ||
       description.toLowerCase().includes('woman') ||
       description.toLowerCase().includes('man') ||
       description.toLowerCase().includes('subject') ||
       description.toLowerCase().includes('outfit') ||
       description.toLowerCase().includes('wearing'));
    
    if (!hasModel) {
      console.log('     ❌ SKIP: No model detected in image');
      console.log(`     📝 ${description.substring(0, 100)}...`);
      return { success: false, reason: 'no_model' };
    }
    
    fs.writeFileSync(path.join(imgDir, 'description.txt'), description);
    console.log('     ✅ Description saved (model detected)');
    console.log(`     📝 ${description.substring(0, 100)}...`);
    
    console.log('  3️⃣  Generating with Gemini Pro...');
    let generatePrompt;
    const parts = [];
    
    if (img1B64 && imgIndex > 1) {
      console.log('     📎 Using: STYLE from img1 + IDENTITY from model');
      generatePrompt = `Fashion photo:\n${description}\n\nUse STYLE from first image, FACE from second. Same person as img1.`;
      parts.push({ text: generatePrompt });
      parts.push({ inline_data: { mime_type: "image/jpeg", data: img1B64 } });
      parts.push({ text: "STYLE REFERENCE" });
      parts.push({ inline_data: { mime_type: "image/png", data: identityB64 } });
      parts.push({ text: "IDENTITY REFERENCE" });
    } else {
      console.log('     📎 Using: IDENTITY only (this is img1)');
      generatePrompt = `Fashion photo:\n${description}\n\nSmartphone quality, natural lighting.`;
      parts.push({ text: generatePrompt });
      parts.push({ inline_data: { mime_type: "image/png", data: identityB64 } });
    }
    
    const generateResponse = await callGemini({
      contents: [{ parts }],
      generationConfig: { responseModalities: ["IMAGE"] }
    }, 'gemini-3-pro-image-preview');
    
    const candidate = generateResponse.candidates?.[0];
    
    if (candidate?.finishReason === 'STOP') {
      for (const part of candidate?.content?.parts || []) {
        if (part.inlineData) {
          const imgData = Buffer.from(part.inlineData.data, 'base64');
          const originalPath = path.join(imgDir, 'generated.jpg');
          const croppedPath = path.join(imgDir, 'generated-cropped.jpg');
          
          fs.writeFileSync(originalPath, imgData);
          console.log('     ✅ Image generated successfully');
          
          await cropTo45FromTop(originalPath, croppedPath);
          console.log('     ✅ Cropped to 4:5 + 5% sides');
          
          return { success: true, imgData: imgData.toString('base64') };
        }
      }
      console.log('     ❌ FAIL: No image data in response');
      return { success: false, reason: 'no_image_data' };
    } else if (candidate?.finishReason === 'IMAGE_SAFETY') {
      console.log('     ❌ FAIL: BLOCKED by safety filter');
      return { success: false, reason: 'safety_filter' };
    } else {
      const reason = candidate?.finishReason || 'unknown';
      console.log(`     ❌ FAIL: ${reason}`);
      if (generateResponse.error) {
        console.log(`     📛 API: ${JSON.stringify(generateResponse.error).substring(0, 150)}`);
      }
      return { success: false, reason };
    }
  } catch (err) {
    console.log(`     ❌ FAIL: Exception - ${err.message}`);
    return { success: false, reason: 'exception', error: err.message };
  }
}

async function processPost1() {
  // Read CSV and get first post
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.trim().split('\n');
  const parts = lines[1].split(',');
  const imageUrls = parts[6].split('|').filter(u => u && u.startsWith('http'));
  
  const post = {
    shortcode: parts[1],
    date: parts[3],
    images: imageUrls
  };
  
  console.log(`Post: ${post.shortcode}`);
  console.log(`Date: ${post.date}`);
  console.log(`Available source images: ${post.images.length}`);
  console.log('='.repeat(70));
  
  const postDir = path.join(outputDir, post.shortcode);
  if (!fs.existsSync(postDir)) fs.mkdirSync(postDir, { recursive: true });
  
  const identityB64 = fs.readFileSync(identityImagePath).toString('base64');
  
  let img1B64 = null;
  let generatedCount = 0;
  let sourceIndex = 0;
  
  // Generate img1 - keep trying until success
  console.log('\n🎯 GENERATING img1 (base reference)...');
  while (!img1B64 && sourceIndex < post.images.length) {
    const result = await generateImage(post.images[sourceIndex], 1, postDir, identityB64, null, sourceIndex + 1, post.images.length);
    sourceIndex++;
    
    if (result.success) {
      img1B64 = result.imgData;
      generatedCount++;
      console.log('\n   ⭐ img1 SUCCESS - This is now the style base');
    } else {
      console.log(`   🔄 Trying next source image...`);
    }
  }
  
  if (!img1B64) {
    console.log('\n❌ CRITICAL: Could not generate img1 from any source!');
    return;
  }
  
  // Generate img2
  console.log('\n🎯 GENERATING img2 (using img1 as style ref)...');
  let img2Success = false;
  while (!img2Success && sourceIndex < post.images.length) {
    const result = await generateImage(post.images[sourceIndex], 2, postDir, identityB64, img1B64, sourceIndex + 1, post.images.length);
    sourceIndex++;
    
    if (result.success) {
      generatedCount++;
      img2Success = true;
      console.log('\n   ✅ img2 SUCCESS');
    } else {
      console.log(`   🔄 Trying next source image...`);
    }
  }
  
  if (!img2Success) {
    console.log('\n⚠️  Could not generate img2');
  }
  
  // Generate img3
  console.log('\n🎯 GENERATING img3 (using img1 as style ref)...');
  let img3Success = false;
  while (!img3Success && sourceIndex < post.images.length) {
    const result = await generateImage(post.images[sourceIndex], 3, postDir, identityB64, img1B64, sourceIndex + 1, post.images.length);
    sourceIndex++;
    
    if (result.success) {
      generatedCount++;
      img3Success = true;
      console.log('\n   ✅ img3 SUCCESS');
    } else {
      console.log(`   🔄 Trying next source image...`);
    }
  }
  
  if (!img3Success) {
    console.log('\n⚠️  Could not generate img3');
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`FINAL RESULT: ${generatedCount}/3 images generated`);
  console.log('='.repeat(70));
}

processPost1().catch(console.error);
