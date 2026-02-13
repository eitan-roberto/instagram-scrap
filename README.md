# Instagram Scraper - Human-like Approach

This scraper mimics a real human browsing Instagram, which avoids detection and blocking.

## How It Works

Instead of trying to automate login (which gets blocked), this approach:

1. **Opens a real browser window** you can see
2. **You login manually** (like a normal user)
3. **Session is saved** so you don't need to login again
4. **Scraper enters each photo** like a human clicking
5. **Extracts all image URLs** including carousels
6. **Saves to CSV** for easy analysis

## Quick Start

### 1. Set target profile

```bash
export IG_TARGET="https://www.instagram.com/username/"
export IG_MAX_PHOTOS=20  # How many photos to scrape
```

### 2. Run the scraper

```bash
npm run scrape
```

### 3. First time - Login manually

- A Chrome window will open
- Instagram will load
- **Login manually** with your credentials
- **Press ENTER** in the terminal when done
- Your session is now saved!

### 4. Scraping begins

The scraper will:
- Navigate to the profile
- Scroll naturally (like a human)
- Click each photo
- Extract image URLs
- Handle carousels (multiple images)
- Save everything to CSV

## Features

✅ **Persistent session** - Login once, reuse forever  
✅ **Human-like delays** - Random waits between actions  
✅ **Natural scrolling** - Mimics real user behavior  
✅ **Carousel support** - Gets all images from multi-photo posts  
✅ **Progress saving** - Saves CSV every 5 posts  
✅ **Headless ready** - After first login, can run headless  

## Output

CSV files saved to `data/` folder:
```csv
URL,Caption,Likes,Date,Image_URLs
https://instagram.com/p/ABC123,Beautiful sunset,1234 likes,2024-01-15,https://instagram.com/image1.jpg
```

## File Structure

```
instagram-scrap/
├── src/
│   └── human-scraper.js    # Main scraper
├── user_data/              # Saved browser session (cookies, etc)
├── screenshots/            # Debug screenshots
├── data/                   # CSV output
└── package.json
```

## Session Management

Your login session is stored in `user_data/` folder. This includes:
- Cookies
- Local storage
- Session storage
- Login state

**To logout/start fresh:**
```bash
rm -rf user_data/
```

## Docker/Sandbox Notes

This approach works much better in Docker because:
- Uses real browser with persistent storage
- Manual login bypasses bot detection
- Human-like timing avoids rate limits
- Session reuse reduces login attempts

## Troubleshooting

**"Please login manually" keeps appearing:**
- Delete `user_data/` folder and try again
- Make sure you're fully logged in before pressing ENTER

**Photos not loading:**
- Check your internet connection
- Instagram may be slow - increase delays in the code

**Getting blocked after scraping many photos:**
- Reduce `IG_MAX_PHOTOS` to scrape fewer at once
- Add longer delays between photos (edit the `randomDelay` calls)
- Wait a few hours before scraping again

## Security

- Your login credentials are NOT stored
- Only session cookies are saved
- You login manually (scraper never sees your password)
- Session is stored locally on your machine

## Alternative: Old Puppeteer Approach

If you want to try the automated approach (less reliable):

```bash
npm run scrape:old
```

This uses Puppeteer with stealth plugins but Instagram usually blocks it.

## Requirements

- Node.js 18+
- Playwright (installs automatically)
- Chrome/Chromium (Playwright downloads this)

## License

Use at your own risk. Respect Instagram's Terms of Service.
