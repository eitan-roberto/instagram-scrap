import { GeminiImageGenerator } from './src/core/gemini.js';
import fs from 'fs';

// Set proxy
process.env.NORDVPN_PROXY = 'socks5://oH2XZer6WzFTaY299bVr9NwL:QrYkpu4itrGTyXnxXAQK4U11@us.socks.nordhold.net:1080';

const API_KEY = process.env.GEMINI_API_KEY || 'YOUR_API_KEY_HERE';
const generator = new GeminiImageGenerator(API_KEY, { model: 'gemini-2.5-flash' });

const outputDir = './test-batch';
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// Pick just one image from the posts
const testImages = [
  {
    post: 'DUdpoCMDsuY',
    url: 'https://scontent-fra5-1.cdninstagram.com/v/t51.82787-15/628134265_18408216238125405_4335708264951004473_n.jpg?stp=dst-jpg_e35_tt6&_nc_cat=110&ig_cache_key=MzgyNzM5ODMyOTM3MDU5NDIwMA%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6InhwaWRzLjE0NDB4MTg4Ni5zZHIuQzMifQ%3D%3D&_nc_ohc=CAaqeM8RkQMQ7kNvwFkU3Kv&_nc_oc=AdkKZrRPfrK5JEbhGwKEl7TANa1zL9BwiB_NJ5x8QAzaH6ofCc00Vb9TrbegZc61f2g&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent-fra5-1.cdninstagram.com&_nc_gid=Wh4-DU1h6oiL3w3gF1gktg&oh=00_Afumw4dPdDAURHkYKuJcOM1IMLHjN5HwoSOsIiIv3Qk6dw&oe=6995D6A3'
  },
  {
    post: 'DUQ_dBhAcD3', 
    url: 'https://scontent-fra5-1.cdninstagram.com/v/t51.82787-15/625685179_18406461541125405_1162124541566533708_n.jpg?stp=dst-jpegr_e35_tt6&_nc_cat=110&ig_cache_key=MzgyMzgzNTA5NjI1NTg5OTU2Nw%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6InhwaWRzLjE0NDB4MTkyMC5oZHIuQzMifQ%3D%3D&_nc_ohc=ZAM825ug5X4Q7kNvwHLcyxh&_nc_oc=AdnVT_kwpNtEriuPBY3Bm7uSXbFSiuBIN8IX67ZUI3Rg5NMrEVP5xGELc5cFKiLRm4U&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent-fra5-1.cdninstagram.com&_nc_gid=-NCaq2PtllTvtvlyO766WA&oh=00_AfsUrZnq4shvqwVQq5oAsjNF4Ncb7YO0ovxepHL9LZlLIw&oe=6995D333'
  }
];

const identityImage = './src/models/israeli-cute.png';

console.log('🎨 Quick Face Swap Test (2 images)\n');

(async () => {
  let successCount = 0;
  let failCount = 0;
  
  for (const img of testImages) {
    console.log(`📄 ${img.post}:`);
    console.log(`   Attempting face swap...`);
    
    try {
      const result = await generator.faceSwap(img.url, identityImage, {
        aspectRatio: '9:16',
        model: 'gemini-2.5-flash'
      });
      
      if (result.success) {
        const postDir = `${outputDir}/${img.post}`;
        if (!fs.existsSync(postDir)) fs.mkdirSync(postDir, { recursive: true });
        
        const saved = generator.extractImages(result.response, postDir, 'generated');
        console.log(`   ✅ SUCCESS! Saved ${saved.length} image(s)`);
        console.log(`      Files: ${saved.map(s => s.split('/').pop()).join(', ')}`);
        successCount++;
      } else {
        console.log(`   ⚠️ BLOCKED (all ${result.results.length} prompts failed)`);
        failCount++;
      }
    } catch (e) {
      console.log(`   ❌ ERROR: ${e.message}`);
      failCount++;
    }
    
    console.log('');
    await new Promise(r => setTimeout(r, 3000)); // Delay between requests
  }
  
  console.log('='.repeat(50));
  console.log('SUMMARY:');
  console.log(`✅ Successful: ${successCount}/${testImages.length}`);
  console.log(`⚠️ Blocked: ${failCount}/${testImages.length}`);
  console.log('='.repeat(50));
  console.log(`\nOutput: ${outputDir}`);
})();
