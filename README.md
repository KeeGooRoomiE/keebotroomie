# Telegram to LinkedIn Sync (GitHub Actions)

# KeeBotRoomiE

Automated cross-posting bot from Telegram channel [@keegooroomie](https://t.me/keegooroomie) to LinkedIn personal profile.

[![Sync Status](https://github.com/KeeGooRoomiE/keebotroomie/actions/workflows/post-to-linkedin.yml/badge.svg)](https://github.com/KeeGooRoomiE/keebotroomie/actions)

## Features

* 🔄 **Automated sync** every hour via GitHub Actions
* 📸 **Image support** — posts with photos (single image per post)
* 🔒 **Secure** — channel whitelist, admin notifications
* 💾 **Stateful** — remembers last processed message, no duplicates
* 🚨 **Token monitoring** — alerts when LinkedIn token expires
* 🆓 **Free hosting** — runs on GitHub Actions (2,000 free minutes/month)

## How It Works

```
┌─────────────┐      ┌──────────────────┐      ┌──────────────┐
│  Telegram   │ ───> │  GitHub Actions  │ ───> │   LinkedIn   │
│   Channel   │      │   (every hour)   │      │    Profile   │
└─────────────┘      └──────────────────┘      └──────────────┘
                              │
                              ▼
                    Tracks last_message_id
                    (no duplicates)
```

1. **Hourly trigger** — GitHub Actions runs `index.js` every hour
2. **Poll Telegram** — fetches new posts since last run
3. **Upload media** — downloads photos, uploads to LinkedIn Assets API
4. **Create post** — publishes to your LinkedIn profile
5. **Save state** — updates `last_message_id.txt` via Actions cache

## Setup

### Prerequisites

* Telegram Bot Token (via [@BotFather](https://t.me/BotFather))
* LinkedIn Developer App (via [LinkedIn Developers](https://www.linkedin.com/developers/apps))
* GitHub account (for Actions)

---

### 1. Create Telegram Bot

1. Open [@BotFather](https://t.me/BotFather)
2. Send `/newbot`
3. Follow prompts → get **bot token** (`123456:ABC-DEF...`)
4. Add bot to your channel as **admin**
5. **Disable groups**: `/mybots` → Bot Settings → Allow Groups? → **Turn off**

---

### 2. Get Channel ID

Send a post to your channel, then:

```bash
curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
```

Look for `"chat":{"id":-1001234567890}` — this is your **TARGET\_CHANNEL\_ID**.

---

### 3. Create LinkedIn App

1. Go to [LinkedIn Developers](https://www.linkedin.com/developers/apps)
2. **Create app**:
   * App name: `KeeBotRoomiE` (or any)
   * LinkedIn Page: create/select a company page
   * **Verify** the page association
3. **Products** tab → Request **"Share on LinkedIn"** (instant approval)
4. **Auth** tab → copy **Client ID** and **Client Secret**
5. **Auth** tab → Add redirect URL: `http://localhost:3000/callback`

---

### 4. Get LinkedIn Tokens

#### Local Setup

1. Clone this repo:
   ```bash
   git clone https://github.com/KeeGooRoomiE/keebotroomie.git
   cd keebotroomie
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create `.env`:
   ```bash
   LINKEDIN_CLIENT_ID=your_client_id
   LINKEDIN_CLIENT_SECRET=your_client_secret
   LINKEDIN_REDIRECT_URI=http://localhost:3000/callback
   TELEGRAM_BOT_TOKEN=your_bot_token
   ```
4. Run auth helper:
   ```bash
   node auth.js
   ```
5. Open http://localhost:3000 in browser
6. Click **"Authorize with LinkedIn"** → approve
7. Copy the **Access Token** and **Person URN** from the success page
8. Click **"Get my Telegram Chat ID"** → send a message to your bot → refresh page → copy **Chat ID**

---

### 5. Configure GitHub Secrets

1. Go to your repo → **Settings** → **Secrets and variables** → **Actions**
2. Add these secrets:


| Secret Name             | Example Value          | Where to Get              |
| ----------------------- | ---------------------- | ------------------------- |
| `TELEGRAM_BOT_TOKEN`    | `123456:ABC-DEF...`    | @BotFather                |
| `TELEGRAM_ADMIN_ID`     | `987654321`            | `auth.js`→ Get Chat ID   |
| `TARGET_CHANNEL_ID`     | `-1001234567890`       | Telegram getUpdates       |
| `LINKEDIN_ACCESS_TOKEN` | `AQV2UPwhP...`         | `auth.js`→ LinkedIn Auth |
| `LINKEDIN_PERSON_URN`   | `urn:li:person:abc123` | `auth.js`→ LinkedIn Auth |

---

### 6. Enable GitHub Actions

1. Go to **Actions** tab in your repo
2. If disabled, click **"I understand my workflows, go ahead and enable them"**
3. **Run workflow** manually to test (Actions → Sync Telegram to LinkedIn → Run workflow)

---

## Configuration

### Posting Frequency

Edit `.github/workflows/post-to-linkedin.yml`:

```yaml
on:
  schedule:
    - cron: '0 * * * *'  # Every hour
    # - cron: '*/30 * * * *'  # Every 30 minutes
    # - cron: '0 */3 * * *'  # Every 3 hours
```

Free tier: 2,000 minutes/month = \~66 hours of runtime.
Hourly runs = \~744 runs/month × 1-2 min each = well within limits.

### Admin Notifications

When enabled (`TELEGRAM_ADMIN_ID` set), you'll receive DMs about:

* ⚠️ **Token expiration** — LinkedIn access token expired (every \~60 days)
* ❌ **Sync errors** — script crashes or API failures

---

## Maintenance

### LinkedIn Token Expires Every \~60 Days

When you get the expiration notification:

1. Run `node auth.js` locally
2. Complete OAuth flow
3. Update **LINKEDIN\_ACCESS\_TOKEN** in GitHub Secrets
4. Done — bot resumes automatically

### Manually Trigger Sync

Go to **Actions** → **Sync Telegram to LinkedIn** → **Run workflow**

### View Logs

**Actions** → latest run → **Run sync script** step

---

## Architecture

```
keebotroomie/
├── index.js                 # Main sync script
├── auth.js                  # Local OAuth helper
├── package.json
├── last_message_id.txt      # Cached by GitHub Actions
└── .github/
    └── workflows/
        └── post-to-linkedin.yml
```

### Key Features

**Idempotency**: `last_message_id.txt` tracks processed posts → no duplicates even if GitHub Actions reruns.

**Channel whitelist**: Only posts from `TARGET_CHANNEL_ID` are processed → prevents abuse if bot is added elsewhere.

**Token validation**: Before every sync, checks if LinkedIn token is valid → exits cleanly with notification if expired.

**Single image only**: LinkedIn UGC API v2 supports 1 image per post. Multi-image albums are not supported.

---

## Limitations

* **No multi-image albums** — only first photo from Telegram album is posted
* **Text-only or single-photo posts** — videos/documents not supported
* **Hourly sync** — not real-time (can be adjusted to 30min with more GitHub Actions usage)
* **LinkedIn token expires** — manual renewal every \~60 days (no auto-refresh implemented)

---

## Troubleshooting

### Bot not posting

1. **Check Actions logs** — go to Actions tab → latest run → view error
2. **Verify secrets** — all 5 secrets must be set correctly
3. **Test manually** — Actions → Run workflow → check logs
4. **Channel ID format** — must be numeric like `-1001234567890`, not `@username`

### "LinkedIn Token is invalid"

1. Run `node auth.js` locally
2. Reauthorize LinkedIn
3. Update `LINKEDIN_ACCESS_TOKEN` in GitHub Secrets

### Posts going to wrong place

* Check `LINKEDIN_PERSON_URN` format: `urn:li:person:abc123`
* Verify it matches your profile via `https://api.linkedin.com/v2/userinfo`

### Duplicate posts

* GitHub Actions cache corrupted → delete `last_message_id.txt` from cache
* Or manually set a higher message ID in cache

---

## Security

* ✅ **Channel whitelist** — only `TARGET_CHANNEL_ID` posts are processed
* ✅ **Groups disabled** — bot cannot be added to groups
* ✅ **Secrets in GitHub** — tokens never committed to repo
* ✅ **Admin notifications** — DM alerts for issues

**Never commit `.env` file or expose tokens publicly.**

---

## License

MIT

---

## Author

**Alexander Gusarov**
DevOps Engineer | Kемерово, Russia

* 📱 Telegram: [@keegooroomie](https://t.me/keegooroomie)
* 💼 LinkedIn: [alexander-gusarov-4a08911a2](https://www.linkedin.com/in/alexander-gusarov-4a08911a2/)
* 🐙 GitHub: [KeeGooRoomiE](https://github.com/KeeGooRoomiE)

---

## Acknowledgments

Built with:

* [Telegram Bot API](https://core.telegram.org/bots/api)
* [LinkedIn API v2](https://learn.microsoft.com/en-us/linkedin/)
* [GitHub Actions](https://github.com/features/actions)

Бот для автоматической пересылки постов из Telegram канала в LinkedIn. Работает бесплатно через GitHub Actions.

## Особенности

* **Автономность**: Запускается каждый час по расписанию.
* **Уведомления**: Бот сам напишет вам в Telegram, если токен LinkedIn истечет или произойдет ошибка.
* **Безопасность**: Все данные хранятся в GitHub Secrets.

## Настройка

### 1. Получение данных (Локально)

1. Установите зависимости: `npm install`.
2. Создайте `.env` и укажите `TELEGRAM_BOT_TOKEN`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`.
3. Запустите `node auth.js`.
4. В браузере на `localhost:3000`:
   * Нажмите **Get my Telegram Chat ID**, напишите боту любое сообщение в Telegram и получите ваш `TELEGRAM_ADMIN_ID`.
   * Нажмите **Authorize with LinkedIn** и получите `LINKEDIN_ACCESS_TOKEN` и `LINKEDIN_PERSON_URN`.

### 2. Настройка GitHub

1. Создайте **приватный** репозиторий.
2. Загрузите файлы проекта (без `node_modules` и `.env`).
3. Добавьте секреты в **Settings -> Secrets and variables -> Actions**:
   * `TELEGRAM_BOT_TOKEN`: `8500165320:AAGzf367TZijOjLdX61irZRTc3JSYwAD5Zc`
   * `TELEGRAM_ADMIN_ID`: Ваш ID (полученный в шаге 1).
   * `LINKEDIN_ACCESS_TOKEN`: Ваш токен.
   * `LINKEDIN_PERSON_URN`: Ваш URN.
   * `TARGET_CHANNEL_ID`: `@keegooroomie`
   * `REPO_URL`: Ссылка на ваш репозиторий (для уведомлений).

### 3. Расписание (Cron)

Настраивается в `.github/workflows/post-to-linkedin.yml`.
По умолчанию: `0 * * * *` (каждый час).

* Чтобы изменить на "каждые 30 минут": `*/30 * * * *`.
* Чтобы изменить на "каждые 2 часа": `0 */2 * * *`.

## Как обновить токен, когда придет уведомление?

1. Запустите `node auth.js` локально.
2. Пройдите авторизацию LinkedIn.
3. Скопируйте новый токен в GitHub Secrets (замените старый `LINKEDIN_ACCESS_TOKEN`).
4. Всё! Бот снова в строю.
