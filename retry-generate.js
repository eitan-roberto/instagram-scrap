import { SocksProxyAgent } from 'socks-proxy-agent';
import https from 'https';
import fs from 'fs';

const PROXY_URL = 'socks5://oH2XZer6WzFTaY299bVr9NwL:QrYkpu4itrGTyXnxXAQK4U11@us.socks.nordhold.net:1080';
const agent = new SocksProxyAgent(PROXY_URL);
const API_KEY = 'AIzaSyAxQ7X3xweJdEG1lgzQDEFVWz07ZMSwZR0';

const identityImagePath = './src/models/israeli-cute.png';
const outputDir = './test-describe-generate';

const description = fs.readFileSync(`${outputDir}/description.txt`, 'utf8');

console.log('🎨 RETRY: Generate image from description\n');

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
  const identityB64 = fs.readFileSync(identityImagePath).toString('base64');

  const generatePrompt = `Create a fashion photo with these specifications:

${description}

Use the person in the reference image as the model. Maintain their face features, hair, and skin tone. The result should look like the model from the reference image wearing the outfit and pose described above.`;

  console.log('📤 Sending generation request...\n');

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

  const generateResponse = await callGemini(generatePayload);
  
  const candidate = generateResponse.candidates?.[0];
  
  if (candidate?.finishReason === 'STOP') {
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
  } else if (generateResponse.error) {
    console.log('❌ API Error:', generateResponse.error.message);
  } else {
    console.log('⚠️ Response:', JSON.stringify(generateResponse, null, 2));
  }
}

main().catch(e => console.error('❌ Error:', e.message));
