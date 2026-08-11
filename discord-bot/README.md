# 🤖 Priority 8 — Quản gia hướng nội Discord Bot

Bot Discord riêng cho **Quản gia hướng nội**, tập trung vào live notification và kết nối với website.

## Đã có

- 🔴 `/live start` — gửi thông báo bắt đầu live.
- ⚫ `/live stop` — cập nhật thông báo thành đã kết thúc.
- 📡 `/status` — xem trạng thái live hiện tại.
- 📅 `/schedule` — xem lịch stream trên website.
- 🌐 `/website` — mở website.
- 🔐 HTTP bridge `POST /api/live` để sau này Admin/Cloudflare Worker điều khiển bot mà không đưa Discord token lên frontend.
- `GET /health` để kiểm tra bot/API.

## 1. Tạo Discord App

Trong Discord Developer Portal, tạo một Application rồi tạo Bot. Lấy:

- Bot Token → `DISCORD_TOKEN`
- Application ID → `DISCORD_CLIENT_ID`
- Server ID → `DISCORD_GUILD_ID`
- ID channel nhận thông báo → `DISCORD_LIVE_CHANNEL_ID`

**Không commit `.env` và không gửi Bot Token vào chat.**

Mời bot vào server với các quyền tối thiểu cần thiết cho channel thông báo: xem channel, gửi message, embed links và chỉnh sửa message của bot.

## 2. Cài đặt

```bash
cd discord-bot
npm install
copy .env.example .env
```

Điền `.env`, sau đó đăng ký slash commands:

```bash
npm run register
```

Chạy bot:

```bash
npm start
```

## 3. Test Discord

```text
/live start game:Wuthering Waves title:"Farm echo cùng mọi người" url:https://www.tiktok.com/@quangiahuongnoi
/status
/live stop
```

## 4. Kết nối website/Admin

Không gọi `/api/live` trực tiếp từ GitHub Pages với secret. Frontend là public nên secret sẽ bị lộ.

Kiến trúc an toàn:

```text
Admin website
     ↓
Cloudflare Worker / backend
     ↓  Authorization: Bearer <secret>
Discord Bot /api/live
     ↓
Discord #live-notification
```

Payload bắt đầu live:

```json
{
  "live": true,
  "game": "Wuthering Waves",
  "title": "Farm echo cùng mọi người 🐧",
  "url": "https://www.tiktok.com/@quangiahuongnoi"
}
```

Kết thúc live:

```json
{ "live": false }
```

## 5. Deploy

Bot **không chạy trên GitHub Pages**. GitHub Pages chỉ phục vụ website tĩnh. Bot cần một Node.js host/server có process chạy liên tục, ví dụ VPS hoặc một nền tảng hosting Node.js.

Sau khi deploy, đặt các biến môi trường từ `.env.example` trong phần Secrets/Environment Variables của host.

## Roadmap Priority 8

- [x] Bot core
- [x] Slash commands
- [x] Live notification embed
- [x] Edit notification when live ends
- [x] Secure webhook bridge
- [ ] Kết nối Admin Dashboard
- [ ] Auto sync lịch stream
- [ ] Tự phát hiện TikTok Live (Priority 9)
