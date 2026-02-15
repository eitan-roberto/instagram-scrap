import fs from 'fs';
import path from 'path';
import { parseCSV } from '../core/csv.js';
import { GeminiImageGenerator, ImageDescriptor } from '../core/gemini.js';

// NordVPN credentials from environment or default
const NORDVPN_USER = process.env.NORDVPN_USER || 'oH2XZer6WzFTaY299bVr9NwL';
const NORDVPN_PASS = process.env.NORDVPN_PASS || 'QrYkpu4itrGTyXnxXAQK4U11';
const NORDVPN_HOST = process.env.NORDVPN_HOST || 'us.socks.nordhold.net';

// Set proxy for all Gemini operations
process.env.NORDVPN_PROXY = `socks5://${NORDVPN_USER}:${NORDVPN_PASS}@${NORDVPN_HOST}:1080`;

const DEFAULT_API_KEY = process.env.GEMINI_API_KEY;

export async function generateCommand(flags) {
  const inputFile = flags.input || flags.i;
  const outputDir = flags.output || flags.o || './generated';
  const apiKey = flags.apiKey || flags.key || DEFAULT_API_KEY;
  const mode = flags.mode || 'describe';
  const identityImage = flags.identity || flags.face;
  const model = flags.model || 'gemini-2.5-flash';

  if (!inputFile) {
    console.error('❌ Error: --input is required');
    console.log('Usage: ./cli.js generate -i ./data/account-scraped.csv');
    process.exit(1);
  }

  if (!apiKey) {
    console.error('❌ Error: Gemini API key required');
    console.log('Set GEMINI_API_KEY env var or use --apiKey flag');
    process.exit(1);
  }

  console.log(`\n🎨 Generate Images (${mode})`);
  console.log(`📂 Input: ${inputFile}`);
  console.log(`💾 Output: ${outputDir}`);
  console.log(`🤖 Model: ${model}`);
  console.log(`🌐 VPN: ${NORDVPN_HOST}\n`);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const posts = parseCSV(inputFile);
  console.log(`Found ${posts.length} posts to process\n`);

  // Mode: describe images
  if (mode === 'describe') {
    const descriptor = new ImageDescriptor(apiKey, { model });
    
    for (const post of posts) {
      const shortcode = post.shortcode || post.post_url?.split('/p/')?.[1]?.replace('/', '');
      if (!shortcode) continue;

      const imageUrls = post.image_urls?.split('|') || [];
      console.log(`📄 ${shortcode}: ${imageUrls.length} image(s)`);

      const descriptions = [];
      for (const [idx, url] of imageUrls.entries()) {
        console.log(`   [${idx + 1}] Describing...`);
        try {
          const desc = await descriptor.describe(url);
          descriptions.push(desc);
          
          const descPath = path.join(outputDir, `${shortcode}_img${idx}_desc.json`);
          fs.writeFileSync(descPath, JSON.stringify(desc, null, 2));
          console.log(`      ✅ Saved`);
        } catch (e) {
          console.log(`      ❌ Error: ${e.message}`);
        }
      }

      // Update manifest
      const manifestPath = path.join(outputDir, `${shortcode}-manifest.json`);
      const manifest = fs.existsSync(manifestPath) 
        ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        : { shortcode, timestamp: new Date().toISOString() };
      
      manifest.descriptions = descriptions;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }

    console.log(`\n✅ Descriptions saved to ${outputDir}`);
    return;
  }

  // Mode: face-swap
  if (mode === 'face-swap') {
    if (!identityImage) {
      console.error('❌ Error: --identity image required for face-swap mode');
      console.log('Usage: ./cli.js generate -i data.csv --identity face.png --mode face-swap');
      process.exit(1);
    }

    const generator = new GeminiImageGenerator(apiKey, { model });
    let successCount = 0;
    let failCount = 0;

    for (const post of posts.slice(0, 3)) { // Limit to first 3 for testing
      const shortcode = post.shortcode || post.post_url?.split('/p/')?.[1]?.replace('/', '');
      if (!shortcode) continue;

      const imageUrls = post.image_urls?.split('|') || [];
      if (imageUrls.length === 0) continue;

      console.log(`\n📄 ${shortcode}: ${imageUrls.length} image(s)`);

      const generated = [];
      
      for (const [idx, url] of imageUrls.entries()) {
        console.log(`   [${idx + 1}] Face swap...`);
        
        const result = await generator.faceSwap(url, identityImage, {
          aspectRatio: flags.aspectRatio || '9:16',
          model: 'gemini-2.5-flash'
        });

        if (result.success) {
          const rowDir = path.join(outputDir, shortcode);
          if (!fs.existsSync(rowDir)) fs.mkdirSync(rowDir, { recursive: true });
          
          const saved = generator.extractImages(result.response, rowDir, `img${idx}`);
          generated.push(...saved);
          console.log(`      ✅ Success (prompt ${result.promptIndex + 1})`);
          successCount++;
        } else {
          console.log(`      ⚠️ Failed (all ${result.results.length} prompts blocked)`);
          failCount++;
        }
        
        await new Promise(r => setTimeout(r, 2000));
      }

      // Update manifest
      const manifestPath = path.join(outputDir, `${shortcode}-manifest.json`);
      const manifest = fs.existsSync(manifestPath)
        ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        : {
            shortcode,
            originalPost: post.post_url,
            caption: post.caption,
            date: post.date,
            timestamp: new Date().toISOString()
          };
      
      manifest.generated = generated;
      manifest.status = generated.length > 0 ? 'generated' : 'failed';
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log('Face Swap Results:');
    console.log(`✅ Successful: ${successCount}`);
    console.log(`⚠️ Blocked: ${failCount}`);
    console.log(`${'='.repeat(50)}`);
    console.log(`\nOutput: ${outputDir}`);
    return;
  }

  // Mode: generate from prompt
  if (mode === 'generate') {
    const generator = new GeminiImageGenerator(apiKey, { model });

    for (const post of posts) {
      const shortcode = post.shortcode || post.post_url?.split('/p/')?.[1]?.replace('/', '');
      if (!shortcode) continue;

      console.log(`\n📄 ${shortcode}:`);

      try {
        const response = await generator.generate(flags.prompt || post.caption, {
          referenceImage: identityImage,
          aspectRatio: flags.aspectRatio || '1:1'
        });

        const rowDir = path.join(outputDir, shortcode);
        if (!fs.existsSync(rowDir)) fs.mkdirSync(rowDir, { recursive: true });
        
        const saved = generator.extractImages(response, rowDir, 'generated');
        console.log(`   ✅ ${saved.length} image(s)`);

        const manifestPath = path.join(outputDir, `${shortcode}-manifest.json`);
        fs.writeFileSync(manifestPath, JSON.stringify({
          shortcode,
          originalPost: post.post_url,
          caption: post.caption,
          generated: saved,
          timestamp: new Date().toISOString()
        }, null, 2));
        
      } catch (e) {
        console.log(`   ❌ Error: ${e.message}`);
      }
      
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`\n✅ Generated images saved to ${outputDir}`);
  }
}
