# Instagram Scraper

Instagram profile scraper built with Puppeteer. Works in Docker/containers with proper sandbox settings.

## Features

- ✅ Docker-compatible (uses `--no-sandbox` flags)
- ✅ Stealth mode (avoids detection)
- ✅ Login automation
- ✅ Profile scraping with pagination
- ✅ Extracts: post URLs, captions, likes, dates, images, videos
- ✅ CSV export
- ✅ Progress saving every 5 posts
- ✅ Screenshot on errors

## Quick Start

### 1. Install

```bash
cd instagram-scrap
npm install
```

### 2. Set credentials

```bash
export IG_USERNAME="your_instagram_username"
export IG_PASSWORD="your_instagram_password"
export IG_TARGET="https://www.instagram.com/target_profile/"
export IG_MAX_POSTS="20"
```

Or create `.env` file:
```
IG_USERNAME=your_username
IG_PASSWORD=your_password
IG_TARGET=https://www.instagram.com/target_profile/
IG_MAX_POSTS=20
```

### 3. Run

```bash
# Test login first (opens browser window)
npm run test

# Run full scraper
npm run scrape
```

## Output

CSV saved to `data/` folder with columns:
- POST_URL
- CAPTION
- LIKES
- DATE
- IMAGE_URLS
- VIDEO_URLS

## Docker Notes

The scraper uses these Chromium flags (REQUIRED for Docker/sandboxed environments):

```javascript
[
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu'
]
```

## Project Structure

```
instagram-scrap/
├── src/
│   ├── scraper.js      # Main scraper class
│   ├── test-login.js   # Login test script
│   └── index.js        # Entry point
├── data/               # CSV output
├── logs/               # Screenshots
├── .env.example
└── package.json
```

## Troubleshooting

**"No sandbox" errors:**
- Already handled by default args in scraper

**Login fails:**
- Check credentials
- Instagram may require 2FA (not handled yet)
- Try test script to debug: `npm run test`

**Rate limiting:**
- Reduce `maxPosts`
- Increase delays in code
- Use longer `slowMo` value

**Selectors outdated:**
- Instagram changes selectors frequently
- Update `SELECTORS` object in scraper.js

## Safety

- Don't scrape too fast (add delays)
- Don't scrape private profiles
- Respect Instagram's Terms of Service
- Use at your own risk

## Requirements

- Node.js 18+
- Puppeteer will download Chromium automatically
