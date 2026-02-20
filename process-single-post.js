#!/usr/bin/env node
/**
 * Single Post Processor - Process one post at a time with consistency
 * Usage: node process-single-post.js <post-shortcode>
 * Example: node process-single-post.js DUlIOVJDLnS
 */

import { SocksProxyAgent } from 'socks-proxy-agent';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROXY_URL = 'socks5://oH2XZer6WzFTaY299bVr9NwL:QrYkpu4itrGTyXnxXAQK4U11@us.socks.nordhold.net:1080';
const agent = new SocksProxyAgent(PROXY_URL);
const API_KEY = 'AIzaSyB7olaBwD3-zXFPfDTTXa-L20AytQUeRmM';

const identityImagePath = path.join(__dirname, 'src/models/israeli-cute.png');
const csvPath = path.join(__dirname, 'data', 'helenabeckmann-scraped.csv');
const outputDir = path.join(__dirname, 'output', 'helena-cropped');

// Config
const IMAGES_PER_POST = 3;
const TARGET_RATIO = 4/5;
const SIDE_CROP_PERCENT = 4;

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
    
    console.log(`   ✂️  Cropped: ${croppedWidth}x${cropHeight} (4:5 from top + 4% sides)`);
    return true;
  } catch (e) {
    console.log(`   ⚠️  Crop failed: ${e.message}, copying original`);
    fs.copyFileSync(inputPath, outputPath);
    return false;
  }
}

async function processSinglePost(shortcode) {
  const posts = parseCSV(csvPath);
  const post = posts.find(p => p.shortcode === shortcode);
  
  if (!post) {
    console.log(`❌ Post ${shortcode} not found in CSV`);
    process.exit(1);
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Processing Post: ${post.shortcode}`);
  console.log(`Date: ${post.date}`);
  console.log(`Images: ${post.images.length} (processing up to ${IMAGES_PER_POST})`);
  console.log('='.repeat(70));
  
  const postDir = path.join(outputDir, post.shortcode);
  if (!fs.existsSync(postDir)) {
    fs.mkdirSync(postDir, { recursive: true });
  }
  
  const imagesToProcess = post.images.slice(0, IMAGES_PER_POST);
  let generatedCount = 0;
  
  for (let i = 0; i < imagesToProcess.length; i++) {
    const imgUrl = imagesToProcess[i];
    const imgIndex = i + 1;
    
    console.log(`\n  📸 Image ${imgIndex}/${imagesToProcess.length}`);
    
    const imgDir = path.join(postDir, `img${imgIndex}`);
    if (!fs.existsSync(imgDir)) {
      fs.mkdirSync(imgDir, { recursive: true });
    }
    
    const croppedPathCheck = path.join(imgDir, 'generated-cropped.jpg');
    if (fs.existsSync(croppedPathCheck)) {
      console.log('     ⏭️  Already exists, skipping...');
      generatedCount++;
      continue;
    }
    
    try {
      console.log('     📥 Downloading reference...');
      const instagramB64 = await downloadImage(imgUrl);
      const identityB64 = fs.readFileSync(identityImagePath).toString('base64');
      
      fs.writeFileSync(path.join(imgDir, 'original-reference.jpg'), Buffer.from(instagramB64, 'base64'));
      console.log('     ✅ Loaded');
      
      console.log('     📝 Analyzing...');
      const describePrompt = `Analyze this fashion photo and describe it in detail for AI image generation. Include:
- The exact outfit (clothing type, color, style, fit)
- The pose and body position
- The setting/background
- The lighting and mood
- Camera angle and composition

Provide the description in a format suitable for an AI image generation prompt.`;

      const describeResponse = await callGemini({
        contents: [{
          parts: [
            { inline_data: { mime_type: "image/jpeg", data: instagramB64 } },
            { text: describePrompt }
          ]
        }]
      }, 'gemini-2.5-flash');

      const description = describeResponse.candidates?.[0]?.content?.parts?.[0]?.text || '';
      fs.writeFileSync(path.join(imgDir, 'description.txt'), description);
      console.log('     ✅ Description saved');
      
      console.log('     🎨 Generating...');
      
      let img1B64 = null;
      let useImg1Reference = false;
      
      if (imgIndex > 1) {
        const img1Path = path.join(postDir, 'img1', 'generated.jpg');
        if (fs.existsSync(img1Path)) {
          img1B64 = fs.readFileSync(img1Path).toString('base64');
          useImg1Reference = true;
          console.log('     📎 Using img1 as style reference for consistency');
        }
      }
      
      let generatePrompt;
      if (useImg1Reference) {
        generatePrompt = `Create a fashion photo with these specifications:

${description}

IMPORTANT - Model Consistency:
You have TWO reference images:
1. IDENTITY reference - Use this person's exact face features, long dark hair style/color, and skin tone
2. STYLE reference (first image) - Match this photo's overall style, lighting, color grading, and aesthetic

The model should look like the SAME PERSON from the first image of this post series. Maintain visual consistency with the style reference image.

Camera/Style Requirements:
- Photo should look like it was taken with a modern good smartphone (iPhone/Samsung quality)
- Natural, candid aesthetic - NOT professional studio photography
- Slight natural grain/authentic feel like a real phone camera
- Natural lighting, no heavy studio lights
- Casual, lifestyle feel like an everyday Instagram post
- No white borders or frames - full bleed image edge to edge`;
      } else {
        generatePrompt = `Create a fashion photo with these specifications:

${description}

IMPORTANT - Model Details:
Use the person in the reference image as the model. Maintain their exact face features, long dark hair style and color, and skin tone. The model should have the same hair color and hairstyle as shown in the reference.

Camera/Style Requirements:
- Photo should look like it was taken with a modern good smartphone (iPhone/Samsung quality)
- Natural, candid aesthetic - NOT professional studio photography
- Slight natural grain/authentic feel like a real phone camera
- Natural lighting, no heavy studio lights
- Casual, lifestyle feel like an everyday Instagram post
- No white borders or frames - full bleed image edge to edge`;
      }

      const parts = [{ text: generatePrompt }];
      
      if (useImg1Reference) {
        parts.push({ inline_data: { mime_type: "image/jpeg", data: img1B64 } });
        parts.push({ text: "STYLE REFERENCE: Use this image's aesthetic, lighting, and overall look" });
        parts.push({ inline_data: { mime_type: "image/png", data: identityB64 } });
        parts.push({ text: "IDENTITY REFERENCE: Use this person's face and features" });
      } else {
        parts.push({ inline_data: { mime_type: "image/png", data: identityB64 } });
      }

      const generateResponse = await callGemini({
        contents: [{ parts }],
        generationConfig: { responseModalities: ["IMAGE"] }
      }, 'gemini-3-pro-image-preview');

      const candidate = generateResponse.candidates?.[0];

      if (candidate?.finishReason === 'STOP') {
        const parts = candidate?.content?.parts || [];
        let saved = false;
        
        for (let j = 0; j < parts.length; j++) {
          if (parts[j].inlineData) {
            const imgData = Buffer.from(parts[j].inlineData.data, 'base64');
            const originalPath = path.join(imgDir, 'generated.jpg');
            const croppedPath = path.join(imgDir, 'generated-cropped.jpg');
            
            fs.writeFileSync(originalPath, imgData);
            console.log(`     ✅ Generated: ${originalPath}`);
            
            await cropTo45FromTop(originalPath, croppedPath);
            
            saved = true;
            generatedCount++;
            break;
          }
        }
        
        if (!saved) {
          console.log('     ❌ No image data in response');
        }
      } else if (candidate?.finishReason === 'IMAGE_SAFETY') {
        console.log('     ⚠️ BLOCKED by safety filter');
      } else {
        console.log(`     ❌ Error: ${candidate?.finishReason || 'Unknown'}`);
      }
      
      if (i < imagesToProcess.length - 1) {
        console.log('     ⏳ Waiting 2s...');
        await new Promise(r => setTimeout(r, 2000));
      }
      
    } catch (err) {
      console.log(`     ❌ Error: ${err.message}`);
    }
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`✅ Post ${shortcode} complete: ${generatedCount}/${imagesToProcess.length} images`);
  console.log('='.repeat(70));
}

const shortcode = process.argv[2];
if (!shortcode) {
  console.log('Usage: node process-single-post.js <post-shortcode>');
  console.log('Example: node process-single-post.js DUlIOVJDLnS');
  process.exit(1);
}

processSinglePost(shortcode).catch(console.error);
