# Instagram Login Instructions

## How to Save Instagram Session

Since Instagram requires login to view profiles, you need to login once and save the session.

### Method 1: Manual Login (Recommended)

1. **SSH into the server:**
```bash
ssh your-username@your-server-ip
```

2. **Navigate to project:**
```bash
cd /home/node/.openclaw/workspace/projects/instagram-scrap
```

3. **Run login script:**
```bash
node login-instagram.js
```

4. **A browser window will open** (if you have GUI access) or you'll see a URL to open locally

5. **Login to Instagram manually:**
   - Enter username/password
   - Complete 2FA if required
   - Wait until you see your feed

6. **Session is saved** in `user_data/` folder

### Method 2: Copy Cookies from Your Browser

1. **On your local machine**, login to Instagram in Chrome/Firefox

2. **Export cookies** using a browser extension (like "EditThisCookie")

3. **Copy cookies to server:**
```bash
scp cookies.txt user@server:/home/node/.openclaw/workspace/projects/instagram-scrap/user_data/
```

### Method 3: Send Me Credentials (Less Secure)

**Send me via secure message:**
- Instagram username
- Instagram password
- 2FA code (if enabled)

I'll login manually and save the session.

---

## After Login

Once session is saved, run:
```bash
node build-repository.js
```

This will scrape all profiles and build the repository.

---

## Current Status

Repository currently has data from:
- ✅ helenabeckmann (from CSV)
- ⏳ linda.sza (needs login)
- ⏳ lara_bsmnn (needs login)
- ⏳ sina.anjulie (needs login)
- ⏳ whatgigiwears (needs login)
- ⏳ sofiamcoelho (needs login)

---

## Files Created

- `user_data/` - Browser session (persistent login)
- `repository/outfits/` - Outfit descriptions (JSON)
- `repository/scenes/` - Scene descriptions (JSON)
- `repository/raw/` - Raw scraped data
