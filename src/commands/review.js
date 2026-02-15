import fs from 'fs';
import path from 'path';

const REVIEW_DIR = './review';

export async function reviewCommand(flags) {
  const inputDir = flags.input || flags.i || './generated';
  
  console.log(`\n👁️  Review Generated Images`);
  console.log(`📂 Input: ${inputDir}\n`);

  if (!fs.existsSync(inputDir)) {
    console.error(`❌ Directory not found: ${inputDir}`);
    process.exit(1);
  }

  // Find all generated image sets
  const items = fs.readdirSync(inputDir)
    .filter(f => f.endsWith('-manifest.json'))
    .map(f => {
      const manifestPath = path.join(inputDir, f);
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      return {
        id: f.replace('-manifest.json', ''),
        manifest,
        manifestPath,
        images: manifest.generated || []
      };
    });

  if (items.length === 0) {
    console.log('⚠️  No generated images to review');
    return;
  }

  console.log(`Found ${items.length} post(s) to review\n`);

  // Ensure review directory exists
  if (!fs.existsSync(REVIEW_DIR)) {
    fs.mkdirSync(REVIEW_DIR, { recursive: true });
  }

  // Load existing approvals
  const approvalsPath = path.join(REVIEW_DIR, 'approvals.json');
  let approvals = {};
  if (fs.existsSync(approvalsPath)) {
    approvals = JSON.parse(fs.readFileSync(approvalsPath, 'utf8'));
  }

  // Review each item
  for (const item of items) {
    const existing = approvals[item.id];
    
    console.log('─'.repeat(60));
    console.log(`📄 Post: ${item.id}`);
    console.log(`   Original: ${item.manifest.originalPost || 'N/A'}`);
    console.log(`   Caption: ${(item.manifest.caption || '').substring(0, 100)}...`);
    console.log(`   Images: ${item.images.length}`);
    
    if (item.manifest.descriptions?.length > 0) {
      const desc = item.manifest.descriptions[0];
      const scene = desc.scene || {};
      const subject = desc.subject || {};
      console.log(`   Scene: ${scene.location || 'N/A'}`);
      console.log(`   Action: ${subject.action || 'N/A'}`);
    }
    console.log();

    // Show image paths
    item.images.forEach((img, idx) => {
      console.log(`   🖼️  [${idx + 1}] ${img}`);
    });
    console.log();

    // Check if already reviewed
    if (existing) {
      console.log(`   Status: ${existing.status.toUpperCase()} (${existing.reviewedAt})`);
      console.log();
      continue;
    }

    // Mark as pending review
    approvals[item.id] = {
      status: 'pending',
      images: item.images,
      manifestPath: item.manifestPath,
      reviewedAt: null
    };
  }

  // Save approvals
  fs.writeFileSync(approvalsPath, JSON.stringify(approvals, null, 2));

  console.log('─'.repeat(60));
  console.log('\n✅ Review manifest saved');
  console.log(`📁 ${approvalsPath}\n`);
  console.log('Commands:');
  console.log('  ./cli.js review approve --id <post-id>');
  console.log('  ./cli.js review reject --id <post-id>');
  console.log('  ./cli.js review pending');
  console.log('  ./cli.js upload approved\n');
}

export async function approveCommand(flags) {
  const id = flags.id;
  const approvalsPath = path.join(REVIEW_DIR, 'approvals.json');
  
  if (!id) {
    console.error('❌ Error: --id is required');
    process.exit(1);
  }

  if (!fs.existsSync(approvalsPath)) {
    console.error('❌ No approvals file found');
    process.exit(1);
  }

  const approvals = JSON.parse(fs.readFileSync(approvalsPath, 'utf8'));
  
  if (!approvals[id]) {
    console.error(`❌ Post ${id} not found`);
    process.exit(1);
  }

  approvals[id].status = 'approved';
  approvals[id].reviewedAt = new Date().toISOString();
  
  fs.writeFileSync(approvalsPath, JSON.stringify(approvals, null, 2));
  console.log(`✅ Approved: ${id}`);
}

export async function rejectCommand(flags) {
  const id = flags.id;
  const approvalsPath = path.join(REVIEW_DIR, 'approvals.json');
  
  if (!id) {
    console.error('❌ Error: --id is required');
    process.exit(1);
  }

  if (!fs.existsSync(approvalsPath)) {
    console.error('❌ No approvals file found');
    process.exit(1);
  }

  const approvals = JSON.parse(fs.readFileSync(approvalsPath, 'utf8'));
  
  if (approvals[id]) {
    approvals[id].status = 'rejected';
    approvals[id].reviewedAt = new Date().toISOString();
    fs.writeFileSync(approvalsPath, JSON.stringify(approvals, null, 2));
    console.log(`❌ Rejected: ${id}`);
  }
}

export async function listPendingCommand() {
  const approvalsPath = path.join(REVIEW_DIR, 'approvals.json');
  
  if (!fs.existsSync(REVIEW_DIR) || !fs.existsSync(approvalsPath)) {
    console.log('\n📊 Review Status:');
    console.log('   Pending:  0');
    console.log('   Approved: 0');
    console.log('   Rejected: 0');
    console.log('\n   No items to review yet.');
    console.log('   Run: ./cli.js generate first\n');
    return;
  }

  const approvals = JSON.parse(fs.readFileSync(approvalsPath, 'utf8'));
  const pending = Object.entries(approvals).filter(([_, v]) => v.status === 'pending');
  const approved = Object.entries(approvals).filter(([_, v]) => v.status === 'approved');
  const rejected = Object.entries(approvals).filter(([_, v]) => v.status === 'rejected');

  console.log('\n📊 Review Status:');
  console.log(`   Pending:  ${pending.length}`);
  console.log(`   Approved: ${approved.length}`);
  console.log(`   Rejected: ${rejected.length}`);
  console.log();

  if (pending.length > 0) {
    console.log('⏳ Pending:');
    pending.forEach(([id, data]) => {
      console.log(`   • ${id} (${data.images?.length || 0} images)`);
    });
    console.log();
  }

  if (approved.length > 0) {
    console.log('✅ Ready to upload:');
    approved.forEach(([id, data]) => {
      console.log(`   • ${id}`);
    });
    console.log();
    console.log('Run: ./cli.js upload approved\n');
  }
}

// Main review command handler
export async function reviewMainCommand(flags) {
  const subcommand = flags._?.[0] || 'show';

  switch (subcommand) {
    case 'show':
    case 'list':
      await reviewCommand(flags);
      break;
    case 'approve':
      await approveCommand(flags);
      break;
    case 'reject':
      await rejectCommand(flags);
      break;
    case 'pending':
      await listPendingCommand();
      break;
    default:
      console.log(`\nReview commands:
  review show       Show all items for review
  review approve    Approve item (--id required)
  review reject     Reject item (--id required)  
  review pending    List pending/approved counts
`);
  }
}
