# Mục lục tài liệu

Tài liệu tách theo **tuổi thọ và chủ sở hữu**, không theo định dạng file. Ba nhánh cấp 1:

| Khu vực | Vai trò | Nhịp thay đổi | Điểm vào |
|---|---|---|---|
| [`kien-truc/`](kien-truc/nen-tang-da-khach.md) | **Canonical.** Hệ thống được thiết kế thế nào — đúng cho mọi khách, mọi thời điểm | Hiếm; đổi là quyết định kiến trúc | [`kien-truc/nen-tang-da-khach.md`](kien-truc/nen-tang-da-khach.md) |
| [`phat-trien/`](phat-trien/README.md) | **Công việc.** Đang làm gì, xong gì, kiểm thử ra sao | Liên tục | [`phat-trien/ke-hoach/tong-quan.md`](phat-trien/ke-hoach/tong-quan.md) |
| [`khach-hang/`](khach-hang/README.md) | **Theo khách.** Hồ sơ nguồn, trao đổi, nghiệp vụ, bản bàn giao | Theo từng khách | [`khach-hang/ultty/README.md`](khach-hang/ultty/README.md) |

### Ba tài liệu trong `kien-truc/` khác vai nhau

| File | Là gì | Không phải gì |
|---|---|---|
| [`nen-tang-da-khach.md`](kien-truc/nen-tang-da-khach.md) | **Kiến trúc tổng quát cao nhất** — core/tenant, port/adapter, silo, cách ly dữ liệu, bất biến bảo mật | Không phải kế hoạch, không chứa trạng thái, không nhắc tên khách |
| [`he-thong.md`](kien-truc/he-thong.md) | **Thiết kế kỹ thuật & as-built** — sơ đồ, quyết định kỹ thuật, phụ lục PoC | Không được mâu thuẫn với file trên |
| [`api-http.md`](kien-truc/api-http.md) | **Hợp đồng HTTP** — xác thực, phân quyền, toàn bộ endpoint, giới hạn tần suất, hình dạng lỗi | Không phải hướng dẫn vận hành, không chứa dữ liệu khách |

> ⚠️ Đừng nhầm [`kien-truc/nen-tang-da-khach.md`](kien-truc/nen-tang-da-khach.md) (kiến trúc) với
> [`phat-trien/ke-hoach/dot-0-nen-tang.md`](phat-trien/ke-hoach/dot-0-nen-tang.md) (kế hoạch Đợt 0).
> Tên từng gần giống nhau nên đã đổi tên file kế hoạch cho khỏi lẫn.

## Quy ước đặt tên

- Tên thư mục/file dùng chữ thường, không dấu và `kebab-case`.
- Ngày trong tên file dùng ISO: `YYYY-MM-DD`; tài liệu theo tháng dùng `YYYY-MM`.
- Hồ sơ trong `nguon-goc/` không sửa nội dung. Nếu cần phân tích hoặc diễn giải, tạo tài liệu dẫn xuất ở `nghiep-vu/` hoặc `phat-trien/`.
- Chỉ [`phat-trien/ke-hoach/tong-quan.md`](phat-trien/ke-hoach/tong-quan.md) giữ trạng thái `✅/⬜`; kế hoạch con chỉ giữ phạm vi và thiết kế.
- File bàn giao và nguồn sinh file được đặt cạnh nhau dưới `khach-hang/<slug>/ban-giao/`.
- Không đưa dữ liệu riêng của khách vào tài liệu kiến trúc base nếu không cần; dùng đường dẫn tham chiếu sang hồ sơ khách.

