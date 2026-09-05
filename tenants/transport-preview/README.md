# `transport-preview` — gói khách THAM CHIẾU của nghiệp vụ vận tải

> **Đây không phải khách hàng.** Không có người, công ty, số điện thoại, biển số, giấy phép hay tài
> khoản nào trong gói này là có thật. Tài liệu này là **nội bộ** và nói thẳng điều đó; **màn hình
> hướng khách thì không** — xem mục "Vì sao màn hình không tự nhận là bản demo" bên dưới.

## Slug giữ nguyên, tên hiển thị thì không

Slug `transport-preview` **giữ nguyên** dù nó đọc như một cái tên tạm. Lý do là vận hành chứ không
phải thẩm mỹ: slug quyết định tên stack (`transport-preview-gd1-test`), và tên compose project
quyết định **tên volume** — đổi nó là mất PostgreSQL của môi trường đang chạy. #196 Phase C cho
phép giữ slug nội bộ khi việc đổi làm tăng rủi ro triển khai, và ở đây nó có tăng.

Thứ **đã đổi** là những gì người dùng nhìn thấy: `identity.displayName`, `branding.installName`,
`branding.pageTitle`, `branding.pageDescription`. Trước đây cả bốn đều mang chữ "xem trước".

## Vì sao màn hình không tự nhận là bản demo

`#195` cấm mọi chữ về trạng thái nội bộ trên bề mặt hướng khách: `PREVIEW`, `UAT`, `chờ API`,
`runtime-proven`, số hiệu Issue/PR. Một người đang xem sản phẩm không cần biết chúng ta gọi môi
trường này là gì — và một dải băng "BẢN XEM TRƯỚC" nói với họ rằng thứ họ đang xem chưa đáng tin,
kể cả khi từng nghiệp vụ trên màn hình đều chạy thật.

Sự thật "đây không phải khách hàng" **không biến mất** — nó chuyển sang một chỗ máy đọc được:

```jsonc
"readiness": { "demoTenant": true }   // NỘI BỘ, không bao giờ ra màn hình
```

Trước đây năm cổng `*.composition.spec.ts` suy ra điều đó từ `readiness.previewNotice` — tức ràng
buộc một **tính chất kỹ thuật** vào một **dải băng khách nhìn thấy**. Hệ quả: không gỡ được dải
băng mà không phá cổng bảo vệ. Tách ra thì hai thứ độc lập, và
`apps/api/src/transport/transport-tenant-allowlist.spec.ts` khoá cả hai chiều: mỗi gói được miễn trừ
**phải** có `demoTenant: true`, và **không** gói khách thật nào được mang cờ đó.

## Nó KHÔNG phải cái gì

| Không phải | Vì sao ghi ra đây |
|---|---|
| Không phải khách hàng | Không dữ liệu nào trong gói là thật. |
| Không phải `BUSINESS-PROVEN` | Dành cho UAT/nghiệm thu thật của khách. |
| Không phải chỗ giữ chính sách lương | `policies.transportPayroll` **cố tình để trống**: bịa một chính sách lương là bịa nghiệp vụ của khách (#180 §12). |

## Năng lực đã bật

`transport-core` · `transport-costing` · `transport-fuel` · `transport-settlement` ·
`transport-asset-compliance` · `transport-workforce` — cả sáu, và từ T7D (#170) **cả sáu đều có
đường dữ liệu thật**. `readiness.blockedCapabilities` nay rỗng vì không còn nghiệp vụ nào bị chặn;
trước đây nó liệt kê bốn mục đang chờ #168/#169/#170.

Không bật `knowledge`, `messaging`, `sales-order`: bề mặt vận tải không cần, và bật thừa là mở một
đường ghi PII sang LLM mà việc này không cần đến.

## Xoá đi lúc nào

Khi một gói khách vận tải **thật** vào repo và không còn ai cần một môi trường tham chiếu. Xoá thư
mục này, gỡ slug khỏi `TRANSPORT_PREVIEW_TENANTS`, và trỏ
`apps/web/playwright.transport.config.ts` sang gói kế nhiệm.
