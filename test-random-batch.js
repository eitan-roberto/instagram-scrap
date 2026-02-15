import { SocksProxyAgent } from 'socks-proxy-agent';
import https from 'https';
import fs from 'fs';
import path from 'path';

const PROXY_URL = 'socks5://oH2XZer6WzFTaY299bVr9NwL:QrYkpu4itrGTyXnxXAQK4U11@us.socks.nordhold.net:1080';
const agent = new SocksProxyAgent(PROXY_URL);
const API_KEY = process.env.GEMINI_API_KEY || 'YOUR_API_KEY_HERE';

const identityImagePath = './src/models/israeli-cute.png';
const outputDir = './test-random-batch';

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// Read CSV and pick random images
const csvPath = './data/helenabeckmann-scraped.csv';
const csvContent = fs.readFileSync(csvPath, 'utf8');
const lines = csvContent.split('\n').slice(1); // Skip header

// Parse and collect all images with their posts
const allImages = [];
for (const line of lines) {
  if (!line.trim()) continue;
  const parts = line.split(',');
  if (parts.length < 7) continue;
  
  const shortcode = parts[1];
  const imageUrls = parts[6]?.split('|') || [];
  
  for (const url of imageUrls) {
    if (url && url.includes('instagram.com') && !url.includes('giphy')) {
      allImages.push({ shortcode, url: url.trim() });
    }
  }
}

// Pick 3 random images
const randomImages = allImages
  .sort(() => Math.random() - 0.5)
  .slice(0, 3);

console.log('🎨 RANDOM BATCH: Describe → Generate\n');
console.log(`📊 Found ${allImages.length} total images`);
console.log(`🎯 Testing ${randomImages.length} random images\n`);
console.log('Selected posts:');
randomImages.forEach((img, i) => console.log(`  ${i+1}. ${img.shortcode}`));
console.log('');

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { agent }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
    }).on('error', reject);
  });
}

function callGemini(payload, model = 'gemini-2.5-flash') {
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

async function processImage(img, index) {
  const postDir = path.join(outputDir, `${index}_${img.shortcode}`);
  if (!fs.existsSync(postDir)) fs.mkdirSync(postDir, { recursive: true });
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${index}/3] Processing: ${img.shortcode}`);
  console.log('='.repeat(60));
  
  try {
    // Step 1: Download
    console.log('\n📥 Downloading image...');
    const instagramB64 = await downloadImage(img.url);
    const identityB64 = fs.readFileSync(identityImagePath).toString('base64');
    console.log('✅ Loaded');
    
    // Step 2: Describe
    console.log('\n📝 Analyzing image...');
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
    fs.writeFileSync(path.join(postDir, 'description.txt'), description);
    
    console.log('📝 Description:');
    console.log(description.substring(0, 300) + '...');
    console.log(`   (Full description saved to ${postDir}/description.txt)`);
    
    // Step 3: Generate
    console.log('\n🎨 Generating new image...');
    const generatePrompt = `Create a fashion photo with these specifications:

${description}

Use the person in the reference image as the model. Maintain their face features, hair, and skin tone. The result should look like the model from the reference image wearing the outfit and pose described above.`;

    const generateResponse = await callGemini({
      contents: [{
        parts: [
          { text: generatePrompt },
          { inline_data: { mime_type: "image/png", data: identityB64 } }
        ]
      }],
      generationConfig: { responseModalities: ["IMAGE"] }
    }, 'gemini-3-pro-image-preview');
    
    const candidate = generateResponse.candidates?.[0];
    
    if (candidate?.finishReason === 'STOP') {
      const parts = candidate?.content?.parts || [];
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].inlineData) {
          const imgData = Buffer.from(parts[i].inlineData.data, 'base64');
          const filename = path.join(postDir, 'generated.jpg');
          fs.writeFileSync(filename, imgData);
          console.log(`✅ SUCCESS! Image saved to: ${filename}`);
          return { success: true };
        }
      }
    } else if (candidate?.finishReason === 'IMAGE_SAFETY') {
      console.log('⚠️ BLOCKED by safety filter');
      fs.writeFileSync(path.join(postDir, 'error.json'), JSON.stringify(generateResponse, null, 2));
      return { success: false, reason: 'safety' };
    } else if (generateResponse.error) {
      console.log('❌ API Error:', generateResponse.error.message);
      return { success: false, reason: 'api_error', error: generateResponse.error.message };
    } else {
      console.log('⚠️ Unexpected:', candidate?.finishReason);
      return { success: false, reason: 'unknown' };
    }
    
  } catch (e) {
    console.error('❌ Error:', e.message);
    return { success: false, reason: 'error', error: e.message };
  }
}

async function main() {
  const results = [];
  
  for (let i = 0; i < randomImages.length; i++) {
    const result = await processImage(randomImages[i], i + 1);
    results.push({ ...randomImages[i], ...result });
    
    if (i < randomImages.length - 1) {
      console.log('\n⏳ Waiting 3 seconds before next image...');
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  
  const successCount = results.filter(r => r.success).length;
  const safetyCount = results.filter(r => r.reason === 'safety').length;
  const errorCount = results.filter(r => !r.success && r.reason !== 'safety').length;
  
  console.log(`✅ Successful: ${successCount}/${results.length}`);
  console.log(`⚠️ Safety blocked: ${safetyCount}/${results.length}`);
  console.log(`❌ Errors: ${errorCount}/${results.length}`);
  
  results.forEach((r, i) => {
    const status = r.success ? '✅' : r.reason === 'safety' ? '⚠️' : '❌';
    console.log(`  ${status} [${i+1}] ${r.shortcode}: ${r.success ? 'OK' : r.reason}`);
  });
  
  console.log(`\n📁 Output: ${outputDir}/`);
}

main().catch(e => console.error('❌ Error:', e.message));
