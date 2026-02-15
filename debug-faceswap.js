import { SocksProxyAgent } from 'socks-proxy-agent';
import https from 'https';

const PROXY_URL = 'socks5://oH2XZer6WzFTaY299bVr9NwL:QrYkpu4itrGTyXnxXAQK4U11@us.socks.nordhold.net:1080';
const agent = new SocksProxyAgent(PROXY_URL);
const API_KEY = 'AIzaSyAxQ7X3xweJdEG1lgzQDEFVWz07ZMSwZR0';

// Test image from helenabeckmann
const testImageUrl = 'https://scontent-fra5-2.cdninstagram.com/v/t51.82787-15/632631406_18153149800444840_773346114252105670_n.jpg?stp=dst-jpegr_e35_tt6&_nc_cat=106&ig_cache_key=MzgyOTUwMjQzOTM1MTY3ODE3Ng%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6InhwaWRzLjE0NDB4MTA4MC5oZHIuQzMifQ%3D%3D&_nc_ohc=DC_MY6L8gJUQ7kNvwFsnpX4&_nc_oc=AdnOIt5yLnqm2iyaPPSiWrGWNv3ZcjR653RAhQsBisKnq5KAvUiUaKXzIpOBW3KgIgw&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent-fra5-2.cdninstagram.com&_nc_gid=mKt38nEnNGE3RkNsuEGpqQ&oh=00_AftEabaKcYkuKLziouIkBVMkwk6fZkmqGewoD_CWwTWoIQ&oe=699722D4';

// Model image
const identityImagePath = './src/models/israeli-cute.png';

import fs from 'fs';

console.log('🔍 DEBUG: Face Swap Error Details\n');
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

function callGemini(payload, model = 'gemini-3-pro-image-preview') {
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
  console.log('📥 Downloading images...');
  const structureB64 = await downloadImage(testImageUrl);
  const identityB64 = fs.readFileSync(identityImagePath).toString('base64');
  
  console.log('✅ Images loaded');
  console.log(`   Structure image: ${testImageUrl.substring(0, 100)}...`);
  console.log(`   Identity image: ${identityImagePath}`);
  console.log('');
  
  const prompts = [
    "Create a fashion photo using the outfit, pose and setting from the first image. Use the face features and hair from the second image. Keep the exact outfit and background from the first image.",
    "Fashion lookbook: Combine the clothing and pose from the first reference with the facial features from the second reference. Maintain the original outfit exactly.",
    "Create a portrait wearing the outfit from the first image, with the face characteristics from the second image."
  ];
  
  for (let i = 0; i < prompts.length; i++) {
    console.log(`\n--- PROMPT ${i + 1} ---`);
    console.log(`Text: "${prompts[i]}"`);
    console.log('');
    
    const payload = {
      contents: [{
        parts: [
          { text: prompts[i] },
          { inline_data: { mime_type: "image/jpeg", data: structureB64 } },
          { inline_data: { mime_type: "image/png", data: identityB64 } }
        ]
      }],
      generationConfig: {
        responseModalities: ["IMAGE"]
      }
    };
    
    try {
      const response = await callGemini(payload, 'gemini-3-pro-image-preview');
      
      console.log('📤 API RESPONSE:');
      console.log(JSON.stringify(response, null, 2));
      
      const candidate = response.candidates?.[0];
      if (candidate?.finishReason) {
        console.log(`\n⚠️ Finish Reason: ${candidate.finishReason}`);
        if (candidate.finishMessage) {
          console.log(`📝 Message: ${candidate.finishMessage}`);
        }
      }
      
      if (candidate?.finishReason === 'STOP') {
        console.log('\n✅ SUCCESS - Image generated!');
      } else {
        console.log('\n❌ BLOCKED');
      }
      
    } catch (error) {
      console.error('❌ API Error:', error.message);
    }
    
    await new Promise(r => setTimeout(r, 2000));
  }
}

main();
