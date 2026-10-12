# Luyện nói tiếng Anh – Shadowing

Ứng dụng web tĩnh luyện shadowing tiếng Anh không cần chạm tay. Trang web: https://trantan93.github.io/Hand-free-shadowing-english/ (GitHub Pages, nhánh `main`, thư mục `/`).

Có hai chế độ, chọn bằng cách bấm tên bài ở góc trên bên trái:

- **Câu tự nhập (v1):** bot đọc câu hai lần (speechSynthesis), ghi âm và tự dừng khi im lặng, phát lại bản ghi, rồi chọn **Đọc lại** hoặc **Câu tiếp**.
- **Bài từ YouTube (v2):** cùng vòng lặp đó, nhưng phần "bot đọc" là giọng người nói thật trong video, phát đúng từng câu. Bài được tạo từ link YouTube + file phụ đề tiếng Anh (hoặc từ file âm thanh + phụ đề). Cách thêm bài: xem [HUONG-DAN-V2.md](HUONG-DAN-V2.md).

Tệp:

- `index.html`: giao diện và vòng lặp luyện tập.
- `js/lesson.js`: đọc phụ đề SRT/VTT/json3/bản chép lời, ghép thành câu, ước lượng và căn thời gian từng câu.
- `js/players.js`: phát một đoạn bằng YouTube IFrame Player hoặc file âm thanh.
- `js/store.js`: lưu file âm thanh người dùng trong IndexedDB.
- `lessons/`: bài có sẵn (`index.json` và một file JSON cho mỗi bài).
- `tools/build-lesson.js`: công cụ Node để tạo bài có sẵn.
- `ipa-dict.json`: IPA tiếng Anh Mỹ offline, khoảng 18 nghìn từ, từ CMUdict.
- `manifest.webmanifest` và icon.

Không cần backend.
