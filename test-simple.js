import https from 'https';
import fs from 'fs';

const API_KEY = "AIzaSyAxQ7X3xweJdEG1lgzQDEFVWz07ZMSwZR0";
const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// Instagram image URL (structure image)
const structureImageUrl = 'https://scontent-fra5-1.cdninstagram.com/v/t51.82787-15/628134265_18408216238125405_4335708264951004473_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=110&ig_cache_key=MzgyNzM5ODMyOTM3MDU5NDIwMA%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6InhwaWRzLjE0NDB4MTg4Ni5zZHIuQzMifQ%3D%3D&_nc_ohc=CAaqeM8RkQMQ7kNvwFkU3Kv&_nc_oc=AdkKZrRPfrK5JEbhGwKEl7TANa1zL9BwiB_NJ5x8QAzaH6ofCc00Vb9TrbegZc61f2g&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent-fra5-1.cdninstagram.com&_nc_gid=Wh4-DU1h6oiL3w3gF1gktg&oh=00_Afumw4dPdDAURHkYKuJcOM1IMLHjN5HwoSOsIiIv3Qk6dw&oe=6995D6A3';

// Model image path
const identityImagePath = './src/models/israeli-cute.png';
const outputDir = './test-generated';

// Download image from URL
function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
    }).on('error', reject);
  });
}

// Call Gemini API
function callGemini(payload) {
  return new Promise((resolve, reject) => {
    const req = https.request(ENDPOINT, {
      method: 'POST',
      headers: {
        'x-goog-api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) reject(new Error(json.error.message));
          else resolve(json);
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
  console.log('🎨 Face Swap Test\n');
  
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  
  console.log('📥 Downloading images...');
  const structureB64 = await downloadImage(structureImageUrl);
  const identityB64 = fs.readFileSync(identityImagePath).toString('base64');
  
  console.log('🔄 Generating...\n');
  
  const payload = {
    contents: [{
      parts: [
        { text: "Create a new image combining both reference images. Use the outfit, pose and setting from the first image, but use the face and hair style from the second image. Maintain realistic photography style." },
        { inline_data: { mime_type: "image/jpeg", data: structureB64 } },
        { inline_data: { mime_type: "image/png", data: identityB64 } }
      ]
    }],
    generationConfig: {
      responseModalities: ["IMAGE"]
    }
  };
  
  try {
    const response = await callGemini(payload);
    
    // Check for errors
    const candidate = response.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== "STOP") {
      console.log('⚠️ Generation issue:', candidate.finishReason);
      console.log('Message:', candidate.finishMessage || 'No message');
      fs.writeFileSync(`${outputDir}/error.json`, JSON.stringify(response, null, 2));
      return;
    }
    
    // Extract images
    let count = 0;
    const parts = candidate?.content?.parts || [];
    
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].inlineData) {
        const imgData = Buffer.from(parts[i].inlineData.data, 'base64');
        const filename = `${outputDir}/generated_${count}.jpg`;
        fs.writeFileSync(filename, imgData);
        console.log('✅ Saved:', filename);
        count++;
      }
    }
    
    if (count === 0) {
      console.log('⚠️ No images in response');
      fs.writeFileSync(`${outputDir}/response.json`, JSON.stringify(response, null, 2));
    } else {
      console.log(`\n✅ Generated ${count} image(s)`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

main();
