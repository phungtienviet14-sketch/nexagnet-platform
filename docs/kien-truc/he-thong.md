# SƠ ĐỒ & THIẾT KẾ KỸ THUẬT — NỀN TẢNG AI AGENT ĐA KHÁCH

> **Vai trò tài liệu:** bản KỸ THUẬT hợp nhất — toàn bộ **sơ đồ hệ thống (12 sơ đồ Mermaid)** + **quyết định thiết kế đã chốt** + **phụ lục bằng chứng PoC**. Xem trên GitHub hoặc VS Code (extension Markdown Preview Mermaid).
> **Hợp nhất 11/07/2026:** nuốt trọn `thiet-ke-ky-thuat-hop-nhat.md` (quyết định kỹ thuật — §2/§3/§15) và 2 tài liệu PoC `poc-zalo-bot.md`, `poc-parser.md` (→ Phụ lục A/B) — 3 file gốc đã xóa, git history còn.
> **Đối chiếu code/yêu cầu 12/08/2026:** base đa khách đã tách tenant; lát cắt P1 auto-confirm đã khớp sơ đồ (`sent` + handoff Sale, không gọi ERP). Bảng sai lệch còn lại ở [nghiệp vụ Ultty](../khach-hang/ultty/nghiep-vu/mo-ta-nghiep-vu.md).
> Nghiệp vụ + sai lệch nguồn gốc: [nghiệp vụ Ultty](../khach-hang/ultty/nghiep-vu/mo-ta-nghiep-vu.md) · Kế hoạch + trạng thái: [tổng quan](../phat-trien/ke-hoach/tong-quan.md).

**Mục lục:** §1 Bối cảnh · §2 Quyết định kỹ thuật · §3 Ma trận kênh Zalo · §4 Kiến trúc 6 tầng · §5 Bản đồ module · §6 Luồng 1 đơn hàng · §7 Pipeline chi tiết · §8 Vòng đời đơn · §9 Bảy intent · §10 Nguồn sự thật động · §11 Realtime SSE · §12 ERD · §13 Runtime & cờ env · §14 Chọn kênh · §15 Tích hợp, KPI, bảo mật, rủi ro · Phụ lục A/B (PoC).

---

## 1. Bối cảnh tổng thể (ai dùng, hệ thống nói chuyện với gì)

```mermaid
flowchart LR
    DL["👥 Đại lý / CTV<br/>(200-300 đối tác)"]
    GRP["💬 ~200-350 nhóm Zalo"]
    SALE["🧑‍💼 Sale<br/>(can thiệp ngoại lệ + nhập ERP thủ công)"]
    KT["🧾 Kế toán"]

    subgraph SYS["🤖 Hệ thống AI Agent (NetViet vận hành - cloud)"]
        CONSOLE["🖥️ Console điều hành (demo)<br/>· 📱 PWA 5 tab (hướng sản phẩm)"]
        API["⚙️ Backend NestJS"]
    end

    FLOW["🔀 Flowise Agentflow V2<br/>(chỉ adapter gọi LLM)"]
    LLM["🧠 LLM (pilot: DeepSeek TEST<br/>production PII: Claude)"]
    KV["📦 ERP tenant<br/>(GĐ1: chưa tích hợp)"]
    BASE["🗂️ Base<br/>(duyệt + giao vận)"]
    SHIP["🚚 Aha / Viettel"]

    DL -->|"nhắn đặt hàng<br/>(viết tắt, không dấu)"| GRP
    GRP -->|"GĐ1 hybrid: có native @mention → Bot Platform<br/>không tag Bot → zca · dán tay = dự phòng"| API
    API -->|"FlowiseParser (1 request/tin)"| FLOW
    FLOW -->|"1 lần LLM · structured output"| LLM
    API --> CONSOLE
    SALE -->|sửa đơn vượt ngưỡng/lỗi<br/>+ nhận việc nhập ERP| CONSOLE
    API -->|"đơn đủ điều kiện: gửi tự động<br/>đơn ngoại lệ: Sale xác nhận trước"| GRP
    SALE -.->|"GĐ1: nhập tay"| KV
    API -.->|"GĐ2: format dán / API<br/>(chưa có code)"| BASE
    BASE --> SHIP
    KT -->|kiểm tra khi lên hệ thống| KV
```

**Đọc sơ đồ:** đại lý có thể nhắn như hiện tại; hybrid bảo đảm chỉ một nhánh vào pipeline. Rules engine quyết định số. Đơn đủ dữ liệu có tổng số lượng trong ngưỡng tenant được gửi xác nhận ngay khi kill switch cho phép; đơn vượt ngưỡng/lỗi chuyển Sale trước gửi. Sau outbound thành công, hệ thống tạo hàng việc Sale nhập ERP thủ công. `AUTO_SEND` là kill switch, không chứa ngưỡng/policy tenant.

---

## 2. Quyết định kỹ thuật đã chốt

*(gốc: `thiet-ke-ky-thuat-hop-nhat.md` v1.0 06/07 — hợp nhất vào đây 11/07/2026; khi nguồn khác nhau, bảng này là quyết định cuối cho phần kỹ thuật)*

| Hạng mục | Quyết định | Ghi chú |
|---|---|---|
| Kiến trúc 6 tầng, intent taxonomy, luồng chính sách/bảo hành, checklist chốt đơn | Theo NetViet (`docs/khach-hang/ultty/nguon-goc/de-xuat-giai-phap-netviet.md` §3, §5 — giữ nguyên) | Nghiệp vụ không đổi |
| Lộ trình 3 giai đoạn, KPI, managed service | Theo NetViet (§6, §7) | Sơ đồ lộ trình: [tổng quan](../phat-trien/ke-hoach/tong-quan.md) |
| Stack | TypeScript (Node 22) · NestJS · Next.js · PostgreSQL + **Prisma 6 (pin, KHÔNG nâng v7** — `@adminjs/prisma` chưa hỗ trợ) · Flowise 3.1.4 · Claude/DeepSeek API · monorepo pnpm | BullMQ/Redis có trong stack nhưng **chưa dùng** (YAGNI — thêm khi pipeline thật sự cần queue) |
| Kênh Zalo GĐ1 | **Hai Bot cùng nhóm qua `CHANNEL_MODE=hybrid`** (03/08/2026): native @mention Bot chính thức → Bot Platform; không tag Bot → zca. Các mode đơn `mock\|bot\|zca` vẫn giữ để rollback/test | `getMe` lấy Bot UID; zca so metadata `mentions[].uid`, bỏ tin do Bot chính thức gửi; không lấy được UID thì zca fail-closed. Điều kiện zca: **tài khoản phụ** + **văn bản chấp nhận rủi ro** |
| Multi-agent 6 vai | 6 vai chuyên trách **dưới 1 orchestrator, dùng chung 1 lần gọi LLM/tin** (Router parse) — KHÔNG phải 6 LLM độc lập | Chi phí như 1 orchestrator; rules engine tính tiền |
| LLM vs rules | **LLM không tính tiền, không quyết chính sách** — chỉ phân loại intent + trích xuất + soạn văn bản; giá/ship/VAT/chính sách do rules engine TS tất định tính từ nguồn sự thật | Nguyên tắc bất di bất dịch |
| Dify → Flowise | NestJS giữ orchestrator; `FlowiseParser` gọi Agentflow `zalo-order-parser-v1` chỉ gồm form input + một LLM structured output. Không tool/code/memory/MCP/callback vào NestJS | `PARSER_MODE=deepseek` được giữ để rollback; D18a-c ở kế hoạch tổng quan |
| Cách ly khách v1 | Một Compose stack + DB/user/secret/volume/network riêng cho mỗi dự án; chưa cần `tenantId` khi không dùng chung DB | Stack đầu: `/srv/netviet/apps/zalo-ultty` |
| ERP/kho | KHÔNG xây module kho riêng. GĐ1 không gọi ERP; Sale nhập tay. Khi tích hợp sau này, ERP tenant là source of truth tồn kho | 10-20 đơn/ngày không cần cache |
| Lưu trữ | Mặc định **in-memory** (`PERSISTENCE=memory` — demo/CI không cần DB); bật Postgres bằng `PERSISTENCE=prisma` (cờ riêng, tách khỏi `DATABASE_URL`) | as-built Phase 3 |
| Nguồn sự thật ĐỘNG | Trang **`/settings`** cho người vận hành (6 tab: Kênh Zalo · Nhóm & thành viên · Đại lý/SP/giá · Rules · Tự động hóa · Lịch sử) + panel **`/admin`** (AdminJS auto-CRUD, power-user) + **MCP tool** (8 tool) — tất cả đi qua một `SourceTruthWriteService` (transaction → audit → reload snapshot) | Thay cho tab "Prompt AI" của PWA trong thiết kế cũ; `/settings` là mặt chính, `/admin` giữ làm fallback |
| Policy GĐ1 theo tenant | Auto-confirm ceiling inclusive · ERP mode · retail advice field/qualifier · campaign window/spacing/max-target là runtime config có audit | Không hard-code 50/tên khách trong base; `AUTO_SEND` chỉ kill switch |
| Campaign CSKH | Năng lực base: draft → approved → scheduled → running → completed/partially_failed/cancelled; delivery được phân bổ trong cửa sổ và claim bền vững | Không dùng broadcast `for + sleep` trong HTTP request |
| Drive/content | Binary gốc ở Drive/object storage; provenance, mapping SP, FAQ, link catalog/video, nội dung tư vấn và readiness ở DB/config + `/settings` | Inventory 12/08: 122 folder/825 file; thiếu T8 và promo formula |
| App Sale | Demo = **console PC 3 cột** (Feed · 6-agent theater SSE · Nguồn sự thật); PWA mobile 5 tab theo `docs/khach-hang/ultty/thiet-ke-giao-dien/` = hướng sản phẩm, làm sau | Quyết định treo D3 |

---

## 3. Kênh Zalo — ma trận 4 phương án

| Phương án | Chính thức | Đọc tin nhóm | Chi phí | Vị trí trong lộ trình |
|---|---|---|---|---|
| **A. Co-pilot / dán tay** (Sale dán tin vào app) | ✅ Không đụng ToS | Thủ công | 0đ | **Fallback vĩnh viễn** (khi zca lỗi/khóa) |
| **B. Zalo Bot Platform** (bot.zapps.me, Beta) | ✅ | **CHỈ tin @mention** (mention-gating gốc Zalo, không tắt được — Phụ lục A) | 0đ (Premium chưa công bố) | Kênh phụ — bật khi đại lý chịu tag bot (quyết định D2) |
| **C. Zalo OA + GMF** | ✅ | Tự động (API đầy đủ) | ~25-300k/tháng/nhóm × 200-350 nhóm + gói OA | GĐ2-3: OA cho CSKH 1:1 + ZNS; GMF chỉ khi khách chịu chi phí |
| **D. zca-js (userbot)** | ❌ vi phạm ToS | **Tự động — thấy MỌI tin nhóm**; ở hybrid tự nhường tin tag Bot chính thức | 0đ | Nhánh nhận tin không tag trong `CHANNEL_MODE=hybrid`; mode `zca` đơn giữ làm rollback |

Mọi kênh đi qua interface `ChannelAdapter` → đổi kênh không đập hệ thống. Bằng chứng PoC Bot Platform: **Phụ lục A**.

---

## 4. Kiến trúc 6 tầng (NetViet) → module code thực tế

```mermaid
flowchart TB
    subgraph L1["Tầng 1 — Kênh (channels/) — chọn qua CHANNEL_MODE"]
        CA["ChannelAdapter (interface: gửi)"]
        ZCA["ZcaAdapter<br/>(zca-js — kênh chính)"]
        BOT["BotPlatformAdapter<br/>(@mention — kênh phụ)"]
        MOCK["MockAdapter (offline/CI)"]
        COP["Co-pilot dán tay<br/>(fallback — qua /demo/simulate)"]
        CA --- ZCA
        CA --- BOT
        CA --- MOCK
        CA --- COP
    end

    subgraph L2["Tầng 2 — Tiếp nhận (ingest/)"]
        LIS["ZcaListener (nghe mọi tin nhóm)<br/>/ BotPoller (@mention)"]
        IDENT["Gán danh tính:<br/>nhóm → đại lý/CTV (theo chatId)"]
        SAVE["Lưu messages ngay khi nhận<br/>trước parser · chống trùng · retry tối đa 3 lượt"]
    end

    subgraph L3["Tầng 3 — Lõi AI (pipeline/ + agents/)"]
        ORCH["AgentOrchestrator — Router qua OrderParser<br/>FlowiseParser = 1 structured LLM call<br/>→ dispatch 6 vai chuyên trách → Giám sát"]
    end

    subgraph L4["Tầng 4 — Luật nghiệp vụ (rules/) — TypeScript tất định, KHÔNG dùng LLM"]
        PRICE["Giá sỉ (wholesale) + deal riêng"]
        SHIPR["Phí ship<br/>(TH1 miễn / ≥2 SP miễn / Grab / Viettel)"]
        POL["Chính sách: công nợ 30-45<br/>ký gửi / trả ngay / COD"]
        VAT["VAT (mặc định off) + format TH1/TH2"]
    end

    subgraph L5["Tầng 5 — Tích hợp (erp/)"]
        XLS["GĐ1: ErpPort KHÔNG được gọi<br/>Sau GĐ1: adapter Excel/API"]
        APIS["GĐ2: Base API, vận đơn<br/>(chưa có code)"]
    end

    subgraph L6["Tầng 6 — Dữ liệu & quản trị"]
        KNOW["knowledge/ — NGUỒN SỰ THẬT<br/>(SEED in-memory hoặc Postgres/Prisma)<br/>19 SKU, bảng giá, 24 glossary, map nhóm"]
        ADMIN["/admin (AdminJS) + MCP tool<br/>sửa nguồn sự thật ĐỘNG"]
        ORD["orders/ (trạng thái + duyệt)"]
        MET["metrics/ — KPI (GĐ sau, chưa có)"]
        AUTH["auth/ — phân quyền + audit (GĐ sau, chưa có)"]
        ADMIN -.->|"ghi + reload()"| KNOW
    end

    L1 --> L2 --> L3 --> L4 --> L5
    KNOW -.->|"ngữ cảnh cho AI"| ORCH
    KNOW -.->|"số liệu cho rules"| L4
    L4 --> ORD
    ORD --> MET
```

**Điểm mấu chốt:** tầng 3 (AI) chỉ *hiểu và soạn*; tầng 4 (rules) mới *tính tiền và áp chính sách* — từ nguồn sự thật ở tầng 6. AI sai thì validation + Sale chặn; số tiền không bao giờ do AI "đoán".

---

## 5. Bản đồ module & phụ thuộc (as-built)

```mermaid
flowchart LR
    subgraph APIAPP["apps/api — NestJS"]
        MAIN["main.ts<br/>validate env → AppModule.forRoot()"]
        ING2["ingest/<br/>ZcaListener · BotPoller"]
        PIP2["pipeline/<br/>PipelineService + OrderParser<br/>(mock · deepseek · claude · flowise)"]
        AGE2["agents/<br/>AgentOrchestrator · risk-rules<br/>AgentEventsService"]
        RUL2["rules/ — thuần TS, pure"]
        KNO2["knowledge/<br/>KnowledgeService · seed · repo"]
        ORD2["orders/<br/>OrdersService · repo"]
        CHA2["channels/<br/>ChannelAdapter (Zca·Bot·Mock)"]
        KIO2["erp/ (port + mock cho phase sau)"]
        BRO2["broadcast/ (gửi tay as-built)"]
        STR2["stream/ — SSE /events"]
        DEM2["demo/ — simulate · rerun · config"]
        ADM2["admin/ — AdminJS /admin<br/>(chỉ khi ADMIN_UI=on + prisma)"]
    end
    MCP2["mcp/server.ts — tiến trình RIÊNG<br/>8 tool nguồn sự thật"]
    WEB2["apps/web — console Next.js"]
    SHA2["packages/shared — zod schemas + types<br/>(hợp đồng chung api ⇄ web ⇄ tools)"]
    PG2[("Postgres<br/>chỉ khi PERSISTENCE=prisma")]
    FLO2["Flowise 3.1.4<br/>zalo-order-parser-v1"]
    LLM2["DeepSeek / Claude API"]

    MAIN --> ING2
    ING2 --> PIP2 --> AGE2
    PIP2 -->|"PARSER_MODE=flowise"| FLO2
    FLO2 -->|"1 structured LLM call"| LLM2
    AGE2 --> RUL2
    AGE2 --> KNO2
    AGE2 --> ORD2
    PIP2 -->|"policy tenant + AUTO_SEND: sendConfirmation"| ORD2
    DEM2 --> PIP2
    ORD2 --> CHA2
    ORD2 -.->|"sau GĐ1"| KIO2
    BRO2 --> CHA2
    BRO2 --> KNO2
    AGE2 --> STR2
    KNO2 --> PG2
    ORD2 --> PG2
    ADM2 --> PG2
    MCP2 --> PG2
    MCP2 -.->|"POST /knowledge/reload"| KNO2
    WEB2 -->|REST| DEM2
    WEB2 -->|SSE| STR2
    SHA2 -.-> APIAPP
    SHA2 -.-> WEB2
```

Console web hiện gọi REST `/orders` · `/messages` · `/knowledge/*` · `/broadcast`; tab KiotViet đã ẩn khỏi console GĐ1. Route `/kiotviet/*` và mock adapter còn trong code cho dữ liệu legacy/bề mặt phase ERP tương lai nhưng không nằm trong luồng xác nhận đơn. Target GĐ1 thay gửi trực tiếp `/broadcast` bằng API campaign bền vững.

---

## 6. Luồng xử lý 1 đơn hàng GĐ1 (tự xác nhận có kiểm soát, không ERP)

```mermaid
sequenceDiagram
    autonumber
    actor DL as Đại lý (nhóm Zalo)
    actor S as Sale (console)
    participant IN as Ingest
    participant AI as AgentOrchestrator (Router + 6 vai)
    participant FL as Flowise Agentflow V2
    participant RU as Rules engine
    participant ST as Lưu trữ (in-memory / Postgres)

    DL->>DL: "gui 10 ghe felix ve TN cho c, ko lay VAT"

    alt CHANNEL_MODE=zca (kênh chính GĐ1)
        DL-->>IN: zca đọc mọi tin nhóm (KHÔNG cần tag)
    else CHANNEL_MODE=bot / dán tay
        DL-->>IN: Bot nhận tin @mention / Sale dán qua console
    end

    IN->>ST: Lưu message thô TRƯỚC xử lý<br/>chống trùng externalMessageId
    IN->>AI: Đưa vào pipeline
    AI->>ST: Lấy ngữ cảnh: nhóm→đại lý Meta HN,<br/>19 SKU, glossary (TN=Thái Nguyên)
    AI->>FL: FlowiseParser gửi form + ngữ cảnh đóng
    FL->>FL: 1 lần LLM, structured output<br/>không tool/memory/callback
    FL-->>AI: parseResultSchema: intent=dat_don<br/>10 x Ghế Felix, giao TN, không VAT
    AI->>RU: JSON đơn thô
    RU->>ST: Tra giá sỉ + deal riêng + phí ship + chính sách
    RU->>RU: Validation: SKU/giá/đại lý đủ?<br/>tổng lệch? tổng SL ≤ ngưỡng tenant?
    RU->>ST: Tạo order + format xác nhận TH1
    alt đủ dữ liệu và tổng SL ≤ maxAutoConfirmQuantity
        ST->>DL: Gửi format xác nhận vào đúng nhóm (kèm nhãn tenant)
        ST->>ST: Chuyển sent; tạo SalesTask manual_erp_create
        ST-->>S: 🔔 Khách đã xác nhận — nhập ERP thủ công
    else > ngưỡng hoặc thiếu dữ liệu/validation lỗi
        ST-->>S: 🔔 needs_edit/pending_review
        S->>ST: Sửa + xác nhận trước khi gửi
        ST->>DL: Gửi sau khi Sale can thiệp
        ST->>ST: Chuyển sent; tạo SalesTask manual_erp_create
    end
    Note over ST: kpi_events — model đã có, CHƯA ghi (Phase 5)
```

---

## 7. Pipeline chi tiết trong 1 tin (định tuyến theo độ tin cậy + rủi ro)

```mermaid
flowchart TD
    IN3["Tin vào (zca / bot / dán tay / demo)"] --> ALLOW{"Nhóm trong allowlist?<br/>(hybrid: áp cho CẢ hai kênh)"}
    ALLOW -->|không| DROP0["Không đọc, không lưu"]
    ALLOW -->|có| IGN{"Người gửi để handlingMode=ignore?"}
    IGN -->|có| DROP1["ignored — người vận hành chủ động loại"]
    IGN -->|không| SAVE["LƯU TIN VÀO DB — luôn luôn<br/>(Zalo không phát lại; mất là mất hẳn)"]
    SAVE --> DEDUP{"Trùng externalMessageId?"}
    DEDUP -->|có| DROP["duplicate — bỏ qua (idempotent)"]
    DEDUP -->|không| DISC["Ghi nhận nhóm (pending/auto_suggest)<br/>+ ghi nhận NGƯỜI GỬI vào danh sách thành viên<br/>(nguồn message_stream — chạy cả khi chưa map)"]
    DISC --> MAPPED{"Nhóm đã map đại lý?<br/>(fail-closed nếu không xác minh được)"}
    MAPPED -->|chưa| STORED["stored_only — tin ĐÃ nằm trong DB,<br/>KHÔNG đưa nội dung sang parser/LLM"]
    MAPPED -->|rồi| RESOLVE["Map chatId → đại lý · chi nhánh · loại người gửi"]
    RESOLVE --> ROUTER["Điều phối (Router) — parse 1 lần:<br/>mock = regex tất định, 0 LLM<br/>deepseek/claude = gọi trực tiếp<br/>flowise = Agentflow structured output"]
    ROUTER --> ISORDER{"intent = dat_don<br/>kèm order thô?"}
    ISORDER -->|có| PRICE3["Bán hàng → rules engine tất định:<br/>map SKU (alias, không dấu) · giá sỉ/deal riêng<br/>ship · VAT · COD · format xác nhận TH1/TH2"]
    ISORDER -->|không| DRAFT3["Vai chuyên trách tra kho tri thức<br/>→ soạn draft trả lời KÈM nguồn<br/>(không có dữ liệu → nói cần Sale, không bịa)"]
    PRICE3 --> VALID3["Validation cảnh báo:<br/>SKU lạ · chưa map đại lý · tổng lệch >5%"]
    VALID3 --> SUP3
    DRAFT3 --> SUP3["Giám sát — rules tất định, 0 LLM<br/>leo thang: đơn ≥20tr · đại lý lạ · khiếu nại gắt<br/>cờ vàng: SL ≥30 · có cảnh báo · confidence <0.5"]
    SUP3 --> ELIG{"Dữ liệu/rules hợp lệ?<br/>totalQuantity ≤ ngưỡng tenant?<br/>AUTO_SEND kill switch on?"}
    ELIG -->|"không"| NE3["needs_edit/pending_review<br/>Sale can thiệp TRƯỚC gửi"]
    ELIG -->|"có"| AUTO3["Gửi xác nhận → sent<br/>+ tạo việc Sale nhập ERP thủ công"]

    style NE3 fill:#fff3cd,stroke:#997404
    style AUTO3 fill:#cfe2ff,stroke:#084298
    style SAVE fill:#d1e7dd,stroke:#0f5132
    style STORED fill:#fff3cd,stroke:#997404
```

**Thứ tự hai cổng lọc là có chủ ý (sửa 04/08/2026).** Trước đó cả hai listener chặn ngay từ đầu bằng điều kiện "nhóm đã map", nên tin của nhóm chưa map **không bao giờ được lưu** — mà Zalo không phát lại, tức mất hẳn. Nay tách rõ: **allowlist** là sự đồng ý *đọc* nhóm (điều kiện để lưu), còn **đã map đại lý** chỉ là điều kiện để đưa *nội dung* sang parser/LLM. Nhóm chưa map vẫn giữ trọn tin trong DB và vẫn góp người gửi vào danh sách thành viên; chọn đại lý ở `/settings` là chạy tiếp ngay.

`intake()` trả kết quả **có nhãn** (`processed` · `stored_only` · `duplicate` · `ignored`) dạng union phân biệt — trước đây mọi trường hợp bỏ qua đều trả `null` giống hệt lỗi thật, nên listener gọi `guard.release()` cho cả hai và tin bỏ-qua-có-chủ-ý bị xếp lịch chạy lại.

Lưới an toàn: tin thô được giữ trong PostgreSQL; timeout/401/404/429/5xx/schema sai làm lượt xử lý thất bại, ingest thử tối đa **3 lượt** rồi để vận hành chạy lại — không âm thầm đổi sang MockParser. Tiền dạng chuỗi ("11tr5", "1.150k") được ép về số trước khi validate (Phụ lục B).

---

## 8. Vòng đời đơn GĐ1 — as-built sau P1

```mermaid
stateDiagram-v2
    [*] --> pending_review: AI xử lý xong — đơn sạch
    [*] --> needs_edit: có cảnh báo / Giám sát leo thang
    pending_review --> sent: đủ điều kiện — gửi xác nhận OK
    needs_edit --> sent: Sale sửa/xác nhận — gửi OK
    pending_review --> rejected: Từ chối
    needs_edit --> rejected: Từ chối
    sent --> [*]: Sale còn work item nhập ERP thủ công
    rejected --> [*]

    note right of sent
        sent = khách đã nhận xác nhận,
        CHƯA đồng bộ ERP · gửi lỗi giữ trạng thái cũ ·
        retry idempotent, không gửi/tạo task trùng
    end note
    note left of needs_edit
        > ngưỡng hoặc thiếu dữ liệu
        luôn chuyển Sale trước outbound
    end note
```

> **As-built sau P1 12/08/2026:** `PipelineService` dùng policy tenant inclusive, không dùng toàn bộ risk làm cổng outbound; `OrdersService.sendConfirmation()` ghi `sent` + `salesHandoff` và không có dependency ERP. Hai thao tác đồng thời cùng tiến trình dùng chung một outbound đang chạy; `sent` chặn gửi/rerun lại. Sale có endpoint/UI hoàn tất handoff. Đây không phải cam kết exactly-once qua lúc process crash vì Zalo outbound chưa có idempotency key. `synced` chỉ còn cho dữ liệu legacy/phase ERP tương lai.

---

## 9. Bảy loại ý định (intent) và đường đi của từng loại

```mermaid
flowchart TD
    MSG["Tin nhắn mới"] --> INT{"Router (Điều phối)<br/>phân loại intent + danh tính"}

    INT -->|dat_don| EX["Bán hàng: trích xuất TH1/TH2<br/>→ rules → hàng đợi duyệt"]
    INT -->|hoi_gia| RAG1["Chính sách & TC: tra field giá lẻ tenant<br/>+ qualifier + validMonth + nguồn"]
    INT -->|hoi_san_pham| RAG2["Tư vấn SP: kho tri thức<br/>→ draft mô tả"]
    INT -->|chinh_sach_cong_no| RAG3["Chính sách & TC: chính sách theo đại lý<br/>→ draft điều kiện áp dụng"]
    INT -->|bao_hanh_khieu_nai| WAR["Hậu mãi: phân nhánh<br/>trong 7 ngày / ngoài 7 ngày / giao thiếu<br/>→ định tuyến kỹ thuật (handoff)"]
    INT -->|van_chuyen| SHIP2["Chính sách & TC: ETA cần API vận đơn (GĐ2)<br/>GĐ1: draft cho Sale trả lời (handoff)"]
    INT -->|khac| HUMAN["Điều phối giữ — soạn câu ghi nhận lịch sự,<br/>AI không đoán · AUTO_ACK=on thì tự nhắn ghi nhận"]

    EX --> POLICY["Policy outbound tenant:<br/>đủ dữ liệu + trong ngưỡng → gửi<br/>còn lại → Sale"]
    RAG1 --> POLICY
    RAG2 --> POLICY
    RAG3 --> POLICY
    WAR --> TECH["Nhóm kỹ thuật quyết định lỗi<br/>(AI không tự phán)"]

    style HUMAN fill:#f8d7da,stroke:#842029
    style SALE2 fill:#d1e7dd,stroke:#0f5132
```

**Nguyên tắc:** không có dữ liệu/nguồn hiện hành → handoff hoặc nói rõ thiếu, tuyệt đối không bịa/fallback tháng cũ. Quyền gửi theo loại nội dung + policy tenant; campaign luôn cần Sale duyệt nội dung trước lịch chạy.

---

## 10. Nguồn sự thật ĐỘNG (Phase 3): 2 cửa ghi, 1 lần nạp lại

```mermaid
sequenceDiagram
    autonumber
    actor SALE as Sale (trình duyệt)
    actor AG as Agent AI (Claude)
    participant ADM as Panel /admin (AdminJS)
    participant MCP as MCP server (tiến trình riêng — 8 tool)
    participant PG as Postgres (nguồn sự thật)
    participant API as API — KnowledgeService (snapshot in-memory)
    participant PL as Pipeline (tin kế tiếp)

    rect rgb(240, 248, 255)
        SALE->>ADM: CRUD 6 bảng (Dealer · Product · Price ·<br/>Override · Glossary · Group) + action "Map nhóm→đại lý"
        ADM->>PG: Ghi
        ADM->>API: refreshKnowledge() — nạp lại snapshot
    end
    rect rgb(245, 255, 245)
        AG->>MCP: gọi tool (list/upsert_dealer · map_group ·<br/>set_price · add_glossary · list_unmapped_groups…)
        MCP->>PG: Ghi (zod validate + kiểm FK, lỗi trả tiếng Việt)
        MCP-->>API: POST /knowledge/reload (best-effort)
    end
    API->>PG: loadSnapshot()
    PL->>API: đọc snapshot → tin kế tiếp thấy dữ liệu MỚI ngay
```

- Panel `/admin` chỉ mount khi `ADMIN_UI=on` **và** `PERSISTENCE=prisma` (dynamic import — chế độ memory không nạp AdminJS). Hộp thư "**nhóm chưa map**": danh sách Group mặc định lọc `status=pending`.
- MCP đọc `DATABASE_URL` trực tiếp; chạy `pnpm --filter @netviet/api mcp`.

---

## 11. Realtime: SSE 6-agent theater trên console

```mermaid
sequenceDiagram
    autonumber
    participant W as Console 3 cột (Next.js)
    participant S as GET /events (SSE)
    participant O as AgentOrchestrator

    W->>S: mở kênh SSE ngay khi vào app (tránh race)
    Note over O: tin mới vào pipeline
    O-->>W: order.created — card "đang xử lý" lên Feed
    loop 6 vai theo thứ tự (Router → … → Giám sát)
        O-->>W: agent.progress (active) rồi (done + AgentStep)
    end
    O-->>W: order.finalized — OrderView đầy đủ + AgentTrace + draft
    Note over W: Sale bấm Duyệt / Từ chối / Chạy lại
    O-->>W: order.updated — trạng thái mới
```

- Độ trễ vai Router là **thật** (LLM); các vai rules tức thì được giãn `STREAM_STEP_DELAY_MS` (mặc định 280ms, chỉ khi có client xem) cho dễ nhìn.
- `STREAM_MODE=off` → frontend quay về polling (lưới an toàn demo). AgentTrace ghi `llmCalls` (0 với mock, 1 với LLM) — minh bạch chi phí.

---

## 12. Dữ liệu chính (ERD as-built — Prisma 15 model, Phase 3)

> **Bổ sung 03/08/2026** (migration `20260803102000_operator_settings`): `GROUP_PARTICIPANTS` (thành viên
> nhóm đồng bộ bằng zca + phân loại), `RULE_CONFIG_VERSIONS` (rules typed có vòng đời
> draft → preview → active → archived) và `AUDIT_LOGS` (append-only, đã lọc secret/PII).
> `ORDERS.rule_config_version` giữ vết version rules đã dùng cho từng đơn.

```mermaid
erDiagram
    DEALERS ||--o{ GROUPS : "có nhóm"
    GROUPS ||--o{ GROUP_PARTICIPANTS : "thành viên (sync zca)"
    GROUPS ||--o{ MESSAGES : ""
    MESSAGES ||--o{ ORDERS : "AI trích xuất ra"
    ORDERS ||--|{ ORDER_ITEMS : ""
    PRODUCTS ||--o{ ORDER_ITEMS : ""
    PRODUCTS ||--o| PRICES : "1 bảng giá/SKU"
    PRODUCTS ||--o{ DEALER_PRICE_OVERRIDES : "deal riêng"
    DEALERS ||--o{ DEALER_PRICE_OVERRIDES : ""
    DEALERS ||--o{ ORDERS : "đặt"
    ORDERS ||--o{ PARSE_FEEDBACK : "Sale sửa → học"

    DEALERS {
        string name
        string tier "dai_ly | ctv"
        string default_policy "cong_no_30 | cong_no_45 | ky_gui | thanh_toan_ngay | cod"
    }
    GROUPS {
        string platform "zalo"
        string chat_id "map nhóm theo ID, KHÔNG theo tên"
        string status "pending | mapped | ignored (pending = tin vẫn lưu, chưa lên đơn)"
        string source "auto_suggest (tự thấy) | manual (người chọn) | import"
        datetime last_seen_at "lần cuối có tin — do GroupDiscoveryService ghi"
    }
    MESSAGES {
        string source "copilot_paste | bot_webhook | zca_listener"
        string text
        string image_url "ảnh kèm tin (nếu có)"
    }
    ORDERS {
        string status "pending_review | needs_edit | sent | rejected | synced (legacy/future)"
        string order_type "TH1 | TH2"
        json view "OrderView đầy đủ + salesHandoff (round-trip)"
        int grand_total "denormalize để truy vấn"
    }
    PRODUCTS {
        string sku "19 SKU"
        string name
    }
    PRICES {
        int wholesale "Đơn giá CTV = giá tính đơn"
        int min_retail_price "sàn đại lý bán ra"
        string valid_month "bảng giá theo tháng"
    }
    GROUP_PARTICIPANTS {
        string external_user_id "UID Zalo — unique cùng group_id"
        string customer_rank "dai_ly | ctv | khach_le | unknown — KHÔNG quyết định giá"
        string operational_role "khach_hang | sale | ke_toan | quan_ly | ksnb | bpvh | ky_thuat | unknown"
        string handling_mode "inherit_group | process | ignore | manual_review"
        bool active "false khi vắng mặt trong lần sync ĐẦY ĐỦ gần nhất"
        string source "zca_sync | manual | message_stream"
    }
    RULE_CONFIG_VERSIONS {
        int version "tăng dần"
        string status "draft | preview | active | archived — chỉ 1 active"
        json payload "schema typed, KHÔNG chứa code"
    }
    AUDIT_LOGS {
        string actor
        string action "price.update | rules.activate | participant.* | automation.auto_send…"
        json before_after "đã lọc token/cookie/SĐT/địa chỉ/UID"
    }
    PARSE_FEEDBACK {
        json ai_output
        json corrected
    }
```

Bảng độc lập (chưa nối quan hệ): `glossary_entries` (24 mục) · `users` (Phase 5 auth) · `kpi_events` (Phase 5).

> **Bảng nào ĐANG được ghi thật (31/07/2026):**
> - **Ghi rồi:** `dealers` · `groups` · `products` · `prices` · `dealer_price_overrides` · `glossary_entries` (qua seed + `/admin` + MCP), `messages` (ghi trước pipeline, chống trùng) và `orders` (khi `PERSISTENCE=prisma`; dòng đơn nằm trong cột JSON `view`, scalar denormalize để lọc).
> - **Model có, CHƯA ghi:** `order_items` (dữ liệu dòng đang nằm trong `orders.view`) · `parse_feedback` · `users` · `kpi_events` (Phase 5).
> - Các bảng thuộc **đích GĐ sau, CHƯA có model**: `conversations` · `warranty_tickets` · `policies` (điều khoản dạng bảng — hiện là enum trên dealer + rules-config) · `audit_logs`.
> Schema thật: [apps/api/prisma/schema.prisma](../../apps/api/prisma/schema.prisma). Mặc định app chạy in-memory (`PERSISTENCE=memory`).

---

## 13. Runtime & cờ môi trường

```mermaid
flowchart LR
    OP["Máy vận hành<br/>gcloud CLI"]
    SM["GCP Secret Manager"]
    AR["Artifact Registry<br/>image theo git SHA + digest"]
    GCS["GCS backup<br/>7 ngày + 4 tuần"]
    LLM3["DeepSeek TEST / Claude production"]

    CUSTOMER["Khách demo<br/>HTTPS · KHÔNG xác thực (dev/demo)"]
    OPERATOR["Operator<br/>HTTPS · KHÔNG xác thực (dev/demo)"]

    subgraph VM["GCP VM netviet · SSH chỉ qua IAP"]
        GW["Caddy gateway<br/>public 80/443<br/>loopback 8080"]
        WEBP["Console Next.js"]
        APIP["API NestJS"]
        FLOWP["Flowise 3.1.4<br/>127.0.0.1:3002"]
        PGD[("Postgres nội bộ<br/>DB/user Zalo + Flowise riêng")]
    end

    CUSTOMER -->|"demo host"| GW
    OPERATOR -->|"operator /zalo"| GW
    OP -->|"IAP tunnel dự phòng"| GW
    AR -->|"pull digest"| VM
    SM -->|"render env 0600"| VM
    GW --> WEBP
    GW -->|"REST + SSE, gắn x-api-key"| APIP
    GW -->|"Flowise host + login riêng"| FLOWP
    APIP -->|"FlowiseParser"| FLOWP
    FLOWP -->|"1 lần LLM/tin"| LLM3
    APIP --> PGD
    FLOWP --> PGD
    PGD -->|"pg_dump nightly"| GCS
```

**Cờ env quyết định hành vi** (đủ bộ: [packages/shared/src/env.ts](../../packages/shared/src/env.ts) — validate lúc boot, fail fast):

| Cờ | Giá trị (mặc định **đậm**) | Quyết định gì |
|---|---|---|
| `CHANNEL_MODE` | **mock** · bot · zca · hybrid | `hybrid`: chạy đồng thời Bot Platform + zca và định tuyến phản hồi về đúng kênh nguồn |
| `PARSER_MODE` | **mock** · claude · deepseek · flowise | Bộ não parse; `flowise` gọi Agentflow nội bộ, `deepseek` giữ làm rollback pilot |
| `PERSISTENCE` | **memory** · prisma | Lưu đơn + nguồn sự thật (memory = demo/CI không cần DB) |
| `ADMIN_UI` | **off** · on | Mount panel `/admin` (đòi thêm `PERSISTENCE=prisma`) |
| `AUTO_SEND` | **off** · on | Kill switch khởi động/runtime. Không chứa business policy; quyền đã có. Eligibility/ngưỡng nằm trong tenant config có audit; restart behavior phải rõ |
| `AUTO_ACK` | **off** · on | Tự nhắn "đã ghi nhận" khi intent=khac |
| `STREAM_MODE` | **on** · off | SSE real-time / polling |
| `ZALO_SELF_LISTEN` | **off** · on | zca có nghe tin do chính tài khoản gửi không (chống vòng lặp) |
| Flowise | `FLOWISE_BASE_URL`, `FLOWISE_FLOW_ID`, `FLOWISE_API_KEY`, `FLOWISE_TIMEOUT_MS`=30000 | Bắt buộc và fail-fast khi `PARSER_MODE=flowise`; không dùng `overrideConfig` |
| `AUTH_MODE` | **api-key** · none | **Công tắc xác thực toàn hệ thống.** `api-key`: guard `x-api-key` + kiểm `Origin` cho mutation + CORS theo `CORS_ORIGIN` + AdminJS đòi đăng nhập. `none`: **tắt cả bốn** — dùng cho VM dev/demo (VM `netviet` chạy `none` từ 04/08/2026, kèm bỏ Basic Auth ở Caddy). `none` cũng miễn luôn fail-fast "production phải có `API_KEY`" |
| Bảo vệ API | `API_KEY` | Bắt buộc khi `NODE_ENV=production` **trừ khi** `AUTH_MODE=none`; gateway nội bộ gắn header, không đưa key vào browser/query string |
| Khác | `BOT_NAME`, `ZALO_CRED_PATH`, `BROADCAST_THROTTLE_MS`, `BROADCAST_MAX_TARGETS`, `STREAM_STEP_DELAY_MS`, auth/DB/LLM/Zalo secrets | Hai biến broadcast env hiện chỉ là as-built; target campaign dùng policy tenant + scheduler/limiter bền vững |

---

## 14. Chọn kênh tiếp nhận bằng `CHANNEL_MODE`

```mermaid
flowchart TB
    subgraph HYBRID["CHANNEL_MODE=hybrid — HAI BOT CÙNG NHÓM"]
        H0["getMe → cache UID Bot chính thức"]
        H1["Tin có native @mention Bot"] --> H2["BotPoller nhận → pipeline<br/>replyChannel=bot"]
        H3["Tin không tag Bot"] --> H4["ZcaListener nhận → pipeline<br/>replyChannel=zca"]
        H0 --> H4
        H5["zca thấy mention Bot hoặc tin do Bot gửi"] --> H6["BỎ QUA — chống trùng/vòng lặp"]
        H7["Không lấy được Bot UID"] --> H8["zca FAIL-CLOSED"]
        H2 --> H9["Policy/Sale → OutboundChannelRouter<br/>gửi đúng Bot Platform"]
        H4 --> H10["Policy/Sale → OutboundChannelRouter<br/>gửi đúng tài khoản zca"]
    end

    subgraph BOTM["CHANNEL_MODE=bot — kênh phụ (chính thức)"]
        T1["Bot trong nhóm CHỈ nhận tin @mention<br/>(mention-gating gốc Zalo, không tắt được — Phụ lục A)"] --> T2["AI + rules + policy tenant"]
        T2 --> T3["Tự gửi đủ điều kiện / Sale xử lý ngoại lệ"]
    end

    subgraph MOCKM["CHANNEL_MODE=mock — offline/CI + dán tay"]
        M1["Ô 'Bơm tin thử' trên console / Sale dán tay"] --> M2["AI + rules y hệt, chỉ khác nguồn tin"]
    end

    HYBRID -.->|"zca lỗi/khóa → chỉ giữ luồng có tag"| BOTM
    HYBRID -.->|"mạng yếu / demo an toàn"| MOCKM
```

**Vì sao an toàn:** `OrderView.replyChannel` được lưu cùng đơn (`bot|zca|mock`); `OrdersService`, auto-ack và auto-send đều đi qua `OutboundChannelRouter`, không dùng một adapter toàn cục để đoán kênh. Đơn cũ thiếu `replyChannel` bị từ chối trong hybrid. Broadcast gửi thật cũng bị khóa trong hybrid tới khi UI buộc chọn kênh/chat ID rõ ràng.

**Map nhóm:** Bot Platform `chat.id` và zca `threadId` là hai ID khác nhau. Cần tạo hai bản ghi Group cùng trỏ về một Dealer. Bot Platform chỉ đưa tin nhóm đã map vào pipeline; zca còn qua allowlist operator riêng trước LLM.

Chi tiết hành vi zca as-built: bỏ tin do chính tài khoản gửi (trừ khi `ZALO_SELF_LISTEN=on`) · tin chỉ-ảnh nay được lưu và tải media bất đồng bộ khi bật store · chống trùng 2.000 id gần nhất · tự ghi nhận nhóm/người gửi · mỗi tài khoản chỉ 1 listener (mở Zalo Web cùng tài khoản → listener dừng). Trang Operator đăng xuất cục bộ dừng listener, xóa credential/QR/allowlist; không phải thu hồi phiên phía Zalo.

> **Điều kiện chặn kênh zca:** dùng **tài khoản Zalo phụ** (không dùng tài khoản Sale chính) + **văn bản chấp nhận rủi ro của khách** (vi phạm ToS Zalo, có thể bị khóa tài khoản; Luật BVDLCN 91/2025/QH15 + NĐ 356/2025).

---

## 15. Tích hợp vận hành · KPI · Bảo mật · Rủi ro

### 15.1 Tích hợp (nguyên tắc NetViet: API-first nhưng không phụ thuộc API)

| Hệ thống | Hiện tại | Kế tiếp (Phase 4 / GĐ2+) |
|---|---|---|
| ERP/KiotViet | GĐ1: **không gọi**; `OrdersService` đã bỏ dependency ERP, Sale nhập thủ công sau work item. Mock adapter chỉ còn phục vụ bề mặt demo/phase tương lai | Sau GĐ1: Excel/API + map SKU ↔ mã hàng số |
| Base | Chưa có code | GĐ1: sinh format dán tay · GĐ2: API/webhook nếu có tài liệu |
| Vận chuyển | Cước theo bảng nội bộ (tạm tính) | API vận đơn Aha/Viettel (GĐ2-3) |
| VAT | AI chuẩn bị dữ liệu (có/không VAT theo tin nhắn) — kế toán quyết | Giữ quy trình kế toán (nháp → khách kiểm → xuất) |

### 15.2 KPI (NetViet 7.1 — đo từ `kpi_events`, Phase 5 mới ghi)

| KPI | Cách đo | Mục tiêu tham chiếu |
|---|---|---|
| Tỷ lệ bóc tách đúng | đơn duyệt không sửa field / tổng đơn AI tạo | ≥90% sau GĐ1 ổn định |
| Thời gian chốt đơn TB | t(nhận tin → duyệt) | < mốc 5 phút hiện tại |
| Tỷ lệ trả lời cần sửa | draft bị sửa / tổng draft | giảm dần |
| Tỷ lệ handoff | đơn chuyển người thật / tổng | hợp lý theo độ phức tạp |

### 15.3 Bảo mật & tuân thủ

- Secrets production nằm trong Secret Manager, render file 0600; env validate lúc boot, không hardcode; phiên zca (`secrets/zalo-cred.json`) bảo mật như secret, đã gitignore.
- Dữ liệu khách (SĐT, địa chỉ, đơn) là nội bộ — **không gửi bên thứ 3** ngoài API đã thống nhất (KiotViet, Claude). DeepSeek không có DPA phù hợp cho luồng này → pilot Flowise chỉ dùng dữ liệu TEST; bản chạy thật phải dùng Claude.
- Mọi tin bot/hệ thống gửi ra đều nối nhãn lấy từ `tenant.persona.botName`; base không hard-code tên khách.
- Lưu mọi tin về DB ngay khi nhận; lỗi parser không đánh dấu đã xử lý và được retry tối đa 3 lượt.
- `ApiKeyGuard` bảo vệ toàn API ở production; pilot chỉ bind loopback/IAP. **Auth người dùng theo vai + audit log** vẫn còn thiếu trước production nhiều người dùng (Phase 5).

### 15.4 Rủi ro kỹ thuật chính

| Rủi ro | Giảm thiểu |
|---|---|
| zca vi phạm ToS → khóa tài khoản | Tài khoản phụ + văn bản chấp nhận rủi ro; Bot Platform + dán tay là fallback; `CHANNEL_MODE` đổi kênh 1 biến |
| Bot Platform mention-gating (chỉ tin @mention) | Kênh lai: bot bắt đơn có tag; phần còn lại zca/dán tay (Phụ lục A) |
| Tin gửi lúc bot/zca offline không replay | Production: webhook always-on / listener không gián đoạn + lưu mọi tin DB; Sale vẫn thấy tin trong nhóm (dán tay) |
| AI trả lời sai giá/chính sách | Rules engine tất định + RAG bắt buộc kèm nguồn + không dữ liệu thì không đoán |
| LLM/Flowise lỗi, timeout hoặc output sai schema | Ném lỗi, retry tối đa 3 lượt, giữ tin thô chưa xử lý để vận hành chạy lại; không fallback âm thầm. Rollback pilot bằng `PARSER_MODE=deepseek` |
| DeepSeek khai tử model cũ 24/07/2026 | Đã dùng `deepseek-v4-flash` (cập nhật trước hạn) |
| Flowise 3.1.4 thiếu `thinking:disabled` và không expose Agentflow structured output tại `response.json` | Image dẫn xuất từ digest khóa phiên bản, patch có source guard cho cả hai điểm; contract container kiểm tra lại |
| Một VM tự host là single point of failure | Pilot có backup/restore, health alert và rollback; không cam kết SLA production cho tới khi chốt E3/D24 |
| Beta Bot Platform đổi chính sách | `ChannelAdapter` đổi kênh không đập hệ thống; tin đã lưu DB |

---

## Phụ lục A — Kết quả PoC Zalo Bot Platform (07/07/2026)

*(gốc: `poc-zalo-bot.md` — hợp nhất 11/07/2026; log thô: `tools/poc-zalo-bot/logs/`, chạy lại theo [tools/poc-zalo-bot/README.md](../../tools/poc-zalo-bot/README.md))*

**Bot:** `Bot ultty AI orders` · nhóm test `zgr-f8a7101d77709e2ec761`.

| Câu hỏi Beta | Kết quả |
|---|---|
| 1. Bot vào được nhóm cá nhân có sẵn? | ✅ **CÓ** — "Thêm thành viên" tìm tên bot, hoặc link mời của bot (hữu ích onboard 200 nhóm) |
| 2. Nhận mọi tin hay chỉ @mention? | ⚠️ **CHỈ @mention** — 6/6 test nhất quán: text/ảnh/thoại KHÔNG tag đều không về; tin CÓ tag về **trọn nội dung**, **kể cả ẢNH** (event `message.image.received` kèm `photo_url` tải được + `caption`) |
| 3. Giới hạn nhóm / rate limit? | ⬜ chưa test (mới 1 nhóm) |
| 4. Có API danh sách thành viên nhóm không? *(dò 04/08/2026)* | ❌ **KHÔNG CÓ** — xem dưới |

**Dò API thành viên bằng token thật (04/08/2026), trên 2 nhóm thật:**

```
getMe                  => ok:true  {"account_type":"BASIC","can_join_groups":true}
getChat                => 404 Not Found
getChatMemberCount     => 404 Not Found
getChatMembersCount    => 404 Not Found
getChatAdministrators  => 404 Not Found
```

`getMe` trả 200 trên **cùng dạng đường dẫn** ⇒ 404 nghĩa là **method không tồn tại**, không phải thiếu quyền hay sai chat_id. Kết luận: Bot Platform **không cấp danh sách thành viên** ở gói BASIC. Cộng với việc `getGroupInfo` của zca trả mảng rỗng, **luồng tin là nguồn duy nhất còn lại** để dựng danh sách thành viên — xem `ParticipantSource.message_stream` (§12) và [tổng quan trạng thái](../phat-trien/ke-hoach/tong-quan.md).

**Bổ sung 05/08/2026 — còn một trường UID nữa trong chính response đó.** Kiểu `GroupInfoResponse` của zca-js 2.1.2 khai `gridInfoMap[groupId]: GroupInfo & { memVerList: string[] }`. `memVerList` là danh sách `"uid_version"` Zalo dùng để bắt cache hồ sơ — **không** nằm trong model `GroupInfo` nên dễ bị bỏ sót, và code trước đó chỉ đọc `memberIds` + `currentMems`. `fetchGroupMembers` nay đọc cả ba. Đây **chưa** phải kết luận: log VM cũ không đếm `memVerList` nên chưa biết Zalo có điền hay cũng bỏ trống; dòng cảnh báo đã thêm số đếm để lần bấm "Đồng bộ" kế tiếp trả lời dứt điểm. Rà API còn lại của zca-js 2.1.2 (`getGroupMembersInfo`, `getGroupBlockedMember`, `getPendingGroupMembers`) — **không có** endpoint liệt kê thành viên phân trang nào; `hasMoreMember=0` nên cũng không có trang tiếp. npm chốt ở 2.1.2, không có bản mới hơn để nâng.

**Nguyên nhân gốc đã rõ (05/08/2026): Zalo CHỦ ĐỘNG đóng, không phải mình làm sai.** Hai issue trên repo zca-js chốt lại điều này, và nó **loại bỏ cả hai giả thuyết** còn treo trong [tổng quan trạng thái](../phat-trien/ke-hoach/tong-quan.md) (lệch phiên bản thư viện / tài khoản bị hạn chế):

| Issue | Nội dung |
|---|---|
| [#359](https://github.com/RFS-ADRENO/zca-js/issues/359) (mở) | *"trước quét được giờ bị zalo lock rồi"* — người bảo trì: *"Zalo họ biết và có thể là đã sửa lỗi này rồi"* |
| [#349](https://github.com/RFS-ADRENO/zca-js/issues/349) (đóng) | *"link cũ vẫn gọi đc, còn link mới là k thấy members luôn"* |

⇒ Giữa 2026 Zalo chặn đọc danh sách thành viên ở **diện rộng**. Nâng thư viện không cứu được. Cơ chế `message_stream` **không phải giải pháp tạm — nó là giải pháp chính.**

**Đường vét vát cuối, đã cài đặt:** `getGroupLinkInfo` (endpoint **khác**: `group/link/ginfo`) vẫn trả `currentMems` kèm hồ sơ, có phân trang `mpage`. `ZaloUserClient.membersViaInviteLink` gọi nó **chỉ khi** cả ba trường UID của `getGroupInfo` đều rỗng, và **chỉ khi nhóm đã sẵn có link mời đang bật** — hệ thống **KHÔNG bao giờ gọi `enableGroupLink`**, vì bật link mời là đổi cài đặt nhóm của khách (ai có link đều vào được). Thất bại được coi là bình thường: trả `null`, lần đồng bộ đi tiếp với những gì có. `hasMoreMember` ⇒ `complete: false` để tầng persistence không đánh INACTIVE người ở trang sau.

**Kết luận câu hỏi “tin không tag có về server Bot không?”: KHÔNG.** PoC không thấy 6/6 tin text/ảnh/thoại không tag ở cả `getUpdates`/server nhận Bot; chỉ tin có native @mention mới phát event. Mention-gating là hành vi GỐC của Zalo (Beta), không tắt được — đã loại trừ khả năng cấu hình sai: docs OpenClaw ghi rõ "Groups require an @mention... not configurable"; docs webhook Zalo không có setting privacy/mention nào; `getMe` không có cờ `can_read_all_group_messages`; phía mình sạch (webhook 404, token ok, poller nhận đúng khi có tag).

**Quan sát vận hành:** bot gửi tin nhóm được (kèm nhãn tự động ✅ điều khoản); long-poll `getUpdates` trả HTTP 408 khi rảnh = BÌNH THƯỜNG; độ trễ vài giây ~20s; ⚠️ **tin gửi lúc bot offline KHÔNG được phát lại** → production phải webhook always-on + lưu mọi tin DB ngay.

**Hệ quả kiến trúc — kênh lai đã có code 03/08/2026:** text/ảnh **có native tag** → Bot Platform; **không tag** → zca. Gõ tên Bot bằng chữ nhưng không có `mentions[].uid` vẫn thuộc zca. Phản hồi đi theo `replyChannel` của tin nguồn. Runtime hiện vẫn long-poll; trước production 24/7 phải chuyển/kiểm chứng webhook official Bot và lưu event ngay.

**Còn treo (không chặn):** xác nhận mention từ NGƯỜI KHÁC (mọi test là chủ bot) · thoại-có-tag · đa nhóm + rate limit · chế độ webhook.

---

## Phụ lục B — Eval parser DeepSeek trên 35 tin (08/07/2026)

*(gốc: `poc-parser.md` — hợp nhất 11/07/2026; chạy lại: `pnpm --filter @netviet/poc-parser eval`, bộ đề `tools/poc-parser/eval-set.json`)*

Đo **phân loại 7 intent** qua đúng pipeline thật (`/demo/simulate`, `PARSER_MODE=deepseek`) trên 35 tin tiếng Việt không dấu (phủ 7 intent + bẫy TH2/nhiều SP/glossary/adversarial):

**Kết quả: 35/35 = 100%** (từng intent đều 100%; ngưỡng demo đề ra ≥90% → ĐẠT).

**Chạy lại qua `FlowiseParser` + Flowise 3.1.4 ngày 31/07/2026:** **35/35 = 100%**, ngang baseline gọi DeepSeek trực tiếp; mọi response thành công qua `parseResultSchema` và trace ghi `llmCalls=1`. Bộ đề hiện chỉ có nhãn intent, chưa có golden field — chưa được dùng để tuyên bố field-accuracy; cổng đó vẫn là B1-B2.

**Lịch sử tune (bài học nằm trong code dùng chung [parser-prompt.ts](../../apps/api/src/pipeline/parser-prompt.ts)):**

| Mốc | Accuracy | Nguyên nhân / cách sửa |
|---|---|---|
| Ban đầu | 43% | Prompt template luôn có khối `order` rỗng → intent hỏi bị fail schema → fallback `khac` |
| Fix 1 | 91% | Prompt rõ "intent≠dat_don thì KHÔNG có order" + normalizer bỏ `order` thừa trước validate |
| Fix 2 | **100%** | Tiền dạng chuỗi ("11tr5", "1.150k") → ép về số (`coerceVnd`); không đọc được thì bỏ field tùy chọn |

**Lưu ý:** `PARSER_MODE=mock` (tất định) vẫn là lưới an toàn offline. Khi có tin thật của khách (mục B1-B2), thay/bổ sung vào `eval-set.json` + golden output để đo cả **field-accuracy** — đó mới là cổng go-live.
