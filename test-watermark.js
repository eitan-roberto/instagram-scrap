import { SocksProxyAgent } from 'socks-proxy-agent';
import https from 'https';
import fs from 'fs';

const PROXY_URL = 'socks5://oH2XZer6WzFTaY299bVr9NwL:QrYkpu4itrGTyXnxXAQK4U11@us.socks.nordhold.net:1080';
const agent = new SocksProxyAgent(PROXY_URL);
const API_KEY = process.env.GEMINI_API_KEY || 'YOUR_API_KEY_HERE';

const instagramUrl = 'https://scontent-fra5-2.cdninstagram.com/v/t51.82787-15/629728561_18152801923444840_1321420214850376778_n.jpg?stp=dst-jpegr_e35_tt6&_nc_cat=106&ig_cache_key=MzgyNjU2NjIwMDE4NTEyNTEwNA%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6InhwaWRzLjE0NDB4MTA4MC5oZHIuQzMifQ%3D%3D&_nc_ohc=Cq1x3SBamYsQ7kNvwHbdzOa&_nc_oc=AdnotM5EYSCC-syRyatCCmvXtSjgA0ETXMt9F17cBj9JQbJ2m-r7f9GkbfAucJ6ASZo&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent-fra5-2.cdninstagram.com&_nc_gid=D3XfIJJqD1clcXMRe3wtyw&oh=00_AfsU_vPq12GnZQR5OMauBCxQl9oCD66lBNaxe-2BsmuzGA&oe=69973DCB';
const identityPath = './src/models/israeli-cute.png';
const outDir = './test-watermark';

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { agent }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
    }).on('error', reject);
  });
}

function callGemini(payload, model) {
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
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.write(JSON.stringify(payload));
    req.end();
  });
}

async function main() {
  console.log('🎨 Generating with Google Gemini...\n');
  
  const instagramB64 = await downloadImage(instagramUrl);
  const identityB64 = fs.readFileSync(identityPath).toString('base64');
  
  // Describe
  const descResponse = await callGemini({
    contents: [{
      parts: [
        { inline_data: { mime_type: 'image/jpeg', data: instagramB64 } },
        { text: 'Describe this fashion photo in detail for AI generation. Include outfit, pose, setting, lighting.' }
      ]
    }]
  }, 'gemini-2.5-flash');
  
  const description = descResponse.candidates?.[0]?.content?.parts?.[0]?.text;
  console.log('📝 Description:', description.substring(0, 100) + '...\n');
  
  // Generate
  const genResponse = await callGemini({
    contents: [{
      parts: [
        { text: `Create this fashion photo: ${description}` },
        { inline_data: { mime_type: 'image/png', data: identityB64 } }
      ]
    }],
    generationConfig: { responseModalities: ['IMAGE'] }
  }, 'gemini-3-pro-image-preview');
  
  const candidate = genResponse.candidates?.[0];
  if (candidate?.finishReason === 'STOP') {
    const imgData = Buffer.from(candidate.content.parts[0].inlineData.data, 'base64');
    fs.writeFileSync(`${outDir}/google-generated.jpg`, imgData);
    console.log('✅ Saved to test-watermark/google-generated.jpg');
  } else {
    console.log('❌ Failed:', candidate?.finishReason);
  }
}

main().catch(console.error);
