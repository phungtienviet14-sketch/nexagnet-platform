# Đưa DEMO Ultty AI lên Hugging Face Spaces (SDK Docker)

Hướng dẫn này dành cho **người không rành kỹ thuật**. Làm theo đúng thứ tự là chạy được.
Bản demo chạy **offline hoàn toàn** — **KHÔNG cần nhập bất kỳ secret / API key nào**
(`CHANNEL_MODE=mock`, `PERSISTENCE=memory` đã đặt sẵn trong Dockerfile).
**Từ 18/08/2026 Space cần `DEEPSEEK_API_KEY` trong Secrets** — `PARSER_MODE=mock` đã bị gỡ khỏi cấu hình (parser giả từng là mặc định, nên một stack quên đặt biến này sẽ khớp-mẫu trên dữ liệu thật mà không báo gì).

> ⚠️ **BẢO MẬT — đọc trước:**
> - Để Space ở chế độ **Private** (riêng tư) khi tạo.
> - **KHÔNG dán token Hugging Face (chuỗi `hf_...`) vào khung chat với AI, vào code, hay bất kỳ đâu.**
>   Token chỉ nhập ở **máy của bạn** (khi Git hỏi mật khẩu) hoặc trong **giao diện web của Hugging Face**.
> - Demo mock này **không cần** token nào để chạy. Token chỉ dùng để *đẩy code lên* Space của bạn.

---

## Bức tranh tổng thể (cần hiểu 1 phút)

- Một "Space" trên Hugging Face là **một kho Git riêng**. Bạn đẩy code lên đó, HF tự build Docker và chạy.
- HF **bắt buộc** 2 file nằm ở **gốc** của Space: `Dockerfile` và `README.md` (có phần cấu hình ở đầu file).
- Trong repo này, các file đã soạn sẵn nằm trong `deploy/hf-demo/`. Khi lên Space, ta **copy** chúng ra gốc.
- App gồm 2 phần chạy chung 1 container: **Web (Next.js)** công khai ở cổng **7860**, gọi **API (NestJS)**
  nội bộ ở cổng 3001. Người xem chỉ thấy 1 địa chỉ web — mọi thứ khác ẩn bên trong.

---

## Bước 1 — Chuẩn bị (một lần)

1. Có **tài khoản Hugging Face**: https://huggingface.co/join
2. Cài **Git** trên máy (nếu chưa có): https://git-scm.com/downloads
3. Tạo **Access Token** của HF để đẩy code:
   - Vào https://huggingface.co/settings/tokens → **New token** → quyền **Write** → **Create**.
   - Bấm **Copy** để chép token (dạng `hf_...`). **Giữ kín** — không gửi cho ai, không dán vào chat.
   - (Bạn sẽ dán token này khi Git hỏi *password* ở Bước 4 — chỉ trên máy bạn.)

---

## Bước 2 — Tạo Space (SDK Docker, Private)

1. Vào https://huggingface.co/new-space
2. Điền:
   - **Owner**: tài khoản của bạn.
   - **Space name**: ví dụ `ultty-ai-demo`.
   - **License**: chọn tuỳ ý (ví dụ `other`).
   - **Select the Space SDK**: chọn **Docker** → **Blank** (mẫu trống).
   - **Space hardware**: `CPU basic` (miễn phí) là đủ.
   - **Visibility**: chọn **Private** ✅ (rất quan trọng).
3. Bấm **Create Space**. Ghi lại địa chỉ Space, dạng:
   `https://huggingface.co/spaces/<tên-của-bạn>/ultty-ai-demo`

---

## Bước 3 — Chuẩn bị code để đẩy lên

Mở **PowerShell** tại thư mục gốc repo này (`...\source\Z`) rồi chạy 3 lệnh copy sau
(đưa các file HF bắt buộc ra gốc — HF chỉ đọc `Dockerfile` và `README.md` ở gốc):

```powershell
Copy-Item deploy/hf-demo/Dockerfile      ./Dockerfile      -Force
Copy-Item deploy/hf-demo/.dockerignore   ./.dockerignore   -Force
Copy-Item deploy/hf-demo/README.space.md ./README.md       -Force
```

> Repo hiện **chưa có** `README.md` ở gốc nên không ghi đè lên gì cả — yên tâm.
> Nếu sau này muốn giữ gốc repo "sạch", bạn có thể xoá 3 file này khỏi nhánh làm việc
> **sau khi đã đẩy lên Space** (Space giữ bản sao riêng của nó).

---

## Bước 4 — Đẩy code lên Space

Vẫn ở PowerShell tại gốc repo, thay `<tên-của-bạn>` và tên Space cho đúng:

```powershell
# Khai báo Space như một "remote" tên là hf
git remote add hf https://huggingface.co/spaces/<tên-của-bạn>/ultty-ai-demo

# Đưa các file vừa copy vào một commit (Git sẽ tự bỏ qua secrets/PII nhờ .gitignore)
git add Dockerfile .dockerignore README.md
git commit -m "chore(hf): them file trien khai demo len Hugging Face Spaces"

# Đẩy nhánh hiện tại lên nhánh main của Space
git push hf HEAD:main
```

- Khi Git hỏi **Username**: gõ **tên tài khoản HF** của bạn.
- Khi Git hỏi **Password**: **dán token `hf_...`** (Bước 1). Màn hình sẽ không hiện ký tự — vẫn cứ dán rồi Enter.
- **Nhắc lại:** token chỉ dán ở đây, trên máy bạn. Không dán vào chat, không lưu vào file trong repo.

> Nếu `git push` báo lỗi "updates were rejected" (Space đã có sẵn commit mẫu), chạy:
> `git push hf HEAD:main --force` (an toàn vì Space mới, chưa có gì quan trọng).

---

## Bước 5 — Chờ build & xem demo

1. Mở trang Space trên web. HF sẽ tự **Building** (lần đầu mất khoảng **5–12 phút** — bình thường).
2. Xem tiến trình ở tab **Logs** (hoặc **App**). Khi trạng thái chuyển **Running**, demo đã chạy.
3. Bấm vào tab **App** để mở console. Ở cột giữa bấm **Giả lập tin** (hoặc chọn tin mẫu) để xem
   6 agent xử lý một đơn hàng.

Không cần đặt biến môi trường hay secret nào cho demo mock.

---

## Xử lý sự cố thường gặp

- **Demo không cập nhật real-time (khối 6 agent như đứng im):** một số hạ tầng chặn luồng SSE qua proxy.
  Khắc phục: vào **Settings → Variables and secrets** của Space → mục **Variables** (KHÔNG phải Secrets)
  → thêm biến `STREAM_MODE` = `off` → Space tự khởi động lại và chuyển sang chế độ *polling* (ổn định hơn).
  Đây chỉ là biến cấu hình bình thường, **không phải secret**.
- **Build thất bại:** mở tab **Logs**, đọc dòng lỗi cuối. Thường do đẩy thiếu file — kiểm tra đã copy
  đủ `Dockerfile`, `.dockerignore`, `README.md` ra gốc (Bước 3) và `git push` thành công chưa.
- **Trang trắng / lỗi 404:** đợi thêm 1–2 phút cho tới khi trạng thái **Running**, rồi tải lại trang.

---

## (Tuỳ chọn) Kiểm tra bằng Docker ngay trên máy trước khi đẩy

Nếu máy bạn có Docker, có thể chạy thử để chắc chắn trước:

```powershell
# Chạy tại GỐC repo (build context bắt buộc là gốc repo)
docker build -f deploy/hf-demo/Dockerfile -t ultty-demo .
docker run --rm -p 7860:7860 ultty-demo
```

Rồi mở trình duyệt tại http://localhost:7860 . Bấm **Ctrl+C** trong PowerShell để dừng.

---

## Vì sao thiết kế như vậy (ghi chú kỹ thuật ngắn)

- **Web (Next.js) là app công khai ở cổng 7860**, còn **API (NestJS) chạy nội bộ ở 3001**.
  Trình duyệt gọi API "cùng nguồn" (same-origin) — Next.js chuyển tiếp (`rewrites`) các đường dẫn API
  sang API nội bộ. Nhờ vậy **không dính CORS** và **không cần biết trước URL thật của Space**.
- Đây là cách khớp với code thật: web gọi API từ **trình duyệt** qua `NEXT_PUBLIC_API_URL`
  (`apps/web/lib/api.ts`) và mở luồng SSE `EventSource('/events')` (`apps/web/hooks/useAgentStream.ts`).
  Bản demo build với `NEXT_PUBLIC_API_URL=""` để mọi lời gọi thành same-origin.
- Container chạy 2 tiến trình bằng `start.sh`; nếu một tiến trình chết thì cả hai dừng để HF khởi động lại.
