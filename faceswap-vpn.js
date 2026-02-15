import { SocksProxyAgent } from 'socks-proxy-agent';
import https from 'https';
import fs from 'fs';

// NordVPN SOCKS5 proxy
const PROXY_URL = 'socks5://oH2XZer6WzFTaY299bVr9NwL:QrYkpu4itrGTyXnxXAQK4U11@us.socks.nordhold.net:1080';
const agent = new SocksProxyAgent(PROXY_URL);

const API_KEY = "AIzaSyAxQ7X3xweJdEG1lgzQDEFVWz07ZMSwZR0";

// Images
const structureImageUrl = 'https://scontent-fra5-1.cdninstagram.com/v/t51.82787-15/628134265_18408216238125405_4335708264951004473_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=110&ig_cache_key=MzgyNzM5ODMyOTM3MDU5NDIwMA%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6InhwaWRzLjE0NDB4MTg4Ni5zZHIuQzMifQ%3D%3D&_nc_ohc=CAaqeM8RkQMQ7kNvwFkU3Kv&_nc_oc=AdkKZrRPfrK5JEbhGwKEl7TANa1zL9BwiB_NJ5x8QAzaH6ofCc00Vb9TrbegZc61f2g&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent-fra5-1.cdninstagram.com&_nc_gid=Wh4-DU1h6oiL3w3gF1gktg&oh=00_Afumw4dPdDAURHkYKuJcOM1IMLHjN5HwoSOsIiIv3Qk6dw&oe=6995D6A3';
const identityImagePath = './src/models/israeli-cute.png';
const outputDir = './test-generated';

console.log('🎨 Face Swap through NordVPN\n');

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// Download image helper
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { agent }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
    }).on('error', reject);
  });
}

// API call helper
function callGemini(payload) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${API_KEY}`,
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
  try {
    console.log('📥 Downloading structure image...');
    const structureB64 = await downloadImage(structureImageUrl);
    
    console.log('📸 Loading identity image...');
    const identityB64 = fs.readFileSync(identityImagePath).toString('base64');

    console.log('🔄 Generating face swap...\n');
    
    const payload = {
      contents: [{
        parts: [
          { text: "Recreate the first image but with the model of the second image, keeping the outfit and body shape from the first image but with the skin type and tone of the second image." },
          { inline_data: { mime_type: "image/jpeg", data: structureB64 } },
          { inline_data: { mime_type: "image/png", data: identityB64 } }
        ]
      }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: "9:16" }
      }
    };
    
    const response = await callGemini(payload);
    
    // Check for errors
    const candidate = response.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== "STOP") {
      console.log('⚠️ Issue:', candidate.finishReason);
      console.log('Message:', candidate.finishMessage || 'No details');
      fs.writeFileSync(`${outputDir}/error.json`, JSON.stringify(response, null, 2));
      return;
    }
    
    // Extract and save images
    const parts = candidate?.content?.parts || [];
    let count = 0;
    
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].inlineData) {
        const imgData = Buffer.from(parts[i].inlineData.data, 'base64');
        const filename = `${outputDir}/faceswap_${count}.jpg`;
        fs.writeFileSync(filename, imgData);
        console.log('✅ Saved:', filename);
        count++;
      }
    }
    
    if (count > 0) {
      console.log(`\n✅ Face swap complete! ${count} image(s) generated.`);
    } else {
      console.log('⚠️ No images generated');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

main();
