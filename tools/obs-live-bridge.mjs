import OBSWebSocket from "obs-websocket-js";

const OBS_URL = process.env.OBS_URL || "ws://127.0.0.1:4455";
const OBS_PASSWORD = process.env.OBS_PASSWORD || "";
const LIVE_WEBHOOK_URL = process.env.LIVE_WEBHOOK_URL || "";
const LIVE_WEBHOOK_SECRET = process.env.LIVE_WEBHOOK_SECRET || "";
const LIVE_TITLE = process.env.LIVE_TITLE || "";
const LIVE_DETAIL = process.env.LIVE_DETAIL || "";

if (!LIVE_WEBHOOK_URL || !LIVE_WEBHOOK_SECRET) {
  console.error("Thiếu LIVE_WEBHOOK_URL hoặc LIVE_WEBHOOK_SECRET.");
  process.exit(1);
}

const obs = new OBSWebSocket();
let lastState = null;
let reconnectTimer = null;

async function sendLive(enabled) {
  if (lastState === enabled) return;
  lastState = enabled;

  const response = await fetch(LIVE_WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Live-Webhook-Secret": LIVE_WEBHOOK_SECRET
    },
    body: JSON.stringify({
      live: enabled,
      title: LIVE_TITLE,
      detail: LIVE_DETAIL
    })
  });

  const text = await response.text();
  if (!response.ok) throw new Error(`Worker ${response.status}: ${text}`);
  console.log(`[LIVE] ${enabled ? "ĐANG LIVE" : "OFFLINE"} → Worker`, text);
}

async function connect() {
  clearTimeout(reconnectTimer);
  try {
    await obs.connect(OBS_URL, OBS_PASSWORD);
    console.log(`Đã kết nối OBS: ${OBS_URL}`);

    const state = await obs.call("GetStreamStatus");
    await sendLive(Boolean(state.outputActive));
  } catch (error) {
    console.error("Không thể kết nối OBS:", error?.message || error);
    reconnectTimer = setTimeout(connect, 5000);
  }
}

obs.on("StreamStateChanged", async ({ outputActive }) => {
  try {
    await sendLive(Boolean(outputActive));
  } catch (error) {
    console.error("Không thể cập nhật Worker:", error?.message || error);
  }
});

obs.on("ConnectionClosed", () => {
  console.log("OBS mất kết nối. Đang thử kết nối lại...");
  reconnectTimer = setTimeout(connect, 5000);
});

process.on("SIGINT", async () => {
  try { await obs.disconnect(); } catch {}
  process.exit(0);
});

process.on("SIGTERM", async () => {
  try { await obs.disconnect(); } catch {}
  process.exit(0);
});

connect();
