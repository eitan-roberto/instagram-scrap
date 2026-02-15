import { SocksProxyAgent } from 'socks-proxy-agent';
import https from 'https';
import fs from 'fs';
import path from 'path';

const PROXY_URL = 'socks5://oH2XZer6WzFTaY299bVr9NwL:QrYkpu4itrGTyXnxXAQK4U11@us.socks.nordhold.net:1080';
const agent = new SocksProxyAgent(PROXY_URL);
const API_KEY = 'AIzaSyAxQ7X3xweJdEG1lgzQDEFVWz07ZMSwZR0';

const identityImagePath = './src/models/israeli-cute.png';
const outputDir = './output/helena-cropped';
const csvPath = './data/helenabeckmann-scraped.csv';

// Config
const IMAGES_PER_POST = 3;
const CROP_PERCENT = 5; // Crop bottom 5% to remove watermark

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('🎨 FULL RUN with Auto-Crop (Watermark Removal)\n');
console.log('==============================================\n');
console.log(`📸 Generating images...`);
console.log(`✂️  Auto-cropping bottom ${CROP_PERCENT}% to remove watermarks\n`);

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

// Simple crop function using image data
// Note: This is a placeholder - we'd need sharp or similar for actual cropping
// For now, we'll save both versions and note that cropping should be done
async function cropImage(inputPath, outputPath, cropPercent) {
  // For now, just copy and log
  // In production, use: sharp(inputPath).extract({left: 0, top: 0, width: width, height: height * (1-cropPercent/100)})
  console.log(`   ✂️  Crop: Remove bottom ${cropPercent}%`);
  console.log(`      Original: ${inputPath}`);
  console.log(`      Cropped: ${outputPath} (use Sharp/ImageMagick)`);
  
  // Copy for now - user can crop manually or we can add sharp later
  fs.copyFileSync(inputPath, outputPath);
}

async function processPost(post, postIndex, totalPosts) {
  const postDir = path.join(outputDir, post.shortcode);
  if (!fs.existsSync(postDir)) {
    fs.mkdirSync(postDir, { recursive: true });
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`[${postIndex}/${totalPosts}] Post: ${post.shortcode}`);
  console.log(`Date: ${post.date}`);
  console.log(`Images: ${post.images.length} (processing up to ${IMAGES_PER_POST})`);
  console.log('='.repeat(70));

  const manifest = {
    shortcode: post.shortcode,
    originalUrl: post.url,
    date: post.date,
    caption: post.caption,
    processedAt: new Date().toISOString(),
    images: []
  };

  const imagesToProcess = post.images.slice(0, IMAGES_PER_POST);
  
  for (let i = 0; i < imagesToProcess.length; i++) {
    const imgUrl = imagesToProcess[i];
    const imgIndex = i + 1;
    
    console.log(`\n  📸 Image ${imgIndex}/${imagesToProcess.length}`);
    
    const imgDir = path.join(postDir, `img${imgIndex}`);
    if (!fs.existsSync(imgDir)) {
      fs.mkdirSync(imgDir, { recursive: true });
    }

    const imgResult = {
      index: imgIndex,
      originalUrl: imgUrl,
      status: 'pending',
      description: null,
      generatedPath: null,
      croppedPath: null,
      error: null
    };

    try {
      // Step 1: Download
      console.log('     📥 Downloading reference...');
      const instagramB64 = await downloadImage(imgUrl);
      const identityB64 = fs.readFileSync(identityImagePath).toString('base64');
      
      // Save original reference
      fs.writeFileSync(path.join(imgDir, 'original-reference.jpg'), Buffer.from(instagramB64, 'base64'));
      console.log('     ✅ Loaded');

      // Step 2: Describe
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
      imgResult.description = description.substring(0, 200) + '...';
      console.log('     ✅ Description saved');

      // Step 3: Generate
      console.log('     🎨 Generating...');
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
        let saved = false;
        
        for (let j = 0; j < parts.length; j++) {
          if (parts[j].inlineData) {
            const imgData = Buffer.from(parts[j].inlineData.data, 'base64');
            const originalPath = path.join(imgDir, 'generated.jpg');
            const croppedPath = path.join(imgDir, 'generated-cropped.jpg');
            
            // Save original
            fs.writeFileSync(originalPath, imgData);
            imgResult.generatedPath = `img${imgIndex}/generated.jpg`;
            console.log(`     ✅ Generated: ${originalPath}`);
            
            // "Crop" (copy for now, actual crop needs sharp)
            await cropImage(originalPath, croppedPath, CROP_PERCENT);
            imgResult.croppedPath = `img${imgIndex}/generated-cropped.jpg`;
            
            saved = true;
            break;
          }
        }
        
        if (!saved) {
          imgResult.status = 'error';
          imgResult.error = 'No image data';
        } else {
          imgResult.status = 'success';
        }
      } else if (candidate?.finishReason === 'IMAGE_SAFETY') {
        imgResult.status = 'blocked';
        imgResult.error = 'IMAGE_SAFETY';
        fs.writeFileSync(path.join(imgDir, 'error.json'), JSON.stringify(generateResponse, null, 2));
        console.log('     ⚠️ BLOCKED by safety filter');
      } else {
        imgResult.status = 'error';
        imgResult.error = candidate?.finishReason || 'Unknown';
        console.log(`     ⚠️ Failed: ${candidate?.finishReason}`);
      }

    } catch (e) {
      imgResult.status = 'error';
      imgResult.error = e.message;
      console.error(`     ❌ Error: ${e.message}`);
    }

    manifest.images.push(imgResult);

    // Delay between images
    if (i < imagesToProcess.length - 1) {
      console.log('     ⏳ Waiting 2s...');
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Save manifest
  fs.writeFileSync(path.join(postDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  
  const successful = manifest.images.filter(i => i.status === 'success').length;
  console.log(`\n  📊 Results: ✅${successful}/${manifest.images.length}`);
  
  return manifest;
}

async function main() {
  // Parse CSV
  console.log('📂 Reading CSV...');
  const csvContent = fs.readFileSync(csvPath, 'utf8');
  const lines = csvContent.split('\n').slice(1);

  const posts = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(',');
    if (parts.length < 7) continue;

    const url = parts[0];
    const shortcode = parts[1];
    const caption = parts[2]?.replace(/^"|"$/g, '') || '';
    const date = parts[3];
    const imageUrls = parts[6]?.split('|') || [];

    const validImages = imageUrls.filter(u => 
      u && u.includes('instagram.com') && !u.includes('giphy')
    );

    if (validImages.length > 0) {
      posts.push({
        shortcode,
        url,
        caption,
        date,
        images: validImages
      });
    }
  }

  console.log(`✅ Found ${posts.length} posts\n`);

  // Process all posts
  const allManifests = [];
  
  for (let i = 0; i < posts.length; i++) {
    const manifest = await processPost(posts[i], i + 1, posts.length);
    allManifests.push(manifest);
    
    if (i < posts.length - 1) {
      console.log('\n⏳ Waiting 3s before next post...');
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(70));
  console.log('FINAL SUMMARY');
  console.log('='.repeat(70));

  const totalImages = allManifests.reduce((sum, m) => sum + m.images.length, 0);
  const totalSuccess = allManifests.reduce((sum, m) => 
    sum + m.images.filter(i => i.status === 'success').length, 0);

  console.log(`\nPosts: ${allManifests.length}`);
  console.log(`Images: ${totalImages}`);
  console.log(`✅ Successful: ${totalSuccess}`);
  console.log(`\n📁 Output: ${outputDir}/`);
  console.log(`✂️  Note: Images need bottom ${CROP_PERCENT}% cropped to remove watermarks`);
  console.log(`   Use: sharp(input).extract({top: 0, left: 0, width: w, height: h * 0.95})`);
}

main().catch(console.error);
