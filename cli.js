#!/usr/bin/env node

import { scrapeCommand } from './src/commands/scrape.js';
import { generateCommand } from './src/commands/generate.js';
import { uploadCommand } from './src/commands/upload.js';
import { reviewMainCommand } from './src/commands/review.js';
import { dailyCommand } from './src/commands/daily.js';
import { sessionCommand } from './src/commands/session.js';
import { describeCommand } from './src/commands/describe.js';

const args = process.argv.slice(2);
const command = args[0];

// Parse flags and positional args
const parseArgs = (args) => {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].replace('--', '');
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
      flags[key] = value;
      if (value !== true) i++;
    } else if (args[i].startsWith('-')) {
      const key = args[i].replace('-', '');
      const value = args[i + 1] && !args[i + 1].startsWith('-') ? args[i + 1] : true;
      flags[key] = value;
      if (value !== true) i++;
    } else {
      positional.push(args[i]);
    }
  }
  flags._ = positional;
  return flags;
};

const flags = parseArgs(args.slice(1));

// Show help
if (!command || command === 'help' || flags.help || flags.h) {
  console.log(`
🤖 Instagram Automation CLI

WORKFLOW:
  1. scrape → 2. generate → 3. review → 4. upload

COMMANDS:

  scrape <target>
    Scrape Instagram profile
    -t, --target      Target username or URL
    -l, --limit       Max posts (default: all)
    -o, --output      Output dir (default: ./data)

  generate
    Generate images using Gemini AI
    -i, --input       Input CSV file
    -o, --output      Output dir (default: ./generated)
    -m, --mode        Mode: face-swap|generate|describe (default: face-swap)
    --identity        Face image for face-swap mode
    --prompt          Custom generation prompt
    --model           Gemini model (default: gemini-2.5-flash)
    --aspectRatio     Aspect ratio: 1:1|9:16|16:9 (default: 9:16)
    --apiKey          Gemini API key (or GEMINI_API_KEY env)

  describe
    Analyze images and get structured descriptions
    -i, --input       Input CSV or image path
    -o, --output      Output dir (default: ./descriptions)
    --model           Gemini model (default: gemini-2.5-flash)
    --apiKey          Gemini API key

  review
    Review generated images before upload
    show              Show all items
    approve --id      Approve specific item
    reject --id       Reject specific item
    pending           Show status counts

  upload
    Upload approved content
    approved          Upload all approved items
    -a, --account     Target account
    -i, --input       Upload specific item

  daily
    Full daily workflow
    --source          Source account
    --dest            Destination account
    --limit           Max posts

  session
    Manage login sessions
    list              List sessions
    create --name     Create new session
    delete --name     Delete session

EXAMPLES:
  # Scrape
  ./cli.js scrape -t noachassidim

  # Generate with face swap
  ./cli.js generate -i ./data/noachassidim.csv --identity ./face.png --mode face-swap

  # Describe images (structured output)
  ./cli.js describe -i ./data/noachassidim.csv

  # Daily workflow
  ./cli.js daily --source noachassidim --dest @myaccount

  # Review and approve
  ./cli.js review show
  ./cli.js review approve --id POST_ID
  ./cli.js upload approved -a @myaccount
`);
  process.exit(0);
}

// Execute command
async function main() {
  try {
    switch (command) {
      case 'scrape':
        await scrapeCommand(flags);
        break;
      case 'generate':
        await generateCommand(flags);
        break;
      case 'describe':
        await describeCommand(flags);
        break;
      case 'review':
        await reviewMainCommand(flags);
        break;
      case 'upload':
        await uploadCommand(flags);
        break;
      case 'daily':
        await dailyCommand(flags);
        break;
      case 'session':
        await sessionCommand(flags);
        break;
      default:
        console.error(`❌ Unknown command: ${command}`);
        console.log('Run `./cli.js help` for usage');
        process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
