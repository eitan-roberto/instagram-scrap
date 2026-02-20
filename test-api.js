import { SocksProxyAgent } from 'socks-proxy-agent';
import https from 'https';
import fs from 'fs';

const PROXY_URL = 'socks5://oH2XZer6WzFTaY299bVr9NwL:QrYkpu4itrGTyXnxXAQK4U11@us.socks.nordhold.net:1080';
const agent = new SocksProxyAgent(PROXY_URL);
const API_KEY = 'AIzaSyB7olaBwD3-zXFPfDTTXa-L20AytQUeRmM';

const identityB64 = fs.readFileSync('./src/models/israeli-cute.png').toString('base64');

const payload = {
  contents: [{
    parts: [
      { text: "Create a simple portrait photo of a woman" },
      { inline_data: { mime_type: "image/png", data: identityB64 } }
    ]
  }],
  generationConfig: { responseModalities: ["IMAGE"] }
};

console.log('Testing Gemini API...\n');

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
    console.log('Status:', res.statusCode);
    console.log('\nResponse:');
    try {
      const json = JSON.parse(data);
      console.log(JSON.stringify(json, null, 2).substring(0, 2000));
    } catch (e) {
      console.log(data.substring(0, 2000));
    }
  });
});

req.on('error', (err) => console.log('Error:', err.message));
req.write(JSON.stringify(payload));
req.end();
