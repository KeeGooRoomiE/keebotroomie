# Telegram to LinkedIn Sync (GitHub Actions)

Бот для автоматической пересылки постов из Telegram канала в LinkedIn. Работает бесплатно через GitHub Actions.

## Особенности
*   **Автономность**: Запускается каждый час по расписанию.
*   **Уведомления**: Бот сам напишет вам в Telegram, если токен LinkedIn истечет или произойдет ошибка.
*   **Безопасность**: Все данные хранятся в GitHub Secrets.

## Настройка

### 1. Получение данных (Локально)
1.  Установите зависимости: `npm install`.
2.  Создайте `.env` и укажите `TELEGRAM_BOT_TOKEN`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`.
3.  Запустите `node auth.js`.
4.  В браузере на `localhost:3000`:
    *   Нажмите **Get my Telegram Chat ID**, напишите боту любое сообщение в Telegram и получите ваш `TELEGRAM_ADMIN_ID`.
    *   Нажмите **Authorize with LinkedIn** и получите `LINKEDIN_ACCESS_TOKEN` и `LINKEDIN_PERSON_URN`.

### 2. Настройка GitHub
1.  Создайте **приватный** репозиторий.
2.  Загрузите файлы проекта (без `node_modules` и `.env`).
3.  Добавьте секреты в **Settings -> Secrets and variables -> Actions**:
    *   `TELEGRAM_BOT_TOKEN`: `8500165320:AAGzf367TZijOjLdX61irZRTc3JSYwAD5Zc`
    *   `TELEGRAM_ADMIN_ID`: Ваш ID (полученный в шаге 1).
    *   `LINKEDIN_ACCESS_TOKEN`: Ваш токен.
    *   `LINKEDIN_PERSON_URN`: Ваш URN.
    *   `TARGET_CHANNEL_ID`: `@keegooroomie`
    *   `REPO_URL`: Ссылка на ваш репозиторий (для уведомлений).

### 3. Расписание (Cron)
Настраивается в `.github/workflows/post-to-linkedin.yml`.
По умолчанию: `0 * * * *` (каждый час).
*   Чтобы изменить на "каждые 30 минут": `*/30 * * * *`.
*   Чтобы изменить на "каждые 2 часа": `0 */2 * * *`.

## Как обновить токен, когда придет уведомление?
1.  Запустите `node auth.js` локально.
2.  Пройдите авторизацию LinkedIn.
3.  Скопируйте новый токен в GitHub Secrets (замените старый `LINKEDIN_ACCESS_TOKEN`).
4.  Всё! Бот снова в строю.
