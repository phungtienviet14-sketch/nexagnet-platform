# Mẫu Excel A4 — Đại lý & Map nhóm Zalo

Công cụ soạn **file mẫu Excel gửi khách** (chị Nguyễn Thu Phương) điền dữ liệu A4:
danh sách đại lý/CTV + ghép nhóm Zalo ↔ đại lý. Đây là **việc kế tiếp #1 (11/07/2026)** —
hạng mục Phase 3 duy nhất không bị khách chặn ([../../docs/phat-trien/ke-hoach/dot-0-nen-tang.md](../../docs/phat-trien/ke-hoach/dot-0-nen-tang.md) §1.3, cổng **A4**).

## Sinh lại file

```bash
python tools/excel-template/generate_a4_template.py
# cần: pip install openpyxl   (chỉ là công cụ soạn mẫu — KHÔNG phải dependency runtime)
```

Đầu ra: [`docs/khach-hang/ultty/trao-doi/a4-dai-ly-map-nhom-ultty.xlsx`](../../docs/khach-hang/ultty/trao-doi/a4-dai-ly-map-nhom-ultty.xlsx)
(3 sheet: **Hướng dẫn** · **1. Đại lý & CTV** · **2. Map nhóm Zalo**). Đã kèm sẵn 3 đại lý + 2 nhóm
thật từ khảo sát (`apps/api/src/knowledge/seed.ts`) làm dữ liệu khởi tạo → file round-trip đúng seed hiện tại.

`generate_a4_template.py` là **nguồn sự thật** cho cấu trúc mẫu; `.xlsx` là bản build đem gửi khách.
Sửa mẫu → sửa script rồi chạy lại, đừng sửa tay file .xlsx.

## Ánh xạ cột → field (dành cho importer sau này)

Importer (`read-excel-file` — [nen-tang.md §1.3](../../docs/phat-trien/ke-hoach/dot-0-nen-tang.md)) đọc file khách trả về và ghi
`Dealer` + `Group` (schema tại `apps/api/prisma/schema.prisma`). Header ở **dòng 1**, dữ liệu từ **dòng 2**.

### Sheet `1. Đại lý & CTV` → model `Dealer`

| Cột Excel | Field | Bắt buộc | Ghi chú |
|---|---|---|---|
| Tên đại lý / CTV (*) | `name` | ✅ | |
| Cấp (*) | `tier` | ✅ | dropdown → map nhãn bên dưới |
| Chính sách mặc định (*) | `defaultPolicy` | ✅ | dropdown → map nhãn bên dưới |
| Số điện thoại | `phone` | | |
| Tên gọi tắt / viết tắt | `aliases` | | tách bằng dấu phẩy → `string[]` |
| Mã đại lý | `code` | | rỗng → để `null` (unique khi có) |

### Sheet `2. Map nhóm Zalo` → model `Group`

| Cột Excel | Field | Bắt buộc | Ghi chú |
|---|---|---|---|
| Tên nhóm Zalo (*) | `name` | ✅ | |
| Thuộc đại lý / CTV (*) | `dealerId` | ✅ | khớp theo `Dealer.name` (hoặc `code`) ở sheet 1 |
| Chi nhánh | `branch` | | vd HN / TN / OCP |
| Chat ID nhóm | `chatId` | | thường **để trống** — kỹ thuật/hệ thống điền; khóa map là `(platform, chatId)` |

> Nhóm chưa có `chatId` → nhập vào "hộp thư nhóm chưa map" (`status=pending`), khớp `chatId` khi nhóm gửi tin đầu.
> `platform` mặc định `"zalo"`; `source` khi import đặt `"import"`.

### Bảng map nhãn dropdown → enum (khớp `schema.prisma`)

`DealerTier`:

| Nhãn trong file | Enum |
|---|---|
| Đại lý | `dai_ly` |
| CTV (Cộng tác viên) | `ctv` |

`PolicyType`:

| Nhãn trong file | Enum |
|---|---|
| Công nợ 30 ngày | `cong_no_30` |
| Công nợ 45 ngày | `cong_no_45` |
| Ký gửi | `ky_gui` |
| Thanh toán ngay | `thanh_toan_ngay` |
| COD (thu hộ khi giao) | `cod` |

Nguồn map duy nhất nằm trong `generate_a4_template.py` (`TIER_LABEL_TO_ENUM`, `POLICY_LABEL_TO_ENUM`) —
importer nên tái dùng đúng bảng này, và **dry-run báo lỗi từng dòng** trước khi ghi (yêu cầu nen-tang §1.3).
