# Tài liệu phát triển

Khu vực này chứa tài liệu do đội phát triển hoặc AI coding tạo ra để thiết kế, triển khai, kiểm thử và vận hành code. Không đặt hồ sơ khách hàng gốc tại đây.

## Điểm vào bắt buộc

1. [`ke-hoach/tong-quan.md`](ke-hoach/tong-quan.md) — nguồn trạng thái duy nhất, quyết định và dữ liệu còn thiếu.
2. [`ke-hoach/gd1-ultty.md`](ke-hoach/gd1-ultty.md) — phạm vi và thứ tự triển khai GĐ1 Ultty.
3. [`kien-truc/he-thong.md`](../kien-truc/he-thong.md) — kiến trúc base đa khách và sơ đồ as-built/target.
4. [`../khach-hang/ultty/nghiep-vu/mo-ta-nghiep-vu.md`](../khach-hang/ultty/nghiep-vu/mo-ta-nghiep-vu.md) — nghiệp vụ đã đối chiếu nguồn gốc trước khi sửa rules.

## Cấu trúc

```text
phat-trien/
  kien-truc/       Quyết định kỹ thuật, sơ đồ, PoC và contract hệ thống.
  ke-hoach/        Roadmap, phạm vi từng đợt và nguồn trạng thái duy nhất.
  kiem-thu/tdd/    Bằng chứng RED → GREEN → REFACTOR của các lát cắt đã làm.
```

Khi thêm tài liệu mới, ưu tiên cập nhật tài liệu hiện có. Chỉ tạo file mới khi có vòng đời hoặc đối tượng đọc khác biệt rõ ràng.

