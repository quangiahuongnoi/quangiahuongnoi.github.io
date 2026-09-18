# Quản gia hướng nội — Java Edition

Đây là **bản sao độc lập** của website Quản gia hướng nội dưới dạng ứng dụng Java desktop.

> Website GitHub Pages gốc không bị thay đổi bởi project này.

## Phiên bản 1.0

Ứng dụng dùng **JavaFX WebView** để hiển thị website hiện tại trong cửa sổ desktop. Cách này giữ lại giao diện, CSS, JavaScript, animation, Live status và music player hiện có trong khi chúng ta phát triển các tính năng native Java riêng.

## Yêu cầu

- JDK 17+
- Maven 3.9+
- Internet connection để tải website và Maven dependencies

## Chạy bằng Maven

```bash
mvn clean javafx:run
```

## Cấu trúc

```text
java-edition/
├── pom.xml
├── README.md
└── src/main/java/vn/quangiahuongnoi/Main.java
```

## Lộ trình tiếp theo

1. Native Java settings/profile
2. Native Live controller
3. Discord Bot integration
4. Local/offline website resources
5. Đóng gói thành ứng dụng Windows
