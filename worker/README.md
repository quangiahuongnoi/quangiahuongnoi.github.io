# Cloudflare Worker cho trang quản trị

Worker này cho phép `admin.html` đăng nhập bằng mật khẩu riêng. GitHub token được lưu trong Cloudflare Secret và không xuất hiện trong mã nguồn website.

## Triển khai bằng Cloudflare Dashboard

1. Đăng nhập [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. Mở **Workers & Pages** → **Create** → **Worker**.
3. Đặt tên Worker là `quangiahuongnoi-admin-api`.
4. Mở trình chỉnh sửa mã, xóa mã mẫu và dán toàn bộ nội dung file `worker.js`.
5. Bấm **Deploy**.
6. Trong **Settings** → **Variables and Secrets**, thêm ba Secret:
   - `ADMIN_PASSWORD`: mật khẩu riêng, tối thiểu 12 ký tự.
   - `SESSION_SECRET`: chuỗi ngẫu nhiên tối thiểu 32 ký tự.
   - `GITHUB_TOKEN`: Fine-grained GitHub token chỉ dành cho repo `quangiahuongnoi.github.io`, quyền **Contents: Read and write**.
7. Thêm các biến thường nếu Dashboard không dùng file `wrangler.toml`:
   - `ALLOWED_ORIGIN` = `https://quangiahuongnoi.github.io`
   - `GITHUB_OWNER` = `quangiahuongnoi`
   - `GITHUB_REPO` = `quangiahuongnoi.github.io`
   - `GITHUB_BRANCH` = `main`
   - `SITE_URL` = `https://quangiahuongnoi.github.io`
8. Sao chép URL dạng `https://quangiahuongnoi-admin-api.<tai-khoan>.workers.dev`.
9. Mở trang `/admin.html`, nhập URL Worker một lần rồi đăng nhập bằng `ADMIN_PASSWORD`.

Không gửi mật khẩu, SESSION_SECRET hoặc GITHUB_TOKEN cho bất kỳ ai.

## Wrangler (tùy chọn)

```bash
npx wrangler deploy
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
npx wrangler secret put GITHUB_TOKEN
```

## TikTok Live Monitor (Cloudflare Cron)

Worker có thêm bộ theo dõi LIVE định kỳ:

- `TIKTOK_USERNAME` mặc định là `quangiahuongnoi`.
- Cron hiện đặt mỗi 5 phút trong `wrangler.toml`.
- Worker gọi TikTool `POST /webcast/bulk_live_check` để lấy trạng thái LIVE.
- Chỉ cập nhật GitHub và gọi Discord khi trạng thái chuyển **OFFLINE ↔ LIVE**.
- Nếu nguồn trả về `unknown`, Worker giữ nguyên trạng thái trước đó để tránh tự tắt LIVE do lỗi kiểm tra.
- Endpoint `POST /live/monitor/check` có thể được gọi từ Admin sau khi đăng nhập để kiểm tra ngay, không cần chờ Cron.

### Secret cần thêm

Trong Cloudflare Worker → **Settings → Variables and Secrets**, thêm Secret:

- `TIKTOOL_API_KEY`: API key của TikTool.

Các biến thường đã nằm trong `wrangler.toml`:

- `TIKTOK_USERNAME` = `quangiahuongnoi`
- `LIVE_MONITOR_ENABLED` = `true`

### Sau khi cập nhật Worker

Nếu bạn deploy bằng Cloudflare Dashboard, hãy dán phiên bản `worker/worker.js` mới vào editor rồi Deploy. Sau đó tạo/kiểm tra **Cron Trigger** với lịch `*/5 * * * *`.

Nếu deploy bằng Wrangler:

```bash
npx wrangler deploy
npx wrangler secret put TIKTOOL_API_KEY
```

Cron của Cloudflare dùng UTC; lịch `*/5 * * * *` nghĩa là chạy mỗi 5 phút.

### Ghi chú

TikTool là dịch vụ bên thứ ba. TikTokLive và các dịch vụ tương tự không phải TikTok Official Live API; TikTok hiện không công khai một webhook creator LIVE start/stop phù hợp cho nhu cầu này. Monitor này vì vậy cần `TIKTOOL_API_KEY` để kiểm tra trạng thái LIVE.

