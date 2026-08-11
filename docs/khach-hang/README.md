# Tài liệu theo KHÁCH HÀNG

Nơi giữ **tài liệu của/gửi cho từng khách**. Tách khỏi tài liệu kỹ thuật dùng chung
([../nghiep-vu.md](../nghiep-vu.md) · [../so-do-he-thong.md](../so-do-he-thong.md) · [../ke-hoach/](../ke-hoach/)) vì
những thứ đó mô tả **nền tảng**, không thuộc về khách nào.

> **Đừng nhầm với [`tenants/`](../../tenants/README.md)** (đã có từ Đợt B1): thư mục này là
> **tài liệu cho người đọc** (hồ sơ, báo giá, trao đổi, ảnh design). `tenants/<slug>/` là
> **cấu hình máy đọc** (JSON có zod schema, dữ liệu seed) mà hệ thống nạp lúc chạy.
> Slug hai bên đặt trùng nhau. Xem [../ke-hoach/nen-tang-da-khach.md](../ke-hoach/nen-tang-da-khach.md).

## Quy ước

```
docs/khach-hang/<slug>/
  nguon-goc/    Hồ sơ GỐC do khách hoặc NetViet phát hành: khảo sát, báo giá, đề xuất,
                PO, bảng giá. Loại 4 trong CLAUDE.md — ĐỌC, KHÔNG SỬA NỘI DUNG.
  trao-doi/     Thư từ hai chiều: tin nhắn gửi khách, checklist hỏi, mẫu file xin dữ liệu.
                Đây là bản nháp của mình — sửa thoải mái.
  design-app/   Ảnh/bản vẽ giao diện khách gửi (tham khảo UX).
```

- `<slug>` trùng với slug gói khách trong `tenants/` (`ultty`, `amico`) để tra chéo dễ.
- Tên file dùng **chữ không dấu, gạch nối**, có **ngày dạng `YYYY-MM`** khi tài liệu gắn với một mốc phát hành.
- Tài liệu chứa **PII/giá thật** phải nằm trong thư mục đã gitignore (xem bảng dưới).

## Đang có

| Khách | Đường dẫn | Nội dung | Git |
|---|---|---|---|
| **U Ultty** | `ultty/nguon-goc/khao-sat-khach-hang-2026-07.docx` | Hồ sơ khảo sát gốc (mẫu PO, SKU, bảng giá, link Drive mục 7). *Tên gốc: `APP AI_Công ty Cổ Phần U Ultty Việt Nam_ Phuong Jul 2026.docx`* | theo dõi |
| | `ultty/nguon-goc/de-xuat-giai-phap-netviet.md` | Đề xuất giải pháp NetViet: kiến trúc nghiệp vụ, 6 vai agent (§5.1), lộ trình 3 GĐ, KPI. **GIỮ NGUYÊN.** *Tên gốc: `Thiet_ke_AI_Agent_U_Ultty.md`* | theo dõi |
| | `ultty/nguon-goc/ho-so-khao-sat/` | Quy trình + 3 PO + bảng giá + spec GĐ1. *Tên gốc: `HỒ SƠ THÔNG TIN KHẢO SÁT KHÁCH HÀNG/`* | **gitignored — PII** |
| | `ultty/trao-doi/` | 4 bản tin nhắn/checklist gửi chị Nguyễn Thu Phương + mẫu Excel A4. *Trước ở `docs/mau/`* | theo dõi |
| | `ultty/design-app/01.jpg` … `08.jpg` | 8 ảnh design app của khách (PWA 5 tab — quyết định treo **D3**). *Trước ở `design/`, tên gốc là chuỗi băm; thứ tự 01-08 giữ đúng thứ tự thời gian của tên cũ* | theo dõi |
| **Amico** | `amico/nguon-goc/bao-gia-ai-agent-2026-08.md` | Báo giá NetViet 08/2026: ~30 nhóm Zalo B2B, 6 agent, tích hợp Nhanh.vn + MISA, 80tr + 3 tuần. ⚠️ **4 mâu thuẫn cần chốt** — xem [../ke-hoach/nen-tang-da-khach.md §8](../ke-hoach/nen-tang-da-khach.md) | theo dõi |

## Thêm khách mới

1. `mkdir -p docs/khach-hang/<slug>/{nguon-goc,trao-doi}` — bỏ `design-app/` nếu khách không gửi ảnh.
2. Bỏ hồ sơ gốc vào `nguon-goc/`, đặt tên theo quy ước trên, ghi **tên gốc** vào bảng này.
3. Nếu hồ sơ có PII hoặc bảng giá thật → để trong thư mục con khớp mẫu gitignore, hoặc thêm dòng mới vào `.gitignore`.
4. Thêm một dòng vào bảng "Đang có".
