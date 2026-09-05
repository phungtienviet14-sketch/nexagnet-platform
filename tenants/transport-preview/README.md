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
| Không phải mức lương của ai | `policies.transportPayroll` có số, và **mọi con số đó đều do chúng ta nghĩ ra** — xem ngay dưới. |

### `transportPayroll` từng để trống, nay có số — và vì sao đảo lại

Ghi chú cũ ở đây nói gói này **cố tình để trống** `policies.transportPayroll`, dẫn #180 §12: bịa một
chính sách lương là bịa nghiệp vụ của khách. **Vế đó vẫn đúng, nhưng nó không áp cho gói này.**
#180 §12 cấm bịa chính sách **của một khách hàng**; `transport-preview` không có khách hàng nào —
công ty, đội xe và mười hai lái xe trong gói đều là hư cấu, và tài liệu này nói thẳng điều đó ngay
dòng đầu.

Cái giá của việc để trống thì có thật: mặc định của miền là `0`, nên **mọi phiếu lương trong bản
demo ra 0 đồng**. T8 (#90) đòi "một kỳ lương với nhiều phiếu lương" — một kỳ lương toàn số 0 không
trình bày được gì ngoài việc bảng lương biết cộng số 0.

Nên gói này khai một biểu lương hư cấu, và ranh giới là: **số nằm trong gói mẫu, không nằm trong
mặc định của miền.** `payroll-policy.ts` vẫn trả `0` cho mọi khách không khai — bất biến của #180
§12 không suy suyển.

> **`fuelSavingBonusVndPerLiter` CỐ TÌNH VẮNG MẶT.** `WorkforceFuelFacts` không được đăng ký ở đâu
> cả (xem `transport-workforce.module.ts`), nên `runPayroll` luôn trả `fuelLitersSaved: null` và ghi
> `FUEL_SAVING_UNAVAILABLE` vào `missingInputs`. Khai một mức thưởng mà runtime không thể áp là hứa
> một cái khoá không tồn tại — đúng kiểu hỏng mà schema `transportFuel` đã cảnh báo ở mục
> `vehicleMatch`.

## Tháng vận hành mẫu (T8/#90)

`data/demo-month.json` mô tả một tháng làm việc: 10 xe, 12 lái xe, 5 khách hàng, 3 cây xăng,
3 đối tác, 10 tuyến và 44 chuyến qua cả ba loại, kèm quỹ lái xe, phiếu dầu, đối chiếu bảng kê,
công nợ hai chiều, hoa hồng, bảo dưỡng, giấy tờ và một kỳ lương.

**Mọi ngày trong tệp là ĐỘ LỆCH so với ngày gieo, không phải ngày lịch.** Một bộ dữ liệu đóng cứng
ngày tháng chỉ dùng được một lần rồi hỏng dần: sang tháng sau mọi giấy tờ "sắp hết hạn" thành "đã
hết hạn", và bảng điều khiển hiện một mảng đỏ không ai giải thích được.

| Muốn gì | Chạy gì |
|---|---|
| Gieo (tự bỏ qua nếu DB đã có chuyến) | `node deploy/netviet/seed-transport-demo.mjs` |
| Xoá sạch rồi gieo lại | đặt `TRANSPORT_DEMO_RESET=xoa-va-gieo-lai` rồi gọi `resetTransportDemoData()` |
| Cho lái xe đăng nhập được | đặt `TRANSPORT_DEMO_DRIVER_PASSWORD` trước khi gieo |

Thiếu `TRANSPORT_DEMO_DRIVER_PASSWORD` thì **vẫn gieo** — chỉ không tạo tài khoản đăng nhập, và
script nói rõ điều đó ra log. Mật khẩu không bao giờ nằm trong kho mã nguồn.

Cả hai đường ghi đều gác bằng `readiness.demoTenant`, nên chúng **không chạy được** trên gói khách
thật; `apps/api/src/transport/demo/demo-guard.spec.ts` khoá cả hai chiều.

`templates/*.csv` là biểu mẫu nhập liệu ban đầu (xe, lái xe, khách hàng, đối tác, tuyến, bảng kê
cây xăng). Chúng lưu kèm BOM UTF-8 để Excel trên Windows hiện đúng tiếng Việt, và
`demo-templates.spec.ts` đẩy chính tệp bảng kê qua **bộ đọc thật** của sản phẩm — một biểu mẫu chưa
ai nhập thử là một biểu mẫu chưa chắc nhập được.

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
