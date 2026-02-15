# Instagram Automation CLI

A CLI tool for Instagram automation: **scrape → generate → review → upload**

## Features

- **Scrape** - Download posts from any Instagram account
- **Generate** - Create new images using Gemini AI (face-swap or generation)
- **Describe** - Analyze images and get structured JSON descriptions
- **Review** - Human-in-the-loop approval workflow
- **Upload** - Post approved content to destination account

## Installation

```bash
npm install
```

## Configuration

Set your Gemini API key:

```bash
export GEMINI_API_KEY="your-api-key"
```

Or use `--apiKey` flag with commands.

## Commands

### 1. Scrape

```bash
# Scrape entire profile
./cli.js scrape -t noachassidim

# Limit number of posts
./cli.js scrape -t noachassidim -l 20
```

### 2. Describe (Image Analysis)

Analyze images and get structured JSON descriptions:

```bash
# Describe all images from scraped CSV
./cli.js describe -i ./data/noachassidim-scraped.csv -o ./descriptions

# Describe single image
./cli.js describe -i ./image.jpg
```

Output structure:
```json
{
  "meta": {
    "quality": "ultrafotorrealista",
    "resolution": "8k",
    "camera": "iPhone 15 Pro",
    "aspect_ratio": "4:3",
    "style": "realismo crudo..."
  },
  "character_lock": {
    "age": "veintitantos",
    "ethnicity": "mediterránea",
    "hair": { "color": "castaño", "style": "moño desordenado" },
    "eyes": "marrones",
    "body": { "type": "curvilínea", ... }
  },
  "scene": { "location": "dormitorio", "time": "tarde", ... },
  "camera_perspective": { "pov": "selfie", "angle": "alto", ... },
  "subject": { "action": "de pie", "pose": {...}, "outfit": {...} },
  "lighting": { "type": "lámpara cálida", ... },
  "negative_prompt": ["hombres", "desnudez", ...]
}
```

### 3. Generate Images

#### Face Swap Mode
Swap faces between images:

```bash
./cli.js generate \
  -i ./data/noachassidim-scraped.csv \
  --identity ./face.png \
  --mode face-swap \
  -o ./generated
```

#### Describe Mode (for review)
Generate descriptions without images:

```bash
./cli.js generate -i ./data/noachassidim.csv --mode describe
```

#### Generation Mode
Generate from text prompts:

```bash
./cli.js generate \
  -i ./data/posts.csv \
  --mode generate \
  --prompt "Create a similar image but with..."
```

### 4. Review

```bash
# Show all items for review
./cli.js review show

# Check status
./cli.js review pending

# Approve specific post
./cli.js review approve --id DUdpoCMDsuY

# Reject post
./cli.js review reject --id DGBHsgWIxUH
```

### 5. Upload

```bash
# Upload only approved posts
./cli.js upload approved -a @myaccount
```

### 6. Daily Workflow

Full automation (scrape → describe → review → upload):

```bash
./cli.js daily --source noachassidim --dest @myaccount
```

This will:
1. Scrape all posts from source
2. Generate descriptions for images
3. Show you the review list
4. Wait for your approval
5. Upload approved posts

## Session Management

```bash
# Create login session
./cli.js session create --name @myaccount

# List sessions
./cli.js session list

# Delete session
./cli.js session delete --name @myaccount
```

## Directory Structure

```
├── data/              # Scraped CSV files
├── generated/         # Generated images + manifests
├── descriptions/      # Image analysis JSON files
├── review/            # Approval tracking
│   └── approvals.json
├── sessions/          # Instagram login sessions
└── src/
    ├── commands/      # CLI commands
    ├── core/          # Core modules
    │   ├── scraper.js
    │   ├── gemini.js  # Image generation & description
    │   └── csv.js
    └── utils/
```

## Human-in-the-Loop Workflow

The CLI is designed for approval workflow:

```bash
# 1. Run daily workflow (stops at review)
./cli.js daily --source noachassidim --dest @myaccount

# 2. Review descriptions/images
./cli.js review show

# 3. Approve good posts
./cli.js review approve --id POST_ID_1
./cli.js review approve --id POST_ID_2

# 4. Upload approved
./cli.js upload approved -a @myaccount
```

## API Reference

### GeminiImageGenerator

```javascript
import { GeminiImageGenerator } from './src/core/gemini.js';

const gen = new GeminiImageGenerator(apiKey, { model: 'gemini-2.5-flash' });

// Face swap
await gen.faceSwap('./identity.jpg', './structure.jpg');

// Generate from prompt
await gen.generate('A photo of...', { aspectRatio: '9:16' });
```

### ImageDescriptor

```javascript
import { ImageDescriptor } from './src/core/gemini.js';

const desc = new ImageDescriptor(apiKey);

// Single image
const result = await desc.describe('./image.jpg');

// Batch
const results = await desc.describeBatch(['img1.jpg', 'img2.jpg']);
```

## Environment Variables

```bash
GEMINI_API_KEY      # Required for generation/describe
IG_USERNAME         # For upload (optional)
IG_PASSWORD         # For upload (optional)
```

## License

Private
