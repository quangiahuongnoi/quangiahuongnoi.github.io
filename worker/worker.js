const DEFAULTS = {
  allowedOrigin: "https://quangiahuongnoi.github.io",
  owner: "quangiahuongnoi",
  repo: "quangiahuongnoi",
  branch: "main",
  siteUrl: "https://quangiahuongnoi.github.io/quangiahuongnoi"
};

const loginAttempts = new Map();
const MAX_ATTEMPTS = 6;
const WINDOW_MS = 10 * 60 * 1000;

export default {
  async fetch(request, env) {
    const allowedOrigin = env.ALLOWED_ORIGIN || DEFAULTS.allowedOrigin;
    const origin = request.headers.get("Origin");

    if (origin && origin !== allowedOrigin) {
      return json({ ok: false, error: "Origin không được phép." }, 403, allowedOrigin);
    }
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
    }

    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "quangiahuongnoi-admin-api" }, 200, allowedOrigin);
      }
      if (request.method === "POST" && url.pathname === "/login") {
        return await login(request, env, allowedOrigin);
      }

      const session = await requireSession(request, env);
      if (!session) {
        return json({ ok: false, error: "Phiên đăng nhập không hợp lệ hoặc đã hết hạn." }, 401, allowedOrigin);
      }

      if (request.method === "GET" && url.pathname === "/content") {
        const file = await getGithubFile(env, "content.json");
        if (!file) throw new HttpError(404, "Không tìm thấy content.json.");
        return json({ ok: true, content: JSON.parse(decodeBase64(file.content)), sha: file.sha }, 200, allowedOrigin);
      }
      if (request.method === "POST" && url.pathname === "/publish") {
        return await publish(request, env, allowedOrigin);
      }

      return json({ ok: false, error: "Không tìm thấy API." }, 404, allowedOrigin);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof HttpError ? error.message : "Không thể hoàn tất yêu cầu. Hãy thử lại sau.";
      return json({ ok: false, error: message }, status, allowedOrigin);
    }
  }
};

async function login(request, env, allowedOrigin) {
  assertSecrets(env);
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const attempt = getAttempt(ip);
  if (attempt.count >= MAX_ATTEMPTS && Date.now() - attempt.startedAt < WINDOW_MS) {
    return json({ ok: false, error: "Đăng nhập sai quá nhiều lần. Hãy thử lại sau 10 phút." }, 429, allowedOrigin);
  }

  const body = await readJson(request, 16_000);
  const password = typeof body.password === "string" ? body.password : "";
  const correct = await secureEqual(password, env.ADMIN_PASSWORD);
  if (!correct) {
    recordFailure(ip, attempt);
    return json({ ok: false, error: "Mật khẩu không đúng." }, 401, allowedOrigin);
  }

  loginAttempts.delete(ip);
  const token = await createSession(env.SESSION_SECRET);
  return json({ ok: true, token, expiresIn: 8 * 60 * 60 }, 200, allowedOrigin);
}

async function publish(request, env, allowedOrigin) {
  assertSecrets(env);
  const body = await readJson(request, 3_500_000);
  const incoming = body && typeof body.content === "object" ? structuredClone(body.content) : null;
  const images = body && typeof body.images === "object" ? body.images : {};
  if (!incoming) throw new HttpError(400, "Dữ liệu nội dung không hợp lệ.");

  const stamp = Date.now();
  incoming.socialIcons = incoming.socialIcons || {};

  if (images.avatar) {
    const parsed = parseImage(images.avatar, ["image/webp", "image/jpeg", "image/png"], 900_000);
    const ext = parsed.mime === "image/png" ? "png" : parsed.mime === "image/jpeg" ? "jpg" : "webp";
    const path = "avatar-admin." + ext;
    await putGithubBinary(env, path, parsed.base64, "Cập nhật ảnh đại diện từ trang quản trị");
    incoming.avatarImage = path + "?v=" + stamp;
  }
  if (images.qr) {
    const parsed = parseImage(images.qr, ["image/png", "image/jpeg", "image/webp"], 900_000);
    const ext = parsed.mime === "image/jpeg" ? "jpg" : parsed.mime === "image/webp" ? "webp" : "png";
    const path = "qr-admin." + ext;
    await putGithubBinary(env, path, parsed.base64, "Cập nhật QR từ trang quản trị");
    incoming.qrImage = path + "?v=" + stamp;
  }
  if (images.share) {
    const parsed = parseImage(images.share, ["image/jpeg"], 900_000);
    await putGithubBinary(env, "share-preview.jpg", parsed.base64, "Cập nhật ảnh xem trước khi chia sẻ");
    incoming.shareImage = "share-preview.jpg?v=" + stamp;
  }

  for (const key of ["tiktok", "youtube", "discord"]) {
    if (!images[key + "Icon"]) continue;
    const parsed = parseImage(images[key + "Icon"], ["image/webp", "image/png", "image/jpeg"], 450_000);
    const ext = parsed.mime === "image/png" ? "png" : parsed.mime === "image/jpeg" ? "jpg" : "webp";
    const path = "icon-" + key + "-admin." + ext;
    await putGithubBinary(env, path, parsed.base64, "Cập nhật biểu tượng " + key);
    incoming.socialIcons[key] = path + "?v=" + stamp;
  }

  const content = normalizeContent(incoming);
  content.updatedAt = new Date().toISOString();

  await putGithubText(env, "content.json", JSON.stringify(content, null, 2) + "\n", "Cập nhật nội dung website từ trang quản trị");
  await updateStaticMetadata(env, content);

  return json({ ok: true, content }, 200, allowedOrigin);
}

function normalizeContent(input) {
  const siteName = cleanText(input.siteName, 80, "Tên hiển thị");
  const profileLabel = cleanText(input.profileLabel || "Profile cá nhân", 60, "Nhãn profile");
  const role = cleanText(input.role, 140, "Vai trò");
  const description = cleanText(input.description, 320, "Mô tả");
  const aboutTitle = cleanText(input.aboutTitle, 160, "Tiêu đề giới thiệu");
  const aboutText = cleanText(input.aboutText, 800, "Nội dung giới thiệu");
  const footerEmail = cleanEmail(input.footerEmail || "quangiahuongnoi@gmail.com");
  const shareTitle = cleanText(input.shareTitle || (siteName + " | " + profileLabel), 140, "Tiêu đề chia sẻ");
  const shareDescription = cleanText(input.shareDescription || description, 320, "Mô tả chia sẻ");

  return {
    siteName,
    profileLabel,
    role,
    description,
    aboutTitle,
    aboutText,
    footerEmail,
    shareTitle,
    shareDescription,
    links: {
      tiktok: cleanUrl(input.links && input.links.tiktok, "TikTok"),
      youtube: cleanUrl(input.links && input.links.youtube, "YouTube"),
      discord: cleanUrl(input.links && input.links.discord, "Discord")
    },
    avatarImage: cleanAsset(input.avatarImage || "avatar.webp"),
    qrImage: input.qrImage ? cleanAsset(input.qrImage) : "",
    shareImage: cleanAsset(input.shareImage || "share-preview.jpg"),
    socialIcons: {
      tiktok: input.socialIcons && input.socialIcons.tiktok ? cleanAsset(input.socialIcons.tiktok) : "",
      youtube: input.socialIcons && input.socialIcons.youtube ? cleanAsset(input.socialIcons.youtube) : "",
      discord: input.socialIcons && input.socialIcons.discord ? cleanAsset(input.socialIcons.discord) : ""
    },
    fontScale: cleanScale(input.fontScale),
    colors: {
      background: cleanColor(input.colors && input.colors.background, "#070707"),
      primary: cleanColor(input.colors && input.colors.primary, "#e10600"),
      accent: cleanColor(input.colors && input.colors.accent, "#ff2a1a")
    }
  };
}

async function updateStaticMetadata(env, content) {
  const file = await getGithubFile(env, "index.html");
  if (!file) throw new HttpError(404, "Không tìm thấy index.html.");
  let html = decodeBase64(file.content);

  const title = escapeHtml(content.shareTitle);
  const description = escapeAttribute(content.shareDescription);
  const image = absoluteAsset(env, content.shareImage);

  html = replaceRequired(html, /<title>[\s\S]*?<\/title>/, "<title>" + title + "</title>", "title");
  html = replaceMeta(html, "name", "description", description);
  html = replaceMeta(html, "property", "og:title", escapeAttribute(content.shareTitle));
  html = replaceMeta(html, "property", "og:description", description);
  html = replaceMeta(html, "property", "og:image", escapeAttribute(image));
  html = replaceMeta(html, "property", "og:image:secure_url", escapeAttribute(image));
  html = replaceMeta(html, "name", "twitter:title", escapeAttribute(content.shareTitle));
  html = replaceMeta(html, "name", "twitter:description", description);
  html = replaceMeta(html, "name", "twitter:image", escapeAttribute(image));

  await putGithubText(env, "index.html", html, "Đồng bộ metadata chia sẻ từ trang quản trị");
}

function replaceMeta(html, attribute, key, value) {
  const escapedKey = key.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");
  const expression = new RegExp('<meta\\s+' + attribute + '="' + escapedKey + '"\\s+content="[^"]*"\\s*\\/?>', "i");
  return replaceRequired(html, expression, '<meta ' + attribute + '="' + key + '" content="' + value + '">', key);
}

function replaceRequired(value, expression, replacement, label) {
  if (!expression.test(value)) throw new HttpError(500, "Thiếu trường " + label + " trong index.html.");
  return value.replace(expression, replacement);
}

function absoluteAsset(env, value) {
  if (/^https:\/\//i.test(value)) return value;
  const base = (env.SITE_URL || DEFAULTS.siteUrl).replace(/\/+$/, "");
  return base + "/" + value.replace(/^\/+/, "");
}

function parseImage(dataUrl, allowedMimes, maxBase64Length) {
  if (typeof dataUrl !== "string") throw new HttpError(400, "Ảnh không hợp lệ.");
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match || !allowedMimes.includes(match[1])) throw new HttpError(400, "Định dạng ảnh không được hỗ trợ.");
  if (match[2].length > maxBase64Length) throw new HttpError(413, "Ảnh quá lớn.");
  return { mime: match[1], base64: match[2] };
}

async function putGithubBinary(env, path, base64, message) {
  const existing = await getGithubFile(env, path);
  await putGithubContent(env, path, base64, message, existing && existing.sha);
}

async function putGithubText(env, path, text, message) {
  const existing = await getGithubFile(env, path);
  await putGithubContent(env, path, encodeBase64(text), message, existing && existing.sha);
}

async function getGithubFile(env, path) {
  const branch = env.GITHUB_BRANCH || DEFAULTS.branch;
  const response = await fetch(githubApi(env, path) + "?ref=" + encodeURIComponent(branch) + "&t=" + Date.now(), { headers: githubHeaders(env) });
  if (response.status === 404) return null;
  if (!response.ok) throw new HttpError(502, "GitHub không cho phép đọc repo. Hãy kiểm tra GITHUB_TOKEN.");
  return response.json();
}

async function putGithubContent(env, path, base64, message, sha) {
  const body = { message, content: base64, branch: env.GITHUB_BRANCH || DEFAULTS.branch };
  if (sha) body.sha = sha;
  const response = await fetch(githubApi(env, path), {
    method: "PUT",
    headers: { ...githubHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    if (response.status === 409) throw new HttpError(409, "Repo vừa thay đổi. Hãy tải lại trang quản trị và thử lại.");
    throw new HttpError(502, error.message ? "GitHub: " + error.message : "Không thể cập nhật GitHub.");
  }
  return response.json();
}

function githubApi(env, path) {
  const owner = env.GITHUB_OWNER || DEFAULTS.owner;
  const repo = env.GITHUB_REPO || DEFAULTS.repo;
  return "https://api.github.com/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + "/contents/" + path.split("/").map(encodeURIComponent).join("/");
}

function githubHeaders(env) {
  if (!env.GITHUB_TOKEN) throw new HttpError(500, "Worker chưa có GITHUB_TOKEN.");
  return {
    "Accept": "application/vnd.github+json",
    "Authorization": "Bearer " + env.GITHUB_TOKEN,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "quangiahuongnoi-admin-worker"
  };
}

async function createSession(secret) {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({ iat: now, exp: now + 8 * 60 * 60, nonce: crypto.randomUUID() })));
  const signature = await sign(payload, secret);
  return payload + "." + signature;
}

async function requireSession(request, env) {
  if (!env.SESSION_SECRET) return false;
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return false;
  const parts = header.slice(7).split(".");
  if (parts.length !== 2 || !(await verify(parts[0], parts[1], env.SESSION_SECRET))) return false;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    return Number(payload.exp) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

async function verify(value, signature, secret) {
  try {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    return crypto.subtle.verify("HMAC", key, base64UrlDecode(signature), new TextEncoder().encode(value));
  } catch {
    return false;
  }
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

function base64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  let normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  while (normalized.length % 4) normalized += "=";
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const step = 32768;
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(binary);
}

function decodeBase64(value) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function readJson(request, maxBytes) {
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > maxBytes) throw new HttpError(413, "Dữ liệu gửi lên quá lớn.");
  const text = await request.text();
  if (text.length > maxBytes) throw new HttpError(413, "Dữ liệu gửi lên quá lớn.");
  try { return JSON.parse(text || "{}"); } catch { throw new HttpError(400, "JSON không hợp lệ."); }
}

function cleanText(value, max, label) {
  if (typeof value !== "string" || !value.trim()) throw new HttpError(400, label + " không được để trống.");
  return value.trim().slice(0, max);
}
function cleanUrl(value, label) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
    return url.href;
  } catch { throw new HttpError(400, "Liên kết " + label + " không hợp lệ."); }
}
function cleanEmail(value) {
  const email = typeof value === "string" ? value.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Email liên hệ không hợp lệ.");
  return email.slice(0, 160);
}
function cleanAsset(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._/-]+(?:\?v=[a-zA-Z0-9._-]+)?$/.test(value)) throw new HttpError(400, "Đường dẫn ảnh không hợp lệ.");
  return value;
}
function cleanColor(value, fallback) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}
function cleanScale(value) {
  const scale = Number(value);
  return Number.isFinite(scale) ? Math.min(1.2, Math.max(0.9, Math.round(scale * 100) / 100)) : 1;
}
function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
function getAttempt(ip) {
  const now = Date.now();
  for (const [key, value] of loginAttempts) if (now - value.startedAt > WINDOW_MS) loginAttempts.delete(key);
  return loginAttempts.get(ip) || { count: 0, startedAt: now };
}
function recordFailure(ip, attempt) {
  if (loginAttempts.size > 500) loginAttempts.clear();
  loginAttempts.set(ip, { count: attempt.count + 1, startedAt: attempt.startedAt });
}
function assertSecrets(env) {
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 12) throw new HttpError(500, "Worker chưa có ADMIN_PASSWORD đủ mạnh.");
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new HttpError(500, "Worker chưa có SESSION_SECRET đủ mạnh.");
  if (!env.GITHUB_TOKEN) throw new HttpError(500, "Worker chưa có GITHUB_TOKEN.");
}
function corsHeaders(allowedOrigin) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  };
}
function json(body, status, allowedOrigin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(allowedOrigin), "Content-Type": "application/json; charset=utf-8" }
  });
}
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
