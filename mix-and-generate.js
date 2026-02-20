#!/usr/bin/env node
/**
 * Post Mixer - Generate new posts by mixing random outfits + scenes
 * Usage: node mix-and-generate.js --count 5
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

const IDENTITY_IMAGE = './src/models/israeli-cute.png';
const REPO_DIR = './repository';
const OUTFITS_DIR = path.join(REPO_DIR, 'outfits');
const SCENES_DIR = path.join(REPO_DIR, 'scenes');
const OUTPUT_DIR = path.join(REPO_DIR, 'generated-posts');

const TARGET_RATIO = 4/5;
const SIDE_CROP_PERCENT = 5;

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
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
    return true;
  } catch (e) {
    fs.copyFileSync(inputPath, outputPath);
    return false;
  }
}

function getRandomOutfit() {
  const handles = fs.readdirSync(OUTFITS_DIR).filter(f => fs.statSync(path.join(OUTFITS_DIR, f)).isDirectory());
  if (handles.length === 0) return null;
  
  const randomHandle = handles[Math.floor(Math.random() * handles.length)];
  const handleDir = path.join(OUTFITS_DIR, randomHandle);
  const outfitFiles = fs.readdirSync(handleDir).filter(f => f.endsWith('.json'));
  if (outfitFiles.length === 0) return null;
  
  const randomFile = outfitFiles[Math.floor(Math.random() * outfitFiles.length)];
  const outfitPath = path.join(handleDir, randomFile);
  
  return JSON.parse(fs.readFileSync(outfitPath, 'utf8'));
}

function getRandomScene() {
  const handles = fs.readdirSync(SCENES_DIR).filter(f => fs.statSync(path.join(SCENES_DIR, f)).isDirectory());
  if (handles.length === 0) return null;
  
  const randomHandle = handles[Math.floor(Math.random() * handles.length)];
  const handleDir = path.join(SCENES_DIR, randomHandle);
  const postDirs = fs.readdirSync(handleDir).filter(f => fs.statSync(path.join(handleDir, f)).isDirectory());
  if (postDirs.length === 0) return null;
  
  const randomPost = postDirs[Math.floor(Math.random() * postDirs.length)];
  const postDir = path.join(handleDir, randomPost);
  const sceneFiles = fs.readdirSync(postDir).filter(f => f.endsWith('.json')).sort();
  
  const scenes = sceneFiles.map(f => {
    const scenePath = path.join(postDir, f);
    return JSON.parse(fs.readFileSync(scenePath, 'utf8'));
  });
  
  return {
    handle: randomHandle,
    shortcode: randomPost,
    scenes
  };
}

async function generateImage(outfit, scene, imgIndex, postDir, identityB64, img1B64 = null) {
  const imgDir = path.join(postDir, `img${imgIndex}`);
  if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });
  
  try {
    console.log(`   🎨 Generating img${imgIndex}...`);
    
    // Build prompt
    let promptText;
    const parts = [];
    
    if (imgIndex === 1) {
      // img1: outfit + scene + identity
      promptText = `Create a fashion photo:

OUTFIT: ${JSON.stringify(outfit.outfit, null, 2)}

SCENE: ${JSON.stringify(scene.scene, null, 2)}

Style: Smartphone quality, natural lighting, no white borders.`;
      
      parts.push({ text: promptText });
      parts.push({ inline_data: { mime_type: "image/png", data: identityB64 } });
    } else {
      // img2+: scene + img1 style + identity
      promptText = `Create a fashion photo:

SCENE: ${JSON.stringify(scene.scene, null, 2)}

Use STYLE from first reference image (same lighting, colors, aesthetic). Use FACE from second reference. Same person as img1.`;
      
      parts.push({ text: promptText });
      parts.push({ inline_data: { mime_type: "image/jpeg", data: img1B64 } });
      parts.push({ text: "STYLE REFERENCE" });
      parts.push({ inline_data: { mime_type: "image/png", data: identityB64 } });
      parts.push({ text: "IDENTITY REFERENCE" });
    }
    
    const response = await callGemini({
      contents: [{ parts }],
      generationConfig: { responseModalities: ["IMAGE"] }
    }, 'gemini-3-pro-image-preview');
    
    const candidate = response.candidates?.[0];
    
    if (candidate?.finishReason === 'STOP') {
      for (const part of candidate?.content?.parts || []) {
        if (part.inlineData) {
          const imgData = Buffer.from(part.inlineData.data, 'base64');
          const originalPath = path.join(imgDir, 'generated.jpg');
          const croppedPath = path.join(imgDir, 'generated-cropped.jpg');
          
          fs.writeFileSync(originalPath, imgData);
          await cropTo45FromTop(originalPath, croppedPath);
          
          console.log(`   ✅ img${imgIndex} generated`);
          return { success: true, imgData: imgData.toString('base64') };
        }
      }
    } else if (candidate?.finishReason === 'IMAGE_SAFETY') {
      console.log(`   ⚠️  img${imgIndex} blocked by safety`);
      return { success: false, reason: 'safety' };
    } else {
      console.log(`   ❌ img${imgIndex} error: ${candidate?.finishReason || 'unknown'}`);
      return { success: false, reason: candidate?.finishReason };
    }
  } catch (err) {
    console.log(`   ❌ img${imgIndex} exception: ${err.message}`);
    return { success: false, reason: 'exception', error: err.message };
  }
  
  return { success: false, reason: 'no_data' };
}

async function generateNewPost(postIndex) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Generating New Post #${postIndex}`);
  console.log('='.repeat(70));
  
  // Pick random outfit and scene
  const outfit = getRandomOutfit();
  const scenePost = getRandomScene();
  
  if (!outfit) {
    console.log('❌ No outfits available');
    return null;
  }
  if (!scenePost) {
    console.log('❌ No scenes available');
    return null;
  }
  
  console.log(`\n🎲 Mixing:`);
  console.log(`   Outfit: @${outfit.handle} / ${outfit.shortcode}`);
  console.log(`   Scene:  @${scenePost.handle} / ${scenePost.shortcode}`);
  console.log(`   Images: ${scenePost.scenes.length}`);
  
  // Create output directory
  const postId = `new-post-${String(postIndex).padStart(3, '0')}`;
  const postDir = path.join(OUTPUT_DIR, postId);
  if (!fs.existsSync(postDir)) fs.mkdirSync(postDir, { recursive: true });
  
  const identityB64 = fs.readFileSync(IDENTITY_IMAGE).toString('base64');
  
  // Save mix manifest
  const manifest = {
    post_id: postId,
    created_at: new Date().toISOString(),
    outfit_source: {
      handle: outfit.handle,
      shortcode: outfit.shortcode
    },
    scene_source: {
      handle: scenePost.handle,
      shortcode: scenePost.shortcode
    },
    outfit: outfit.outfit,
    scenes: scenePost.scenes.map(s => s.scene)
  };
  fs.writeFileSync(path.join(postDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  
  // Generate images
  let img1B64 = null;
  let generatedCount = 0;
  
  for (let i = 0; i < scenePost.scenes.length && generatedCount < 3; i++) {
    const imgIndex = i + 1;
    const scene = scenePost.scenes[i];
    
    const result = await generateImage(outfit, scene, imgIndex, postDir, identityB64, img1B64);
    
    if (result.success) {
      generatedCount++;
      if (!img1B64) {
        img1B64 = result.imgData;
        console.log('   ⭐ img1 is now style base');
      }
      
      if (i < scenePost.scenes.length - 1 && generatedCount < 3) {
        console.log('   ⏳ Waiting 3s...');
        await new Promise(r => setTimeout(r, 3000));
      }
    } else {
      console.log(`   ⚠️  img${imgIndex} failed, stopping`);
      break;
    }
  }
  
  console.log(`\n✅ Generated ${generatedCount}/${scenePost.scenes.length} images`);
  return { postId, generated: generatedCount };
}

async function main() {
  const count = parseInt(process.argv.find(arg => arg.startsWith('--count='))?.split('=')[1] || '1');
  
  console.log('🎨 POST MIXER\n');
  console.log(`Generating ${count} new post(s)...\n`);
  console.log('='.repeat(70));
  
  const results = [];
  
  for (let i = 1; i <= count; i++) {
    const result = await generateNewPost(i);
    if (result) results.push(result);
    
    if (i < count) {
      console.log('\n⏳ Waiting 10s before next post...');
      await new Promise(r => setTimeout(r, 10000));
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));
  results.forEach(r => {
    console.log(`${r.postId}: ${r.generated} images`);
  });
  console.log(`\nOutput: ${OUTPUT_DIR}/`);
}

main().catch(console.error);
