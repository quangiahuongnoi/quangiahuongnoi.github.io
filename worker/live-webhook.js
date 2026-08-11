const DEFAULTS = {
  owner: "quangiahuongnoi",
  repo: "quangiahuongnoi.github.io",
  branch: "main",
  siteUrl: "https://quangiahuongnoi.github.io"
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "quangiahuongnoi-live-webhook" }, 200);
    }
    if (request.method !== "POST" || url.pathname !== "/live") {
      return json({ ok: false, error: "Không tìm thấy API." }, 404);
    }

    if (!env.LIVE_WEBHOOK_SECRET || !env.GITHUB_TOKEN) {
      return json({ ok: false, error: "Thiếu LIVE_WEBHOOK_SECRET hoặc GITHUB_TOKEN." }, 500);
    }

    const supplied = request.headers.get("X-Live-Webhook-Secret") || "";
    if (!(await secureEqual(supplied, env.LIVE_WEBHOOK_SECRET))) {
      return json({ ok: false, error: "Webhook secret không hợp lệ." }, 401);
    }

    try {
      const body = await request.json();
      const enabled = Boolean(body?.live);
      const file = await getGithubFile(env, "content.json");
      if (!file) return json({ ok: false, error: "Không tìm thấy content.json." }, 404);

      const content = JSON.parse(decodeBase64(file.content));
      content.live = content.live && typeof content.live === "object" ? content.live : {};
      content.live.enabled = enabled;
      content.live.statusLabel = enabled ? "Đang live" : "Offline";

      // Không cần nhập link live mỗi lần. Worker tự lấy TikTok từ Social.
      if (enabled) {
        content.live.url = buildLiveUrl(content.links?.tiktok);
        if (typeof body.title === "string" && body.title.trim()) content.live.title = body.title.trim().slice(0, 120);
        if (typeof body.detail === "string" && body.detail.trim()) content.live.detail = body.detail.trim().slice(0, 220);
      }

      content.updatedAt = new Date().toISOString();
      await putGithubText(
        env,
        "content.json",
        JSON.stringify(content, null, 2) + "\n",
        enabled ? "OBS tự động bật trạng thái LIVE" : "OBS tự động tắt trạng thái LIVE",
        file.sha
      );

      return json({ ok: true, live: content.live, updatedAt: content.updatedAt }, 200);
    } catch (error) {
      console.error(error);
      return json({ ok: false, error: error?.message || "Không thể cập nhật trạng thái LIVE." }, 500);
    }
  }
};

function buildLiveUrl(tiktok) {
  try {
    const url = new URL(String(tiktok || ""));
    if (!/^(www\.)?tiktok\.com$/i.test(url.hostname)) return url.href;
    const path = url.pathname.replace(/\/+$/, "");
    return "https://www.tiktok.com" + path + "/live";
  } catch {
    return DEFAULTS.siteUrl;
  }
}

async function getGithubFile(env, path) {
  const branch = env.GITHUB_BRANCH || DEFAULTS.branch;
  const response = await fetch(githubApi(env, path) + "?ref=" + encodeURIComponent(branch) + "&t=" + Date.now(), {
    headers: githubHeaders(env)
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("GitHub không cho phép đọc repo.");
  return response.json();
}

async function putGithubText(env, path, text, message, sha) {
  const body = {
    message,
    content: encodeBase64(text),
    branch: env.GITHUB_BRANCH || DEFAULTS.branch,
    sha
  };
  const response = await fetch(githubApi(env, path), {
    method: "PUT",
    headers: { ...githubHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (response.status === 409) throw new Error("Repo vừa thay đổi. Hãy thử lại.");
    throw new Error(error.message || "Không thể cập nhật GitHub.");
  }
  return response.json();
}

function githubApi(env, path) {
  const owner = env.GITHUB_OWNER || DEFAULTS.owner;
  const repo = env.GITHUB_REPO || DEFAULTS.repo;
  return "https://api.github.com/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + "/contents/" + path.split("/").map(encodeURIComponent).join("/");
}

function githubHeaders(env) {
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": "Bearer " + env.GITHUB_TOKEN,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "quangiahuongnoi-live-webhook"
  };
}

async function secureEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(a)),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(b))
  ]);
  const x = new Uint8Array(left);
  const y = new Uint8Array(right);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function encodeBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const step = 32768;
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(binary);
}

function decodeBase64(value) {
  const binary = atob(String(value).replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Live-Webhook-Secret",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  };
}

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(), "Content-Type": "application/json; charset=utf-8" }
  });
}
