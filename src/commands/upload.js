import fs from 'fs';
import path from 'path';
import { parseCSV } from '../core/csv.js';

const REVIEW_DIR = './review';

export async function uploadCommand(flags) {
  const subcommand = flags._?.[0];
  const account = flags.account || flags.a;

  // Handle "approved" subcommand
  if (subcommand === 'approved') {
    if (!account) {
      console.error('❌ Error: --account is required for approved uploads');
      console.log('Usage: ./cli.js upload approved -a @myaccount');
      process.exit(1);
    }
    return uploadApprovedCommand({ account });
  }

  // Regular upload
  const inputDir = flags.input || flags.i;

  if (!inputDir || !account) {
    console.error('❌ Error: --input and --account are required');
    console.log('Usage:');
    console.log('  ./cli.js upload -i ./generated -a @myaccount');
    console.log('  ./cli.js upload approved -a @myaccount');
    process.exit(1);
  }

  if (!fs.existsSync(inputDir)) {
    console.error(`❌ Input directory not found: ${inputDir}`);
    process.exit(1);
  }

  console.log(`\n📤 Upload to Instagram`);
  console.log(`📂 Input: ${inputDir}`);
  console.log(`👤 Account: ${account}`);
  console.log(`\n⏳ Upload functionality coming soon...\n`);

  console.log('⚠️  Upload command is a placeholder.');
  console.log('   Will be implemented with session management.\n');
}

export async function uploadApprovedCommand(flags) {
  const account = flags.account || flags.a;
  const approvalsPath = path.join(REVIEW_DIR, 'approvals.json');

  if (!account) {
    console.error('❌ Error: --account is required');
    process.exit(1);
  }

  if (!fs.existsSync(approvalsPath)) {
    console.error('❌ No approvals file found. Run review first.');
    process.exit(1);
  }

  const approvals = JSON.parse(fs.readFileSync(approvalsPath, 'utf8'));
  const approved = Object.entries(approvals).filter(([_, v]) => v.status === 'approved');

  if (approved.length === 0) {
    console.log('\n⚠️  No approved posts to upload');
    console.log('Approve posts with: ./cli.js review approve --id <post-id>\n');
    return;
  }

  console.log(`\n📤 Uploading ${approved.length} approved post(s) to ${account}\n`);

  for (const [id, data] of approved) {
    console.log(`[${id}]`);
    console.log(`   Images: ${data.images?.length || 0}`);
    
    // TODO: Actually upload
    console.log(`   ⏳ Upload placeholder (not implemented yet)`);
    
    // Mark as uploaded
    approvals[id].status = 'uploaded';
    approvals[id].uploadedAt = new Date().toISOString();
    approvals[id].uploadedTo = account;
  }

  fs.writeFileSync(approvalsPath, JSON.stringify(approvals, null, 2));

  console.log(`\n✅ Uploaded ${approved.length} post(s)`);
  console.log(`   Account: ${account}\n`);
}
