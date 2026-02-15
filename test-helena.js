import { GeminiImageGenerator } from './src/core/gemini.js';
import fs from 'fs';

// Set proxy
process.env.NORDVPN_PROXY = 'socks5://oH2XZer6WzFTaY299bVr9NwL:QrYkpu4itrGTyXnxXAQK4U11@us.socks.nordhold.net:1080';

const API_KEY = process.env.GEMINI_API_KEY || 'YOUR_API_KEY_HERE';
const generator = new GeminiImageGenerator(API_KEY, { model: 'gemini-2.5-flash' });

const outputDir = './test-helena';
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// 3 random posts from helenabeckmann (1 image each for testing)
const testImages = [
  {
    post: 'DUlIOVJDLnS',
    url: 'https://scontent-fra5-2.cdninstagram.com/v/t51.82787-15/632631406_18153149800444840_773346114252105670_n.jpg?stp=dst-jpegr_e35_tt6&_nc_cat=106&ig_cache_key=MzgyOTUwMjQzOTM1MTY3ODE3Ng%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6InhwaWRzLjE0NDB4MTA4MC5oZHIuQzMifQ%3D%3D&_nc_ohc=DC_MY6L8gJUQ7kNvwFsnpX4&_nc_oc=AdnOIt5yLnqm2iyaPPSiWrGWNv3ZcjR653RAhQsBisKnq5KAvUiUaKXzIpOBW3KgIgw&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent-fra5-2.cdninstagram.com&_nc_gid=mKt38nEnNGE3RkNsuEGpqQ&oh=00_AftEabaKcYkuKLziouIkBVMkwk6fZkmqGewoD_CWwTWoIQ&oe=699722D4'
  },
  {
    post: 'DUasejljM7L',
    url: 'https://scontent-fra5-2.cdninstagram.com/v/t51.82787-15/629728561_18152801923444840_1321420214850376778_n.jpg?stp=dst-jpegr_e35_tt6&_nc_cat=106&ig_cache_key=MzgyNjU2NjIwMDE4NTEyNTEwNA%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6InhwaWRzLjE0NDB4MTA4MC5oZHIuQzMifQ%3D%3D&_nc_ohc=Cq1x3SBamYsQ7kNvwHbdzOa&_nc_oc=AdnotM5EYSCC-syRyatCCmvXtSjgA0ETXMt9F17cBj9JQbJ2m-r7f9GkbfAucJ6ASZo&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent-fra5-2.cdninstagram.com&_nc_gid=D3XfIJJqD1clcXMRe3wtyw&oh=00_AfsU_vPq12GnZQR5OMauBCxQl9oCD66lBNaxe-2BsmuzGA&oe=69973DCB'
  },
  {
    post: 'DUTLc1DjPhv',
    url: 'https://scontent-fra5-2.cdninstagram.com/v/t51.82787-15/627675831_18152559538444840_9143983106215518166_n.jpg?stp=dst-jpg_e15_tt6&_nc_cat=106&ig_cache_key=MzgyNDQ1MDU0MzkwNTY3ODgyNg%3D%3D.3-ccb7-5&ccb=7-5&_nc_sid=58cdad&efg=eyJ2ZW5jb2RlX3RhZyI6InhwaWRzLjcyMHg0NDcuc2RyLkMzIn0%3D&_nc_ohc=0zfvARrA0V8Q7kNvwHb2uo1&_nc_oc=Adn6woa6XC8C46HseFkgYNViPwobSWVOtD2y2UwE5PhP-r5vSQz8vs5XhUXABGjR-Ww&_nc_ad=z-m&_nc_cid=0&_nc_zt=23&_nc_ht=scontent-fra5-2.cdninstagram.com&_nc_gid=f5UkXt89WiFMS0IHtEqTxA&oh=00_Afskme5bIVegZXgH4piUXh-bu76R1bPZrn5eqswIQlhXVQ&oe=69974E76'
  }
];

const identityImage = './src/models/israeli-cute.png';

console.log('🎨 Face Swap Test - 3 Random Posts from @helenabeckmann\n');

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
    await new Promise(r => setTimeout(r, 3000));
  }
  
  console.log('='.repeat(50));
  console.log('SUMMARY:');
  console.log(`✅ Successful: ${successCount}/${testImages.length}`);
  console.log(`⚠️ Blocked: ${failCount}/${testImages.length}`);
  console.log('='.repeat(50));
  console.log(`\nOutput: ${outputDir}`);
})();
