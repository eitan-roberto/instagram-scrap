import fs from 'fs';
import path from 'path';
import { parseCSV } from '../core/csv.js';
import { GeminiImageGenerator, ImageDescriptor } from '../core/gemini.js';

const DEFAULT_API_KEY = process.env.GEMINI_API_KEY;

export async function generateCommand(flags) {
  const inputFile = flags.input || flags.i;
  const outputDir = flags.output || flags.o || './generated';
  const apiKey = flags.apiKey || flags.key || DEFAULT_API_KEY;
  const mode = flags.mode || 'face-swap'; // face-swap, generate, describe
  const identityImage = flags.identity || flags.face;
  const model = flags.model || 'gemini-2.5-flash';

  if (!inputFile) {
    console.error('❌ Error: --input is required');
    console.log('Usage: ./cli.js generate -i ./data/account-scraped.csv');
    process.exit(1);
  }

  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Input file not found: ${inputFile}`);
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
  console.log(`🤖 Model: ${model}\n`);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Parse CSV
  const posts = parseCSV(inputFile);
  console.log(`Found ${posts.length} posts to process\n`);

  // Initialize generator
  const generator = new GeminiImageGenerator(apiKey, { model });

  // Mode: describe images
  if (mode === 'describe') {
    const descriptor = new ImageDescriptor(apiKey, { model });
    
    for (const post of posts) {
      const shortcode = post.shortcode || post.post_url?.split('/p/')?.[1]?.replace('/', '');
      if (!shortcode) continue;

      const imageUrls = post.image_urls?.split('|') || [];
      console.log(`\n📄 ${shortcode}: ${imageUrls.length} image(s)`);

      const descriptions = [];
      for (const [idx, url] of imageUrls.entries()) {
        console.log(`   [${idx + 1}] Describing...`);
        try {
          const desc = await descriptor.describe(url);
          descriptions.push(desc);
          
          // Save individual description
          const descPath = path.join(outputDir, `${shortcode}_img${idx}_desc.json`);
          fs.writeFileSync(descPath, JSON.stringify(desc, null, 2));
          console.log(`      ✅ Saved to ${path.basename(descPath)}`);
        } catch (e) {
          console.log(`      ❌ Error: ${e.message}`);
        }
      }

      // Update manifest with descriptions
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

  // Mode: face-swap or generate
  if (mode === 'face-swap' && !identityImage) {
    console.error('❌ Error: --identity image required for face-swap mode');
    console.log('Usage: ./cli.js generate -i data.csv --identity face.png --mode face-swap');
    process.exit(1);
  }

  // Process each post
  for (const post of posts) {
    const shortcode = post.shortcode || post.post_url?.split('/p/')?.[1]?.replace('/', '');
    if (!shortcode) continue;

    const imageUrls = post.image_urls?.split('|') || [];
    console.log(`\n📄 ${shortcode}: ${imageUrls.length} image(s)`);

    const generated = [];
    
    for (const [idx, url] of imageUrls.entries()) {
      console.log(`   [${idx + 1}] Generating...`);
      
      try {
        let response;
        
        if (mode === 'face-swap') {
          // Download structure image, swap with identity
          const structureB64 = await generator.downloadImage(url);
          const identityB64 = generator.imageToBase64(identityImage);
          
          response = await generator.callGemini([
            { text: flags.prompt || "Recreate the first image but with the model of the second image, keeping the outfit and body shape from the first image but with the skin type and tone of the second image." },
            { inline_data: { mime_type: "image/jpeg", data: structureB64 } },
            { inline_data: { mime_type: "image/jpeg", data: identityB64 } }
          ], {
            imageConfig: { aspectRatio: flags.aspectRatio || "9:16" }
          });
        } else {
          // Pure generation mode
          response = await generator.generate(flags.prompt || post.caption, {
            referenceImage: identityImage,
            aspectRatio: flags.aspectRatio || "1:1"
          });
        }

        // Save generated images
        const rowDir = path.join(outputDir, shortcode);
        if (!fs.existsSync(rowDir)) fs.mkdirSync(rowDir, { recursive: true });
        
        const saved = generator.extractImages(response, rowDir, `img${idx}`);
        generated.push(...saved);
        console.log(`      ✅ ${saved.length} image(s) saved`);
        
      } catch (e) {
        console.log(`      ❌ Error: ${e.message}`);
      }
      
      // Delay between requests
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

  console.log(`\n✅ Generated images saved to ${outputDir}`);
  console.log(`   Mode: ${mode}`);
  if (mode === 'face-swap') {
    console.log(`   Identity: ${identityImage}`);
  }
}
