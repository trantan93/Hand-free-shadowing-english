# Hướng dẫn v2 – Luyện theo giọng thật từ YouTube

Link app vẫn như cũ: https://trantan93.github.io/Hand-free-shadowing-english/

Bản v2 cho anh nghe **giọng người nói thật** trong video thay cho giọng máy. App cắt video thành từng câu và chạy y như cũ: phát câu gốc 2 lần → anh đọc → app phát lại giọng anh → **Đọc lại** hoặc **Câu tiếp**.

Chế độ cũ (gõ câu, giọng máy đọc) vẫn còn: bấm tên bài ở góc trên bên trái → chọn **Câu tự nhập – máy đọc**.

## Học bài có sẵn

Bấm tên bài ở góc trên bên trái → chọn **Grit** (bài nói TED của Angela Lee Duckworth, 75 câu) → **Bắt đầu**.

## Thêm bài mới từ link YouTube (khoảng 2 phút)

Chọn video có phụ đề tiếng Anh **do người làm** (video TED, TED-Ed, BBC Learning English, VOA… thường có).

1. Trên YouTube bấm **Chia sẻ → Sao chép đường liên kết**.
2. Lấy file phụ đề:
   - Mở trang **downsub.com** (hoặc **savesubs.com**) và dán link video vào.
   - Tải dòng **English** dạng **SRT**.
   - **Đừng** chọn dòng có chữ *auto-generated* (máy tự tạo, hay sai và không có dấu chấm câu).
3. Mở app, bấm tên bài ở góc trên → **+ Từ link YouTube**.
4. Dán link vào ô 1. Ở ô 2, chọn file `.srt` vừa tải (trên iPhone file nằm trong *Tệp › Tải về*). Bấm **Tạo bài**.

App tự ghép phụ đề thành từng câu hoàn chỉnh, lấy tên video và lưu bài trên máy. Lần sau mở app sẽ vào lại đúng bài, đúng câu đang học.

**Nếu không tải được file phụ đề:** trên YouTube (bản máy tính) bấm **…Thêm → Hiện bản chép lời**, bôi đen hết rồi sao chép. Sau đó trong app bấm **"Hoặc dán nội dung phụ đề…"** và dán vào.

## Lưu ý

- **iPhone:** lần đầu có thể app báo *"CHẠM VÀO VIDEO ▶ ĐỂ PHÁT"*. Anh chạm vào video một lần, các câu sau app tự phát.
- **Video không phát trong app** (chủ video tắt chế độ nhúng; app sẽ báo): dùng cách bên dưới.
- **Câu bị mất chữ đầu/cuối hoặc lẫn chữ câu bên cạnh:** vào ⚙ Cài đặt → kéo xuống **Chỉnh thời gian câu đang học** → bấm **Sớm hơn / Muộn hơn**, rồi bấm **▶ Nghe thử câu** để kiểm tra. Nếu mọi câu đều lệch như nhau thì chỉnh dòng **Cả bài**.
- Bài anh tự tạo chỉ lưu trên điện thoại đó, trong trình duyệt đó.

## Cách dự phòng: file âm thanh + file phụ đề

Dùng khi video không phát được trong app, hoặc khi anh có sẵn file mp3/m4a và phụ đề của nó.

Bấm tên bài → **+ Từ file âm thanh** → chọn file âm thanh (hoặc video) → chọn file phụ đề `.srt`/`.vtt` **của chính file đó** → **Tạo bài**. App sẽ nghe file để cắt câu chính xác hơn, rồi lưu file trên máy (không cần chọn lại lần sau).

---

## Dành cho người sửa code: thêm bài có sẵn cho mọi người

Bài có sẵn nằm trong thư mục `lessons/`. Để thêm bài (cần Node.js; ffmpeg nếu dùng `--audio`):

```
node tools/build-lesson.js --youtube <link> --subs phu-de.srt --id ten-bai --title "Tên bài" [--speaker "Người nói"] [--audio am-thanh.m4a] [--offset 0]
```

Lệnh này tạo `lessons/ten-bai.json` và thêm bài vào `lessons/index.json`. Commit lên nhánh `main` là bài hiện ra trong app.

- `--audio`: dùng file âm thanh của chính video để căn ranh giới câu chính xác hơn.
- `--offset`: dùng khi phụ đề lệch giờ so với video. Đơn vị là giây.
- Mở thẳng một bài: `.../Hand-free-shadowing-english/?lesson=ten-bai`.
