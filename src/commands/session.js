import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import readline from 'readline';

const SESSIONS_DIR = './sessions';

function ensureSessionsDir() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

function listSessions() {
  ensureSessionsDir();
  const sessions = fs.readdirSync(SESSIONS_DIR)
    .filter(f => fs.statSync(path.join(SESSIONS_DIR, f)).isDirectory())
    .map(name => {
      const sessionPath = path.join(SESSIONS_DIR, name);
      const stats = fs.statSync(sessionPath);
      return {
        name,
        created: stats.birthtime,
        size: fs.readdirSync(sessionPath).length
      };
    });

  if (sessions.length === 0) {
    console.log('\n📂 No sessions found');
    return;
  }

  console.log('\n📂 Available Sessions:');
  console.log('─'.repeat(60));
  sessions.forEach(s => {
    console.log(`  • ${s.name}`);
    console.log(`    Created: ${s.created.toLocaleString()}`);
    console.log(`    Files: ${s.size}`);
    console.log();
  });
}

async function createSession(name) {
  ensureSessionsDir();
  
  if (!name) {
    console.error('❌ Error: --name is required');
    process.exit(1);
  }

  const sessionPath = path.join(SESSIONS_DIR, name);
  
  if (fs.existsSync(sessionPath)) {
    console.log(`⚠️  Session "${name}" already exists. Overwrite? (y/n)`);
    console.log('Use delete first if you want to recreate.');
    return;
  }

  console.log(`\n🔑 Creating new session: ${name}`);
  console.log('A browser will open. Please login to Instagram manually.\n');

  const context = await chromium.launchPersistentContext(sessionPath, {
    headless: false,
    viewport: { width: 1280, height: 720 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await context.newPage();
  
  await page.goto('https://www.instagram.com/accounts/login/', {
    waitUntil: 'networkidle'
  });

  console.log('🌐 Browser opened. Please login manually...');
  console.log('Press ENTER when done (or wait 60s)...\n');

  // Wait for user to press enter
  await new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const timeout = setTimeout(() => {
      rl.close();
      resolve();
    }, 60000);

    rl.once('line', () => {
      clearTimeout(timeout);
      rl.close();
      resolve();
    });
  });

  await context.close();
  console.log(`✅ Session saved: ${sessionPath}\n`);
}

function deleteSession(name) {
  if (!name) {
    console.error('❌ Error: --name is required');
    process.exit(1);
  }

  const sessionPath = path.join(SESSIONS_DIR, name);
  
  if (!fs.existsSync(sessionPath)) {
    console.error(`❌ Session "${name}" not found`);
    process.exit(1);
  }

  fs.rmSync(sessionPath, { recursive: true, force: true });
  console.log(`🗑️  Deleted session: ${name}\n`);
}

export async function sessionCommand(flags) {
  const subcommand = flags._?.[0] || 'list';
  const name = flags.name || flags.n;

  switch (subcommand) {
    case 'list':
    case 'ls':
      listSessions();
      break;
    case 'create':
      await createSession(name);
      break;
    case 'delete':
    case 'rm':
      deleteSession(name);
      break;
    default:
      console.log(`\nSession commands:
  list        List all sessions
  create      Create new session (--name required)
  delete      Delete session (--name required)\n`);
  }
}
