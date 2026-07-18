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
   - `GITHUB_TOKEN`: Fine-grained GitHub token chỉ dành cho repo `quangiahuongnoi`, quyền **Contents: Read and write**.
7. Thêm các biến thường nếu Dashboard không dùng file `wrangler.toml`:
   - `ALLOWED_ORIGIN` = `https://quangiahuongnoi.github.io`
   - `GITHUB_OWNER` = `quangiahuongnoi`
   - `GITHUB_REPO` = `quangiahuongnoi`
   - `GITHUB_BRANCH` = `main`
   - `SITE_URL` = `https://quangiahuongnoi.github.io/quangiahuongnoi`
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
