# `transport-preview` — gói khách XEM TRƯỚC, dùng một lần

> **Đây không phải khách hàng.** Không có người, công ty, số điện thoại, biển số, giấy phép hay tài
> khoản nào trong gói này là có thật. Gói tồn tại để mở được bề mặt vận hành vận tải trong trình
> duyệt và lấy ý kiến sớm về giao diện — không hơn.

## Nó KHÔNG phải cái gì

| Không phải                          | Vì sao ghi ra đây                                                                                                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Không phải T8 (`#90`)               | T8 là tenant tham chiếu + một tháng dữ liệu thật-như-thật. Gói này tối thiểu và sẽ bị T8 thay thế.                                                                                                                                                |
| Không phải bản chạy được cho khách  | Nghiệp vụ quyết toán, tải ảnh bằng chứng, bảo dưỡng và lương đều **chưa nối**. Từ #195 các mục đó bị **ẩn khỏi điều hướng** thay vì hiện kèm lời giải thích kỹ thuật; `policies.readiness.blockedCapabilities` giữ danh sách bằng câu trung tính. |
| Không phải UAT                      | Không có dữ liệu nghiệp vụ nào được kiểm chứng ở đây.                                                                                                                                                                                             |
| Không phải chỗ giữ chính sách lương | `policies.transportPayroll` **cố tình để trống**: bịa một chính sách lương là bịa nghiệp vụ của khách (#180 §12).                                                                                                                                 |

Những điều trên là **sự thật nội bộ**, và nó ở lại đây — không lên màn hình. Trước #195, gói tự
khai bằng `policies.readiness.previewNotice` và một dải băng **BẢN XEM TRƯỚC** hiện trên mọi màn
hình; dải băng đó đã bị bỏ, vì nó là ngôn ngữ nội bộ đặt trước mặt người dùng.

Chỗ neo của cổng chặn vì vậy đã đổi, nhưng tính chất thì không:
`apps/api/src/transport/transport-tenant-allowlist.spec.ts` **bắt buộc** mọi gói được miễn trừ phải
có `integrations: {}`, `bootstrap: {}` và `smoke: null` — tức không nối vào một đường sống nào. Chỗ
neo mới chặt hơn chỗ cũ: nó không thể thoả mãn bằng một câu văn, và cả ba gói khách thật đều khai
adapter nên không gói nào lọt vào danh sách miễn trừ mà không làm đỏ bài test đó.

## Vì sao nó được phép bật `transport-*`

Năm cổng `*.composition.spec.ts` chặn mọi gói khách bật nghiệp vụ vận tải chừng nào T7 chưa đóng.
Danh sách được miễn trừ nằm ở `apps/api/src/transport/__tests__/tenant-packs.ts`, và có bài test
riêng khoá lại rằng **không một gói khách thật nào** (`amico`, `ultty`, `wata`) lọt vào đó.

## Năng lực đã bật

`transport-core` · `transport-costing` · `transport-fuel` · `transport-settlement` ·
`transport-asset-compliance` · `transport-workforce` — đủ để thấy toàn bộ kiến trúc thông tin,
kể cả những mục nói thật là chưa lấy được dữ liệu.

Không bật `knowledge`, `messaging`, `sales-order`: bề mặt vận tải không cần, và bật thừa là mở
một đường ghi PII sang LLM mà việc này không cần đến.

## Không cần gì để boot

`integrations: {}` — không kênh Zalo, không parser LLM, không ERP. `bootstrap: {}` — không có tệp
dữ liệu hạt giống, vì nghiệp vụ vận tải **chưa có hợp đồng seed nào** (đường duy nhất được hỗ trợ
là gọi HTTP với tư cách ADMIN).

## Xoá đi lúc nào

Khi `#90` (T8) đưa tenant tham chiếu thật vào, hoặc khi T7 đóng và nghiệp vụ vận tải không còn cần
cổng chặn. Xoá thư mục này, gỡ slug khỏi `TRANSPORT_PREVIEW_TENANTS`, và trỏ
`apps/web/playwright.transport.config.ts` sang gói kế nhiệm.
