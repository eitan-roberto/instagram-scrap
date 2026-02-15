import { GeminiImageGenerator } from './src/core/gemini.js';
import fs from 'fs';

const API_KEY = process.env.GEMINI_API_KEY || "AIzaSyAxQ7X3xweJdEG1lgzQDEFVWz07ZMSwZR0";

const structureImageUrl = 'https://scontent-fra5-1.cdninstagram.com/v/t51.82787-15/628134265_18408216238125405_4335708264951004473_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=110&ig_cache_key=MzgyNzM5ODMyOTM3MDU5NDIwMA%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6InhwaWRzLjE0NDB4MTg4Ni5zZHIuQzMifQ%3D%3D&_nc_ohc=CAaqeM8RkQMQ7kNvwFkU3Kv&_nc_oc=AdkKZrRPfrK5JEbhGwKEl7TANa1zL9BwiB_NJ5x8QAzaH6ofCc00Vb9TrbegZc61f2g&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent-fra5-1.cdninstagram.com&_nc_gid=Wh4-DU1h6oiL3w3gF1gktg&oh=00_Afumw4dPdDAURHkYKuJcOM1IMLHjN5HwoSOsIiIv3Qk6dw&oe=6995D6A3';

const identityImagePath = './src/models/israeli-cute.png';
const outputDir = './test-generated';

async function main() {
  console.log('🎨 Testing Face Swap Generation\n');

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const generator = new GeminiImageGenerator(API_KEY, {
    model: 'gemini-3-pro-image-preview'
  });

  try {
    console.log('📥 Downloading structure image...');
    const structureB64 = await generator.downloadImage(structureImageUrl);
    
    console.log('📸 Loading identity image...');
    const identityB64 = generator.imageToBase64(identityImagePath);

    console.log('🔄 Calling Gemini API...\n');
    
    const prompt = "Recreate the first image but with the model of the second image, keeping the outfit and body shape from the first image but with the skin type and tone of the second image.";
    
    const response = await generator.callGemini([
      { text: prompt },
      { inline_data: { mime_type: "image/jpeg", data: structureB64 } },
      { inline_data: { mime_type: "image/png", data: identityB64 } }
    ], {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: "9:16" }
    });

    console.log('✅ API Response received!');
    
    // Debug: Save the raw response
    fs.writeFileSync('./test-generated/debug-response.json', JSON.stringify(response, null, 2));
    console.log('📝 Raw response saved to debug-response.json\n');
    
    // Try to extract images
    console.log('📁 Attempting to extract images...');
    console.log('Response structure:', Object.keys(response));
    
    if (response.candidates) {
      console.log('Candidates:', response.candidates.length);
      response.candidates.forEach((c, i) => {
        console.log(`  Candidate ${i}:`, Object.keys(c));
        if (c.content?.parts) {
          console.log(`    Parts:`, c.content.parts.length);
          c.content.parts.forEach((p, j) => {
            console.log(`      Part ${j}:`, Object.keys(p));
          });
        }
      });
    }
    
    const saved = generator.extractImages(response, outputDir, 'faceswap-test');
    console.log(`\n✅ Saved ${saved.length} image(s)`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }
}

main();
