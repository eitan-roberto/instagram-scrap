import { SocksProxyAgent } from 'socks-proxy-agent';
import https from 'https';
import fs from 'fs';

const PROXY_URL = 'socks5://oH2XZer6WzFTaY299bVr9NwL:QrYkpu4itrGTyXnxXAQK4U11@us.socks.nordhold.net:1080';
const agent = new SocksProxyAgent(PROXY_URL);
const API_KEY = "AIzaSyAxQ7X3xweJdEG1lgzQDEFVWz07ZMSwZR0";

const identityImagePath = './src/models/israeli-cute.png';
const outputDir = './test-generated';

console.log('🎨 Image Generation Test\n');

if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

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
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

async function main() {
  try {
    console.log('📸 Loading reference image...');
    const identityB64 = fs.readFileSync(identityImagePath).toString('base64');

    console.log('🔄 Generating variation...\n');
    
    // Safer prompt - create an illustration/artistic version
    const payload = {
      contents: [{
        parts: [
          { text: "Create a stylized digital portrait illustration inspired by this reference. Use artistic style with soft lighting, warm tones. The subject should be a woman with similar features in a relaxed casual pose. Make it look like a professional digital art illustration, not photorealistic." },
          { inline_data: { mime_type: "image/png", data: identityB64 } }
        ]
      }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: "9:16" }
      }
    };
    
    const response = await callGemini(payload);
    
    const candidate = response.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== "STOP") {
      console.log('⚠️ Issue:', candidate.finishReason);
      console.log('Message:', candidate.finishMessage || 'No details');
      return;
    }
    
    // Save images
    const parts = candidate?.content?.parts || [];
    let count = 0;
    
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].inlineData) {
        const imgData = Buffer.from(parts[i].inlineData.data, 'base64');
        const filename = `${outputDir}/artistic_${count}.jpg`;
        fs.writeFileSync(filename, imgData);
        console.log('✅ Saved:', filename);
        count++;
      }
    }
    
    console.log(`\n✅ Generated ${count} image(s)`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

main();
