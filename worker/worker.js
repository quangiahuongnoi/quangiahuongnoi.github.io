const DEFAULTS = {
  allowedOrigin: "https://quangiahuongnoi.github.io",
  owner: "quangiahuongnoi",
  repo: "quangiahuongnoi.github.io",
  branch: "main",
  siteUrl: "https://quangiahuongnoi.github.io"
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
      if (request.method === "POST" && url.pathname === "/live/sync") {
        return await syncLiveFromSource(request, env, allowedOrigin);
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
      if (request.method === "POST" && url.pathname === "/live/monitor/check") {
        const result = await runTikTokLiveMonitor(env);
        return json(result, result.ok ? 200 : 502, allowedOrigin);
      }
      if (request.method === "POST" && url.pathname === "/youtube/monitor/check") {
        const result = await runYouTubeContentMonitor(env);
        return json(result, result.ok ? 200 : 502, allowedOrigin);
      }
      if (request.method === "POST" && url.pathname === "/tiktok/monitor/check") {
        const result = await runTikTokContentMonitor(env);
        return json(result, result.ok ? 200 : 502, allowedOrigin);
      }

      return json({ ok: false, error: "Không tìm thấy API." }, 404, allowedOrigin);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof HttpError ? error.message : "Không thể hoàn tất yêu cầu. Hãy thử lại sau.";
      return json({ ok: false, error: message }, status, allowedOrigin);
    }
  },

  async scheduled(controller, env, ctx) {
    if (String(env.LIVE_MONITOR_ENABLED || "").toLowerCase() === "true") {
      try {
        const result = await runTikTokLiveMonitor(env);
        console.log("[live-monitor]", JSON.stringify(result));
      } catch (error) {
        console.error("[live-monitor] scheduled check failed:", error?.message || error);
      }
    }

    if (String(env.YOUTUBE_AUTO_ENABLED || "").toLowerCase() === "true") {
      try {
        const result = await runYouTubeContentMonitor(env);
        console.log("[youtube-monitor]", JSON.stringify(result));
      } catch (error) {
        console.error("[youtube-monitor] scheduled check failed:", error?.message || error);
      }
    }

    if (String(env.TIKTOK_AUTO_ENABLED || "").toLowerCase() === "true") {
      try {
        const result = await runTikTokContentMonitor(env);
        console.log("[tiktok-monitor]", JSON.stringify(result));
      } catch (error) {
        console.error("[tiktok-monitor] scheduled check failed:", error?.message || error);
      }
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
  const body = await readJson(request, 16_000_000);
  const incoming = body && typeof body.content === "object" ? structuredClone(body.content) : null;
  const images = body && typeof body.images === "object" ? body.images : {};
  const audio = body && typeof body.audio === "string" ? body.audio : "";
  if (!incoming) throw new HttpError(400, "Dữ liệu nội dung không hợp lệ.");

  const stamp = Date.now();
  incoming.socialIcons = incoming.socialIcons || {};
  incoming.music = incoming.music || {};

  if (audio) {
    const parsed = parseAudio(audio, 14_000_000);
    const ext = parsed.mime === "audio/ogg" ? "ogg" : (parsed.mime === "audio/wav" || parsed.mime === "audio/x-wav") ? "wav" : (parsed.mime === "audio/mp4" || parsed.mime === "audio/x-m4a") ? "m4a" : "mp3";
    const path = "music-admin." + ext;
    await putGithubBinary(env, path, parsed.base64, "Cập nhật nhạc nền từ trang quản trị");
    incoming.music.file = path + "?v=" + stamp;
  }

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

  let discord = { ok: false, configured: false, error: "Discord Bot chưa được cấu hình trong Worker." };
  if (env.DISCORD_BOT_URL && env.DISCORD_WEBHOOK_SECRET) {
    try {
      const result = await syncDiscordLive(env, content.live);
      discord = { ok: true, configured: true, status: result.status };
    } catch (error) {
      const message = error?.message || String(error);
      console.warn("[discord] Live sync failed:", message);
      discord = { ok: false, configured: true, error: message };
    }
  }

  return json({ ok: true, content, discord }, 200, allowedOrigin);
}

async function runYouTubeContentMonitor(env) {
  const enabled = String(env.YOUTUBE_AUTO_ENABLED || "").toLowerCase() === "true";
  if (!enabled) {
    return { ok: true, changed: false, enabled: false, reason: "YouTube Auto Content đang tắt." };
  }

  if (!env.YOUTUBE_API_KEY) {
    throw new HttpError(500, "Worker chưa có YOUTUBE_API_KEY.");
  }

  const handle = String(env.YOUTUBE_CHANNEL_HANDLE || "quangiahuongnoi").trim().replace(/^@+/, "");
  if (!handle) throw new HttpError(500, "Chưa cấu hình YOUTUBE_CHANNEL_HANDLE.");

  const existing = await getGithubFile(env, "content.json");
  if (!existing) throw new HttpError(404, "Không tìm thấy content.json.");

  let content;
  try {
    content = JSON.parse(decodeBase64(existing.content));
  } catch {
    throw new HttpError(500, "content.json hiện tại không hợp lệ.");
  }

  const existingYouTube = content.youtube && typeof content.youtube === "object" ? content.youtube : {};
  let channelId = cleanOptionalText(existingYouTube.channelId, 64);
  let uploadsPlaylistId = cleanOptionalText(existingYouTube.uploadsPlaylistId, 64);

  if (!channelId || !uploadsPlaylistId || cleanOptionalText(existingYouTube.channelHandle, 120) !== handle) {
    const channelPayload = await youtubeApiRequest(env, "channels", {
      part: "contentDetails",
      forHandle: handle,
      maxResults: "1"
    });

    const channel = Array.isArray(channelPayload?.items) ? channelPayload.items[0] : null;
    channelId = cleanOptionalText(channel?.id, 64);
    uploadsPlaylistId = cleanOptionalText(channel?.contentDetails?.relatedPlaylists?.uploads, 64);

    if (!channelId || !uploadsPlaylistId) {
      throw new Error("Không tìm thấy YouTube channel hoặc uploads playlist cho @" + handle + ".");
    }
  }

  const playlistPayload = await youtubeApiRequest(env, "playlistItems", {
    part: "snippet,contentDetails",
    playlistId: uploadsPlaylistId,
    maxResults: "3"
  });

  const items = Array.isArray(playlistPayload?.items)
    ? playlistPayload.items
      .map((item) => {
        const videoId = cleanOptionalText(item?.contentDetails?.videoId, 32);
        const title = cleanOptionalText(item?.snippet?.title, 140);
        const publishedAt = cleanOptionalText(item?.snippet?.publishedAt, 40);
        const thumbnails = item?.snippet?.thumbnails || {};
        const thumbnail = cleanOptionalUrl(
          thumbnails?.maxres?.url ||
          thumbnails?.standard?.url ||
          thumbnails?.high?.url ||
          thumbnails?.medium?.url ||
          thumbnails?.default?.url,
          "thumbnail YouTube"
        );

        if (!videoId || !title) return null;

        return {
          id: videoId,
          label: "YouTube",
          title,
          meta: "YouTube" + (publishedAt ? " · " + formatRelativeDate(publishedAt) : ""),
          url: "https://www.youtube.com/watch?v=" + encodeURIComponent(videoId),
          thumbnail,
          publishedAt
        };
      })
      .filter(Boolean)
    : [];

  const nextYouTube = {
    enabled: true,
    channelHandle: handle,
    channelId,
    uploadsPlaylistId,
    items,
    updatedAt: new Date().toISOString()
  };

  const previousComparable = JSON.stringify({
    enabled: existingYouTube.enabled !== false,
    channelHandle: existingYouTube.channelHandle || "",
    channelId: existingYouTube.channelId || "",
    uploadsPlaylistId: existingYouTube.uploadsPlaylistId || "",
    items: Array.isArray(existingYouTube.items) ? existingYouTube.items : []
  });
  const nextComparable = JSON.stringify({
    enabled: true,
    channelHandle: nextYouTube.channelHandle,
    channelId: nextYouTube.channelId,
    uploadsPlaylistId: nextYouTube.uploadsPlaylistId,
    items
  });

  if (previousComparable === nextComparable) {
    return {
      ok: true,
      changed: false,
      enabled: true,
      channelHandle: handle,
      items
    };
  }

  content.youtube = nextYouTube;
  content.updatedAt = new Date().toISOString();

  await putGithubText(
    env,
    "content.json",
    JSON.stringify(content, null, 2) + "\n",
    "YouTube Auto Content: cập nhật video mới",
    existing.sha
  );

  return {
    ok: true,
    changed: true,
    enabled: true,
    channelHandle: handle,
    items
  };
}


async function runTikTokContentMonitor(env) {
  const enabled = String(env.TIKTOK_AUTO_ENABLED || "").toLowerCase() === "true";
  if (!enabled) {
    return {
      ok: true,
      changed: false,
      enabled: false,
      reason: "TikTok Auto Content đang tắt."
    };
  }

  if (!env.APIFY_API_TOKEN) {
    throw new HttpError(500, "Worker chưa có APIFY_API_TOKEN.");
  }

  const username = String(env.TIKTOK_USERNAME || "quangiahuongnoi")
    .trim()
    .replace(/^@+/, "");

  if (!username) {
    throw new HttpError(500, "Chưa cấu hình TIKTOK_USERNAME.");
  }

  const existing = await getGithubFile(env, "content.json");
  if (!existing) {
    throw new HttpError(404, "Không tìm thấy content.json.");
  }

  let content;
  try {
    content = JSON.parse(decodeBase64(existing.content));
  } catch {
    throw new HttpError(500, "content.json hiện tại không hợp lệ.");
  }

  const endpoint =
    "https://api.apify.com/v2/acts/xtracto~tiktok-profile-scraper/run-sync-get-dataset-items?token=" +
    encodeURIComponent(env.APIFY_API_TOKEN);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({
      username,
      maxPosts: 3
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      "Apify TikTok API " +
      response.status +
      (detail ? ": " + detail.slice(0, 500) : "")
    );
  }

  const payload = await response.json();

  const record =
    Array.isArray(payload)
      ? payload.find((item) => item && Array.isArray(item.posts)) || payload[0] || {}
      : payload && typeof payload === "object"
        ? payload
        : {};

  const rawPosts =
    Array.isArray(record?.posts)
      ? record.posts
      : Array.isArray(payload)
        ? payload
        : [];

  const posts = rawPosts
    .map((post) => {
      const id = cleanOptionalText(
        post?.id ||
        post?.videoId ||
        post?.video_id ||
        post?.aweme_id ||
        post?.awemeId ||
        post?.itemId ||
        post?.item_id,
        64
      );

      if (!id) return null;

      const desc = cleanOptionalText(
        post?.desc ||
        post?.description ||
        post?.title ||
        post?.text,
        180
      );

      let createTime =
        Number(post?.createTime) ||
        Number(post?.create_time) ||
        Number(post?.createdAt) ||
        Number(post?.create_at) ||
        0;

      if (createTime > 100000000000) {
        createTime = Math.floor(createTime / 1000);
      }

      const publishedAt =
        createTime > 0 && Number.isFinite(createTime)
          ? new Date(createTime * 1000).toISOString()
          : cleanOptionalText(post?.publishedAt || post?.published_at, 40);

      const video = post?.video && typeof post.video === "object"
        ? post.video
        : {};

      const cover = cleanOptionalUrl(
        video?.cover ||
        video?.coverUrl ||
        video?.originCover ||
        video?.origin_cover ||
        post?.cover ||
        post?.coverUrl ||
        post?.cover_url ||
        "",
        "thumbnail TikTok"
      );

      const url =
        cleanOptionalUrl(
          post?.webVideoUrl ||
          post?.web_video_url ||
          post?.shareUrl ||
          post?.share_url ||
          post?.url ||
          "",
          "video TikTok"
        ) ||
        ("https://www.tiktok.com/@" +
          encodeURIComponent(username) +
          "/video/" +
          encodeURIComponent(id));

      return {
        id,
        label: "TikTok",
        title: desc || "Video TikTok mới",
        meta:
          "TikTok" +
          (publishedAt ? " · " + formatRelativeDate(publishedAt) : ""),
        url,
        thumbnail: cover,
        publishedAt
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aTime = Date.parse(a.publishedAt || "") || 0;
      const bTime = Date.parse(b.publishedAt || "") || 0;
      return bTime - aTime;
    })
    .slice(0, 3);

  const previousTikTok =
    content.tiktok && typeof content.tiktok === "object"
      ? content.tiktok
      : {};

  const previousItems = Array.isArray(previousTikTok.items)
    ? previousTikTok.items
    : [];

  const previousComparable = JSON.stringify(
    previousItems.map((item) => ({
      id: item?.id || "",
      title: item?.title || "",
      url: item?.url || "",
      thumbnail: item?.thumbnail || "",
      publishedAt: item?.publishedAt || ""
    }))
  );

  const nextComparable = JSON.stringify(
    posts.map((item) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      thumbnail: item.thumbnail,
      publishedAt: item.publishedAt
    }))
  );

  if (previousComparable === nextComparable) {
    return {
      ok: true,
      changed: false,
      enabled: true,
      username,
      items: posts
    };
  }

  content.tiktok = {
    enabled: true,
    username,
    profileUrl:
      "https://www.tiktok.com/@" + encodeURIComponent(username),
    items: posts,
    updatedAt: new Date().toISOString()
  };

  content.updatedAt = new Date().toISOString();

  await putGithubText(
    env,
    "content.json",
    JSON.stringify(content, null, 2) + "\n",
    "TikTok Auto Content: cập nhật 3 video mới nhất",
    existing.sha
  );

  console.log(
    "[tiktok-monitor] updated",
    JSON.stringify({
      username,
      count: posts.length,
      ids: posts.map((post) => post.id)
    })
  );

  return {
    ok: true,
    changed: true,
    enabled: true,
    username,
    items: posts
  };
}

async function youtubeApiRequest(env, resource, params) {
  const query = new URLSearchParams({
    ...params,
    key: String(env.YOUTUBE_API_KEY)
  });
  const response = await fetch("https://www.googleapis.com/youtube/v3/" + resource + "?" + query.toString(), {
    method: "GET",
    headers: { "Accept": "application/json" },
    cache: "no-store"
  });

  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      const first = Array.isArray(body?.error?.errors) ? body.error.errors[0] : null;
      detail = first?.reason || body?.error?.message || "";
    } catch {
      detail = await response.text().catch(() => "");
    }
    throw new Error(
      "YouTube API " + response.status +
      (detail ? ": " + String(detail).slice(0, 220) : "")
    );
  }

  return response.json();
}

function formatRelativeDate(value) {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "";
  const diff = Math.max(0, Date.now() - time);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return minutes <= 1 ? "vừa đăng" : minutes + " phút trước";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 giờ trước" : hours + " giờ trước";
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? "hôm qua" : days + " ngày trước";
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? "1 tuần trước" : weeks + " tuần trước";
  return new Date(time).toLocaleDateString("vi-VN");
}

async function runTikTokLiveMonitor(env) {
  const enabled = String(env.LIVE_MONITOR_ENABLED || "").toLowerCase() === "true";
  if (!enabled) {
    return {
      ok: true,
      changed: false,
      enabled: false,
      state: "disabled",
      reason: "TikTok Live Monitor đang tắt."
    };
  }

  const username = String(env.TIKTOK_USERNAME || "quangiahuongnoi").trim().replace(/^@+/, "");
  if (!username) throw new HttpError(500, "Chưa cấu hình TIKTOK_USERNAME.");
  if (!env.TIKTOOL_API_KEY) {
    throw new HttpError(500, "Worker chưa có TIKTOOL_API_KEY.");
  }

  const response = await fetch("https://api.tik.tools/webcast/bulk_live_check", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.TIKTOOL_API_KEY
    },
    body: JSON.stringify({ unique_id: username }),
    cache: "no-store"
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error("TikTool API " + response.status + (detail ? ": " + detail.slice(0, 300) : ""));
  }

  const payload = await response.json();
  const result = Array.isArray(payload?.data)
    ? payload.data[0]
    : (payload?.data && payload.data[username])
      ? payload.data[username]
      : payload?.data;

  const aliveStatus = String(result?.alive_status || result?.live_status || "").toLowerCase();
  let state = "unknown";

  if (aliveStatus === "live" || result?.is_live === true || result?.alive === true) {
    state = "live";
  } else if (
    aliveStatus === "offline" ||
    (typeof result?.is_live === "boolean" && result.is_live === false &&
      result?.check_failed !== true && aliveStatus !== "unknown")
  ) {
    state = "offline";
  }

  if (state === "unknown") {
    return {
      ok: true,
      changed: false,
      state: "unknown",
      username,
      reason: "TikTok/TikTool chưa xác nhận được trạng thái; giữ nguyên trạng thái hiện tại."
    };
  }

  const existing = await getGithubFile(env, "content.json");
  if (!existing) throw new HttpError(404, "Không tìm thấy content.json.");

  let content;
  try {
    content = JSON.parse(decodeBase64(existing.content));
  } catch {
    throw new HttpError(500, "content.json hiện tại không hợp lệ.");
  }

  const currentLive = content.live && typeof content.live === "object" ? content.live : {};
  const currentEnabled = Boolean(currentLive.enabled);
  const nextEnabled = state === "live";

  if (!nextEnabled) {
    if (!currentEnabled) {
      return {
        ok: true,
        changed: false,
        state,
        username,
        live: currentLive
      };
    }

    content.live = {
      enabled: false,
      statusLabel: "Offline",
      game: "",
      title: "",
      detail: "",
      url: ""
    };
  } else {
    const apiTitle = pickLiveText(result, [
      "title",
      "stream_title",
      "streamTitle",
      "live_title",
      "liveTitle"
    ]);

    const apiGame = pickLiveGame(result);
    const nextTitle = String(
      apiTitle ||
      env.TIKTOK_LIVE_TITLE ||
      currentLive.title ||
      "Quản gia đang livestream"
    ).trim().slice(0, 120);

    const nextGame = String(
      env.TIKTOK_LIVE_GAME ||
      apiGame ||
      currentLive.game ||
      ""
    ).trim().slice(0, 80);

    const nextDetail = String(
      env.TIKTOK_LIVE_DETAIL ||
      currentLive.detail ||
      "Đang livestream trên TikTok. Vào xem và trò chuyện cùng mình nhé."
    ).trim().slice(0, 220);

    const nextUrl = "https://www.tiktok.com/@" + encodeURIComponent(username) + "/live";
    const metadataChanged =
      !currentEnabled ||
      String(currentLive.statusLabel || "") !== "Đang live" ||
      String(currentLive.game || "") !== nextGame ||
      String(currentLive.title || "") !== nextTitle ||
      String(currentLive.detail || "") !== nextDetail ||
      String(currentLive.url || "") !== nextUrl;

    if (!metadataChanged) {
      return {
        ok: true,
        changed: false,
        state,
        username,
        live: currentLive
      };
    }

    content.live = {
      enabled: true,
      statusLabel: "Đang live",
      game: nextGame,
      title: nextTitle,
      detail: nextDetail,
      url: nextUrl
    };

    console.log("[live-monitor] metadata", JSON.stringify({
      username,
      title: nextTitle,
      game: nextGame,
      source: {
        title: apiTitle ? "tiktok" : (env.TIKTOK_LIVE_TITLE ? "env" : "existing"),
        game: apiGame ? "tiktok" : (env.TIKTOK_LIVE_GAME ? "env" : "existing")
      }
    }));
  }

  content.updatedAt = new Date().toISOString();

  await putGithubText(
    env,
    "content.json",
    JSON.stringify(content, null, 2) + "\n",
    nextEnabled ? "TikTok Live Monitor: cập nhật LIVE metadata" : "TikTok Live Monitor: phát hiện OFFLINE",
    existing.sha
  );

  let discord = { ok: false, configured: false };
  if (env.DISCORD_BOT_URL && env.DISCORD_WEBHOOK_SECRET) {
    try {
      const result = await syncDiscordLive(env, content.live);
      discord = { ok: true, configured: true, status: result.status };
    } catch (error) {
      const message = error?.message || String(error);
      console.warn("[discord] Live monitor sync failed:", message);
      discord = { ok: false, configured: true, error: message };
    }
  }

  return {
    ok: true,
    changed: true,
    state,
    username,
    live: content.live,
    discord
  };
}

function pickLiveText(result, keys) {
  for (const key of keys) {
    const value = result?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function pickLiveGame(result) {
  const direct = pickLiveText(result, [
    "game",
    "game_name",
    "gameName",
    "game_title",
    "gameTitle",
    "category_name",
    "categoryName"
  ]);
  if (direct) return direct;

  const objects = [
    result?.game,
    result?.category,
    result?.game_info,
    result?.gameInfo,
    result?.game_server_feature,
    result?.gameServerFeature
  ];

  for (const item of objects) {
    if (!item || typeof item !== "object") continue;
    const value = pickLiveText(item, [
      "name",
      "title",
      "game",
      "game_name",
      "gameName",
      "display_name",
      "displayName",
      "rawTag"
    ]);
    if (value) return normalizeGameTag(value);
  }

  const rawTag = pickLiveText(result, ["rawTag", "raw_tag"]);
  return rawTag ? normalizeGameTag(rawTag) : "";
}

function normalizeGameTag(value) {
  const text = String(value).trim();
  const packed = text.match(/^\\d+(.+)$/);
  return (packed ? packed[1] : text).trim().slice(0, 80);
}

async function syncLiveFromSource(request, env, allowedOrigin) {
  if (!env.LIVE_SYNC_TOKEN || env.LIVE_SYNC_TOKEN.length < 16) {
    throw new HttpError(500, "Worker chưa có LIVE_SYNC_TOKEN.");
  }

  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return json({ ok: false, error: "Thiếu LIVE_SYNC_TOKEN." }, 401, allowedOrigin);
  }

  const token = authorization.slice(7).trim();
  if (!(await secureEqual(token, env.LIVE_SYNC_TOKEN))) {
    return json({ ok: false, error: "LIVE_SYNC_TOKEN không hợp lệ." }, 401, allowedOrigin);
  }

  const body = await readJson(request, 64_000);
  const existing = await getGithubFile(env, "content.json");
  if (!existing) throw new HttpError(404, "Không tìm thấy content.json.");

  let content;
  try {
    content = JSON.parse(decodeBase64(existing.content));
  } catch {
    throw new HttpError(500, "content.json hiện tại không hợp lệ.");
  }

  content.live = cleanLive(body && typeof body === "object" ? body : {});
  content.updatedAt = new Date().toISOString();

  await putGithubText(
    env,
    "content.json",
    JSON.stringify(content, null, 2) + "\n",
    "Đồng bộ trạng thái LIVE từ nguồn phát"
  );

  let discord = { ok: false, configured: false, error: "Discord Bot chưa được cấu hình trong Worker." };
  if (env.DISCORD_BOT_URL && env.DISCORD_WEBHOOK_SECRET) {
    try {
      const result = await syncDiscordLive(env, content.live);
      discord = { ok: true, configured: true, status: result.status };
    } catch (error) {
      const message = error?.message || String(error);
      console.warn("[discord] Live sync failed:", message);
      discord = { ok: false, configured: true, error: message };
    }
  }

  return json({
    ok: true,
    source: typeof body?.source === "string" ? body.source.slice(0, 40) : "live-sync",
    live: content.live,
    discord
  }, 200, allowedOrigin);
}

async function syncDiscordLive(env, live) {
  const base = String(env.DISCORD_BOT_URL || '').replace(/\/+$/, '');
  if (!base || !env.DISCORD_WEBHOOK_SECRET) {
    throw new Error('Thiếu DISCORD_BOT_URL hoặc DISCORD_WEBHOOK_SECRET.');
  }

  const payload = {
    live: Boolean(live?.enabled),
    game: String(live?.game || ''),
    title: String(live?.title || ''),
    detail: String(live?.detail || ''),
    url: String(live?.url || env.SITE_URL || DEFAULTS.siteUrl),
    platform: 'TikTok'
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(base + '/api/live', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + env.DISCORD_WEBHOOK_SECRET
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error('Bot API ' + response.status + (detail ? ': ' + detail.slice(0, 300) : ''));
    }

    return { status: response.status };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Discord Bot không phản hồi trong 10 giây. Render có thể đang sleep hoặc chưa sẵn sàng.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}


function cleanPartnerLogo(value) {
  const logo = typeof value === "string" ? value.trim() : "";
  if (!logo) return "";
  return /^https?:\/\//i.test(logo) ? cleanOptionalUrl(logo, "logo đối tác") : cleanAsset(logo);
}
function cleanPartners(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 40).map((item) => ({
    name: cleanOptionalText(item && item.name, 100),
    logo: cleanPartnerLogo(item && item.logo),
    category: cleanOptionalText(item && item.category, 100),
    description: cleanOptionalText(item && item.description, 500),
    website: item && item.website ? cleanOptionalUrl(item.website, "website đối tác") : "",
    socialUrl: item && item.socialUrl ? cleanOptionalUrl(item.socialUrl, "mạng xã hội đối tác") : ""
  })).filter((item) => item.name);
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
    fontFamily: cleanFont(input.fontFamily),
    headingFontFamily: cleanFont(input.headingFontFamily),
    fontScale: cleanScale(input.fontScale),
    live: cleanLive(input.live),
    schedule: cleanSchedule(input.schedule),
    highlights: cleanHighlights(input.highlights),
    partners: cleanPartners(input.partners),
    youtube: cleanYouTube(input.youtube),
    tiktok: cleanTikTok(input.tiktok),
    music: cleanMusic(input.music),
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

function parseAudio(dataUrl, maxBase64Length) {
  if (typeof dataUrl !== "string") throw new HttpError(400, "Tệp nhạc không hợp lệ.");
  const match = dataUrl.match(/^data:(audio\/(?:mpeg|mp3|ogg|wav|x-wav|mp4|x-m4a));base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) throw new HttpError(400, "Định dạng nhạc không được hỗ trợ.");
  if (match[2].length > maxBase64Length) throw new HttpError(413, "Tệp nhạc quá lớn.");
  return { mime: match[1].toLowerCase(), base64: match[2] };
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
function cleanFont(value) {
  const allowed = new Set(["modern", "arial", "tahoma", "georgia", "times", "monospace"]);
  return allowed.has(value) ? value : "modern";
}
function cleanYouTube(value) {
  const youtube = value && typeof value === "object" ? value : {};
  const items = Array.isArray(youtube.items) ? youtube.items.slice(0, 3).map((item) => ({
    id: cleanOptionalText(item && item.id, 32),
    label: cleanOptionalText(item && item.label, 40) || "YouTube",
    title: cleanOptionalText(item && item.title, 140),
    meta: cleanOptionalText(item && item.meta, 180),
    url: cleanOptionalUrl(item && item.url, "video YouTube"),
    thumbnail: cleanOptionalUrl(item && item.thumbnail, "thumbnail YouTube"),
    publishedAt: cleanOptionalText(item && item.publishedAt, 40)
  })).filter((item) => item.id && item.title && item.url) : [];

  return {
    enabled: !!youtube.enabled,
    channelHandle: cleanOptionalText(youtube.channelHandle, 120),
    channelId: cleanOptionalText(youtube.channelId, 64),
    uploadsPlaylistId: cleanOptionalText(youtube.uploadsPlaylistId, 64),
    items
  };
}

function cleanTikTok(value) {
  const tiktok = value && typeof value === "object" ? value : {};
  const items = Array.isArray(tiktok.items)
    ? tiktok.items.slice(0, 3).map((item) => ({
        id: cleanOptionalText(item && item.id, 64),
        label: cleanOptionalText(item && item.label, 40) || "TikTok",
        title: cleanOptionalText(item && item.title, 180),
        meta: cleanOptionalText(item && item.meta, 180),
        url: cleanOptionalUrl(item && item.url, "video TikTok"),
        thumbnail: cleanOptionalUrl(item && item.thumbnail, "thumbnail TikTok"),
        publishedAt: cleanOptionalText(item && item.publishedAt, 40)
      })).filter((item) => item.id && item.title && item.url)
    : [];

  return {
    enabled: !!tiktok.enabled,
    username: cleanOptionalText(tiktok.username, 120),
    profileUrl: cleanOptionalUrl(tiktok.profileUrl, "profile TikTok"),
    items
  };
}

function cleanMusic(value) {
  const music = value && typeof value === "object" ? value : {};
  const source = ["upload", "spotify", "youtube"].includes(music.source) ? music.source : "upload";
  const file = music.file ? cleanAudioAsset(music.file) : "";
  const rawUrl = typeof music.url === "string" ? music.url.trim() : "";
  let url = "";
  if (rawUrl) {
    if (source === "spotify" || source === "youtube") url = cleanMusicUrl(rawUrl, source);
    else {
      try { url = cleanMusicUrl(rawUrl, "spotify"); }
      catch { try { url = cleanMusicUrl(rawUrl, "youtube"); } catch { url = ""; } }
    }
  }
  const enabled = !!music.enabled;
  if (enabled && source === "upload" && !file) throw new HttpError(400, "Hãy tải tệp nhạc trước khi bật trình phát.");
  if (enabled && source !== "upload" && !url) throw new HttpError(400, "Hãy nhập liên kết " + (source === "spotify" ? "Spotify" : "YouTube") + " hợp lệ.");
  const volume = Number(music.volume);
  return {
    enabled,
    source,
    title: typeof music.title === "string" && music.title.trim() ? music.title.trim().slice(0, 100) : "Nhạc nền",
    artist: typeof music.artist === "string" ? music.artist.trim().slice(0, 100) : "",
    file,
    url,
    layout: music.layout === "full" ? "full" : "compact",
    volume: Number.isFinite(volume) ? Math.min(1, Math.max(0, Math.round(volume * 100) / 100)) : 0.35,
    loop: music.loop !== false,
    autoplay: source === "upload" && !!music.autoplay
  };
}
function cleanOptionalText(value, max) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function cleanOptionalUrl(value, label) {
  const url = typeof value === "string" ? value.trim() : "";
  return url ? cleanUrl(url, label) : "";
}
function cleanLive(value) {
  const live = value && typeof value === "object" ? value : {};
  return {
    enabled: !!live.enabled,
    statusLabel: cleanOptionalText(live.statusLabel, 40) || "Đang live",
    game: cleanOptionalText(live.game, 80),
    title: cleanOptionalText(live.title, 120),
    detail: cleanOptionalText(live.detail, 220),
    url: cleanOptionalUrl(live.url, "xem live")
  };
}
function cleanSchedule(value) {
  const schedule = value && typeof value === "object" ? value : {};
  const events = Array.isArray(schedule.events) ? schedule.events.slice(0, 3) : [];
  return {
    enabled: !!schedule.enabled,
    timezone: cleanOptionalText(schedule.timezone, 40) || "GMT+7",
    events: events.map((event) => ({
      day: cleanOptionalText(event && event.day, 50),
      time: cleanOptionalText(event && event.time, 50),
      title: cleanOptionalText(event && event.title, 120),
      note: cleanOptionalText(event && event.note, 120)
    })).filter((event) => event.title)
  };
}
function cleanHighlights(value) {
  const items = Array.isArray(value) ? value.slice(0, 3) : [];
  return items.map((item) => ({
    label: cleanOptionalText(item && item.label, 50) || "Nội dung mới",
    title: cleanOptionalText(item && item.title, 140),
    meta: cleanOptionalText(item && item.meta, 180),
    url: cleanOptionalUrl(item && item.url, "nội dung nổi bật")
  })).filter((item) => item.title);
}
function cleanMusicUrl(value, source) {
  let url;
  try { url = new URL(value); } catch { throw new HttpError(400, "Liên kết nhạc không hợp lệ."); }
  if (url.protocol !== "https:") throw new HttpError(400, "Liên kết nhạc phải dùng HTTPS.");
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (source === "spotify") {
    if (host !== "open.spotify.com") throw new HttpError(400, "Liên kết Spotify phải thuộc open.spotify.com.");
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] && parts[0].startsWith("intl-")) parts.shift();
    if (parts[0] === "embed") parts.shift();
    if (!["track", "album", "playlist", "artist", "show", "episode"].includes(parts[0]) || !/^[A-Za-z0-9]{10,64}$/.test(parts[1] || "")) throw new HttpError(400, "Liên kết Spotify không được hỗ trợ.");
  } else {
    const allowed = ["youtu.be", "youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"];
    if (!allowed.includes(host)) throw new HttpError(400, "Liên kết YouTube không hợp lệ.");
    let video = "", list = url.searchParams.get("list") || "";
    if (host === "youtu.be") video = url.pathname.split("/").filter(Boolean)[0] || "";
    else {
      video = url.searchParams.get("v") || "";
      const parts = url.pathname.split("/").filter(Boolean);
      if (!video && ["shorts", "live", "embed"].includes(parts[0])) video = parts[1] || "";
    }
    const validVideo = /^[A-Za-z0-9_-]{6,20}$/.test(video);
    const validList = /^[A-Za-z0-9_-]{6,80}$/.test(list);
    if (!validVideo && !validList) throw new HttpError(400, "Liên kết YouTube không chứa video hoặc playlist hợp lệ.");
  }
  return url.href;
}
function cleanAudioAsset(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9._/-]+\.(?:mp3|ogg|wav|m4a|mp4)(?:\?v=[a-zA-Z0-9._-]+)?$/i.test(value)) throw new HttpError(400, "Đường dẫn tệp nhạc không hợp lệ.");
  return value;
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
