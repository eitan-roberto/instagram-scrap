#!/usr/bin/env node
/**
 * Fixed Full Run - Sequential post processing with img1 fallback
 * - Tries images until img1 succeeds
 * - Uses THAT img1 for img2/img3 consistency
 * - Tighter crop: 5% from sides
 * - Never mixes posts
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
  console.error('❌ Error: GEMINI_API_KEY not found in .env file');
  process.exit(1);
}

const identityImagePath = './src/models/israeli-cute.png';
const outputDir = './output/helena-cropped-fixed';
const csvPath = './data/helenabeckmann-scraped.csv';

const IMAGES_PER_POST = 3;
const TARGET_RATIO = 4/5;
const SIDE_CROP_PERCENT = 5; // Tighter crop - 5% from sides

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('🎨 FIXED FULL RUN - No mixing, img1 fallback, 5% crop\n');
console.log('==============================================\n');

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
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
  
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
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
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
      url: parts[0],
      shortcode: parts[1],
      caption: parts[2],
      date: parts[3],
      likes: parts[4],
      imageCount: parts[5],
      images: imageUrls
    });
  }
  return posts;
}

async function cropTo45FromTop(inputPath, outputPath) {
  try {
    const image = sharp(inputPath);
    const metadata = await image.metadata();
    
    const originalWidth = metadata.width;
    const originalHeight = metadata.height;
    
    // 5% from each side (tighter)
    const sideCrop = Math.round(originalWidth * (SIDE_CROP_PERCENT / 100));
    const croppedWidth = originalWidth - (sideCrop * 2);
    const targetHeight = Math.round(croppedWidth / TARGET_RATIO);
    const cropHeight = Math.min(targetHeight, originalHeight);
    
    await image
      .extract({
        left: sideCrop,
        top: 0,
        width: croppedWidth,
        height: cropHeight
      })
      .toFile(outputPath);
    
    console.log(`   ✂️  Cropped: ${croppedWidth}x${cropHeight} (4:5 top + ${SIDE_CROP_PERCENT}% sides)`);
    return true;
  } catch (e) {
    console.log(`   ⚠️  Crop failed: ${e.message}`);
    fs.copyFileSync(inputPath, outputPath);
    return false;
  }
}

async function generateSingleImage(imgUrl, imgIndex, postDir, identityB64, img1B64 = null) {
  const imgDir = path.join(postDir, `img${imgIndex}`);
  if (!fs.existsSync(imgDir)) {
    fs.mkdirSync(imgDir, { recursive: true });
  }
  
  try {
    console.log(`   📥 Downloading reference...`);
    const instagramB64 = await downloadImage(imgUrl);
    fs.writeFileSync(path.join(imgDir, 'original-reference.jpg'), Buffer.from(instagramB64, 'base64'));
    
    console.log(`   📝 Analyzing...`);
    const describePrompt = `Analyze this fashion photo. Include: outfit details, pose, setting, lighting, camera angle. Format for AI generation. If there is NO person/model in the image, respond with "NO_MODEL".`;
    
    const describeResponse = await callGemini({
      contents: [{
        parts: [
          { inline_data: { mime_type: "image/jpeg", data: instagramB64 } },
          { text: describePrompt }
        ]
      }]
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
      console.log(`   ⚠️  SKIP: No model in image`);
      return { success: false, reason: 'no_model' };
    }
    
    fs.writeFileSync(path.join(imgDir, 'description.txt'), description);
    
    console.log(`   🎨 Generating...`);
    
    let generatePrompt;
    const parts = [];
    
    if (img1B64 && imgIndex > 1) {
      // img2/img3 - use img1 as style reference
      generatePrompt = `Create fashion photo:\n\n${description}\n\nCRITICAL - Use STYLE from first reference image (lighting, colors, aesthetic) and IDENTITY from second reference (face, hair). Same person across all images.`;
      
      parts.push({ text: generatePrompt });
      parts.push({ inline_data: { mime_type: "image/jpeg", data: img1B64 } });
      parts.push({ text: "STYLE: Match this look" });
      parts.push({ inline_data: { mime_type: "image/png", data: identityB64 } });
      parts.push({ text: "IDENTITY: Use this face" });
    } else {
      // img1 - just identity
      generatePrompt = `Create fashion photo:\n\n${description}\n\nUse person from reference as model. Smartphone quality, natural lighting, no borders.`;
      
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
          await cropTo45FromTop(originalPath, croppedPath);
          
          console.log(`   ✅ Generated img${imgIndex}`);
          return { success: true, imgPath: originalPath, imgData: imgData.toString('base64') };
        }
      }
    } else if (candidate?.finishReason === 'IMAGE_SAFETY') {
      console.log(`   ⚠️  BLOCKED by safety filter`);
      return { success: false, reason: 'safety' };
    } else {
      const reason = candidate?.finishReason || 'Unknown';
      console.log(`   ❌ Error: ${reason}`);
      if (generateResponse.error) {
        console.log(`   📛 API Error: ${JSON.stringify(generateResponse.error).substring(0, 200)}`);
      }
      return { success: false, reason: 'error', details: reason };
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    return { success: false, reason: 'exception', error: err.message };
  }
  
  return { success: false, reason: 'no_data' };
}

async function processPost(post, postIndex, totalPosts) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`[${postIndex}/${totalPosts}] Post: ${post.shortcode}`);
  console.log(`Date: ${post.date}`);
  console.log(`Available images: ${post.images.length}`);
  console.log('='.repeat(70));
  
  const postDir = path.join(outputDir, post.shortcode);
  if (!fs.existsSync(postDir)) {
    fs.mkdirSync(postDir, { recursive: true });
  }
  
  const identityB64 = fs.readFileSync(identityImagePath).toString('base64');
  
  // STEP 1: Find img1 - try images sequentially until one succeeds
  let img1B64 = null;
  let img1Index = -1;
  let generatedCount = 0;
  
  console.log('\n  🔍 Finding img1 (trying images sequentially)...');
  
  for (let i = 0; i < post.images.length && generatedCount < IMAGES_PER_POST; i++) {
    const imgUrl = post.images[i];
    const tryIndex = generatedCount + 1; // This will be img1, img2, or img3
    
    console.log(`\n  📸 Attempting Image ${tryIndex} (from source ${i+1}/${post.images.length})`);
    
    const result = await generateSingleImage(imgUrl, tryIndex, postDir, identityB64, img1B64);
    
    if (result.success) {
      generatedCount++;
      
      // If this is the first successful image, it becomes our img1 reference
      if (!img1B64) {
        img1B64 = result.imgData;
        img1Index = i;
        console.log(`   ⭐ This is now img1 (base reference)`);
      }
      
      // Wait between generations
      if (generatedCount < IMAGES_PER_POST) {
        console.log('   ⏳ Waiting 3s...');
        await new Promise(r => setTimeout(r, 3000));
      }
    } else {
      console.log(`   ❌ Failed, trying next source image...`);
    }
    
    // Stop if we have 3 images
    if (generatedCount >= IMAGES_PER_POST) break;
  }
  
  console.log(`\n  📊 Results: ${generatedCount}/${IMAGES_PER_POST} images generated`);
  
  return { shortcode: post.shortcode, generated: generatedCount };
}

async function main() {
  const posts = parseCSV(csvPath);
  console.log(`📂 Found ${posts.length} posts\n`);
  
  const results = [];
  
  for (let i = 0; i < posts.length; i++) {
    const result = await processPost(posts[i], i + 1, posts.length);
    results.push(result);
    
    // Wait between posts
    if (i < posts.length - 1) {
      console.log('\n⏳ Waiting 5s before next post...');
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log('FINAL SUMMARY');
  console.log('='.repeat(70));
  
  let totalGenerated = 0;
  for (const r of results) {
    console.log(`${r.shortcode}: ${r.generated}/3 images`);
    totalGenerated += r.generated;
  }
  
  console.log(`\nTotal: ${totalGenerated}/${posts.length * 3} images`);
  console.log(`Output: ${outputDir}/`);
  console.log('='.repeat(70));
}

main().catch(console.error);
