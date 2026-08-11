# Priority 8 — Discord Live Control

Priority 8 now contains three layers:

1. `admin-discord.js` — adds a Discord tab to `admin.html`.
2. `discord-bot/` — Node.js Discord bot + secure `/api/live` webhook.
3. `discord-bot/cloudflare-bridge.example.js` — route pattern for the existing Admin Cloudflare Worker.

## Flow

```text
Admin Dashboard
    │  Authorization: existing Admin session
    ▼
Cloudflare Worker
    │  Authorization: Bearer DISCORD_WEBHOOK_SECRET
    ▼
Discord Bot /api/live
    ▼
Discord #live-notification
```

The browser must never receive either `DISCORD_TOKEN` or `WEBHOOK_SECRET`. Cloudflare recommends storing sensitive API tokens as Worker Secrets rather than plaintext variables. See: https://developers.cloudflare.com/workers/configuration/secrets/

## Bot environment

Copy `discord-bot/.env.example` to `.env` on the bot host and set:

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `DISCORD_GUILD_ID`
- `DISCORD_LIVE_CHANNEL_ID`
- optional `DISCORD_LIVE_ROLE_ID`
- `WEBSITE_URL`
- `WEBHOOK_SECRET`

Run:

```bash
cd discord-bot
npm install
npm run register
npm start
```

Current package setup targets modern Node.js. Verify the host's Node version against the installed discord.js version before deployment.

## Admin

The Priority 8 workflow injects:

```html
<script src="admin-discord.js" defer></script>
```

The new Admin tab uses the same Worker URL and Admin session already used by the dashboard. It calls:

```text
POST /api/live
```

with:

```json
{
  "live": true,
  "game": "Wuthering Waves",
  "title": "Farm echo cùng mọi người 🐧",
  "url": "https://www.tiktok.com/@quangiahuongnoi/live",
  "platform": "TikTok"
}
```

or:

```json
{ "live": false }
```

## Cloudflare Worker integration

Merge the route pattern in `discord-bot/cloudflare-bridge.example.js` into the SAME Worker that already implements `/login`, `/content`, and `/publish`.

The existing Admin-session validation must run first. Only after the session is valid should the Worker forward the request to the bot.

Worker Secrets:

```text
DISCORD_BOT_URL=https://your-bot-host.example.com
DISCORD_WEBHOOK_SECRET=<same value as discord-bot WEBHOOK_SECRET>
```

Do not place either value in `admin.html`, `admin-discord.js`, GitHub source, or browser localStorage.

## What is complete

- [x] Discord bot core
- [x] `/live start`
- [x] `/live stop`
- [x] `/status`
- [x] `/schedule`
- [x] `/website`
- [x] Live embed
- [x] Edit notification when live ends
- [x] Secure bot webhook
- [x] Admin Discord control UI
- [x] Cloudflare bridge contract

## Next

Priority 8.2 can add automatic schedule synchronization.
Priority 9 can add automatic TikTok Live detection.
