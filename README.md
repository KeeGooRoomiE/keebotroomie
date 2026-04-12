# Telegram → LinkedIn (No Server, GitHub Actions)

Cross-post Telegram channel to LinkedIn — **without servers, hosting, or payments**.  
Runs entirely on **GitHub Actions (free tier)**.

---

## TL;DR

- ⏱ Runs on schedule (cron, default: every hour)
- 💸 $0 cost (GitHub Actions free tier)
- ⚙️ Setup: ~10–15 minutes
- 📸 Supports text + single image posts
- 🔁 No duplicates (stateful)

👉 Fork → set secrets → done

---

## Why

Most solutions require:
- VPS / server
- always-on process
- monitoring + payments

This project removes all of that:

→ GitHub Actions runs everything  
→ no infrastructure needed  
→ no monthly cost  

---

## How It Works

Telegram Channel → GitHub Actions (cron) → LinkedIn Profile  
                         ↓  
                 last_message_id (state)

1. GitHub Actions runs `index.js` on schedule  
2. Script fetches new Telegram posts  
3. Uploads image (if present) to LinkedIn  
4. Publishes post  
5. Saves last processed message ID  

---

## Quick Start (10–15 min)

1. **Fork this repo**

2. **Create Telegram bot**
   - Open https://t.me/BotFather
   - /newbot → get token
   - Add bot to your channel as admin

3. **Run local auth helper**
   ```bash
   git clone https://github.com/KeeGooRoomiE/keebotroomie.git
   cd keebotroomie
   npm install
   ```

4. Create `.env`
   ```env
   TELEGRAM_BOT_TOKEN=your_bot_token
   LINKEDIN_CLIENT_ID=your_client_id
   LINKEDIN_CLIENT_SECRET=your_client_secret
   LINKEDIN_REDIRECT_URI=http://localhost:3000/callback
   ```

5. Run:
   ```bash
   node auth.js
   ```

6. In browser:
   - Authorize LinkedIn → get LINKEDIN_ACCESS_TOKEN
   - Get Telegram Chat ID → get TELEGRAM_ADMIN_ID

7. **Add GitHub Secrets**

Go to: Settings → Secrets and variables → Actions

Add:

- TELEGRAM_BOT_TOKEN
- TELEGRAM_ADMIN_ID
- TARGET_CHANNEL_ID
- LINKEDIN_ACCESS_TOKEN
- LINKEDIN_PERSON_URN

8. **Enable Actions**
   - Go to Actions tab
   - Run workflow manually once

Done.

---

## Configuration

Edit `.github/workflows/post-to-linkedin.yml`

Examples:

- every hour: `0 * * * *`
- every 30 min: `*/30 * * * *`
- every 3 hours: `0 */3 * * *`

---

## Features

- 🔄 Scheduled sync via GitHub Actions  
- 📸 Image support (single image)  
- 🔁 No duplicates (state tracking)  
- 🔒 Channel whitelist  
- 🚨 Admin notifications  
- 🆓 Fully free hosting  

---

## Limitations

- Only 1 image per post
- No videos or documents
- Not real-time (cron-based)
- LinkedIn token expires (~60 days)

---

## Maintenance

Token expired?

1. Run:
   ```bash
   node auth.js
   ```
2. Reauthorize LinkedIn  
3. Update LINKEDIN_ACCESS_TOKEN  

---

## Troubleshooting

Nothing posts?

- Check Actions logs  
- Verify secrets  
- Ensure bot is admin  
- Check TARGET_CHANNEL_ID format  

---

## Architecture

- index.js — main logic
- auth.js — OAuth helper
- last_message_id.txt — state
- .github/workflows — cron

---

## License

MIT
