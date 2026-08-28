# PLATFORM ROADMAP v2

> **Vai trò tài liệu:** kế hoạch **nền tảng**. Đây **không** phải danh sách việc của Ultty — backlog
> nghiệp vụ Ultty nằm ở [`gd1-ultty.md`](gd1-ultty.md) và tài liệu khách. Ultty chỉ xuất hiện ở đây
> khi nó đóng vai **runtime proof / tenant tham chiếu / stack tham chiếu / tenant regression**.
>
> **Trạng thái ✅/⬜ vẫn chỉ nằm ở [`tong-quan.md`](tong-quan.md).** Tài liệu này giữ **cổng vào/ra**
> và **thứ tự phụ thuộc**, không giữ tiến độ.
>
> **Cập nhật:** 27/08/2026 · **Đối chiếu mã nguồn tại:** `8b0f6ad603495fc90235d350b13550afd36a982d`

---

## 0. Cách đọc

Mỗi phase có đúng 6 phần: **WHY · ENTRY GATE · DELIVERABLES · RUNTIME PROOF · EXIT GATE · DO NOT DO**.

Phần **DO NOT DO** tồn tại để một coding agent (hoặc một người đang có đà) không tự mở rộng phạm vi.

**Không gắn ngày tháng tuỳ tiện.** Thứ tự đi theo **phụ thuộc** và **trigger**, không theo lịch.

Từ vựng trạng thái: `CLOSED` · `RUNTIME-PROVEN` · `DEPLOYED-NOT-PROVEN` · `CODE-ONLY` · `POC` ·
`PARTIAL` · `NOT-DEPLOYED` · `PLANNED` · `HISTORICAL`.

---

## 1. Nguyên tắc sản phẩm

Nexagnet là **nền tảng AI đa khách hàng**. Ultty là **tenant/stack tham chiếu**, không phải lõi sản
phẩm. Ưu tiên hiện tại: **hoàn thiện nền tảng trước hoàn thiện toàn bộ nghiệp vụ Ultty** — nhưng
**không bỏ** nghiệp vụ Ultty đã có, và **không mở tính năng mới** chỉ để hoàn thành hợp đồng trong
phạm vi các phase này.

---

## P0 — RELEASE IDENTITY CLOSURE · **CLOSED / RUNTIME-PROVEN**

**WHY** — Không biết chắc mã nào đang chạy thì mọi chẩn đoán đều là phỏng đoán, và mọi permalink
"mở mã nguồn" đều có thể trỏ vào một đoạn mã khác với đoạn vừa chạy.

**RUNTIME PROOF (đã thu)** — deploy run `33039065904`, main `8b0f6ad603495fc90235d350b13550afd36a982d`:
EXPECTED = MANIFEST = ENV; `identitySource: "manifest"`; manifest là **file bind readonly** (`EROFS`);
sống qua restart; permalink dùng **đúng 40 ký tự** của chính release đó.

**EXIT GATE** — đã đạt. Chi tiết ở
[reference-platform-stack §6.2](../../kien-truc/reference-platform-stack.md#62-bằng-chứng-cho-hai-dòng-closed).

---

## P1 — DOCUMENTATION TRUTH RESET · *(phase hiện tại)*

**WHY** — Tài liệu đã tụt sau mã nguồn. `tong-quan.md` dừng ở 22/08 trong khi PR #37→#58 (24–27/08)
đã đổi kiến trúc: nền OTel, tách `turn-processing`, workflow nghiệp vụ đầu tiên trên Hatchet, Debug
View, tương quan mã nguồn, tách bốn tín hiệu deploy, đóng danh tính release. Một roadmap dựng trên
tài liệu sai sẽ sai theo.

**ENTRY GATE** — P0 CLOSED.

**DELIVERABLES** — `tech-radar.md` · `reference-platform-stack.md` · `agentic-ops.md` ·
`platform-roadmap-v2.md` (tài liệu này) · cập nhật `tong-quan.md`, `docs/README.md`,
`nen-tang-da-khach.md`, `he-thong.md`, `debugging.md`, `AGENTS.md`/`CLAUDE.md` · gắn banner
HISTORICAL cho các ảnh chụp cũ.

**RUNTIME PROOF** — không có. Đây là phase tài liệu; bằng chứng của nó là **CI xanh** và việc mọi
khẳng định trạng thái đều truy được về một quan sát cụ thể.

**EXIT GATE** — PR docs CI xanh; bảng CANONICAL CURRENT TRUTH tồn tại và được các tài liệu khác viện
dẫn thay vì mâu thuẫn.

**DO NOT DO** — không sửa mã ứng dụng/deploy · không bắt đầu ClickStack · không bắt đầu Fleet View ·
không sửa `zca_listener` · không sửa `gd1-test-preflight.mjs` · không sửa test flaky · không tạo 20
file tài liệu mới.

---

## P2 — REFERENCE STACK PARITY v0 · **MILESTONE TRIỂN KHAI KẾ TIẾP**

> Đây là milestone code kế tiếp. **Không phải Fleet View.**

**WHY** — Người dùng đã quan sát một giới hạn thật: **API khởi động lại → Debug View mất các lượt
cũ**. Toàn bộ giá trị của observability, source correlation và mọi thứ Agentic Ops ở P12+ đứng trên
giả định "bằng chứng còn đó khi cần". Hôm nay giả định đó **sai**: `RecentTracesSink` giữ trace
trong một `Map` trong tiến trình.

Đồng thời hai công nghệ đang mang nhãn ADOPT nhưng chưa đạt parity: **OTel chưa từng bật trên
gd1-test**, **ClickStack chưa rời POC**.

**ENTRY GATE** — P1 xong (có bảng truth để biết mình đang sửa khoảng trống nào).

**DELIVERABLES**
- bật preload OTel trong compose triển khai (API **và** workflow worker);
- đường xuất OTLP;
- ClickStack có **lưu trữ bền**, kèm xác thực;
- **cách ly theo tenant** theo mô hình đã chọn ở
  [reference-platform-stack §8](../../kien-truc/reference-platform-stack.md#8-mô-hình-triển-khai-clickstack--đã-chọn);
- retention + backup/recovery cho kho trace **và** cho `hatchet-postgres`;
- health check + có mặt trong deploy signal;
- **danh tính release của trace bền phải là danh tính release canonical** — preload OTel phân giải
  release bằng đúng luật `manifest → env → conflict` của telemetry nội bộ, không đọc riêng
  `RELEASE_GIT_SHA`; lệch hai nguồn thì **fail-safe** (`unknown`), không im lặng chọn một SHA;
- Debug View có đường lùi về lịch sử khi vòng đệm trong tiến trình không còn;
- **đóng 3 known risk `UNRESOLVED`**: `zca_listener` im lặng · preflight ghi đè `autoSend` · test
  `bot-poller` flaky.

**RUNTIME PROOF** — bốn khẳng định, đo trên stack thật:

```
1. tạo trace X            → Debug View thấy X
2. khởi động lại API      → Debug View VẪN thấy X
3. deploy một release mới → Debug View VẪN thấy X
4. mở một trace cũ        → giữ đúng release SHA cũ → permalink cũ vẫn đúng
```

**EXIT GATE** — bốn khẳng định trên đạt; OTel và ClickStack đạt **L5**; ba known risk chuyển khỏi
`UNRESOLVED`; `ultty-gd1-test` được ghi là **PARITY-CLOSED**.

**TIẾN ĐỘ (28/08/2026, sau deploy run `33172218761`, release `98013f8`)** — trạng thái viết theo
bộ từ vựng ở
[reference-platform-stack §5](../../kien-truc/reference-platform-stack.md#5-bộ-từ-vựng-trạng-thái-bắt-buộc),
không theo phần trăm:

| Hạng mục của cổng ra | Trạng thái |
|---|---|
| preload OTel trong compose (api + 2 worker) | **RUNTIME-PROVEN** |
| đường xuất OTLP | **RUNTIME-PROVEN** |
| ClickStack lưu trữ bền + xác thực | **RUNTIME-PROVEN** |
| cách ly theo tenant | **RUNTIME-PROVEN** ở mức ghi (listener + credential, fail-closed) |
| retention + backup/recovery kho trace | **RUNTIME-PROVEN** — 36993 span phục hồi, tra cứu được theo `TraceId` |
| retention + backup/recovery `hatchet-postgres` | **RUNTIME-PROVEN** — `Restore check thanh cong (hatchet)` |
| health check + có mặt trong deploy signal | **RUNTIME-PROVEN** — 6/6 tín hiệu `pass` |
| danh tính release của trace bền = canonical | **RUNTIME-PROVEN** |
| Debug View có đường lùi lịch sử | **RUNTIME-PROVEN** (§8.13) |
| known risk `bot-poller` flaky | **RESOLVED** |
| known risk preflight `autoSend` | **RESOLVED** — preflight thật chạy qua |
| known risk `zca_listener` | **`FIXED` — chờ chứng minh** ⬅ **mục duy nhất còn vướng** |
| PROOF 1 (tạo trace → Debug View thấy) | **RUNTIME-PROVEN** — `origin=buffer` |
| PROOF 2 (restart → vẫn thấy) | **RUNTIME-PROVEN** — vòng đệm rỗng + `origin=historical` |
| PROOF 3 (deploy release mới → vẫn thấy) | **RUNTIME-PROVEN** — `origin=historical` |
| PROOF 4 (trace cũ giữ release cũ + permalink cũ) | **RUNTIME-PROVEN** — `1ad92be…` ≠ release đang chạy |

**Khoảng cách còn lại là MỘT việc, và nó không phải việc viết mã:** §7.1 đòi *"một tin
`zca_listener` mới đi hết đường"* — cần **một người nhắn một tin trong nhóm Zalo thật**. Kèm theo:
đường tự nối lại chưa từng chạy trong đời thật (mọi lần socket đóng quan sát được đều xảy ra lúc
tiến trình đang tắt, nên cổng `destroyed` chặn — đúng thiết kế).

Vì thế **P2 chưa CLOSED**, và `ultty-gd1-test` **chưa** được ghi là PARITY-CLOSED.

**DO NOT DO** — không thêm tính năng nghiệp vụ Ultty · không bắt đầu Fleet View · không dựng hệ
durability thứ hai · không cài công nghệ ở vòng ASSESS/HOLD.

---

## P3 — GITHUB GOVERNANCE — ✅ **CLOSED** (28/08/2026)

**WHY** — Đo ngày 27/08: **0 ruleset**, `branches/main/protection` trả **404**, repo **public**. Không
bắt buộc PR, không bắt buộc CI xanh, không chặn force-push. Kỷ luật release khi đó dựa vào thói quen
người vận hành. Đây là **HIGH PRIORITY** và là điều kiện cứng của P12+.

**ENTRY GATE** — không có; có thể chạy song song P2.

**DELIVERABLES** — ✅ dùng **GitHub Rulesets gốc**, không viết cơ chế riêng. Ruleset
`main-protection` (id `21740233`, `enforcement: active`, `bypass_actors: []`): bắt buộc PR · **7**
status check bắt buộc (`verify` `integration` `workflow-integration` `tenant-packs` `e2e` `audit`
`images`, `strict`) · chặn force-push · chặn xoá nhánh · buộc giải quyết review thread. Cổng
environment: `production` giữ người duyệt và **bỏ quyền admin bỏ qua**; `gd1-test` **giới hạn về
`main` ở tầng GitHub** (trước đó chỉ chặn bằng mã shell trong workflow).

**RUNTIME PROOF** — ✅ push thẳng vào `main` → `422 "Changes must be made through a pull request."`;
force-push → `422 "Cannot force-push to this branch"`; PR thiếu CI → merge trả `405`. Cả ba đều chạy
bằng **token admin của chủ repo**, và `main` không hề thay đổi.

**EXIT GATE** — ✅ đạt.

**CÒN LẠI — `UNRESOLVED`, mức TRUNG BÌNH:** repo **một collaborator** nên **không cưỡng chế được
review bởi người thứ hai** (GitHub cấm tự duyệt PR của mình ⇒ `required_approving_review_count: 1`
sẽ khoá cứng mọi PR). Chủ repo vẫn sửa/xoá được chính ruleset; chỉ còn lại dấu vết audit. Gỡ bằng
cách thêm collaborator thứ hai, hoặc chuyển repo về một Organization.

**DO NOT DO** — **không tự code cơ chế governance cho git.** Dùng tính năng gốc của GitHub.

📄 [docs/phat-trien/van-hanh/github-governance.md](../van-hanh/github-governance.md)

---

## P4 — FLEET / PORTAINER

**WHY** — Cần nhìn và điều khiển nhiều môi trường mà không SSH từng máy.

**ENTRY GATE** — P2 xong (nếu không, Fleet View sẽ hiển thị một trạng thái không tin được).

**DELIVERABLES** — POC Portainer trước; sau đó Fleet View của Nexagnet **chỉ** sở hữu: tenant ·
environment · release · deploy signal · capability · Hatchet · observability · AI provider · kill
switch · trôi dạt cấu hình · độ sẵn sàng nghiệp vụ — và **deep-link** sang Portainer cho thao tác
mức container.

**RUNTIME PROOF** — điều khiển được stack gd1-test qua Portainer; Fleet View đọc đúng trạng thái thật.

**EXIT GATE** — hai điều trên đạt, và không chồng lấn chức năng với Portainer.

**DO NOT DO** — **không phát minh lại Portainer.** Không tự viết UI quản lý Docker tổng quát.

---

## P5 — TENANT DOCTOR

**WHY** — Lỗi cấu hình khách mới hiện chỉ lộ ra sau một pipeline deploy ~12 phút. Đã có tiền lệ:
khách thiếu capability vấp bốn cổng deploy liên tiếp.

**ENTRY GATE** — P1 (hợp đồng tenant đã được mô tả đúng).

**DELIVERABLES** — `tenant:doctor <slug>` chạy **cục bộ trong vài giây**, kiểm: hợp đồng tenant · đồ
thị capability · khai báo secret · cấu hình runtime · cấu hình deploy · định tuyến · ràng buộc
workflow · cấu hình AI · enrollment observability · enrollment danh tính · chính sách backup.

**RUNTIME PROOF** — một gói khách cố tình hỏng bị bắt **trước** khi chạm pipeline.

**EXIT GATE** — mọi lỗi từng làm đỏ deploy trong lịch sử đều bị `tenant:doctor` bắt được.

**DO NOT DO** — không biến nó thành trình cài đặt tenant. Chỉ chẩn đoán.

---

## P6 — TENANT PROVISIONING

**WHY** — Hạ tầng đang dựng bằng script + thao tác tay ⇒ không tái lập được, và `gd1-test` là một
bông tuyết độc bản.

**ENTRY GATE** — P4, P5.

**DELIVERABLES** — OpenTofu + Ansible + Compose theo chuỗi:
`TenantSpec → kế hoạch hạ tầng → cấp phát host → stack → Caddy → secret → observability → danh tính → nghiệm thu runtime`.

**RUNTIME PROOF** — dựng **một môi trường mới từ số 0** bằng pipeline; sau đó **reconcile chính
gd1-test** bằng cùng pipeline đó.

**EXIT GATE** — gd1-test không còn là bông tuyết độc bản.

**DO NOT DO** — **không viết thêm hàng loạt script SSH.**

---

## P7 — AI RUNTIME / QUALITY

**WHY** — Chất lượng LLM hiện không đo được; prompt nằm trong mã. Và Flowise đang chiếm tài nguyên
trên mọi stack dù `ultty-gd1-test` chạy `PARSER_MODE=deepseek`.

**ENTRY GATE** — P2 (không có observability bền thì không đánh giá được chất lượng theo thời gian).

**DELIVERABLES**
- POC `ModelRuntimePort` với hai hiện thực: `FlowiseAdapter` và adapter provider trực tiếp;
- đánh giá Vercel AI SDK ở vai **trừu tượng provider/tool** — **không** dùng phần durability của nó,
  vì durability đã thuộc Hatchet;
- Langfuse cho: quản lý prompt · golden dataset · experiment · evaluator bằng mã · LLM-as-a-judge ·
  đánh giá bởi người.

**RUNTIME PROOF** — chạy cùng một bộ fixture qua cả hai adapter, so kết quả.

**EXIT GATE** — nếu runtime trực tiếp đạt parity thì Flowise **có thể** trở thành adapter **tuỳ chọn**.

**DO NOT DO** — **không xoá Flowise** · không migration trong phase này · không để Langfuse thay vai
ClickStack (ClickStack = quan sát hệ thống; Langfuse = chất lượng LLM).

---

## P8 — IDENTITY (Keycloak)

**WHY** — Cần SSO/MFA/liên kết danh tính khi có nhiều khách.

**ENTRY GATE** — có khách thứ 2–3 thật sự cần.

**DELIVERABLES** — Keycloak **nằm sau `IdentityProviderPort`**. Mã nghiệp vụ Nexagnet chỉ biết
`Principal`.

Keycloak sở hữu: xác thực · OIDC · MFA/passkey · SSO · liên kết danh tính · vai/nhóm thô.
Nexagnet sở hữu: entitlement của tenant · capability · quyền nghiệp vụ · chính sách nghiệp vụ.

**RUNTIME PROOF** — một tenant đăng nhập qua Keycloak mà mã nghiệp vụ không import claim của Keycloak
ở bất kỳ đâu.

**EXIT GATE** — không có claim của Keycloak rò ra ngoài port.

**DO NOT DO** — không rải claim Keycloak khắp service. Không tự viết IAM.

---

## P9 — TENANT LIFECYCLE / ENTITLEMENTS

**WHY** — Hợp đồng cần ánh xạ được xuống năng lực chạy thật.

**ENTRY GATE** — P8.

**DELIVERABLES** — đánh giá OpenMeter trước khi tự viết bộ đếm/hạn mức/gói/tính tiền. Nexagnet chỉ
sở hữu ánh xạ **hợp đồng → entitlement → capability**.

**RUNTIME PROOF** — vượt hạn mức làm thay đổi hành vi runtime đúng như hợp đồng mô tả.

**EXIT GATE** — ánh xạ chạy đúng end-to-end.

**DO NOT DO** — **không tự xây bộ máy tính tiền** nếu công cụ có sẵn phù hợp.

---

## P10 — INTEGRATION PLATFORM

**WHY** — ERP/kênh/nguồn nội dung sẽ nhân lên theo số khách.

**ENTRY GATE** — P6.

**DELIVERABLES** — chuẩn hoá port tích hợp (`ErpPort`, `ChannelAdapter`, `ContentSource`) thành một
mặt phẳng có danh mục, có kiểm thử hợp đồng.

**RUNTIME PROOF** — thêm một tích hợp mới mà không sửa mã lõi.

**EXIT GATE** — như trên.

**DO NOT DO** — không đưa n8n vào đường nghiệp vụ chính.

---

## P11 — BUSINESS ACCEPTANCE CATALOG

**WHY** — Không có định nghĩa "đúng" đọc được bằng máy thì Agentic Ops mù: agent chỉ biết test xanh,
không biết nghiệp vụ đúng.

**ENTRY GATE** — P2.

**DELIVERABLES** — khái niệm `BusinessAcceptanceContract` (ví dụ `sales-order-auto-confirm.v1`),
chuỗi **tình huống nghiệp vụ → nghiệm thu tự động → bằng chứng runtime → danh mục regression**. Các
tình huống phụ thuộc LLM có thể đồng bộ sang dataset Langfuse.

**RUNTIME PROOF** — một thay đổi làm sai nghiệp vụ bị bắt bởi contract, **không** phải bởi người đọc log.

**EXIT GATE** — mọi tính năng quan trọng đều có contract.

**DO NOT DO** — không xây engine này trong phase tài liệu.

---

## P12 — DIAGNOSTIC AGENT (LEVEL 0, chỉ đọc)

**WHY** — Biến bằng chứng đã có thành chẩn đoán.

**ENTRY GATE** — **P2 và P3 phải CLOSED.** P11 nên có.

**DELIVERABLES** — agent chỉ đọc + MCP server chỉ đọc (8 công cụ, xem
[agentic-ops §4](../../kien-truc/agentic-ops.md#4-mcp--giao-diện-máy-không-phải-màn-hình)).

**RUNTIME PROOF** — trên 10–20 lỗi lịch sử thật, agent chỉ đúng chỗ; đối chiếu với benchmark công
nghệ có sẵn (Sentry Seer hoặc tương đương) **trước** khi tự viết bộ não.

**EXIT GATE** — độ chính xác đủ dùng, đo được, và **không** có công cụ ghi nào được cấp.

**DO NOT DO** — không sửa gì · không mở PR · không bóc HTML của Debug View.

---

## P13 — AUTO-FIX PR AGENT (LEVEL 1)

**ENTRY GATE** — P12 + P11 + P3.
**DELIVERABLES** — regression đỏ → vá → test → **mở PR**.
**RUNTIME PROOF** — PR do agent tạo qua được CI và review của người.
**EXIT GATE** — tỷ lệ PR được người chấp nhận đủ cao, đo trên số thật.
**DO NOT DO** — **tuyệt đối không merge.**

---

## P14 — CANARY REMEDIATION (LEVEL 2)

**ENTRY GATE** — P13 + P4 + P6.
**DELIVERABLES** — CI → gd1/canary → replay runtime → nghiệm thu nghiệp vụ → **người phê duyệt**.
**RUNTIME PROOF** — một lần khắc phục đi trọn chuỗi và bị **rollback đúng** khi nghiệm thu trượt.
**EXIT GATE** — đường rollback đã được chứng minh, không chỉ được viết ra.
**DO NOT DO** — không bỏ bước người duyệt.

---

## P15 — LIMITED AUTONOMOUS PRODUCTION OPS (LEVEL 3)

**ENTRY GATE** — P14 + một lịch sử đã chứng minh.
**DELIVERABLES** — chỉ playbook rủi ro thấp, theo phân loại ở
[agentic-ops §5](../../kien-truc/agentic-ops.md#5-phân-loại-rủi-ro-cho-tự-động-hoá-production).
**RUNTIME PROOF** — chuỗi sự cố thật được xử lý đúng, có kiểm toán đầy đủ.
**EXIT GATE** — do người quyết định, theo chính sách tại thời điểm đó.
**DO NOT DO** — không tự động cho: giá · tài chính · phân quyền · bảo mật · migration phá huỷ · xoá
dữ liệu · cách ly tenant · secret. **Không bao giờ để AI SSH vào production sửa file.**

---

## 2. Bản đồ phụ thuộc

```
P0 CLOSED
   └─ P1 (tài liệu)
        ├─ P2 REFERENCE STACK PARITY v0  ◄── milestone triển khai KẾ TIẾP
        │    ├─ P4 Fleet/Portainer ─┐
        │    ├─ P5 Tenant Doctor ───┼─ P6 Provisioning ─ P10 Integration
        │    ├─ P7 AI Runtime/Quality
        │    └─ P11 Business Acceptance
        └─ P3 GitHub Governance (song song, HIGH)

P2 + P3 ─ P12 Diagnostic ─ P13 Auto-fix PR ─ P14 Canary ─ P15 Limited autonomous
P8 Identity ─ P9 Entitlements
```

---

## 3. Known risks — `UNRESOLVED`

Ba phát hiện runtime ngày 27/08 (`zca_listener` im lặng · preflight ghi đè `autoSend` ·
`bot-poller.spec.ts` flaky) giữ nguyên bằng chứng và trạng thái tại
[reference-platform-stack §7](../../kien-truc/reference-platform-stack.md#7-known-risks--unresolved).
Chúng thuộc **P2**.

Rủi ro thứ tư — **quản trị GitHub (P3)** — đã chuyển `RESOLVED` ngày 28/08/2026, còn lại một khoảng
trống mức TRUNG BÌNH: repo một chủ nên **không cưỡng chế được review bởi người thứ hai**. Xem
[github-governance.md](../van-hanh/github-governance.md).

---

## 3bis. Ghi chú năng lực nhà cung cấp AI — **FUTURE, chưa triển khai**

DeepSeek đã công bố **năng lực đọc ảnh** (28/08/2026). Điều này **không** thay đổi hệ thống hiện tại:
Nexagnet **chưa có runtime đa phương thức**, và cổng chặn của F4 là **tuân thủ** (DeepSeek chưa được
duyệt làm bên thứ ba xử lý PII), không phải năng lực model.

Bài học rút ra cho **AI Runtime / Quality** sau này — **chưa làm, không thuộc P3**: chỗ khai báo
provider hiện **không mô tả nổi năng lực**, nên một thay đổi phía nhà cung cấp phải đi sửa văn bản
rải rác thay vì sửa một hợp đồng. Khi mở hạng mục đó, hợp đồng năng lực model/provider nên nói được:
`text` · `vision` · `tool_use` · `structured_output` · `context_window` · `cost` · `latency` ·
`availability` — và **không** ghim cứng một phiên bản model trong mã.

---

## 4. Liên quan

- [../../kien-truc/reference-platform-stack.md](../../kien-truc/reference-platform-stack.md)
- [../../kien-truc/tech-radar.md](../../kien-truc/tech-radar.md)
- [../../kien-truc/agentic-ops.md](../../kien-truc/agentic-ops.md)
- [tong-quan.md](tong-quan.md) — nơi DUY NHẤT có trạng thái ✅/⬜
