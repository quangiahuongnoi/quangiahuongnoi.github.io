// Priority 8 — merge this route into the SAME Cloudflare Worker already used by admin.html.
// Do NOT put WEBHOOK_SECRET or DISCORD_TOKEN in admin.html/admin-discord.js.
// The existing Worker should validate the Admin session token first, then call this handler.

export async function handleDiscordLive(request, env) {
  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method Not Allowed' }, 405);
  }

  // IMPORTANT: replace this with the existing Worker session check used by /content and /publish.
  const session = request.headers.get('Authorization') || '';
  const validAdmin = await env.validateAdminSession?.(session);
  if (!validAdmin) return json({ ok: false, error: 'Unauthorized' }, 401);

  if (!env.DISCORD_BOT_URL || !env.DISCORD_WEBHOOK_SECRET) {
    return json({ ok: false, error: 'Discord bridge is not configured' }, 503);
  }

  const payload = await request.json();
  const response = await fetch(env.DISCORD_BOT_URL.replace(/\/$/, '') + '/api/live', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + env.DISCORD_WEBHOOK_SECRET,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/*
Required Worker secrets:
  DISCORD_BOT_URL=https://your-bot-host.example.com
  DISCORD_WEBHOOK_SECRET=<same value as discord-bot WEBHOOK_SECRET>

The Worker should route:
  POST /api/live -> handleDiscordLive(request, env)

The Admin sends only its normal session token. The Discord webhook secret remains
inside Cloudflare Worker Secrets. Cloudflare recommends using Secrets for sensitive
API tokens rather than plaintext vars. See the official docs.
*/
