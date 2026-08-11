# Plan: Khai thác tối đa hai kênh hybrid (Bot Platform + zca)

**Nguồn**: kết quả soát kiến trúc 04/08/2026 (phiên `/ecc:code-review` → `/ecc:plan`)
**Độ phức tạp**: Large (4 giai đoạn, có migration DB, chạm đường ingest)
**Trạng thái**: chờ duyệt — chưa viết code

## Tóm tắt

Hệ thống đã biết đủ id + tên nhóm và id + tên người gửi trên **cả hai kênh**, nhưng
không ghi lại gì cả: nhóm phải map tay bằng cách gõ `chatId`, thành viên chỉ đến từ
`getGroupInfo` (đang trả rỗng với dữ liệu thật), và tin của nhóm chưa map bị **vứt
không lưu**. Kế hoạch này biến ba nguồn dữ liệu sẵn-có-mà-bỏ-phí đó thành đường ghi
thật, theo đúng nguyên tắc "mỗi kênh làm việc nó giỏi".

Bằng chứng đã chốt (dò API thật 04/08/2026): Bot Platform **không có** API danh sách
thành viên — `getChat`, `getChatMemberCount`, `getChatMembersCount`,
`getChatAdministrators` đều trả 404 trong khi `getMe` trả 200. Nên luồng tin là
đường **duy nhất** còn lại để dựng danh sách thành viên.

## Nguyên tắc không được vi phạm

| # | Bất biến | Vì sao |
|---|---|---|
| I1 | Nhóm trong allowlist ⇒ **luôn lưu tin**; chỉ nhóm đã map mới được gửi sang parser/LLM | `CLAUDE.md`: "Lưu mọi tin nhắn/đơn về DB ngay khi nhận"; đồng thời không rò PII sang DeepSeek |
| I2 | Đường "học từ luồng tin" **không bao giờ** đánh `active=false` cho ai | Chỉ ảnh chụp đầy đủ mới được suy ra vắng mặt (bài học 04/08) |
| I3 | Học từ luồng tin **không đè** `customerRank` / `operationalRole` / `handlingMode` | Đó là phân loại của người vận hành |
| I4 | `source` không bị hạ cấp: `manual` giữ `manual`, `zca_sync` giữ `zca_sync` | Truy vết nguồn gốc dữ liệu |
| I5 | Bỏ qua có chủ ý ≠ thất bại — không được `guard.release()` | Nếu nhầm, tin chạy lại vô hạn |
| I6 | Lỗi ghi nhóm/thành viên **không chặn** xử lý tin | Đơn hàng quan trọng hơn metadata |

## Patterns to Mirror

| Loại | Nguồn | Pattern |
|---|---|---|
| Hàm thuần để test | `apps/api/src/ingest/bot-poller.ts:33` `isAllowedBotMessage` | tách quyết định thành hàm thuần, export riêng, test không cần Nest |
| Repository 2 impl | `apps/api/src/groups/group-participants.repository.ts:27` | `abstract class` + `InMemory…` + `Prisma…`, DI theo `PERSISTENCE` |
| Upsert theo khoá tự nhiên | `apps/api/src/groups/prisma-group-participants.repository.ts:24` | `where: { platform_chatId: { platform: 'zalo', chatId } }` |
| Lỗi nghiệp vụ | `apps/api/src/groups/prisma-group-participants.repository.ts:12` | class Error riêng, controller map sang HTTP |
| Log tiếng Việt không dấu | `apps/api/src/ingest/zca-listener.ts:87` | `this.logger.warn('Bo qua nhom zca chua map...')` |
| Chống lặp trong tiến trình | `apps/api/src/ingest/zca-listener.ts:31` `announced: Set` | cache in-memory để không lặp việc mỗi tin |
| Ghi audit | `apps/api/src/channels/zalo.controller.ts:87` | `audit.append({ actor, action, entityType, entityId, before, after })` |
| Phản hồi UI có tone | `apps/web/components/settings/SettingsPanelState.tsx` | `tone="success" \| "error"`, `role=status/alert` |
| Test | `*.spec.ts` cạnh file nguồn, Vitest, AAA | `apps/api/src/ingest/bot-poller.spec.ts` |
| Migration | `apps/api/prisma/migrations/20260803102000_operator_settings/` | `<timestamp>_<snake_name>/migration.sql` |

---

## Giai đoạn 1 — Tự phát hiện nhóm + lưu tin trước, lọc parser sau

Gỡ I1. Đây là nền của cả ba giai đoạn sau: sau P1, mọi nhóm allowlist đều **có hàng
`Group`** trong DB (trạng thái `pending`), nên UI có cái để hiện và P3 có chỗ gắn
thành viên.

### Files

| File | Action | Why |
|---|---|---|
| `apps/api/src/groups/group-discovery.service.ts` | CREATE | upsert `Group` theo `platform_chatId`: `status=pending`, `source=auto_suggest`, `lastSeenAt=now` |
| `apps/api/src/groups/group-discovery.service.spec.ts` | CREATE | test: không hạ cấp nhóm đã `mapped`; throttle; nuốt lỗi |
| `apps/api/src/groups/group-participants.module.ts` | UPDATE | provide + export `GroupDiscoveryService` |
| `apps/api/src/pipeline/pipeline.service.ts` | UPDATE | thêm `intake()` trả kết quả có nhãn; cổng "đã map" chuyển xuống **sau** `saveMessage` |
| `apps/api/src/pipeline/pipeline-intake.spec.ts` | CREATE | test 4 outcome |
| `apps/api/src/ingest/zca-listener.ts` | UPDATE | bỏ cổng `knowledge.groups()`; gọi `intake`; map outcome → guard |
| `apps/api/src/ingest/bot-poller.ts` | UPDATE | như trên |
| `apps/api/src/ingest/zca-listener.spec.ts` · `bot-poller.spec.ts` | UPDATE | khẳng định tin nhóm chưa map **có** được lưu |

### Task 1.1 — `GroupDiscoveryService.observe(chatId)`

- **Action**: upsert `Group` theo `{ platform: 'zalo', chatId }`.
  `create` → `status: 'pending'`, `source: 'auto_suggest'`, `lastSeenAt: now`.
  `update` → **chỉ** `lastSeenAt`. Tuyệt đối không đụng `status`, `dealerId`, `name`.
- **Throttle**: `Map<chatId, number>` trong bộ nhớ, bỏ qua nếu đã ghi trong
  `GROUP_SEEN_THROTTLE_MS = 5 * 60_000`. zca đọc *mọi* tin nên không throttle là
  mỗi tin một lượt ghi DB.
- **Không lấy tên nhóm ở đây**: tin nhắn không mang tên nhóm, và gọi
  `zca.getGroupInfo` mỗi tin là lãng phí. Tên hiển thị đã có sẵn từ
  `settings-query.service.ts:104` (ghép nhóm sống ↔ hàng DB); tên chỉ được **ghi**
  khi người vận hành chọn đại lý ở P2.
- **Lỗi ⇒ nuốt + log warn** (I6).
- **Mirror**: `announced: Set` trong `zca-listener.ts:31`; upsert khoá tự nhiên ở
  `prisma-group-participants.repository.ts:24`.
- **Validate**: `pnpm --filter @netviet/api test -- group-discovery`

### Task 1.2 — `PipelineService.intake()`

```ts
export type IntakeOutcome = 'processed' | 'stored_only' | 'duplicate' | 'ignored';
export interface IntakeResult { outcome: IntakeOutcome; view?: OrderView }
```

- **Action**: thứ tự bắt buộc —
  1. tra participant → `handlingMode === 'ignore'` ⇒ `{ outcome: 'ignored' }`
  2. `saveMessage(message)` — **luôn chạy**
  3. `saved?.duplicate` ⇒ `{ outcome: 'duplicate' }`
  4. `groupDiscovery.observe(chatId)`
  5. nhóm **chưa** map trong `knowledge.groups()` ⇒ log warn + `{ outcome: 'stored_only' }`
     — tin đã nằm trong DB, chỉ không sang parser
  6. orchestrator + auto-send ⇒ `{ outcome: 'processed', view }`
- `process()` giữ nguyên chữ ký cho `DemoController` và đường rerun; phần chung tách
  ra private `runPipeline()` để không nhân đôi logic.
- **Cần inject thêm**: `@Optional() knowledge?: KnowledgeService`,
  `@Optional() groupDiscovery?: GroupDiscoveryService`. Không có ⇒ coi như mọi nhóm
  đều được xử lý (giữ hành vi test/mock hiện tại).
- **Validate**: `pnpm --filter @netviet/api test -- pipeline-intake`

### Task 1.3 — Hai listener dùng `intake`

- **Action**: bỏ khối `knowledge.groups().some(...)` ở
  [zca-listener.ts:83](apps/api/src/ingest/zca-listener.ts:83) và
  [bot-poller.ts:110](apps/api/src/ingest/bot-poller.ts:110). Giữ nguyên cổng
  allowlist zca ở dòng 80.
- Map outcome → guard, **sửa luôn lỗi tiềm ẩn I5**:

  | outcome | guard | auto-ack |
  |---|---|---|
  | `processed` | `complete` | theo `shouldAutoAck` |
  | `stored_only` · `duplicate` · `ignored` | `complete` (cố ý, không chạy lại) | không |
  | ném lỗi hết lượt retry | `release` | không |

- **Mirror**: bảng phân nhánh hiện có ở `zca-listener.ts:96-110`.
- **Validate**: `pnpm --filter @netviet/api test -- zca-listener bot-poller`

---

## Giai đoạn 2 — Chọn đại lý ngay trên bảng nhóm (hết gõ chatId)

### Files

| File | Action | Why |
|---|---|---|
| `apps/api/src/settings/group-mapping.service.ts` | CREATE | upsert theo `platform_chatId`; `dealerId` có ⇒ `status=mapped`, bỏ ⇒ `pending`; ghi audit |
| `apps/api/src/settings/group-mapping.service.spec.ts` | CREATE | test |
| `apps/api/src/settings/settings.controller.ts` | UPDATE | `PUT /settings/groups/:chatId/mapping` |
| `apps/web/lib/settings.ts` | UPDATE | `settingsApi.setGroupMapping`, kiểu `SettingsGroupSummary.status` |
| `apps/web/components/settings/ZaloSettings.tsx` | UPDATE | cột "Đại lý" đổi từ text sang `<select>`; `SettingsPanelState tone="success"` sau khi lưu |
| `apps/web/app/settings/settings.css` | UPDATE | style select trong bảng |
| `apps/web/e2e/settings.spec.ts` | UPDATE | luồng: chọn đại lý → hiện xác nhận → nút Đồng bộ bật |
| `deploy/netviet/Caddyfile` + `caddy-route-contract.test.mjs` | UPDATE | `/settings/groups*` đã nằm trong `@api`? — **kiểm tra**, `/settings/summary` đang liệt kê rời từng path |

### Task 2.1 — Endpoint

- **Action**: `PUT /settings/groups/:chatId/mapping`, body
  `{ dealerId: string | null, name?: string, branch?: string }`.
  Upsert `Group` theo `platform_chatId`. `dealerId` không tồn tại ⇒ 400 (mirror
  `source-truth-write.service.ts:184` kiểm SKU). Ghi `AuditLogService` với
  `before`/`after` như `zalo.controller.ts:87`.
- **`name`**: UI gửi kèm tên nhóm nó đang hiển thị (lấy từ zca) ⇒ hàng `Group` có tên
  thật mà không tốn thêm request Zalo.
- **Validate**: `pnpm --filter @netviet/api test -- group-mapping`

### Task 2.2 — Dropdown trong bảng nhóm

- **Action**: `ZaloSettings` fetch danh sách đại lý
  (`useQuery(['settings-source-truth','dealers'])`), render `<select>` ở cột
  "Đại lý đang map". `onChange` ⇒ mutation ⇒ `invalidateQueries(['settings-summary'])`.
- Nhóm `pending` hiện nhãn "Chưa map — chọn đại lý để bắt đầu xử lý"; sau khi chọn
  hiện `SettingsPanelState tone="success"` (mirror khối `syncMutation.isSuccess` ở
  `ZaloSettings.tsx:112`).
- Nút "Đồng bộ" chỉ bật khi `allowed && status === 'mapped'`.
- **Validate**: `pnpm --filter @netviet/web test && pnpm --filter @netviet/web exec playwright test settings`

---

## Giai đoạn 3 — Học thành viên từ luồng tin (gỡ bế tắc `getGroupInfo`)

### Files

| File | Action | Why |
|---|---|---|
| `apps/api/prisma/schema.prisma` | UPDATE | `enum ParticipantSource { zca_sync manual message_stream }` |
| `apps/api/prisma/migrations/<ts>_participant_message_stream/migration.sql` | CREATE | `ALTER TYPE "ParticipantSource" ADD VALUE 'message_stream';` |
| `packages/shared/src/group-participant.ts` | UPDATE | `PARTICIPANT_SOURCES` += `message_stream` |
| `apps/api/src/groups/group-participants.repository.ts` | UPDATE | `abstract recordSeen()` + impl in-memory |
| `apps/api/src/groups/prisma-group-participants.repository.ts` | UPDATE | impl Prisma |
| `apps/api/src/groups/*.spec.ts` | UPDATE | test I2–I4 |
| `apps/api/src/pipeline/pipeline.service.ts` | UPDATE | gọi `recordSeen` trong `intake` |
| `apps/web/lib/settings.ts` | UPDATE | kiểu + `enumValue` cho source mới |
| `apps/web/components/settings/ParticipantsSettings.tsx` | UPDATE | badge nguồn + cột "Nhắn gần nhất" |

### Task 3.1 — `recordSeen(externalChatId, profile, seenAt)`

- **Action**: upsert theo `(groupId, externalUserId)`.
  - `create`: `displayName`, `active: true`, `source: 'message_stream'`,
    `lastSeenAt`, `syncedAt`, phân loại để **mặc định**
    (`unknown` / `unknown` / `inherit_group`).
  - `update`: **chỉ** `displayName`, `lastSeenAt`, `active: true`.
    Không đụng `source`, không đụng 3 trường phân loại (I3, I4).
- Không tìm thấy hàng `Group` ⇒ trả `null`, **không ném** (I6). Sau P1 tình huống này
  gần như không xảy ra, nhưng bản mock/CI không có discovery.
- Không bao giờ `updateMany({ active: false })` — khác hẳn `synchronize` (I2).
- **Mirror**: `synchronize` ở `prisma-group-participants.repository.ts:20`, bỏ phần
  `if (input.complete)`.
- **Validate**: `pnpm --filter @netviet/api test -- group-participants`

### Task 3.2 — Nối vào pipeline

- **Action**: trong `intake`, sau bước 3 (không trùng) và trước orchestrator, nếu có
  `senderExternalId` thì `void participants.recordSeen(...)` — chạy song song, lỗi chỉ log.
- Chạy cho **cả** `stored_only` lẫn `processed`: người nhắn trong nhóm chưa map vẫn
  đáng được ghi nhận (chỉ nội dung mới bị chặn khỏi LLM, danh tính thì không).
- **Validate**: `pnpm --filter @netviet/api test -- pipeline-intake`

### Task 3.3 — UI phân biệt nguồn

- **Action**: `ParticipantsSettings` thêm badge: `Đồng bộ Zalo` (`zca_sync`) ·
  `Học từ tin nhắn` (`message_stream`) · `Người vận hành đặt` (`manual`), kèm cột
  "Nhắn gần nhất" (`lastSeenAt`).
- Vì `getGroupInfo` đang hỏng, đây sẽ là **nguồn duy nhất** người vận hành nhìn thấy —
  phải nói rõ danh sách này là "những người đã nhắn", không phải "toàn bộ nhóm".
- **Validate**: `pnpm --filter @netviet/web test`

---

## Giai đoạn 4 — Bot Platform tuân allowlist trong hybrid

### Task 4.1

- **Action**: thêm hàm thuần vào `bot-poller.ts`:

  ```ts
  export function shouldAcceptBotMessage(
    message: ChannelMessage,
    ctx: { mode: AppEnv['CHANNEL_MODE']; isAllowed: (chatId: string) => boolean; allowlistActive: boolean },
  ): boolean
  ```

- **Quy tắc**: `mode === 'hybrid' && allowlistActive` ⇒ bắt buộc nằm trong allowlist zca.
  `mode === 'bot'` thuần (không có phiên zca ⇒ allowlist rỗng) ⇒ giữ nguyên hành vi cũ,
  **không** chặn — nếu không sẽ chết cả kênh bot.
- Cần inject `ZaloUserClient` vào `BotPoller` (`@Optional()`).
- **Mirror**: `isAllowedBotMessage` ngay trên nó (`bot-poller.ts:33`).
- **Validate**: `pnpm --filter @netviet/api test -- bot-poller`

---

## Validation

```bash
pnpm --filter @netviet/shared build && pnpm -r typecheck && pnpm -r test && pnpm lint
```

```bash
pnpm --filter @netviet/api exec prisma migrate dev --name participant_message_stream
```

Kiểm thật sau khi deploy (nhóm test, không PII):

1. Nhắn 1 tin vào nhóm **chưa map** → `GET /messages` phải **có** tin đó; log ghi `stored_only`.
2. `/settings` → nhóm đó hiện trạng thái "Chưa map" → chọn đại lý → xác nhận xanh.
3. Nhắn tiếp 1 tin → tab "Nhóm & thành viên" hiện người vừa nhắn, badge "Học từ tin nhắn".
4. Phân loại người đó thành `dai_ly` → nhắn lại → phân loại **không** bị ghi đè.

## Risks

| Rủi ro | Khả năng | Giảm thiểu |
|---|---|---|
| P1 sửa hợp đồng guard/retry sai ⇒ **mất tin** hoặc chạy lại vô hạn | Trung bình | Test đủ 4 outcome + đường ném lỗi trước khi sửa listener; đây là task rủi ro cao nhất |
| Lưu tin của nhóm chưa map ⇒ nhiều PII hơn trong DB | Cao (chắc chắn xảy ra) | Nhóm đã nằm trong allowlist do người vận hành tự chọn; nội dung **không** rời máy chủ (không sang DeepSeek). **Cần báo khách** vì đây là thay đổi phạm vi lưu trữ |
| `ALTER TYPE … ADD VALUE` trên Postgres không chạy trong transaction | Trung bình | Prisma tách sẵn; kiểm trên DB docker trước khi lên VM |
| `Group.lastSeenAt` ghi mỗi tin ⇒ tải DB | Thấp | Throttle 5 phút/nhóm |
| Danh sách "học từ tin nhắn" bị hiểu nhầm là danh sách nhóm đầy đủ | Cao | Task 3.3 bắt buộc: badge nguồn + câu giải thích |
| `recordSeen` đè phân loại của người vận hành | Thấp nhưng hậu quả nặng | I3/I4 là test, không phải quy ước |
| Deploy trùng lượt như 04/08 | Thấp | `flock` đã có ở cả 4 đường ghi compose |

## Acceptance

- [ ] I1–I6 mỗi bất biến có ít nhất một test tên nói đúng hành vi
- [ ] Tin từ nhóm allowlist-nhưng-chưa-map có mặt trong DB (kiểm thật, không chỉ unit test)
- [ ] Không còn chỗ nào bắt người vận hành gõ `chatId`; log "copy ID này vào seed.ts" bị xóa
- [ ] Tab thành viên dùng được với dữ liệu Zalo thật dù `getGroupInfo` vẫn rỗng
- [ ] `pnpm -r test` xanh, không giảm so với mốc 04/08 (API 315 pass / 21 skip · shared 64 · web 27 · route 7)
- [ ] `docs/ke-hoach/tong-quan.md` cập nhật trạng thái; mục "bế tắc danh sách thành viên" chuyển sang "đã có đường vòng"
