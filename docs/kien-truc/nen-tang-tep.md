# Nền tảng Tệp (File Platform)

> Nguồn hợp đồng: [#287](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/287) ·
> Hợp đồng nguồn của tầng nền: [#223](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/223) ·
> Bên tiêu thụ đầu tiên: [#279](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/279) (chứng từ vận hành)

Tệp là **hạ tầng nền** (`foundation`), không phải một capability bật/tắt: mọi khách đều có tệp.
Cái khác nhau giữa các khách là **miền nào gắn tệp vào cái gì** — và điều đó do sổ đăng ký quyền
quyết định, tức do các module miền thực sự được nạp, không do một cờ trong `tenant.json`.

## Hình dạng

```text
Miền nghiệp vụ (Vận tải / B2B / …)
        ↓  quyền gắn của chính miền đó
Nexagnet File Service        apps/api/src/files/
  mã tệp ĐỤC · vòng đời · ACL · kiểm toán · lưu trữ · cách ly · dọn byte
        ↓
FileBlobStore  (bọc MediaStore đã có — KHÔNG phải một kho thứ hai)
  ├─ none    (mặc định demo/CI)
  ├─ local
  ├─ S3-compatible
  └─ GCS
```

**GCS không phải mặc định kiến trúc** — nó là _một_ nhà cung cấp. Đổi kho vẫn là đổi `MEDIA_STORE`,
và không một dòng nghiệp vụ nào rẽ nhánh theo tên nhà cung cấp (`file-public-surface.spec.ts` khoá
điều đó bằng một phép quét mã nguồn).

## Ba bất biến trung tâm

### 1. Mã tệp là một mã ĐỤC, và định vị kho là chi tiết riêng tư

`PlatformFile.storageKey` không có mặt trong bất kỳ DTO công khai nào, không tuyến HTTP nào nhận nó
từ thân yêu cầu, và không dòng log/lỗi nào mang nó ra ngoài. Lý do không phải là gu thẩm mỹ: một
định vị thô lọt ra ngoài là một **đường đi vòng qua vòng đời** — ai cầm được nó thì đọc được byte
mãi mãi, kể cả sau khi tệp đã bị rút, bị cách ly, hay hết hạn lưu trữ.

Hệ quả: **không có URL công khai vĩnh viễn nào được sinh ra.** Đường duy nhất byte ra ngoài là
`GET /files/:fileId/content` — một tuyến có xác thực, đi qua cổng quyền.

### 2. `biết mã tệp ≠ được phép đọc tệp`

Mã tệp **không phải** một quyền. Mọi đường đọc/rút đi qua `FileAuthorizationService`, và cổng đó
hỏi lại chính **miền sở hữu đối tượng nghiệp vụ** mà tệp đang gắn vào:

| Trạng thái của tệp          | Ai quyết                       |
| --------------------------- | ------------------------------ |
| chưa từng gắn vào đâu       | chỉ người tạo                  |
| đã gắn (kể cả đã rút)       | **miền**, không phải người tạo |
| tên sở hữu không ai đăng ký | **từ chối** (fail closed)      |

Một mã không tồn tại và một mã có thật nhưng không phải của người gọi trả **cùng một mã lỗi và cùng
một mã HTTP** — nếu khác nhau, thử lần lượt các mã là đếm được bao nhiêu tệp có thật trên hệ thống.

Đọc cần **một** miền đồng ý; rút cần **tất cả** đồng ý, và một tiếng `LOCKED` thắng tất cả.

### 3. Rút là bịa mờ, dọn byte là một bước RIÊNG

```text
STAGED → ACTIVE → WITHDRAWN / QUARANTINED → PURGED
```

Rút ghi tombstone và gỡ **mọi** liên kết trong **một** giao dịch; byte vẫn còn. Dọn byte chạy sau,
**idempotent**, và một lần dọn hỏng **không** kéo trạng thái logic về — nếu không, một kho tạm thời
không với tới được sẽ làm cả lô tệp "sống lại".

Ba cổng chặn trước khi một byte bị dọn, và cả ba được lặp lại ở tầng CSDL bằng trigger
`platform_file_purge_guard`: tệp còn hiệu lực · chưa tới hạn lưu trữ · đang giữ theo lệnh pháp lý.

## Dùng nó từ một miền mới

1. Khai một lớp `FileDomainAuthorizer` với `businessOwnerType` của chính miền, trả lời cho ba hành
   động `READ` / `ATTACH` / `WITHDRAW`.
2. Đăng ký nó vào `FileDomainAuthorizerRegistry` trong module của miền (xem
   `transport-document.module.ts` làm mẫu).
3. Lưu **`fileId`** trong bảng của miền — không bao giờ một định vị kho.
4. Gọi `FileService.link()` sau khi hàng nghiệp vụ đã tồn tại.

Chiều phụ thuộc chỉ đi **một hướng**: miền biết nền tảng, nền tảng không biết tên miền nào.

## Trạng thái còn lại

- **Chưa có backfill.** `TransportFuelReceiptEvidence.locator` vẫn là đường đọc của bằng chứng
  nhiên liệu cũ (`#225`), và nó **không bị đụng tới**. Nền tảng tệp là đường của dữ liệu mới; lớp
  tương thích là việc cả ba khu cùng nằm dưới `media/` trong **một** kho.
- **Máy quét đang tắt** (`DisabledFileScanner`). Cổng và trạng thái `QUARANTINED` có thật; cắm một
  máy quét vào là đổi **một** dòng provider.
- **Chưa có primitive web dùng chung** (`#287` P9) — đó là một tranche riêng.
