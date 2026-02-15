import fs from 'fs';
import path from 'path';
import { scrapeCommand } from './scrape.js';
import { generateCommand } from './generate.js';
import { reviewCommand } from './review.js';
import { uploadApprovedCommand } from './upload.js';

const DATA_DIR = './data';
const GEN_DIR = './generated';

export async function dailyCommand(flags) {
  const source = flags.source;
  const dest = flags.dest || flags.account || flags.a;

  if (!source || !dest) {
    console.error('❌ Error: --source and --dest are required');
    console.log('Usage: ./cli.js daily --source noachassidim --dest @myaccount');
    process.exit(1);
  }

  const username = source.replace('@', '');
  const csvFile = path.join(DATA_DIR, `${username}-scraped.csv`);

  console.log(`\n🔄 Daily Workflow: ${source} → ${dest}\n`);

  // Step 1: Scrape (if not already scraped or force)
  if (!fs.existsSync(csvFile) || flags.rescrape) {
    console.log('═'.repeat(60));
    console.log('STEP 1: SCRAPE');
    console.log('═'.repeat(60));
    
    await scrapeCommand({
      target: source,
      output: DATA_DIR
    });
  } else {
    console.log('═'.repeat(60));
    console.log('STEP 1: SCRAPE (skipped - using existing)');
    console.log('═'.repeat(60));
    console.log(`Using: ${csvFile}\n`);
  }

  if (!fs.existsSync(csvFile)) {
    console.error('❌ Scraping failed');
    process.exit(1);
  }

  // Step 2: Generate
  console.log('\n' + '═'.repeat(60));
  console.log('STEP 2: GENERATE');
  console.log('═'.repeat(60));
  
  await generateCommand({
    input: csvFile,
    output: GEN_DIR,
    mode: flags.mode || 'describe', // Default to describe for review
    apiKey: flags.apiKey
  });

  // Step 3: Review
  console.log('\n' + '═'.repeat(60));
  console.log('STEP 3: REVIEW');
  console.log('═'.repeat(60));
  
  await reviewCommand({ input: GEN_DIR });

  console.log('\n📸 Review generated content and approve posts');
  console.log('Approve with: ./cli.js review approve --id <post-id>');
  console.log('Then upload:  ./cli.js upload approved -a ' + dest + '\n');
}
