import { SocksProxyAgent } from 'socks-proxy-agent';
import https from 'https';
import fs from 'fs';

// NordVPN SOCKS5 proxy configuration
// You'll need to enter your actual NordVPN credentials
const PROXY_HOST = 'us.socks.nordhold.net'; // or nl.socks.nordhold.net, etc.
const PROXY_PORT = '1080';
const PROXY_USER = process.env.NORDVPN_USER || ''; // Your NordVPN username
const PROXY_PASS = process.env.NORDVPN_PASS || ''; // Your NordVPN password

const API_KEY = "AIzaSyAxQ7X3xweJdEG1lgzQDEFVWz07ZMSwZR0";
const MODEL = "gemini-2.5-flash";

// Check if credentials are set
if (!PROXY_USER || !PROXY_PASS) {
  console.error('❌ Error: Please set NORDVPN_USER and NORDVPN_PASS environment variables');
  console.log('Example: NORDVPN_USER=youruser NORDVPN_PASS=yourpass node test-vpn.js');
  process.exit(1);
}

// Create SOCKS5 proxy agent
const proxyUrl = `socks5://${PROXY_USER}:${PROXY_PASS}@${PROXY_HOST}:${PROXY_PORT}`;
const agent = new SocksProxyAgent(proxyUrl);

console.log('🧪 Testing Gemini API through NordVPN SOCKS5 proxy');
console.log('Proxy:', PROXY_HOST);
console.log('');

// Test 1: Simple text request
async function testTextRequest() {
  console.log('Test 1: Text → Text');
  
  const payload = JSON.stringify({
    contents: [{ parts: [{ text: "What is 2+2?" }] }]
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      agent: agent
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.candidates) {
            console.log('✅ Success:', json.candidates[0].content.parts[0].text);
            resolve(true);
          } else {
            console.log('❌ Failed:', json.error?.message || 'Unknown error');
            resolve(false);
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', (err) => {
      console.log('❌ Request error:', err.message);
      resolve(false);
    });
    req.write(payload);
    req.end();
  });
}

// Test 2: Image generation (the blocked feature)
async function testImageGeneration() {
  console.log('\nTest 2: Text → Image (generation)');
  
  const identityImagePath = './src/models/israeli-cute.png';
  const identityB64 = fs.readFileSync(identityImagePath).toString('base64');
  
  const payload = JSON.stringify({
    contents: [{
      parts: [
        { text: "Create a portrait photo of a young woman with long dark hair in a natural setting, professional photography style" },
        { inline_data: { mime_type: "image/png", data: identityB64 } }
      ]
    }],
    generationConfig: {
      responseModalities: ["IMAGE"]
    }
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-3-pro-image-preview:generateContent?key=${API_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      agent: agent
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          console.log('Response:', JSON.stringify(json, null, 2).substring(0, 500));
          
          if (json.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
            console.log('✅ Image generated successfully!');
            
            // Save the image
            const imgData = Buffer.from(json.candidates[0].content.parts[0].inlineData.data, 'base64');
            const outputDir = './test-generated';
            if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);
            fs.writeFileSync(`${outputDir}/vpn-test.jpg`, imgData);
            console.log('✅ Image saved to test-generated/vpn-test.jpg');
            resolve(true);
          } else if (json.candidates?.[0]?.finishReason === 'IMAGE_SAFETY') {
            console.log('⚠️ Blocked by safety filters');
            resolve(false);
          } else if (json.error?.message?.includes('not available in your country')) {
            console.log('❌ Still blocked: Image generation not available');
            resolve(false);
          } else {
            console.log('⚠️ No image in response');
            resolve(false);
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', (err) => {
      console.log('❌ Request error:', err.message);
      resolve(false);
    });
    req.write(payload);
    req.end();
  });
}

async function main() {
  try {
    // Test 1: Basic connectivity
    const textWorks = await testTextRequest();
    
    if (!textWorks) {
      console.log('\n❌ Proxy connection failed. Check credentials.');
      return;
    }
    
    // Test 2: Image generation
    const imageWorks = await testImageGeneration();
    
    console.log('\n' + '='.repeat(50));
    if (imageWorks) {
      console.log('✅ VPN WORKS! Image generation successful.');
    } else {
      console.log('⚠️ VPN connected but image generation still blocked.');
      console.log('   Try a different NordVPN server location.');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

main();
