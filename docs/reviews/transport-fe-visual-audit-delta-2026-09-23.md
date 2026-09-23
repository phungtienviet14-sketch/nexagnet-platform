# Làm mới có mục tiêu #370 — delta so với bản nền #372

> **Đây là một bản ĐO, không phải một task sửa giao diện.** Không một dòng mã sản phẩm nào được sửa.
> Không chụp lại 205 ảnh của bản nền: chỉ mở lại các màn mà #356 · #357 · #375 · #377 chạm tới, và
> chuỗi UAT đang là đường găng (cùng chuỗi với #378), rồi chấm lại từng phát hiện cũ.
>
> Issue: [#370](https://github.com/phungtienviet14-sketch/nexagnet-platform/issues/370) · Bản nền:
> [`transport-fe-visual-audit-2026-09-22.md`](transport-fe-visual-audit-2026-09-22.md) (PR #372,
> `e816fe82`) · Đo trên: `main` = **`0abd0150bce3dad58c9d436958c8f7631d37af81`** · Ngày đo: **23/09/2026**

---

## 1. Kết luận một đoạn

Bốn PR đã làm đúng việc của chúng: **Trang chủ lái xe Run-first** (#356), **menu tiền theo câu hỏi
nghiệp vụ** (#357), **nền OpenFreeMap** (#375) và **văn phòng tiến chặng + xác nhận giao xong** (#377)
đều chạy thật trên trình duyệt. Chuỗi Đơn → giao xe → lái xe → tiến chặng → Giao xong → Kết thúc đơn →
chốt đối soát → thu tiền → phân bổ **đi hết được bằng giao diện**.

Nhưng đi hết chuỗi bằng một đơn **Run-first thật** (bản nền chưa từng kết thúc một đơn) lộ ra ba chỗ
chặn nghiệp vụ mới: (1) lái xe **không ghi được dầu trả tiền mặt** trên vòng chạy dù API đã nhận;
(2) **Tổng hợp tài chính / Hiệu quả từng chuyến không có đơn Run-first** — doanh thu và biên đứng yên ở
44 chuyến cũ; (3) ở **Kết thúc đơn**, danh sách chứng từ nằm **sau lớp phủ** của hộp thoại nên kế toán
không chọn/mở được chứng từ. Và xác nhận một chỗ chặn cũ vẫn còn: lái xe **không ghi được chi phí dọc
đường** khi việc là vòng chạy (D-01 — #369 đã đóng phạm vi backend mà không mang đường này).

Một **hồi quy thứ bậc** do #377: "Xác nhận đã giao xong" là nút nhấn mạnh duy nhất của chi tiết đơn
ngay từ bước lập kế hoạch, khi đơn còn chưa có xe.

| Nhãn                                                    | Số mục |
| ------------------------------------------------------- | ------ |
| Mục cũ `FIXED`                                          | 3      |
| Mục cũ `INVALIDATED`                                    | 1      |
| Mục cũ `STILL_VALID`                                    | 32     |
| Mới `NEW_REGRESSION` (do #356/#357/#375/#377)           | 1      |
| Mới — web chưa theo hợp đồng BE vừa đổi (#371)          | 1      |
| Mới — có từ trước, bản nền không đo tới                 | 3      |
| **Issue đã mở** (chỉ P0/P1 chặn nghiệp vụ)              | **4**  |

---

## 2. Phương pháp

| Mục                | Giá trị                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SHA đo             | `0abd0150` (`main`, sau merge #375), worktree `claude/issue-370-audit-delta-e98655`                                                                                      |
| Chạy ở đâu         | **Cục bộ, toàn bộ**. Không đụng Railway (`nexagnet-transport-preview` là của #378), không seed/reset môi trường chung nào                                                   |
| Postgres           | `embedded-postgres` 16.14, cụm riêng, cổng `15470`                                                                                                                         |
| API                | `apps/api/dist/main.js` :4670 · `PERSISTENCE=prisma` · `AUTH_MODE=session` · `MEDIA_STORE=local` · `CHANNEL_MODE=mock`                                                     |
| Web                | **`next build` + `next start`** :3070 (bản production — không có chỉ báo dev của Next như bản nền), `TENANT_DIR=tenants/transport-preview`                                  |
| Dữ liệu            | Đường gieo chính thức `deploy/netviet/seed-transport-demo.mjs` (không SQL thô): 10 xe · 12 lái xe · 44 chuyến · 40 đơn · 35 phiếu dầu                                     |
| Vai                | `giam-doc` (ADMIN) · `ke-toan` (ACCOUNTING) · `lx.binh` (lái xe) — đăng nhập qua `/auth/login` + CSRF, không gõ mật khẩu vào ô nhập                                        |
| Khung nhìn         | 1440×900 · 1280×800 (Kết thúc đơn) · 390×844 `isMobile`                                                                                                                    |
| Vị trí lái xe      | **GIẢ LẬP** bằng `geolocation` của Playwright (Hải Phòng) — chỉ để mở khoá nút "(cần vị trí)" trên stack cục bộ. **Không phải bằng chứng hiện trường.**                  |
| Số ảnh             | ~40 ảnh thật (không commit) + **8 ảnh bằng chứng có khoanh vùng** trong `transport-fe-visual-audit-delta/assets/`                                                          |
| Đơn đo             | **`UAT370-915482`** · Kho Bắc Ninh → Cảng Hải Phòng · Công ty CP Thép Đông Á · 5.200.000 đ · xe 29H-152.44 → **`RUN-S260923-A9AD927B`** · hệ thống tự gán Nguyễn Văn Bình |

**Không kết luận từ JSX.** Mục nào chấm `STILL_VALID` mà không mở lại trên trình duyệt thì ghi rõ
"mã không đổi từ `e816fe82`" (đo bằng `git diff e816fe82 0abd0150`) — và chỉ dùng cho màn không thuộc
chuỗi UAT.

### Chuỗi UAT đi bằng giao diện

| #   | Bước                                          | Kết quả                                                                                                             |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 1   | Tạo đơn (ADMIN)                               | ✅ — form không xoá, không thông báo (F-13.1)                                                                        |
| 2   | Lập kế hoạch + giao xe                        | ✅ — không nói gán ai (P0-4)                                                                                         |
| 3   | Trang chủ lái xe                              | ✅ **Run-first** (#356)                                                                                              |
| 4   | Mốc Hiện trường (12 lần bấm, 3 chứng từ ảnh)  | ✅ — sau "Khách đã nhận hàng" không còn "Bắt đầu chờ" (#363)                                                         |
| 5   | Văn phòng tiến chặng ×4                       | ✅ (#377) — hệ thống giữ vòng chạy "Đang giữ: hết việc nhưng xe chưa về bãi"                                          |
| 6   | Giao xong đơn                                 | ✅ (#377) — nhưng xem N1                                                                                             |
| 7   | Kết thúc đơn (ACCOUNTING)                     | ⚠️ làm được sau khi **cuộn ngang** và **gõ tay căn cứ** — không chọn được chứng từ (N2)                              |
| 8   | Chốt đối soát → ghi nhận tiền → phân bổ       | ✅ cả ba bước                                                                                                        |
| 9   | Nhiên liệu `SUPPLIER_ACCOUNT` (lái xe)        | ✅ gửi được, văn phòng thấy "Vòng xe RUN-… · Chặng 2"                                                                 |
| 10  | Nhiên liệu `DRIVER_CASH` (lái xe)             | ❌ **khoá ở web**; cùng phiên, API nhận `201` (N3)                                                                    |
| 11  | Bản đồ vòng chạy                              | ✅ nền OpenFreeMap (#375) · ⚠️ vòng chạy Run-first chỉ vẽ 1 điểm (N5)                                                 |
| 12  | Hiệu quả từng chuyến / Tổng hợp tài chính     | ❌ **đơn không có mặt** — "Tính trên 44 chuyến" (N4)                                                                  |

---

## 3. Ma trận phát hiện cũ

Nhãn đúng bốn giá trị theo yêu cầu: `FIXED` · `INVALIDATED` · `STILL_VALID` (`NEW_REGRESSION` ở §4).
Cột **Bằng chứng**: `Dxx` = ảnh có khoanh vùng ở §6; `đo` = số đo DOM trên trình duyệt; `mã` = mã không
đổi từ `e816fe82`.

### 3.1. Các mục PENDING-PR của bản nền

| Mục bản nền                                      | Nhãn      | Bằng chứng                                                                                                                                                                       |
| ------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-06 / C-03 — Trang chủ lái xe (#356/#340)       | `FIXED`   | D01 — đọc `/me/field-work`, một nút "Mở Hiện trường", hết việc thì nút phụ                                                                                                          |
| IA nhóm tài chính (#357/#341)                    | `FIXED`   | menu ở mọi ảnh văn phòng: PHẢI THU · PHẢI TRẢ · QUỸ & LƯƠNG LÁI XE · TỔNG HỢP & HIỆU QUẢ; liên kết dòng tiền của Tổng hợp tài chính đã đúng chiều                                   |
| C-19 — Chờ ↔ `DELIVERY_ACCEPTED` (#363)          | `FIXED`   | đo: trước "Khách đã nhận hàng" có `Bắt đầu chờ`; ngay sau đó chỉ còn `Chụp biên nhận giao hàng` · `Tôi đang giữ biên nhận`                                                          |

### 3.2. P0 của bản nền

| ID   | Nội dung                                             | Nhãn          | Bằng chứng / số đo                                                                                                                              | Issue          |
| ---- | ---------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| P0-1 | Hàng việc không chủ thể/mức độ/hạn (F-01, D-02)      | `STILL_VALID` | D08 — 54 việc, mỗi dòng chỉ còn nhãn loại                                                                                                        | không mở (§5)  |
| P0-2 | Nút "Kết thúc" ngoài khung, 125 nút không thứ bậc (F-03) | `STILL_VALID` | D03 — nay **128 nút**, 0 nhấn mạnh, 42 "Từ chối"; bảng 1554px/1145px (1440) · 1554px/988px (1280); kể cả lọc "Chờ kết thúc" (1 dòng) vẫn 1427px/1145px | **#TBD-C**     |
| P0-3 | Lái xe không ghi chi phí khi việc là vòng chạy (D-01) | `STILL_VALID` | D02 — "Bạn chưa có chuyến nào đang mở…" trong khi Trang chủ "Chuyến đang mở 1"; `/me/expenses` → `recordSelfTripExpense` vẫn cần `tripId`        | **#TBD-D**     |
| P0-4 | Chốt kế hoạch không nói gán ai (F-13.3, C-10)        | `STILL_VALID` | D05 — "Đã giao đơn … cho xe 29H-152.44"; nút chốt vẫn bấm được sau khi chốt                                                                      | không mở (§5)  |
| P0-5 | Đơn hàng & vòng chạy không tìm/lọc (F-14)            | `STILL_VALID` | D05 — 41 đơn, không ô tìm/lọc; ngày ISO                                                                                                          | không mở (§5)  |

### 3.3. P1 của bản nền

| ID    | Nội dung                                          | Nhãn          | Bằng chứng / ghi chú                                                                                                                                         |
| ----- | ------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1-1  | Một định dạng ngày, một ký hiệu tiền, không enum (F-10) | `STILL_VALID` | Phần **enum trạng thái ở Đơn hàng đã FIXED** (#377: "Đang mở"/"Đã giao xong"). Còn: ngày ISO ở Đơn hàng + Kết thúc đơn; `đ`/`₫`/`VND` cùng tồn tại (Phải thu: 45×`₫` + 9×`VND`; Đơn hàng: `đ`; Trang chủ lái xe: `₫`); loại chứng từ enum thô `GATE_PASS`… ở Kết thúc đơn |
| P1-2  | Thẻ vòng chạy thiếu biển số/lái xe/đơn (F-02)      | `STILL_VALID` | D08 — "RUN-… · 1 có hàng · 1 rỗng · — · rỗng —". Câu mâu thuẫn đầu bảng của bản nền đã hết                                                                     |
| P1-3  | Nhận việc trỏ sang "Chuyến"                        | `STILL_VALID` | đo: vẫn "mở màn “Chuyến”" và màn Chuyến "Bạn không có chuyến nào đang mở". Đã bớt đau: Trang chủ nói "không cần vào Nhận việc để nhận lại" (#356)                    |
| P1-4  | 9 tab lái xe, tab "Chuyến" ngang hàng (F-08)       | `STILL_VALID` | đo: 9 tab × 43×53px                                                                                                                                          |
| P1-5  | Màn mở ra là ô chọn rỗng (F-11)                    | `STILL_VALID` | đo: Hiệu quả từng chuyến = ô chọn 45 mục; Bản đồ vòng chạy = chọn trước (nay giữ `?selected=`); Quỹ lái xe = một lái xe một lần                                  |
| P1-6  | Không chọn được kỳ báo cáo (D-04)                  | `STILL_VALID` | đo: Tổng hợp tài chính / Hiệu quả từng chuyến / Tổng hợp giám đốc không có điều khiển kỳ                                                                       |
| P1-7  | Chọn xe không hỗ trợ quyết định (D-06)             | `STILL_VALID` | D04 — ô chọn biển số trần                                                                                                                                    |
| P1-8  | "Điều xe" còn trong ĐIỀU HÀNH (F-04)               | `STILL_VALID` | menu mọi ảnh văn phòng                                                                                                                                       |
| P1-9  | Tổng hợp giám đốc thứ bậc ngược (F-05)             | `STILL_VALID` | đo: biên vẫn là dòng chữ nhỏ nhất; hàng việc vẫn căn phải. "0 km" nay thành "—" + "2 chặng chưa nhập km" (gốc C-11 vẫn còn)                                          |
| P1-10 | Dòng tổng cho bảng nhiên liệu (F-12, C-15)          | `STILL_VALID` | đo: 37 dòng, không `<tfoot>`, bảng 1365px trong khung 1145px                                                                                                  |
| P1-11 | Lựa chọn dòng vào URL (F-13.4)                     | `STILL_VALID` | đo: chọn đơn, URL vẫn `/?section=movement`                                                                                                                   |
| P1-12 | Đường vào chuỗi chứng từ (D-05)                    | `STILL_VALID` | mã: `useDocumentChain` có nhưng không màn nào gọi                                                                                                             |
| P1-13 | Nhiên liệu lái xe: nút khoá không nói lý do (F-09) | `STILL_VALID` | D02 — "Gửi phiếu" khoá, không `title`/`aria-describedby`. Gộp vào **#TBD-A** vì cùng form                                                                          |
| P1-14 | Tách bề mặt ADMIN ≠ ACCOUNTING (C-20)              | `STILL_VALID` | đo: 23 mục = 23 mục, không khác một mục nào                                                                                                                   |
| P1-15 | Hành động công nợ bám dòng (C-14)                  | `STILL_VALID` | đo: khối việc ở y=2079 trên trang 2523px, 25 ô, chỉ ô mặc định (tiền tệ/ngày) điền sẵn, 3 nút nhấn mạnh. Chuỗi vẫn đi được                                        |

### 3.4. Phát hiện/ma trận khác của bản nền

| Mục                                  | Nhãn          | Ghi chú                                                                                                                                                          |
| ------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-07 — cột "Vòng chạy (tham khảo)" luôn `—` | `INVALIDATED` | Chỉ `—` với đơn gieo sẵn (không có vòng chạy). Đơn Run-first thật hiện đúng `RUN-S260923-A9AD927B` (D03) — cột mang tin với luồng Order-first                     |
| C-11 — km toàn đội                   | `STILL_VALID` | Tổng hợp giám đốc "—" (không còn "0 km") nhưng 44 chuyến cũ vẫn không được cộng; đơn Run-first không có km (chữ, không toạ độ — #379)                               |
| F-13.1 — form tạo đơn không xoá       | `STILL_VALID` | D05                                                                                                                                                              |
| F-13.2 — bản kế hoạch không km/chi phí/lái xe | `STILL_VALID` | D04 — "chưa nhập" ×2; km phụ thuộc toạ độ đơn (**#379**)                                                                                                         |
| F-13.5 / P2-7 — "Vòng chạy của xe"    | `STILL_VALID` | tiêu đề vẫn to hơn khối đơn                                                                                                                                       |
| D-03 — danh tính đối tượng mỏng       | `STILL_VALID` | Phần phiếu dầu đã tốt hơn ("Vòng xe RUN-… · Chặng 2"); thẻ vòng chạy + chi tiết đơn (hàng hoá không hiện lại) vẫn như cũ                                             |
| P2-1 EmptyState · P2-3 Bảo dưỡng · P2-6 văn bản dài | `STILL_VALID` | mã; P2 — bỏ qua theo yêu cầu                                                                                                                                     |
| P2-2 hành động phủ định               | `STILL_VALID` | đo: 42 "Từ chối" cùng trọng số; P2                                                                                                                                |
| P2-4 cột rỗng · `vòng xe` ≠ `vòng chạy` | `STILL_VALID` | phần "cột rỗng" xem C-07; "Vòng xe" (Nhiên liệu) và "Mã chuyến" cho mã vòng chạy (Trang chủ lái xe) vẫn lẫn; P2                                                      |
| P2-5 danh mục vừa 900px               | `STILL_VALID` | vẫn cuộn (6 nhãn nhóm); P2                                                                                                                                        |
| P2-8 / F-15 — ETC rơi về Tổng quan    | `STILL_VALID` | đo: `?section=toll` → h1 "Tổng quan"; P2                                                                                                                          |

---

## 4. Phát hiện MỚI

| ID  | Nhãn                                  | Nguồn gốc                                           | Mức    | Nội dung                                                                                                                                                                                                                                                                                                                          | Issue         |
| --- | ------------------------------------- | --------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| N1  | `NEW_REGRESSION`                      | **#377**                                            | P1     | D04 — "Xác nhận đã giao xong" là nút nhấn mạnh **duy nhất** của chi tiết đơn từ lúc chọn đơn, kể cả khi đơn **chưa có xe**; hộp xác nhận ghi "Không hoàn tác được". Harness đã bấm đúng nút đó khi hai chặng còn "Dự kiến" → đơn thành "Đã giao xong" và vào "Kết thúc đơn". Cho phép là cố ý (đơn thuê xe ngoài); **thứ bậc** mới là hồi quy | không mở (§5) |
| N2  | Mới — có từ trước, bản nền không đo tới | `OrderCompletionView` + `ConfirmAction` (không đổi từ `e816fe82`) | **P0** | D03 — khối "Chứng từ số của đơn" chỉ render khi hộp thoại mở, nhưng render **ngoài** hộp thoại: `.tx-confirm` phủ toàn màn (`position:fixed; inset:0; z-index:50`), `elementFromPoint` tại ô chọn = `DIV.tx-confirm`. Kế toán không chọn được, không mở được tệp chứng từ; căn cứ luôn là `EXTERNAL_PHYSICAL_CONFIRMATION` + gõ tay | **#TBD-C**    |
| N3  | Mới — web chậm hợp đồng BE mới        | #369 R-4 (commit `609236f4`, merge qua #371)         | **P0** | D02 — option "Lái xe trả tiền mặt **(chỉ chuyến cũ)**" `disabled` khi việc là vòng chạy (`workspace/fuel-declaration.ts:196` `allowsDriverCash = kind === 'LEGACY_TRIP'`). Cùng phiên lái xe, `POST /transport/me/fuel/slips {runId, legId, paymentMethod: DRIVER_CASH}` → **201**. Bước "Fuel DRIVER_CASH" của chuỗi UAT không làm được bằng UI | **#TBD-A**    |
| N4  | Mới — có từ trước, bản nền không đo tới | `finance-facts.port.ts` `directMargin()` = rollup theo `trips.list()`; `MarginView` chọn theo chuyến | **P0** | D06 — sau khi `UAT370-915482` đã Giao xong → Đã kết thúc → chốt đối soát → thu tiền → phân bổ, **Tổng hợp tài chính** và **Hiệu quả từng chuyến** vẫn "Tính trên 44 chuyến", biên 219.386.201 đ (78,55%) trùng từng đồng với bản nền. `GET /transport/analytics/runs/:runId/margin` có sẵn nhưng không màn nào gọi | **#TBD-B**    |
| N5  | Mới — có từ trước, bản nền không đo tới | `journey-read.service.ts` đọc GPS thô qua `TransportTripRunLegLink`; đơn chỉ có chữ | P1     | D07 — vòng chạy Run-first đã xong 2/2 chặng chỉ vẽ **một điểm**; vệt GPS "Chặng không nối với chuyến nào…"; km "—". Phần điểm lấy/giao thuộc **#379**                                                                                                                                                                                      | không mở (§5) |

---

## 5. Issue đã mở và lý do KHÔNG mở

Chỉ mở cho P0/P1 **thực sự chặn nghiệp vụ** còn tồn tại:

| Issue      | Mục                | Vì sao chặn nghiệp vụ                                                                                                                  |
| ---------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| **#TBD-A** | N3 (+P1-13)        | Lái xe trả tiền mặt đổ dầu trên việc được điều không ghi được — tiền rời sổ quỹ; bước DRIVER_CASH của chuỗi UAT không làm được bằng UI      |
| **#TBD-B** | N4                 | Doanh thu/biên của MỌI đơn tạo theo đường chính thức không vào báo cáo — màn hình nói sai sự thật về tiền                                    |
| **#TBD-C** | P0-2 + N2          | Bước kiểm soát thương mại (kết thúc đơn theo chứng từ) không dùng được chứng từ; hành động chính không thấy                                    |
| **#TBD-D** | P0-3 / D-01        | Lái xe không ghi được phí cầu đường/bốc xếp/bến bãi của việc được điều; #369 đã đóng phạm vi backend mà không mang đường này                    |

**Không mở** (vẫn `STILL_VALID`, giữ trong backlog #372, không chặn một bước nghiệp vụ nào — chuỗi UAT vẫn đi qua):

- **P0-1** hàng việc không chủ thể — cản triage, nhưng chi tiết có ở "Bảo dưỡng & giấy tờ".
- **P0-4 · P0-5 · N1 · P1-11 · F-13.1** — cùng một màn `MovementView`; phần tạo đơn sắp được **#379**
  làm lại (map-first). Đề nghị gom thành **một** issue giao diện Đơn hàng **sau khi #379 hạ cánh** để
  không đụng tệp hai lần.
- **N5** — nửa là #379 (toạ độ đơn), nửa là đọc GPS theo vòng chạy; đo lại sau #379.
- Mọi P1 còn lại và mọi P2.

Tồn đọng đã biết, **không đo lại** ở đây (ngoài phạm vi UI): vòng chạy "đang giữ" giữ phiên bám vị trí
của lái xe (`409 DRIVER_HAS_ANOTHER_OPEN_SESSION` cho đơn kế tiếp cùng lái xe) và nằm ở cột "Trên đường"
của Bảng điều hành — xem comment kết của #376.

---

## 6. Ảnh bằng chứng

| Ảnh | Nội dung |
| --- | -------- |
| [D01](transport-fe-visual-audit-delta/assets/D01-trang-chu-lai-xe-run-first-truoc-sau.png) | FIXED — Trang chủ lái xe trước/sau |
| [D02](transport-fe-visual-audit-delta/assets/D02-tien-lai-xe-tren-vong-chay-bi-khoa.png) | N3 + D-01 — tiền của lái xe trên việc Run-first |
| [D03](transport-fe-visual-audit-delta/assets/D03-ket-thuc-don-nut-ngoai-khung-chung-tu-sau-lop-phu.png) | P0-2 + N2 — Kết thúc đơn |
| [D04](transport-fe-visual-audit-delta/assets/D04-giao-xong-don-la-nut-dam-tu-luc-chua-co-xe.png) | N1 — hồi quy thứ bậc của #377 |
| [D05](transport-fe-visual-audit-delta/assets/D05-don-hang-giao-xe-khong-noi-gan-ai-khong-loc.png) | P0-4 · P0-5 · F-13.1 · F-10 |
| [D06](transport-fe-visual-audit-delta/assets/D06-tai-chinh-va-hieu-qua-bo-sot-don-run-first.png) | N4 — tài chính/hiệu quả bỏ sót đơn Run-first |
| [D07](transport-fe-visual-audit-delta/assets/D07-ban-do-vong-chay-openfreemap-run-first.png) | #375 FIXED + N5 |
| [D08](transport-fe-visual-audit-delta/assets/D08-hang-viec-va-the-vong-chay.png) | P0-1 · P1-2 |

### Hai giới hạn của phép đo

- **Ô nhập ngày và ô chọn tệp gốc của trình duyệt** (`09/23/2026 05:10 PM`, `Choose File`) theo **ngôn
  ngữ giao diện của Chromium headless**, không theo trang. Không tính vào F-10 ở bản này; cần đo lại
  trên Chrome tiếng Việt thật trước khi kết luận.
- **Ảnh chứng từ của 35 phiếu dầu gieo sẵn** không có tệp trong kho `MEDIA_STORE=local` của stack cục
  bộ, nên hiện như liên kết gãy — là giới hạn của môi trường đo, **không** ghi thành phát hiện.

Quan sát bên lề: **Tổng quan** nay đếm theo Đơn/Vòng chạy ("Đơn đang mở", "Vòng chạy đang chạy 1") —
có vẻ yêu cầu của #348 đã được đáp ứng trên `0abd0150`; nên kiểm và đóng riêng.

---

## Phụ lục — tái lập

```bash
# Postgres riêng (cổng chưa ai dùng), migrate, gieo — cùng công thức với bản nền
pg_ctl -D <dir>/data -o "-p 15470" -l <dir>/pg.log -w start
export PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
pnpm --filter @netviet/api exec prisma migrate deploy
pnpm --filter @netviet/api build
TENANT_DIR=$PWD/tenants/transport-preview TRANSPORT_DEMO_DRIVER_PASSWORD=<ngẫu nhiên> \
  node deploy/netviet/seed-transport-demo.mjs

# API — KHÔNG đặt NODE_ENV=production trên http://localhost: cookie CSRF thành `secure`, đăng nhập 403
PORT=4670 PERSISTENCE=prisma AUTH_MODE=session SESSION_SECRET=<≥32> CORS_ORIGIN=http://localhost:3070 \
  CHANNEL_MODE=mock MEDIA_STORE=local TENANT_DIR=... node apps/api/dist/main.js

# Web bản production
cd apps/web && TENANT_DIR=... NEXT_PUBLIC_API_URL=http://localhost:4670 node node_modules/next/dist/bin/next build
TENANT_DIR=... NEXT_PUBLIC_API_URL=http://localhost:4670 node node_modules/next/dist/bin/next start -p 3070
```

Harness Playwright (không commit): đăng nhập 3 vai qua API → tạo đơn → giao xe → 12 mốc hiện trường →
4 lần tiến chặng → giao xong → kết thúc đơn → chốt đối soát/thu tiền/phân bổ → phiếu dầu → báo cáo/bản đồ.
