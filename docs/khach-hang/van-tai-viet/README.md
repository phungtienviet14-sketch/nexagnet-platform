# Vận tải Việt — mục lục

**Công ty Vận tải Việt** là khách **vận tải đầu tiên** của nền tảng, và đóng vai **reference tenant**
của vertical Transport. Nghiệp vụ của họ là nguồn để tổng quát hóa thành
[Transport Domain](../../kien-truc/transport-domain-contract.md) — không phải để viết một phần mềm
riêng cho họ.

- Quy mô: ~10 xe đầu kéo.
- Giai đoạn hiện tại: **demo cho khách xem**. Nghiệp vụ chưa chốt hết; phần chưa chốt chạy trên
  giả định `GD-xx` được ghi tường minh ở [T1 §21](../../kien-truc/transport-domain-contract.md#21-giả-định-giai-đoạn-demo-gd-xx).
- Chưa có gói `tenants/van-tai-viet/`. Mốc T2 (`TRANSPORT CORE v0`) **hoãn có chủ ý** việc tạo
  gói này: T2 là mốc CODE-ONLY, chưa có màn hình vận hành để demo và chưa có dữ liệu khách được
  duyệt về mặt riêng tư. Capability `transport-core` được chứng minh boot bằng một gói **fixture**
  tổng hợp (`packages/tenant/src/__tests__/fixtures/transport-core/`). Gói khách thật thuộc T7.

## Tài liệu

| File | Nội dung |
|---|---|
| [`nghiep-vu/nguon-su-that-van-tai.md`](nghiep-vu/nguon-su-that-van-tai.md) | **T0 — Nguồn sự thật.** 60+ sự kiện truy vết tới từng trang/mục của tài liệu khách, kèm 8 xung đột, 23 quyết định còn mở, 6 mục thiếu nguồn |
| [`../../kien-truc/transport-domain-contract.md`](../../kien-truc/transport-domain-contract.md) | **T1 — Hợp đồng Transport Domain.** Trung tính, không nhắc tên khách. Bounded context, aggregate, bất biến tài chính, capability, phân quyền, guardrail, 25 case nghiệm thu, 23 giả định demo |

## Hồ sơ gốc

| Tài liệu | Vị trí | Trong git? |
|---|---|---|
| `Phan_tich_nghiep_vu_App_Van_Tai.pdf` — tài liệu phân tích nghiệp vụ do chính khách viết, 14 trang, v1.0 tháng 7/2026 | **Ngoài repo:** `C:\Users\phung\Documents\vietpt\khoi_nghiep\van_tai\customer_docs\van_tai_viet\` | **Không** |

> **Vì sao hồ sơ gốc không nằm trong repo.** `nexagnet-platform` là repo **public**. Một tài liệu
> phân tích nghiệp vụ nội bộ của khách đưa vào đây là công bố nó ra ngoài. Tính toàn vẹn được bảo
> đảm bằng **SHA-256** ghi ở [T0 §1.1](nghiep-vu/nguon-su-that-van-tai.md), không bằng một bản sao.
>
> Muốn đưa vào repo thì cần **văn bản đồng ý của khách** *và* một dòng `.gitignore` thêm **trước**,
> theo đúng cách hồ sơ khảo sát Ultty đang được xử lý.

## Chưa có — cần xin khách

Ba nhóm dưới đây chặn phần lớn công việc tiếp theo (chi tiết ở [T0 §14](nghiep-vu/nguon-su-that-van-tai.md)):

1. **Một file bảng kê cây xăng thật** — không có nó thì đối soát nhiên liệu (T4) chỉ chạy trên dữ liệu bịa.
2. **Danh mục vận hành thật** — xe, lái xe, cây xăng, khách hàng, đối tác, giá tuyến.
3. **Văn bản đồng ý xử lý dữ liệu cá nhân của lái xe** — hệ thống lưu SĐT, GPLX, ảnh, lương; thuộc phạm vi Luật BVDLCN 91/2025/QH15 + NĐ 356/2025.
