import { SocksProxyAgent } from 'socks-proxy-agent';
import https from 'https';
import fs from 'fs';

const PROXY_URL = 'socks5://oH2XZer6WzFTaY299bVr9NwL:QrYkpu4itrGTyXnxXAQK4U11@us.socks.nordhold.net:1080';
const agent = new SocksProxyAgent(PROXY_URL);
const API_KEY = process.env.GEMINI_API_KEY || 'YOUR_API_KEY_HERE';

// Test image from helenabeckmann
const instagramImageUrl = 'https://scontent-fra5-2.cdninstagram.com/v/t51.82787-15/632631406_18153149800444840_773346114252105670_n.jpg?stp=dst-jpegr_e35_tt6&_nc_cat=106&ig_cache_key=MzgyOTUwMjQzOTM1MTY3ODE3Ng%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6InhwaWRzLjE0NDB4MTA4MC5oZHIuQzMifQ%3D%3D&_nc_ohc=DC_MY6L8gJUQ7kNvwFsnpX4&_nc_oc=AdnOIt5yLnqm2iyaPPSiWrGWNv3ZcjR653RAhQsBisKnq5KAvUiUaKXzIpOBW3KgIgw&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent-fra5-2.cdninstagram.com&_nc_gid=mKt38nEnNGE3RkNsuEGpqQ&oh=00_AftEabaKcYkuKLziouIkBVMkwk6fZkmqGewoD_CWwTWoIQ&oe=699722D4';

// Model image
const identityImagePath = './src/models/israeli-cute.png';
const outputDir = './test-describe-generate';

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

console.log('🎨 NEW APPROACH: Describe → Generate\n');
console.log('=====================================\n');

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

async function main() {
  // STEP 1: Download images
  console.log('📥 Step 1: Loading images...');
  const instagramB64 = await downloadImage(instagramImageUrl);
  const identityB64 = fs.readFileSync(identityImagePath).toString('base64');
  console.log('✅ Images loaded\n');

  // STEP 2: Describe the Instagram image
  console.log('📝 Step 2: Analyzing Instagram image...');
  
  const describePrompt = `Analyze this fashion photo and describe it in detail for AI image generation. Include:
- The exact outfit (clothing type, color, style, fit)
- The pose and body position
- The setting/background
- The lighting and mood
- Camera angle and composition

Provide the description in a format suitable for an AI image generation prompt.`;

  const describePayload = {
    contents: [{
      parts: [
        { inline_data: { mime_type: "image/jpeg", data: instagramB64 } },
        { text: describePrompt }
      ]
    }]
  };

  const descriptionResponse = await callGemini(describePayload, 'gemini-2.5-flash');
  const description = descriptionResponse.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  console.log('📝 Generated Description:');
  console.log('-'.repeat(50));
  console.log(description);
  console.log('-'.repeat(50));
  console.log('');

  // Save description
  fs.writeFileSync(`${outputDir}/description.txt`, description);

  // STEP 3: Generate new image using description + model reference
  console.log('🎨 Step 3: Generating new image with model reference...');
  
  const generatePrompt = `Create a fashion photo with these specifications:

${description}

Use the person in the reference image as the model. Maintain their face features, hair, and skin tone. The result should look like the model from the reference image wearing the outfit and pose described above.`;

  const generatePayload = {
    contents: [{
      parts: [
        { text: generatePrompt },
        { inline_data: { mime_type: "image/png", data: identityB64 } }
      ]
    }],
    generationConfig: {
      responseModalities: ["IMAGE"]
    }
  };

  const generateResponse = await callGemini(generatePayload, 'gemini-3-pro-image-preview');
  
  // Check response
  const candidate = generateResponse.candidates?.[0];
  
  if (candidate?.finishReason === 'STOP') {
    // Extract and save image
    const parts = candidate?.content?.parts || [];
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].inlineData) {
        const imgData = Buffer.from(parts[i].inlineData.data, 'base64');
        const filename = `${outputDir}/generated.jpg`;
        fs.writeFileSync(filename, imgData);
        console.log(`✅ SUCCESS! Image saved to: ${filename}`);
      }
    }
  } else if (candidate?.finishReason === 'IMAGE_SAFETY') {
    console.log('⚠️ BLOCKED by safety filter');
    console.log('Message:', candidate.finishMessage);
    fs.writeFileSync(`${outputDir}/error.json`, JSON.stringify(generateResponse, null, 2));
  } else {
    console.log('⚠️ Unexpected response');
    console.log(JSON.stringify(generateResponse, null, 2));
  }

  console.log('\n✅ Workflow complete!');
  console.log(`📁 Output: ${outputDir}/`);
}

main().catch(e => console.error('❌ Error:', e.message));
