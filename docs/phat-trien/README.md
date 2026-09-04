# Tài liệu phát triển

Khu vực này chứa tài liệu do đội phát triển hoặc AI coding tạo ra để thiết kế, triển khai, kiểm thử và vận hành code. Không đặt hồ sơ khách hàng gốc tại đây.

## Điểm vào bắt buộc

1. [`ke-hoach/tong-quan.md`](ke-hoach/tong-quan.md) — nguồn trạng thái duy nhất, quyết định và dữ liệu còn thiếu.
2. [`ke-hoach/gd1-ultty.md`](ke-hoach/gd1-ultty.md) — phạm vi và thứ tự triển khai GĐ1 Ultty.
3. [`kien-truc/he-thong.md`](../kien-truc/he-thong.md) — kiến trúc base đa khách và sơ đồ as-built/target.
4. [`../khach-hang/ultty/nghiep-vu/mo-ta-nghiep-vu.md`](../khach-hang/ultty/nghiep-vu/mo-ta-nghiep-vu.md) — nghiệp vụ đã đối chiếu nguồn gốc trước khi sửa rules.
5. [`van-hanh/checklist-go-live.md`](van-hanh/checklist-go-live.md) — **đọc trước khi bật pilot dữ liệu thật**: 9 cổng máy tự chấm, 2 công tắc đang khóa có chủ ý, chặn pháp lý, trình tự bật và rollback.
6. [`van-hanh/ci-cd.md`](van-hanh/ci-cd.md) — **đọc trước khi sửa `.github/workflows/` hoặc `deploy/`**: ai là ai (Nexagnet · NetViet · khách), bản đồ pipeline, 7 bất biến, thứ tự lên khách mới, 4 phép kiểm sau deploy, 6 sự cố đã xảy ra thật.
7. [`van-hanh/github-governance.md`](van-hanh/github-governance.md) — **đọc trước khi đổi tên job CI hoặc sửa cổng deploy**: `main` được bảo vệ bằng gì, 7 status check bắt buộc và bẫy đổi tên job, cổng environment, bằng chứng phủ định, và giới hạn chưa gỡ được.
8. [`van-hanh/chay-kiem-workflow-engine.md`](van-hanh/chay-kiem-workflow-engine.md) — **hướng dẫn dùng cổng CI `workflow-integration`**: nó chứng minh gì, chạy lại 24 bài trên máy mình thế nào, và bốn kiểu đỏ đã đo được.
9. [`van-hanh/nguon-khach-hang.md`](van-hanh/nguon-khach-hang.md) — **đọc trước khi mở một tệp tài liệu khách trên máy**: byte gốc sống ở kho riêng, repo giữ SHA-256; bảy bước nạp một tài liệu, bốn bất biến không nhảy được bước nào, cổng CI `NO_RAW_CUSTOMER_ARTIFACT_IN_GIT`, và phải làm gì khi đã lỡ commit.
10. [`van-hanh/autopilot-protocol-v0.md`](van-hanh/autopilot-protocol-v0.md) — **đọc trước khi viết Issue/comment cho autopilot hoặc đụng vào `tools/autopilot-protocol/`**: giao thức ChatGPT ↔ GitHub ↔ Claude V0 — tác nhân, 9 thông điệp có marker, máy trạng thái 8 trạng thái, quy tắc SHA/CI/rủi ro/retry/idempotency, Task Contract, validator CLI. **Nền tảng giao thức** — chưa có orchestrator hay dispatcher.

## Cấu trúc

```text
phat-trien/
  kien-truc/       Quyết định kỹ thuật, sơ đồ, PoC và contract hệ thống.
  ke-hoach/        Roadmap, phạm vi từng đợt và nguồn trạng thái duy nhất.
  kiem-thu/tdd/    Bằng chứng RED → GREEN → REFACTOR của các lát cắt đã làm.
  van-hanh/        Thủ tục vận hành: điều kiện bật pilot, trình tự bật, rollback.
```

Khi thêm tài liệu mới, ưu tiên cập nhật tài liệu hiện có. Chỉ tạo file mới khi có vòng đời hoặc đối tượng đọc khác biệt rõ ràng.

