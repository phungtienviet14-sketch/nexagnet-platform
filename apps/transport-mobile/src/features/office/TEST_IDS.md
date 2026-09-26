# testID van phong (giam doc + ke toan) — #394

ID on dinh cho Playwright (ban web) va kiem thu may ao. Doi mot ID o day la doi hop dong voi bai test —
sua ca hai cung luc. ID co `<...>` lap lai theo tung ban ghi; ID co `<kind>` co the lap lai khi hang
viec co nhieu muc cung loai (dung `.nth(i)`).

## Dung chung (to truot quyet dinh)

| testID | O dau | Nghia |
| --- | --- | --- |
| `decision-approve` | moi to truot quyet dinh | Chon/ghi DUYET (de nghi chi, phu cap, ket thuc don "Đã kết thúc", phan cong lai xe) |
| `decision-reject` | moi to truot quyet dinh | Chon TU CHOI |
| `decision-needs-correction` | to ket thuc don | Chon "Cần bổ sung" |
| `decision-confirm` | buoc 2 cua to truot | Gui quyet dinh (sau khi nhap ly do) |
| `decision-reason` | to de nghi chi | O ly do (1..60 ky tu) |
| `decision-amount` | de nghi chi / phu cap | O so duyet (dong) |
| `decision-retry-notice` | to truot | Chua gui duoc — bam lai la phat lai CUNG lenh |
| `decision-refused-notice` | to truot | May chu tu choi (ly do nguyen van) |
| `decision-notice` | dau man hinh | Ket qua: da xong / da duoc xu ly truoc do |
| `claim-detail` | to de nghi chi | Than chi tiet de nghi |
| `allowance-detail`, `allowance-<id>` | to phu cap cho | Chi tiet / mot khoan trong danh sach |
| `why-missing` | Hom nay, Can xu ly | Khoi gap "Vì sao thiếu mục" |
| `money-rows`, `money-<key>` | Hom nay, Tong quan | Sau o tien (khong o tong nao); `key` = `CUSTOMER_FREIGHT`… `driver-wage-remaining` |
| `margin-card`, `margin-disclosure` | Hom nay, Tong quan | Bien truc tiep + cau cong bo cua may chu |
| `money-unavailable` | Hom nay, Tong quan | So tien chua bat / khong co quyen |
| `location-health`, `device-proof-note` | to mot xe | Suc khoe vi tri bang chu + "Thiết bị thực tế chưa được chứng minh" |

## Viec tai xe nhan truc tiep (#398) — to truot dung chung giam doc + ke toan

| testID | O dau | Nghia |
| --- | --- | --- |
| `site-intake-review-sheet` | to viec tai xe nhan | Than to truot (Can xu ly, Can duyet, chi tiet don) |
| `site-intake-missing` | to viec tai xe nhan | "Thiếu: …" / "Đủ điều kiện — bấm Hoàn thiện để tạo đơn" |
| `site-intake-complete` | to viec tai xe nhan | "Hoàn thiện" (chi khi may chu noi du dieu kien) |
| `site-intake-set-destination`, `site-intake-place-filter`, `site-intake-place-<placeId>`, `site-intake-destination-send` | to viec tai xe nhan | Chon diem giao tu dia diem da biet (`GET /transport/site-intakes/destinations`, khong chon san) |
| `site-intake-place-note` | to viec tai xe nhan (chon diem giao) | Danh sach dia diem da biet tat / rong / khong khop — tro sang tim theo ten |
| `site-intake-review-search-query`, `site-intake-review-search-submit` | to viec tai xe nhan (chon diem giao) | Tim diem giao theo ten (#379) — `POST /transport/site-intakes/destinations/search`; chuoi 2..200 ky tu |
| `site-intake-review-search-result-<index>` | to viec tai xe nhan (chon diem giao) | Mot ket qua tim (`index` tu 0 theo thu tu may chu, da bo toa do hong); chon = `PLACE_SEARCH` NGUYEN VAN chuoi + nhan + toa do |
| `site-intake-review-search-notice`, `site-intake-review-search-attribution` | to viec tai xe nhan (chon diem giao) | Tim dang tat / ban / khong ra gi; dong nguon du lieu ban do |
| `site-intake-review-destination-picked` | to viec tai xe nhan (chon diem giao) | "Điểm giao đã chọn: …" hoac loi nhac chon |
| `site-intake-attest-origin` | to viec tai xe nhan | "Xác nhận nơi lấy hàng" |
| `site-intake-bind-open`, `site-intake-bind-<orderId>`, `site-intake-bind-submit` | to viec tai xe nhan | "Gắn vào đơn có sẵn" — nguoi chon, khong chon san |
| `site-intake-exception-open` | to viec tai xe nhan, chi tiet don | "Báo bất thường / Hủy" (chi khi co quyen `transport.site_intake.exception`) |
| `site-intake-exception-reason`, `site-intake-exception-submit` | to viec tai xe nhan | Ly do BAT BUOC (>= 3 ky tu); nut gui tat cho toi khi du |
| `site-intake-mode-back` | to viec tai xe nhan | Quay lai danh sach nut |
| `site-intake-outcome` | to viec tai xe nhan | Ket cuc THAT may chu tra ("Đã tạo đơn …", "Đã hủy đơn. Xe chưa chạy…") |
| `site-intake-exception-recorded` | to viec tai xe nhan | Lan bao bat thuong da ghi |

## Giam doc

| testID | Man | Nghia |
| --- | --- | --- |
| `director-today` | Hôm nay | Man hinh |
| `director-headline` | Hôm nay | Cau mo dau ghep tu so may chu ("3 việc cần quyết · 4/6 xe đang chạy") |
| `director-running-summary` | Hôm nay | "Vòng chạy đang chạy: N trên M xe." |
| `director-decide-first` | Hôm nay | Nut ho phach: mo viec dau hang |
| `director-open-inbox` | Hôm nay | "Cả N việc" -> Cần xử lý |
| `director-fleet-strip`, `director-fleet-<key>` | Hôm nay | Dai so doi xe; `key` = `fleet`, `on-trip`, `idle`, `maintenance`, `drivers` |
| `director-queue-item-<kind>` | Hôm nay, Cần xử lý | The mot viec; `kind` = ma may chu (vd `EXPENSE_CLAIM_AWAITING_REVIEW`) |
| `director-queue-note-SITE_INTAKE_NEEDS_REVIEW` | Hôm nay, Cần xử lý | "Thiếu: …" tren the viec tai xe nhan truc tiep |
| `director-driver-orders` | Hôm nay | Khoi TIN TUC "Đơn mới từ tài xế" (khong doi so viec can quyet) |
| `director-driver-order-<orderCode>`, `director-driver-order-<orderCode>-open` | Hôm nay | The mot don tu tao + "Xem đơn" |
| `director-driver-orders-error` | Hôm nay | Doc ban tin hong — mot dong nho, khong chan man |
| `director-inbox` | Cần xử lý | Man hinh |
| `director-closeout-<orderCode>` | Cần xử lý | Don cho ket thuc |
| `closeout-note` | to ket thuc don | Can cu khi khong chon chung tu so |
| `assign-driver-<driverId>` | to phan cong | Mot lai xe de chon |
| `director-readonly-detail`, `director-desktop-only` | to chi doc | Chi tiet + "Xử lý trên máy tính" |
| `director-fleet` | Đội xe | Man hinh |
| `director-fleet-phrase` | Đội xe | "4/6 xe đang chạy" |
| `director-vehicle-<vehicleId>` | Đội xe | The mot xe |
| `director-vehicle-detail` | to mot xe | Vi tri + hanh trinh |
| `director-orders` | Đơn hàng | Man hinh |
| `director-orders-search` | Đơn hàng | O tim |
| `director-orders-filter-<status>` | Đơn hàng | Chip loc; `status` = `ALL`/`OPEN`/`FULFILLED`/`CANCELLED` |
| `director-order-<code>` | Đơn hàng | The mot don |
| `director-order-detail` | Chi tiết đơn | Man hinh |
| `order-driver-source`, `order-driver-source-exception` | Chi tiết đơn | "Tạo từ xác nhận của tài xế" + bat thuong da ghi (404 = khong ve) |

## Ke toan

| testID | Man | Nghia |
| --- | --- | --- |
| `accounting-queue` | Cần duyệt | Man hinh |
| `accounting-queue-filter-<type>` | Cần duyệt | Chip loc; `type` = `ALL`/`CLAIM`/`FUEL`/`ALLOWANCE`/`INTAKE` |
| `accounting-card-<id>` | Cần duyệt | The mot muc (id cua de nghi / phieu / phu cap / viec tai xe nhan truc tiep) |
| `fuel-detail`, `fuel-evidence`, `fuel-verify-consequence` | to phieu dau | Chi tiet, anh chung tu, hau qua xac thuc |
| `decision-resubmit` | to phieu dau | "Cho nộp lại" (phieu bi tu choi) |
| `accounting-collections` | Thu tiền | Man hinh (chi doc) |
| `accounting-drivers` | Lái xe | Man hinh (chi doc) |
| `accounting-overview` | Tổng quan | Man hinh |
