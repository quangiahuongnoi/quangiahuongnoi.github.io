# Quản gia hướng nội — Website context

Tài liệu này là ghi chú nhanh để bảo trì website và hỗ trợ sửa lỗi trong các lần làm việc sau.

## Website

- **Website:** https://quangiahuongnoi.github.io/
- **Repository:** https://github.com/quangiahuongnoi/quangiahuongnoi.github.io
- **Triển khai:** GitHub Pages từ nhánh `main`.
- **Ngôn ngữ giao diện:** Tiếng Việt.

## File chính

| File | Mục đích |
| --- | --- |
| `index.html` | Giao diện và JavaScript chính của trang profile. |
| `content.json` | Nội dung động: profile, liên kết, live, lịch, YouTube, TikTok, nhạc và màu sắc. |
| `priority5.css` | Giao diện cho mascot, animation và mục TikTok. |
| `priority5.js` | Tương tác mascot, scroll reveal, trạng thái live và easter egg. |
| `admin.html` / `admin-v2.html` / `admin-dashboard.html` | Các trang quản trị nội dung. |
| `robots.txt` | Cho phép bot tìm kiếm crawl website và khai báo sitemap. |
| `sitemap.xml` | Danh sách các trang cần lập chỉ mục. |

## Cập nhật nội dung thường xuyên

Sửa `content.json` khi cần thay đổi:

- `links`: TikTok, YouTube và Discord.
- `live`: trạng thái livestream, tiêu đề, game và đường dẫn xem live.
- `schedule.events`: lịch stream.
- `youtube.items` / `tiktok.items`: nội dung mới.
- `music`: nhạc nền.
- `avatarImage`, `shareImage`, `qrImage`: ảnh đại diện, ảnh chia sẻ và QR.

## TikTok

- HTML tạo thẻ video với các class: `tiktok-post`, `tiktok-post-thumb`, `tiktok-post-body`, `tiktok-post-label`, `tiktok-post-arrow`.
- CSS tương ứng nằm trong `priority5.css`.
- Mỗi phần tử tại `content.json > tiktok.items` nên có `title`, `url`, `publishedAt`; thêm `thumbnail` để hiện ảnh video.
- Không đổi một bên class HTML/CSS mà không đổi bên còn lại.

## SEO

- Sau khi thêm trang công khai mới, thêm URL của trang đó vào `sitemap.xml`.
- Giữ canonical URL và Open Graph meta tags trong `index.html` đồng nhất với domain chính.
- Kiểm tra sau deploy:
  - https://quangiahuongnoi.github.io/robots.txt
  - https://quangiahuongnoi.github.io/sitemap.xml

## Quy trình sửa website

1. Thay đổi file cần thiết trong repository.
2. Kiểm tra liên kết ngoài, cú pháp JSON và tên class HTML/CSS.
3. Commit trực tiếp lên `main` hoặc tạo pull request.
4. Chờ GitHub Pages deploy vài phút.
5. Mở website ở cửa sổ ẩn danh hoặc hard refresh để tránh cache cũ.

## Lưu ý bảo mật

- Không commit token, mật khẩu, khóa API hay URL webhook riêng tư.
- Dùng biến môi trường hoặc GitHub Secrets cho các phần cần bí mật.
- Không đưa dữ liệu người dùng hoặc thông tin thanh toán vào repository công khai.

## Lần cập nhật gần nhất

- **2026-10-04:** Sửa class thẻ TikTok để khớp CSS; thêm `robots.txt` và `sitemap.xml`.
