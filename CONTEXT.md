# instagram-scrap - CONTEXT

## Project Overview
Instagram profile scraper using Puppeteer with Docker-compatible Chromium settings.

## Status
🟡 **In Development** - Core scraper built, needs testing

## What It Does
1. Logs into Instagram (with 2FA handling)
2. Navigates to target profile
3. Scrapes posts (up to configurable limit)
4. For each post extracts:
   - Post URL
   - Caption text
   - Like count
   - Date posted
   - All image URLs (carousel support)
   - Video URLs if present
5. Exports to CSV

## Tech Stack
- **Runtime:** Node.js 18+ with ES modules
- **Browser:** Puppeteer + puppeteer-extra-plugin-stealth
- **Export:** csv-writer
- **Config:** dotenv

## Key Features
- ✅ Docker sandbox compatibility (`--no-sandbox` flags)
- ✅ Stealth mode to avoid detection
- ✅ Auto-scroll to load more posts
- ✅ Progress saving (every 5 posts)
- ✅ Error screenshots
- ✅ Random delays to avoid rate limiting

## File Structure
```
src/
├── index.js          # CLI entry point
├── scraper.js        # Main scraper class (InstagramScraper)
└── test-login.js     # Login test utility

data/                 # CSV output
logs/                 # Screenshots for debugging
```

## Docker/Container Notes
REQUIRED Chromium args for sandboxed environments:
```javascript
[
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu'
]
```

## Usage

### Test Login
```bash
npm run test
```

### Scrape Profile
```bash
export IG_USERNAME="user"
export IG_PASSWORD="pass"
export IG_TARGET="https://www.instagram.com/profile/"
export IG_MAX_POSTS="20"
npm start
```

## Known Limitations
- Instagram changes selectors frequently (may need updates)
- 2FA not fully handled yet
- Private profiles not accessible
- Rate limiting possible (use delays)

## Next Steps
1. Test login functionality
2. Test profile scraping
3. Handle edge cases (empty profiles, private accounts)
4. Add proxy support for large-scale scraping
5. Add retry logic for failed posts

## Safety Notes
- Respect rate limits
- Don't scrape too fast
- Private profiles are off-limits
- Use at your own risk

## Created
2026-02-13 by Roberto for Eitan
