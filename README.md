# Telegram → LinkedIn (Serverless via GitHub Actions)

Cross-post from a Telegram channel to your LinkedIn profile with **zero infrastructure**.  
Runs entirely on **GitHub Actions** (free tier).

---

## TL;DR

- ⏱ Cron-based (default: every hour)
- 💸 $0 hosting cost
- ⚙️ Setup: ~10–15 minutes
- 📸 Text + single image supported
- 🔁 Idempotent (no duplicate posts)

👉 Fork → configure secrets → done

---

## Why this exists

Typical solutions:
- require a VPS
- run persistent workers
- cost money and need maintenance

This project:
- uses GitHub Actions as a scheduler
- runs stateless jobs
- persists minimal state (last message id)
- avoids infrastructure entirely

---

## How it works

1. Action runs on schedule  
2. Script fetches Telegram updates  
3. Filters new posts from your channel  
4. Uploads media (if exists) to LinkedIn  
5. Creates a post  
6. Stores last processed message ID  

---

## Quick Start

### 1. Fork repository

### 2. Create Telegram bot
- Use @BotFather
- Get token
- Add bot as **admin** to your channel

### 3. Get credentials

Run locally:

```bash
git clone <your-fork>
cd keebotroomie
npm install
node auth.js
```

You will get:
- TELEGRAM_ADMIN_ID
- LINKEDIN_ACCESS_TOKEN
- LINKEDIN_PERSON_URN

---

### 4. Configure GitHub Secrets

Add in repo settings:

- TELEGRAM_BOT_TOKEN
- TELEGRAM_ADMIN_ID
- TARGET_CHANNEL_ID
- LINKEDIN_ACCESS_TOKEN
- LINKEDIN_PERSON_URN

---

### 5. Enable Actions

Run workflow once manually.

Done.

---

## Post History

Every successfully published post is automatically appended to `posts.txt` in the repository.

Format:

```
https://t.me/yourchannel/123 - 2026-07-02 15:30:00
Post text here...

https://t.me/yourchannel/124 - 2026-07-03 10:15:42
Next post text...
```

Each entry contains a link to the original Telegram post, the publish timestamp (UTC), and the post text. Media is not stored. New posts are always appended at the bottom.

To disable logging, set `canSavePosts = false` in `index.js`.

---

## LinkedIn Token Renewal

LinkedIn access tokens expire every ~60 days. The bot includes two workflows to handle this:

- **LinkedIn Token Monitor** — runs every Monday at 9:00 UTC. If the token is expired, sends a Telegram notification with an authorization link.
- **LinkedIn Token Refresh** — triggered manually via `workflow_dispatch`. Paste the `code` from the LinkedIn redirect URL as input — the workflow exchanges it for a new token and updates `LINKEDIN_ACCESS_TOKEN` and `LINKEDIN_PERSON_URN` secrets automatically.

Required secrets for renewal: `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `GH_PAT` (Personal Access Token with `repo` scope).

---

## Configuration

Edit cron in:

.github/workflows/post-to-linkedin.yml

Examples:
- hourly: `0 * * * *`
- every 30 min: `*/30 * * * *`

---

## Features

- Serverless architecture
- No duplicate posts
- Admin notifications
- Token validation
- Channel whitelist
- Post history log
- Automatic LinkedIn token renewal workflow

---

## Limitations

- Only 1 image supported
- No videos/documents
- Not real-time
- LinkedIn token expires (~60 days)

---

## Troubleshooting

- Check Actions logs
- Verify secrets
- Ensure bot has admin rights
- Validate channel ID format (-100...)

---

## Architecture

- `index.js` — sync logic
- `auth.js` — LinkedIn OAuth helper (run locally)
- `posts.txt` — post history log
- `last_message_id.txt` — deduplication state
- `last_update_id.txt` — Telegram API offset state
- `.github/workflows/post-to-linkedin.yml` — hourly sync
- `.github/workflows/linkedin-token-monitor.yml` — weekly token check
- `.github/workflows/linkedin-token-refresh.yml` — manual token renewal

---

## License

MIT
