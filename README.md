# IDX Keyword Alerts to Telegram

A small Docker service that checks the rendered IDX Keterbukaan Informasi page every five minutes during weekday market hours and sends Telegram alerts for new matching disclosures.

The service deliberately uses Chromium rather than an undocumented IDX endpoint. IDX currently protects ordinary server requests with Cloudflare; the monitor reports challenge pages and does not attempt to bypass CAPTCHAs or access controls.

## What it monitors

- Schedule: Monday–Friday, 07:55–16:15 Asia/Jakarta (public holidays are not excluded).
- Match fields: disclosure title, ticker, and attachment filenames.
- Match rule: any configured phrase, case-insensitive substring.
- First run: records the current first page silently.
- Later runs: alerts only for unseen records and scans older pages after an outage until it reaches a stored record.
- Document contents are never downloaded or inspected.

## Telegram setup

1. Message `@BotFather` in Telegram, create a bot, and copy its token.
2. Start a private chat with the new bot and send it any message.
3. Open `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` and copy `message.chat.id` from the response.
4. Copy `.env.example` to `.env`, then set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.

Keep `.env` private. It is excluded from Git and should be stored in the secret manager of the Docker host when one is available.

## Configure keywords

Edit `config/keywords.json`. It must be a non-empty JSON array:

```json
[
  "transaksi material",
  "akuisisi",
  "merger",
  "BBCA"
]
```

Restart the service after changing the file. Existing disclosures remain recorded, so adding a keyword does not generate historical alerts.

## Run with Docker

```sh
cp .env.example .env
# Edit .env and config/keywords.json
docker compose build
docker compose up -d
docker compose logs -f monitor
```

The SQLite database and Chromium profile use named volumes. Rebuilding or restarting the container will not resend stored disclosures.

Check service health locally:

```sh
curl http://127.0.0.1:3000/health
```

The endpoint returns scheduler state, last successful poll, browser status, Telegram delivery status, and consecutive failures. It never returns tokens or chat IDs. It returns HTTP 503 after three consecutive poll failures.

## Safe live smoke test

This loads one IDX page and prints parsed disclosure metadata. It does **not** contact Telegram or modify the SQLite database:

```sh
docker compose run --rm monitor node dist/src/smoke.js
```

Cloud providers sometimes block or challenge headless browsers. Run this smoke test from the intended host before relying on the deployment. A challenge is reported as an error and is never bypassed.

## Local development

Node.js 20+ is required.

```sh
npm install
npx playwright install chromium
npm test
npm run typecheck
npm run lint
npm run build
```

Run the local smoke test with `npm run smoke`. Start the service with `npm run dev` after setting the Telegram environment variables.

## Operational behavior

- Page loads and Telegram calls retry three times with bounded exponential backoff.
- After three consecutive polling failures, the bot attempts one operational warning. It sends one recovery message after a later successful poll.
- A disclosure is stored only after its Telegram notification succeeds, so a temporary Telegram failure is retried on the next poll.
- Catch-up is bounded by `CATCH_UP_PAGE_LIMIT` (default 20). A warning is logged if no known record is reached.
- `STALE_AFTER_HOURS` defaults to 168 hours to detect a rendered feed that has stopped updating without flagging ordinary weekends.

## Environment variables

| Variable | Required | Default |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Yes (service only) | — |
| `TELEGRAM_CHAT_ID` | Yes (service only) | — |
| `DATABASE_PATH` | No | `data/idx-alerts.sqlite` |
| `BROWSER_PROFILE_PATH` | No | `browser-profile` |
| `TZ` | No | `Asia/Jakarta` |
| `IDX_URL` | No | IDX disclosure page |
| `KEYWORDS_PATH` | No | `config/keywords.json` |
| `POLL_INTERVAL_MINUTES` | No | `5` |
| `CATCH_UP_PAGE_LIMIT` | No | `20` |
| `STALE_AFTER_HOURS` | No | `168` |
| `HEALTH_PORT` | No | `3000` |
| `LOG_LEVEL` | No | `info` |
| `HEADLESS` | No | `true` |

## Resource guidance

Allocate at least 512 MB RAM; 1 GB is safer for Chromium. The host needs persistent storage for the two Docker volumes and outbound HTTPS access to IDX and `api.telegram.org`.
