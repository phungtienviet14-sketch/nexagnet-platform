# Plan: Kênh Zalo hybrid và giao diện cấu hình nguồn sự thật/thành viên nhóm

**Nguồn yêu cầu**: Hai yêu cầu `/plan` trong hội thoại ngày 03/08/2026  
**Phạm vi hợp nhất**: (A) hai bot cùng một nhóm, mỗi tin chỉ có một bot xử lý; (B) giao diện vận hành, nguồn sự thật, thành viên nhóm và rules động  
**Quyết định mới nhất của người dùng**: Không làm native reply/quote đúng tin nhắn; giữ nguyên thiết kế phản hồi của kế hoạch A. Dùng `zca-js` để lấy danh sách thành viên nhóm và cấu hình từng thành viên.  
**Trạng thái**: Chờ người dùng duyệt; chưa được phép viết code chức năng  
**Độ phức tạp**: Large

## 1. Tóm tắt năng lực

Sau khi hoàn thành, người vận hành có một giao diện thống nhất để quản lý trạng thái hai kênh Zalo, đăng xuất tài khoản Zalo cá nhân, bật/tắt `AUTO_SEND`, đồng bộ thành viên của các nhóm đã cho phép bằng `zca-js`, phân loại từng thành viên, và sửa nguồn sự thật giá/chính sách/rules trong PostgreSQL. Cơ chế hai bot không đổi: tin nhóm có native `@mention` Bot Platform do Bot Platform xử lý và phản hồi; tin không tag Bot Platform do tài khoản cá nhân `zca-js` xử lý và phản hồi; một tin chỉ có một owner.

Kế hoạch này **loại bỏ toàn bộ hạng mục native reply/quote đúng tin nhắn**. Cả Bot Platform và zca gửi phản hồi dạng tin nhắn bình thường vào đúng nhóm, qua đúng kênh đã nhận tin. Khả năng quote của `zca-js` không được dùng trong increment này để giữ một hành vi sản phẩm thống nhất giữa hai kênh.

## 2. Các quyết định đã chốt

### 2.1 Phân luồng hai bot

1. `CHANNEL_MODE=hybrid` khởi động đồng thời Bot Platform và zca.
2. Native mention Bot Platform được xác định bằng `mentions[].uid`, không dò tên Bot trong chuỗi text.
3. Tin tag Bot Platform:
   - zca nhìn thấy nhưng nhường quyền xử lý;
   - Bot Platform nhận, đưa vào pipeline và gửi phản hồi bằng Bot Platform.
4. Tin không tag Bot Platform:
   - Bot Platform không nhận do mention-gating;
   - zca đưa tin vào pipeline và gửi phản hồi bằng tài khoản cá nhân.
5. Tin do Bot Platform gửi bị zca bỏ qua để tránh vòng lặp.
6. Không lấy được Bot UID qua `getMe` thì nhánh zca **fail-closed** trong hybrid mode; không đoán và không cho hai bot cùng xử lý.
7. Mỗi `OrderView` giữ `replyChannel`; mọi luồng duyệt, auto-ack và `AUTO_SEND` phải gửi lại đúng kênh nguồn.
8. Broadcast thật trong hybrid mode vẫn bị khóa cho tới khi người vận hành chọn rõ kênh và ID đích tương ứng.

### 2.2 Không làm native reply

- Không thêm nút “Trả lời đúng tin này” trong Feed.
- Không bổ sung `quote_message_id`, `SendMessageQuote` hay lưu raw quote context trong DB.
- Bot Platform gửi tin bình thường vào nhóm; zca cũng gửi tin bình thường vào nhóm.
- Không chuyển một tin đã tag Bot Platform sang zca chỉ để có native quote, vì việc đó phá vỡ invariant “một tin — một owner”.

### 2.3 Thành viên nhóm và “rank”

Thuật ngữ trên UI nên là **“Phân loại thành viên (rank)”**, nhưng dữ liệu được tách rõ thành:

- `customerRank`: `dai_ly | ctv | khach_le | unknown` — dùng để nhận diện loại người gửi, định tuyến/tone và thống kê.
- `operationalRole`: `khach_hang | sale | ke_toan | quan_ly | ksnb | bpvh | ky_thuat | unknown` — dùng để phân biệt khách với nhân sự nội bộ trong nhóm.
- `handlingMode`: `inherit_group | process | ignore | manual_review` — quyết định pipeline xử lý tin của thành viên thế nào.

**Rank thành viên không quyết định đơn giá.** Tài liệu nghiệp vụ hiện chỉ xác nhận:

1. Một nhóm map tới một `Dealer` theo `chatId`.
2. `Dealer.tier` chỉ có `dai_ly | ctv`.
3. Bảng giá chung có bốn cột; giá tính đơn là `wholesale` (“Đơn giá CTV”).
4. Chỉ đại lý có deal riêng mới dùng `DealerPriceOverride(dealer, sku)`.

Do đó, thứ tự giá giữ nguyên:

```text
DealerPriceOverride(dealer, sku) > Price.wholesale(sku) > needs_edit nếu thiếu giá
```

Không tạo `PricingRank`, bảng giá theo rank, hoặc ngôn ngữ công thức tùy ý khi chưa có nguồn nghiệp vụ xác nhận.

### 2.4 Rules/công thức

- Công thức là các rule có tên và schema cố định: ship, miễn ship, VAT, COD, ngưỡng lệch tổng, ngưỡng đơn lớn, ngưỡng số lượng và độ tin cậy.
- Không cho nhập JavaScript, SQL hoặc biểu thức tùy ý.
- Cấu hình đi theo vòng đời `draft -> preview -> active -> archived`.
- Chỉ `active` áp dụng cho tin/đơn mới hoặc lần “Chạy lại” có chủ ý; đơn cũ giữ snapshot giá/rules đã dùng.
- Các giá trị A3/D8/D15 chưa được khách xác nhận phải hiển thị là “tạm tính/chưa xác minh” và không được coi là dữ liệu production hợp lệ.

## 3. Căn cứ nghiên cứu và giới hạn kênh

| Năng lực | Bot Platform hiện tại | zca-js 2.1.2 | Quyết định trong kế hoạch |
|---|---|---|---|
| Nhận tin nhóm không tag Bot | Không; nhóm chỉ phát event khi native mention Bot hoặc người dùng reply một tin trước của Bot | Có, listener thấy mọi tin mà tài khoản nhìn thấy | Hybrid ownership như §2.1 |
| Gửi native quote tới một tin bất kỳ | API `sendMessage` công khai không có trường quote | `MessageContent.quote?: SendMessageQuote` có trong type cài local | Không làm native reply ở cả hai kênh |
| Lấy danh sách thành viên nhóm | Không tìm thấy endpoint member-list trong bộ API Bot Platform công khai | `getGroupInfo()` có `memberIds`; `getGroupMembersInfo()` trả profile | Chỉ đồng bộ qua zca, nhóm phải allowlist |
| Rủi ro chính sách | Kênh chính thức, group feature còn ràng buộc mention | Thư viện không chính thức, có rủi ro khóa tài khoản | Tài khoản phụ + văn bản chấp nhận rủi ro trước chạy thật |

Căn cứ ngoài repo:

- [Zalo Bot Platform — Send Message](https://docs.zaloplatforms.com/docs/BOT/apis/sendMessage)
- [Zalo Bot Platform — tương tác Bot trong nhóm](https://docs.zaloplatforms.com/docs/BOT/best-practices/build-bot-interaction-with-group)
- [Zalo Bot Platform — Webhook](https://docs.zaloplatforms.com/docs/BOT/webhook)
- [zca-js — getGroupInfo](https://zca-js.tdung.com/vi/models/Group)
- [zca-js — getGroupMembersInfo](https://zca-js.tdung.com/vi/apis/getGroupMembersInfo)

Căn cứ type đang cài trong repo:

- `node_modules/.pnpm/zca-js@2.1.2/node_modules/zca-js/dist/models/Group.d.ts:96`
- `node_modules/.pnpm/zca-js@2.1.2/node_modules/zca-js/dist/apis/getGroupMembersInfo.d.ts:1`
- `node_modules/.pnpm/zca-js@2.1.2/node_modules/zca-js/dist/apis/sendMessage.d.ts:66`

## 4. Tình trạng code hiện tại (as-built 03/08/2026)

### 4.1 Git/worktree

- Nhánh: `feat/phase3-persistence`.
- Commit gần nhất: `012469e feat: add runtime auto-send and Zalo logout controls`.
- Hybrid hai bot nằm trong **worktree local chưa commit/chưa deploy**.
- Worktree hiện có 39 file tracked đã sửa, khoảng `+459/-84` chưa tính file untracked.
- Có 7 file code hybrid untracked cùng `AGENTS.md` và `tmp/`; khi triển khai phải bảo toàn các thay đổi người dùng, không reset/revert.

### 4.2 Năng lực đã có

| Năng lực | Trạng thái | Bằng chứng |
|---|---|---|
| AdminJS CRUD nguồn sự thật | Đã có | `apps/api/src/admin/admin-resources.ts:35`; 6 resource và hook reload snapshot |
| PostgreSQL/Prisma source of truth | Đã có | `apps/api/prisma/schema.prisma`; repository memory/prisma |
| Giá chung + override đại lý | Đã có | `apps/api/src/rules/rules.ts:38` |
| UI bật/tắt `AUTO_SEND` | Đã có | `apps/web/app/page.tsx:67`, `apps/web/components/console/TopBar.tsx:86` |
| API runtime `AUTO_SEND` | Đã có, in-memory | `apps/api/src/demo/demo.controller.ts:82`, `apps/api/src/runtime/runtime-settings.service.ts:7` |
| UI/API logout zca | Đã có | `apps/web/app/zalo/page.tsx:45`, `apps/api/src/channels/zalo.controller.ts:72`, `apps/api/src/channels/zalo-user.client.ts:142` |
| Danh sách nhóm + allowlist | Đã có | `apps/api/src/channels/zalo-user.client.ts:157` |
| Hybrid ownership | Đã viết local | `apps/api/src/ingest/message-ownership.ts:18`, `apps/api/src/ingest/zca-listener.ts:62` |
| Gửi về đúng kênh nguồn | Đã viết local | `apps/api/src/channels/outbound-channel.router.ts:12`, `packages/shared/src/order-view.ts:53` |
| Member list/profile | Chưa có | Chưa có model, repository, endpoint hay UI |
| Cấu hình từng thành viên | Chưa có | Pipeline vẫn suy `senderType` hoàn toàn từ tier của nhóm/dealer |
| Rules/AgentsConfig động | Chưa có | Vẫn dùng `DEFAULT_RULES_CONFIG` và `DEFAULT_AGENTS_CONFIG` hardcoded |
| Giao diện nghiệp vụ thay AdminJS | Chưa có | `/admin` là power-user UI; chưa có `/settings` có preview/audit |
| Native reply/quote | Chưa có và đã loại khỏi scope | `ChannelAdapter.sendMessage(chatId, text)` không có reply target |

### 4.3 Xác minh vừa chạy

- `pnpm test`: PASS — API 226 pass/21 skip có điều kiện; shared 43 pass; web 7 pass; route contract 2 pass.
- `pnpm typecheck`: PASS.
- `pnpm lint`: PASS.
- `pnpm build`: PASS; Next.js tạo route `/` và `/zalo`.
- Các Prisma integration test bị skip đúng thiết kế khi không đặt `RUN_PRISMA_IT=1`; chúng chưa phải bằng chứng DB thật cho increment mới.
- Build có cảnh báo cấu hình pnpm và Next.js ESLint plugin, không làm build fail.

## 5. Patterns phải mirror

| Category | Source | Pattern |
|---|---|---|
| Naming | `apps/api/src/admin/admin-resources.ts:35` | Model/type PascalCase; file/module theo domain và kebab-case |
| Validation/errors | `apps/api/src/demo/demo.controller.ts:82` | Zod `safeParse` ở boundary; lỗi đầu vào thành `BadRequestException`; kiểm Origin cho mutation nhạy cảm |
| Logging | `apps/api/src/admin/knowledge-refresh.ts:17` | Nest `Logger`; log ID/trạng thái, không log token/raw PII |
| Data access | `apps/api/src/messages/prisma-messages.repository.ts:18` | Repository seam memory/prisma; Prisma constraint xử lý ở repository |
| Dynamic reload | `apps/api/src/admin/admin-resources.ts:24` | Ghi DB xong mới reload snapshot; lỗi ghi không được nuốt |
| Frontend mutation | `apps/web/app/page.tsx:67` | React Query `useMutation`, cập nhật/invalidate cache và hiển thị lỗi thân thiện |
| Tests | `apps/api/src/ingest/message-ownership.spec.ts:27` | Vitest colocated; pure function trước, integration theo env gate |
| Hybrid fail-safe | `apps/api/src/ingest/message-ownership.ts:18` | Dựa metadata UID, một owner, identity lỗi thì fail-closed |

Không có pattern tương tự cho đồng bộ profile thành viên, version hóa rules hay audit log; đây là capability mới, nhưng phải dùng cùng repository/Zod/Logger/test style.

## 6. Hợp đồng dữ liệu

### 6.1 `GroupParticipant` — CREATE

| Field | Kiểu/ý nghĩa |
|---|---|
| `id` | CUID nội bộ |
| `groupId` | FK tới `Group` của kênh zca |
| `externalUserId` | UID thành viên do zca trả về |
| `displayName` | Tên hiển thị gần nhất |
| `zaloName` | Tên Zalo nếu API trả về |
| `avatarUrl` | Tùy chọn; không tải ảnh về server nếu không cần |
| `customerRank` | `dai_ly | ctv | khach_le | unknown` |
| `operationalRole` | `khach_hang | sale | ke_toan | quan_ly | ksnb | bpvh | ky_thuat | unknown` |
| `handlingMode` | `inherit_group | process | ignore | manual_review` |
| `active` | Còn có trong lần sync đầy đủ gần nhất |
| `source` | `zca_sync | manual` |
| `lastSeenAt`, `syncedAt`, `createdAt`, `updatedAt` | Audit/lifecycle |

Constraint: unique `(groupId, externalUserId)`. Một lần sync không được xóa cứng thành viên vắng mặt; chỉ chuyển `active=false` sau khi sync đầy đủ thành công.

### 6.2 `RuleConfigVersion` — CREATE

- `id`, `version`, `status`, `payload Json`, `createdBy`, `activatedBy`, `createdAt`, `activatedAt`.
- `payload` phải qua Zod schema versioned; không lưu/execute code.
- Chỉ một bản `active` tại một thời điểm trong một transaction.
- Mỗi `Order.view`/`priced` giữ snapshot kết quả hiện tại; bổ sung `ruleConfigVersion` để truy vết.

### 6.3 `AuditLog` — CREATE

- Ghi actor, action, entity type/id, before/after đã loại dữ liệu nhạy cảm, request ID và timestamp.
- Bắt buộc cho: sửa giá/override, kích hoạt rules, sửa rank/role thành viên, đổi allowlist, bật `AUTO_SEND`, logout zca.
- Không ghi token, cookie, credential, raw message, SĐT/địa chỉ đầy đủ vào log.

### 6.4 Mô hình giá — KEEP

- `Price` giữ bốn cột: list, retail, minimum retail, wholesale.
- `DealerPriceOverride` giữ override theo dealer + SKU.
- `Dealer.tier` giữ `dai_ly | ctv`.
- Không thêm price-by-member hoặc price-by-rank.

## 7. Giao diện đích

Tạo `/settings` cho người vận hành non-technical; `/admin` vẫn giữ làm power-user fallback.

### Tab 1 — Kênh Zalo

- Trạng thái Bot Platform, Bot UID/name và trạng thái fail-closed.
- Trạng thái tài khoản zca, QR, allowlist nhóm và nút logout hiện có.
- Nút “Đồng bộ thành viên” trên từng nhóm zca đã allowlist.
- Hiển thị lần sync gần nhất, số thành viên active/inactive và lỗi gần nhất.

### Tab 2 — Nhóm và thành viên

- Chọn nhóm zca, xem danh sách thành viên, tìm kiếm/lọc theo rank/role/handling mode.
- Sửa từng thành viên hoặc bulk edit có preview.
- Thành viên sync mới mặc định `unknown + inherit_group`; sync không tự thay đổi hành vi pipeline.
- Cho phép đánh dấu nhân sự nội bộ `ignore` hoặc `manual_review` để tránh AI coi tin nội bộ là tin khách.
- Hiển thị rõ nhóm đang map tới Dealer nào; không cho rank thành viên đổi Dealer/giá.

### Tab 3 — Đại lý, sản phẩm và giá

- CRUD Dealer, group mapping, glossary, 19 SKU và bốn cột giá.
- Cấu hình deal riêng bằng `DealerPriceOverride` với preview thứ tự ưu tiên.
- Chặn giá âm, số ngoài giới hạn, SKU/dealer không tồn tại và duplicate override.

### Tab 4 — Rules/công thức

- Form typed cho ship, VAT, COD, tolerance và AgentsConfig.
- Trạng thái draft/active; preview một đơn mẫu trước khi activate.
- Dữ liệu A3/D8/D15 chưa chốt phải có cảnh báo và không được “xác nhận production”.

### Tab 5 — Tự động hóa

- Dùng lại state/service `AUTO_SEND` hiện tại, không tạo state thứ hai.
- Bật ON phải có confirm hai bước, nêu rõ chỉ đơn không rủi ro mới tự gửi.
- Giữ fail-safe restart: API restart quay về giá trị env, mặc định `off`.
- Hiển thị điều kiện D4: chỉ bật thật khi có văn bản đồng ý của khách.

### Tab 6 — Lịch sử thay đổi

- Xem audit theo thời gian, actor, entity và action.
- Cho phép xem diff giá/rules/member classification; không cho sửa log.

## 8. API dự kiến

| Method/path | Mục đích |
|---|---|
| `GET /settings/summary` | Trạng thái Zalo, automation, dữ liệu/rules đang active |
| `POST /zalo/groups/:zcaChatId/members/sync` | Sync thủ công thành viên của một nhóm allowlist |
| `GET /groups/:groupId/participants` | List/filter participant từ DB |
| `PATCH /groups/:groupId/participants/:participantId` | Sửa rank/role/handling mode |
| `PATCH /groups/:groupId/participants` | Bulk update có validate/preview |
| `GET/PUT /settings/source-truth/*` | CRUD chuyên biệt cho Dealer/Group/Product/Price/Override/Glossary |
| `GET/POST /settings/rules` | Tạo/list draft rules |
| `POST /settings/rules/:id/preview` | Chạy rules thuần trên fixture, không ghi đơn |
| `POST /settings/rules/:id/activate` | Transaction kích hoạt version |
| `PUT /settings/automation/auto-send` | Alias nghiệp vụ dùng chung `RuntimeSettingsService` |
| `GET /settings/audit` | Audit pagination/filter |

Các endpoint `PUT /demo/auto-send` và `/zalo/logout` hiện có được giữ tương thích; UI mới gọi service chung, không sao chép business logic.

## 9. Files dự kiến thay đổi

| File/module | Action | Lý do |
|---|---|---|
| `apps/api/prisma/schema.prisma` + migration | UPDATE/CREATE | Thêm participant, rules version, audit và rule version trên order |
| `packages/shared/src/group-participant.ts` | CREATE | DTO/Zod enum rank/role/handling mode |
| `packages/shared/src/settings.ts` | CREATE | DTO settings/rules/audit |
| `packages/shared/src/index.ts` | UPDATE | Export contract mới |
| `apps/api/src/channels/zalo-user.client.ts` | UPDATE | Wrapper `getGroupInfo` + `getGroupMembersInfo`, chunk UID và normalize profile |
| `apps/api/src/channels/zalo.controller.ts` | UPDATE | Endpoint sync có Zod/Origin guard |
| `apps/api/src/groups/*` | CREATE | Participant repository/service/controller/module |
| `apps/api/src/settings/*` | CREATE | Source-truth/rules/automation facade dùng chung |
| `apps/api/src/audit/*` | CREATE | Append-only audit repository/service |
| `apps/api/src/knowledge/knowledge.service.ts` | UPDATE | Resolve sender theo participant khi có cấu hình; fallback group như cũ |
| `apps/api/src/rules/config.ts` | UPDATE | Nhận typed active config thay hằng số trực tiếp |
| `apps/api/src/agents/agents.config.ts` | UPDATE | Nhận typed active config |
| `apps/api/src/admin/admin-resources.ts` | UPDATE | Dùng write service/audit/reload chung; thêm resource mới nếu phù hợp |
| `apps/api/src/mcp/source-of-truth.tools.ts` | UPDATE | Dùng write service chung, tránh lệch với UI/AdminJS |
| `apps/api/src/app.module.ts` | UPDATE | Wire modules/repositories |
| `apps/web/app/settings/page.tsx` | CREATE | Shell giao diện cấu hình |
| `apps/web/components/settings/*` | CREATE | Tabs/forms/member table/preview/audit |
| `apps/web/lib/api.ts`, `apps/web/lib/zalo.ts` | UPDATE | Typed API client |
| `apps/web/app/zalo/page.tsx` | UPDATE | Điều hướng/hợp nhất trạng thái với Settings, giữ logout/QR |
| `apps/web/app/page.tsx`, `TopBar.tsx` | UPDATE nhỏ | Link Settings; vẫn dùng cùng AUTO_SEND state |
| Hybrid files local hiện có | REVIEW/TEST, không viết lại | Giữ thiết kế kế hoạch A và đưa về trạng thái commit-ready |
| `docs/so-do-he-thong.md`, `docs/ke-hoach/tong-quan.md`, `docs/nghiep-vu.md` | UPDATE sau code | Cập nhật as-built/decision/status; không sửa hồ sơ nguồn gốc |

## 10. Tasks triển khai theo TDD

### Task 0: Đóng băng hợp đồng và test RED

- **Action**: Viết capability tests cho ownership hybrid, member sync, rank/role resolution, price precedence, rules lifecycle, audit và UI critical flow trước implementation.
- **Mirror**: `apps/api/src/ingest/message-ownership.spec.ts:27`.
- **Validate**: Test mới fail đúng vì capability chưa tồn tại; test hybrid hiện tại vẫn xanh.

### Task 1: Ổn định baseline hybrid đã có local

- **Action**: Review phần code local của kế hoạch A; bảo đảm Bot UID, allowlist, source-channel routing, AUTO_SEND/approve/auto-ack và broadcast lock tuân invariant §2.1. Không thêm native reply.
- **Mirror**: `apps/api/src/ingest/message-ownership.ts:18` và `apps/api/src/channels/outbound-channel.router.ts:12`.
- **Validate**: Unit matrix tag Bot/không tag/tag người khác/tin Bot gửi/identity lỗi; `pnpm test`.

### Task 2: Migration participant/rules/audit

- **Action**: Thêm enum/model/constraint/index và migration; thêm repository seam memory/prisma khi runtime cần chạy không DB.
- **Mirror**: `apps/api/src/messages/prisma-messages.repository.ts:18`.
- **Validate**: `prisma validate`, migration trên DB test, uniqueness và rollback/re-run migration.

### Task 3: Đồng bộ thành viên bằng zca-js

- **Action**: Với một nhóm zca đã allowlist, gọi `getGroupInfo(groupId)` lấy `memberIds`, chia batch hợp lý gọi `getGroupMembersInfo(ids)`, normalize và upsert transaction. Sync lỗi/partial không được deactivate hàng loạt.
- **Mirror**: `ZaloUserClient.listGroups()` tại `apps/api/src/channels/zalo-user.client.ts:157`.
- **Validate**: Mock API cho full/partial/rate-limit/logout/not-allowlisted; Prisma IT chứng minh upsert + inactive lifecycle.

### Task 4: Áp cấu hình thành viên vào ingest/pipeline

- **Action**: Resolve participant theo `(group, senderExternalId)`; `ignore` bỏ trước LLM/DB nội dung; `manual_review` lưu tối thiểu và không auto-send; `inherit_group` giữ hành vi hiện tại; rank chỉ ảnh hưởng `senderType`, không đổi giá.
- **Mirror**: `KnowledgeService.resolveByChatId()` tại `apps/api/src/knowledge/knowledge.service.ts:141`.
- **Validate**: Test từng handling mode, thành viên unknown, member rời nhóm và group chưa map.

### Task 5: Write service nguồn sự thật và rules versioned

- **Action**: Tạo một service ghi dùng chung cho Settings REST, AdminJS và MCP; transaction -> audit -> reload. Chuyển RulesConfig/AgentsConfig sang active version typed; preview trước activate.
- **Mirror**: write hook/reload ở `apps/api/src/admin/admin-resources.ts:24`.
- **Validate**: Sửa giá/rules -> đơn mới dùng dữ liệu mới; đơn cũ không đổi; activate lỗi rollback toàn bộ; price precedence giữ nguyên.

### Task 6: API settings có auth/validation/audit

- **Action**: Thêm controller/service DTO; reuse logout và RuntimeSettingsService; pagination/filter cho participant/audit.
- **Mirror**: Zod + Origin check ở `apps/api/src/demo/demo.controller.ts:82` và `apps/api/src/channels/zalo.controller.ts:72`.
- **Validate**: 400/401/403/409/422 đúng case; không rò token/PII trong error/log.

### Task 7: Giao diện `/settings`

- **Action**: Xây 6 tab ở §7, trạng thái loading/error/empty, confirm thao tác nguy hiểm, preview diff và accessibility cơ bản. Giữ `/admin` và `/zalo` tương thích.
- **Mirror**: React Query mutation/cache ở `apps/web/app/page.tsx:67` và `apps/web/app/zalo/page.tsx:34`.
- **Validate**: Component tests + Playwright E2E: sync member, sửa rank, sửa override, activate rules, toggle AUTO_SEND, logout.

### Task 8: Security, privacy và observability

- **Action**: Rate limit endpoint sync/mutation, minimize profile fields, retention/inactive cleanup policy, audit append-only, structured metrics cho sync/owner/send failure. Member list không gửi sang LLM; chỉ sender classification tối thiểu đi vào pipeline.
- **Mirror**: fail-closed hybrid và API key/Origin guard hiện có.
- **Validate**: Security tests; log snapshot không có token/cookie/raw member list; `pnpm audit --audit-level high`.

### Task 9: E2E local và rollout có kiểm soát

- **Action**: Chạy full validation local. Chỉ khi có quyền riêng mới deploy test group: backup DB, migrate, sync một nhóm allowlist, chạy ma trận hybrid, quan sát và rollback nếu double-send/PII leak.
- **Mirror**: smoke/rollback hiện có ở `deploy/netviet/`.
- **Validate**: Checklist §11 và acceptance §14.

## 11. Ma trận E2E bắt buộc

1. Tag Bot Platform -> chỉ Bot Platform tạo một order/view và phản hồi một tin bình thường.
2. Không tag -> chỉ zca tạo một order/view và phản hồi một tin bình thường.
3. Tag người khác -> zca xử lý.
4. Tin do Bot Platform gửi -> zca bỏ qua.
5. Không lấy được Bot UID -> zca fail-closed; có cảnh báo operator.
6. Nhóm không allowlist -> không sync member, không lưu/gửi LLM.
7. Sync member thành công -> upsert đúng; thành viên mới chưa làm đổi pipeline cho tới khi operator cấu hình.
8. Sync partial/thất bại -> không đánh inactive nhầm toàn bộ nhóm.
9. Thành viên `ignore` -> không gọi LLM/không tạo order.
10. Thành viên `manual_review` -> không AUTO_SEND.
11. Sửa rank -> sender type đổi nhưng đơn giá không đổi.
12. Dealer override -> đơn mới dùng override; thành viên khác cùng group vẫn dùng cùng giá dealer.
13. Rules draft -> không ảnh hưởng; activate -> chỉ đơn mới/rerun dùng version mới.
14. `AUTO_SEND` ON/OFF trên Settings và TopBar phản ánh cùng state; restart về safe default.
15. Logout -> dừng listener, xóa credential/QR/allowlist local; member config trong DB không bị xóa.
16. Không có native quote/reply metadata trong outbound request.

## 12. Validation

```bash
pnpm --filter @ultty/shared test
pnpm --filter @ultty/api test
RUN_PRISMA_IT=1 pnpm --filter @ultty/api test
pnpm --filter @ultty/web test
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm audit --audit-level high
```

Thêm Playwright E2E cho luồng Settings và chạy live matrix trên **nhóm test không có PII thật** trước khi đề xuất deploy pilot.

## 13. Rủi ro và mitigation

| Risk | Likelihood/Impact | Mitigation |
|---|---|---|
| zca vi phạm ToS/thay API/khóa tài khoản | High/High | Tài khoản phụ, văn bản chấp nhận rủi ro D16, pin 2.1.2, contract tests, Co-pilot fallback |
| Hai bot trả lời cùng một tin | Medium/High | Native UID ownership, source-channel routing, idempotency, fail-closed khi mất identity |
| Bot Platform group feature/long polling không ổn định | Medium/High | Webhook always-on trước production, live contract test, không hứa replay tin offline |
| Member list là PII | High/High | Chỉ nhóm allowlist, sync thủ công, lưu tối thiểu, không gửi danh sách sang LLM, retention/audit |
| Operator gán rank sai làm pipeline sai | Medium/Medium | Default `inherit_group`, preview/bulk confirmation, audit, `manual_review` fail-safe |
| Rank bị hiểu nhầm là bảng giá | High/High | UI tách tab; price luôn theo Dealer/Price/Override; test invariant |
| Rules sai gây sai tiền | Medium/High | Typed schema, không arbitrary formula, draft/preview/activate, snapshot version, rollback |
| A3/D8/D15 chưa có nguồn thật | High/High | Label provisional, chặn production activation/acceptance cho rule liên quan |
| AdminJS/MCP/Settings ghi lệch nhau | Medium/High | Một shared write service + transaction/audit/reload |
| Auth theo vai chưa hoàn thiện | High/High | Pilot nằm sau API key/operator gateway; production activation cần Phase 5 roles D5 |
| Worktree local đang dirty | Medium/High | Review/commit baseline theo phần độc lập; không reset/revert `AGENTS.md`, `tmp/` hay thay đổi người dùng |

## 14. Acceptance

- [ ] Người dùng đã duyệt file kế hoạch trước khi code.
- [ ] Baseline hybrid hiện có được review và full test, không thay đổi ownership design.
- [ ] Mỗi tin chỉ có một owner và phản hồi qua đúng channel nguồn.
- [ ] Không triển khai native reply/quote.
- [ ] Chỉ zca sync thành viên của nhóm allowlist; partial failure không làm mất dữ liệu.
- [ ] Operator cấu hình rank/role/handling mode từng thành viên và có audit.
- [ ] Rank thành viên không tác động đơn giá.
- [ ] Giá giữ đúng `DealerPriceOverride > wholesale`.
- [ ] Rules typed có draft/preview/activate; không chạy arbitrary formula.
- [ ] `/settings` dùng lại logout và AUTO_SEND service hiện có, không tạo state song song.
- [ ] Unit + integration + E2E đạt; coverage code mới tối thiểu 80%.
- [ ] Typecheck, lint, test, build và audit high đều đạt.
- [ ] Chưa deploy production hoặc dùng PII thật nếu chưa có phê duyệt riêng và các cổng D4/D5/D16/A3/D8/D15 liên quan.

## 15. Ngoài phạm vi

- Native reply/quote đúng tin nhắn trên Bot Platform hoặc zca.
- Bảng giá theo rank thành viên và arbitrary formula engine.
- Tự động add/remove thành viên Zalo hoặc quản trị nhóm.
- OA+GMF migration.
- KiotViet/Base production integration.
- Deploy production, commit, push hoặc mở PR nếu chưa có lệnh riêng.

## 16. Handoff sau khi duyệt

Khi người dùng trả lời `yes`/`proceed`, triển khai theo `tdd-workflow`: Task 0 RED -> Task 1 baseline hybrid -> Task 2-8 -> Task 9 verification. Sau code phải chạy code review/security review và chỉ báo sẵn sàng deploy; không tự deploy.

**CONFIRMATION GATE**: Chờ người dùng đọc và duyệt hoặc yêu cầu sửa file này trước khi viết code.
