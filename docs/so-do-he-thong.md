# SƠ ĐỒ & THIẾT KẾ KỸ THUẬT — AI AGENT U ULTTY

> **Vai trò tài liệu:** bản KỸ THUẬT hợp nhất — toàn bộ **sơ đồ hệ thống (12 sơ đồ Mermaid)** + **quyết định thiết kế đã chốt** + **phụ lục bằng chứng PoC**. Xem trên GitHub hoặc VS Code (extension Markdown Preview Mermaid).
> **Hợp nhất 11/07/2026:** nuốt trọn `thiet-ke-ky-thuat-hop-nhat.md` (quyết định kỹ thuật — §2/§3/§15) và 2 tài liệu PoC `poc-zalo-bot.md`, `poc-parser.md` (→ Phụ lục A/B) — 3 file gốc đã xóa, git history còn.
> **Đối chiếu code 03/08/2026:** bổ sung FlowiseParser/Agentflow V2, lưu tin + retry ingest, API key guard, topology pilot GCP `netviet` và chế độ hai Bot `CHANNEL_MODE=hybrid`; code vẫn là chuẩn khi tài liệu lệch.
> Nghiệp vụ + sai lệch nguồn gốc: [nghiep-vu.md](nghiep-vu.md) · Kế hoạch + trạng thái: [ke-hoach/tong-quan.md](ke-hoach/tong-quan.md).

**Mục lục:** §1 Bối cảnh · §2 Quyết định kỹ thuật · §3 Ma trận kênh Zalo · §4 Kiến trúc 6 tầng · §5 Bản đồ module · §6 Luồng 1 đơn hàng · §7 Pipeline chi tiết · §8 Vòng đời đơn · §9 Bảy intent · §10 Nguồn sự thật động · §11 Realtime SSE · §12 ERD · §13 Runtime & cờ env · §14 Chọn kênh · §15 Tích hợp, KPI, bảo mật, rủi ro · Phụ lục A/B (PoC).

---

## 1. Bối cảnh tổng thể (ai dùng, hệ thống nói chuyện với gì)

```mermaid
flowchart LR
    DL["👥 Đại lý / CTV<br/>(200-300 đối tác)"]
    GRP["💬 ~200-350 nhóm Zalo"]
    SALE["🧑‍💼 Sale U Ultty<br/>(duyệt 1 chạm)"]
    KT["🧾 Kế toán"]

    subgraph SYS["🤖 Hệ thống AI Agent (NetViet vận hành - cloud)"]
        CONSOLE["🖥️ Console điều hành (demo)<br/>· 📱 PWA 5 tab (hướng sản phẩm)"]
        API["⚙️ Backend NestJS"]
    end

    FLOW["🔀 Flowise Agentflow V2<br/>(chỉ adapter gọi LLM)"]
    LLM["🧠 LLM (pilot: DeepSeek TEST<br/>production PII: Claude)"]
    KV["📦 KiotViet<br/>(đơn + tồn kho)"]
    BASE["🗂️ Base<br/>(duyệt + giao vận)"]
    SHIP["🚚 Aha / Viettel"]

    DL -->|"nhắn đặt hàng<br/>(viết tắt, không dấu)"| GRP
    GRP -->|"GĐ1 hybrid: có native @mention → Bot Platform<br/>không tag Bot → zca · dán tay = dự phòng"| API
    API -->|"FlowiseParser (1 request/tin)"| FLOW
    FLOW -->|"1 lần LLM · structured output"| LLM
    API --> CONSOLE
    SALE -->|duyệt / sửa| CONSOLE
    CONSOLE -->|"format xác nhận TH1/TH2"| GRP
    API -->|"hiện tại: mock<br/>Phase 4: Excel/API"| KV
    API -.->|"GĐ2: format dán / API<br/>(chưa có code)"| BASE
    BASE --> SHIP
    KT -->|kiểm tra khi lên hệ thống| KV
```

**Đọc sơ đồ:** đại lý có thể nhắn như hiện tại; nếu native @mention Bot chính thức thì Bot đó nhận, còn tin không tag Bot do tài khoản zca nhận. Bộ phân xử bảo đảm chỉ một nhánh vào pipeline. AI soạn sẵn; `AUTO_SEND`/`AUTO_ACK` mặc định off nên Sale vẫn duyệt trước khi phản hồi đi ra ngoài.

---

## 2. Quyết định kỹ thuật đã chốt

*(gốc: `thiet-ke-ky-thuat-hop-nhat.md` v1.0 06/07 — hợp nhất vào đây 11/07/2026; khi nguồn khác nhau, bảng này là quyết định cuối cho phần kỹ thuật)*

| Hạng mục | Quyết định | Ghi chú |
|---|---|---|
| Kiến trúc 6 tầng, intent taxonomy, luồng chính sách/bảo hành, checklist chốt đơn | Theo NetViet (`Thiet_ke_AI_Agent_U_Ultty.md` §3, §5 — giữ nguyên) | Nghiệp vụ không đổi |
| Lộ trình 3 giai đoạn, KPI, managed service | Theo NetViet (§6, §7) | Sơ đồ lộ trình: [ke-hoach/tong-quan.md](ke-hoach/tong-quan.md) |
| Stack | TypeScript (Node 22) · NestJS · Next.js · PostgreSQL + **Prisma 6 (pin, KHÔNG nâng v7** — `@adminjs/prisma` chưa hỗ trợ) · Flowise 3.1.4 · Claude/DeepSeek API · monorepo pnpm | BullMQ/Redis có trong stack nhưng **chưa dùng** (YAGNI — thêm khi pipeline thật sự cần queue) |
| Kênh Zalo GĐ1 | **Hai Bot cùng nhóm qua `CHANNEL_MODE=hybrid`** (03/08/2026): native @mention Bot chính thức → Bot Platform; không tag Bot → zca. Các mode đơn `mock\|bot\|zca` vẫn giữ để rollback/test | `getMe` lấy Bot UID; zca so metadata `mentions[].uid`, bỏ tin do Bot chính thức gửi; không lấy được UID thì zca fail-closed. Điều kiện zca: **tài khoản phụ** + **văn bản chấp nhận rủi ro** |
| Multi-agent 6 vai | 6 vai chuyên trách **dưới 1 orchestrator, dùng chung 1 lần gọi LLM/tin** (Router parse) — KHÔNG phải 6 LLM độc lập | Chi phí như 1 orchestrator; rules engine tính tiền |
| LLM vs rules | **LLM không tính tiền, không quyết chính sách** — chỉ phân loại intent + trích xuất + soạn văn bản; giá/ship/VAT/chính sách do rules engine TS tất định tính từ nguồn sự thật | Nguyên tắc bất di bất dịch |
| Dify → Flowise | NestJS giữ orchestrator; `FlowiseParser` gọi Agentflow `zalo-order-parser-v1` chỉ gồm form input + một LLM structured output. Không tool/code/memory/MCP/callback vào NestJS | `PARSER_MODE=deepseek` được giữ để rollback; D18a-c ở kế hoạch tổng quan |
| Cách ly khách v1 | Một Compose stack + DB/user/secret/volume/network riêng cho mỗi dự án; chưa cần `tenantId` khi không dùng chung DB | Stack đầu: `/srv/netviet/apps/zalo-ultty` |
| Kho | KHÔNG xây module kho riêng — KiotViet là source of truth duy nhất | 10-20 đơn/ngày không cần cache |
| Lưu trữ | Mặc định **in-memory** (`PERSISTENCE=memory` — demo/CI không cần DB); bật Postgres bằng `PERSISTENCE=prisma` (cờ riêng, tách khỏi `DATABASE_URL`) | as-built Phase 3 |
| Nguồn sự thật ĐỘNG | Trang **`/settings`** cho người vận hành (6 tab: Kênh Zalo · Nhóm & thành viên · Đại lý/SP/giá · Rules · Tự động hóa · Lịch sử) + panel **`/admin`** (AdminJS auto-CRUD, power-user) + **MCP tool** (8 tool) — tất cả đi qua một `SourceTruthWriteService` (transaction → audit → reload snapshot) | Thay cho tab "Prompt AI" của PWA trong thiết kế cũ; `/settings` là mặt chính, `/admin` giữ làm fallback |
| App Sale | Demo = **console PC 3 cột** (Feed · 6-agent theater SSE · Nguồn sự thật); PWA mobile 5 tab theo `design/` = hướng sản phẩm, làm sau | Quyết định treo D3 |

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

    subgraph L5["Tầng 5 — Tích hợp (kiotviet/)"]
        XLS["Hiện tại: KiotViet MOCK<br/>Phase 4: Excel export / API"]
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
        KIO2["kiotviet/ (mock)"]
        BRO2["broadcast/"]
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
    PIP2 -->|"AUTO_SEND: gọi approve"| ORD2
    DEM2 --> PIP2
    ORD2 --> CHA2
    ORD2 --> KIO2
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

Console web gọi thêm REST: `/orders` · `/messages` · `/knowledge/*` · `/kiotviet/*` · `/broadcast` (không vẽ hết mũi tên cho đỡ rối).

---

## 6. Luồng xử lý 1 đơn hàng (từ tin nhắn đến KiotViet)

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
    participant KV as KiotViet (mock)

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
    RU->>RU: Validation: SKU hợp lệ? tổng lệch >5%?<br/>Giám sát: rủi ro? → pending_review / needs_edit
    RU->>ST: Tạo order + format xác nhận TH1
    ST-->>S: 🔔 Card đơn hiện real-time (SSE) trên console
    S->>S: Kiểm tra (draft/field mơ hồ tô vàng)
    S->>ST: Bấm Duyệt
    ST->>DL: Gửi format xác nhận vào đúng nhóm Zalo (kèm nhãn tin tự động)
    ST->>KV: Đẩy đơn (mock — trừ tồn, sinh mã KV-xxxx)
    ST->>ST: Chuyển synced · phát order.updated
    Note over ST: kpi_events — model đã có, CHƯA ghi (Phase 5)
```

---

## 7. Pipeline chi tiết trong 1 tin (định tuyến theo độ tin cậy + rủi ro)

```mermaid
flowchart TD
    IN3["Tin vào (zca / bot / dán tay / demo)"] --> DEDUP{"Trùng externalMessageId?"}
    DEDUP -->|có| DROP["Bỏ qua (idempotent)"]
    DEDUP -->|không| RESOLVE["Map chatId → đại lý · chi nhánh · loại người gửi<br/>(nhóm lạ → unknown)"]
    RESOLVE --> ROUTER["Điều phối (Router) — parse 1 lần:<br/>mock = regex tất định, 0 LLM<br/>deepseek/claude = gọi trực tiếp<br/>flowise = Agentflow structured output"]
    ROUTER --> ISORDER{"intent = dat_don<br/>kèm order thô?"}
    ISORDER -->|có| PRICE3["Bán hàng → rules engine tất định:<br/>map SKU (alias, không dấu) · giá sỉ/deal riêng<br/>ship · VAT · COD · format xác nhận TH1/TH2"]
    ISORDER -->|không| DRAFT3["Vai chuyên trách tra kho tri thức<br/>→ soạn draft trả lời KÈM nguồn<br/>(không có dữ liệu → nói cần Sale, không bịa)"]
    PRICE3 --> VALID3["Validation cảnh báo:<br/>SKU lạ · chưa map đại lý · tổng lệch >5%"]
    VALID3 --> SUP3
    DRAFT3 --> SUP3["Giám sát — rules tất định, 0 LLM<br/>leo thang: đơn ≥20tr · đại lý lạ · khiếu nại gắt<br/>cờ vàng: SL ≥30 · có cảnh báo · confidence <0.5"]
    SUP3 -->|"leo thang / có cảnh báo"| NE3["needs_edit — Sale soát kỹ"]
    SUP3 -->|sạch| PR3["pending_review — chờ duyệt 1 chạm"]
    PR3 --> AS3{"AUTO_SEND=on và<br/>Giám sát = 0 rủi ro?"}
    AS3 -->|"có (GĐ2)"| AUTO3["AI tự duyệt: gửi xác nhận<br/>+ đẩy KiotViet → synced"]
    AS3 -->|"không (mặc định GĐ1)"| WAIT3["Chờ Sale bấm Duyệt"]

    style NE3 fill:#fff3cd,stroke:#997404
    style AUTO3 fill:#cfe2ff,stroke:#084298
```

Lưới an toàn: tin thô được giữ trong PostgreSQL; timeout/401/404/429/5xx/schema sai làm lượt xử lý thất bại, ingest thử tối đa **3 lượt** rồi để vận hành chạy lại — không âm thầm đổi sang MockParser. Tiền dạng chuỗi ("11tr5", "1.150k") được ép về số trước khi validate (Phụ lục B).

---

## 8. Vòng đời một đơn hàng (state machine — as-built)

```mermaid
stateDiagram-v2
    [*] --> pending_review: AI xử lý xong — đơn sạch
    [*] --> needs_edit: có cảnh báo / Giám sát leo thang
    pending_review --> synced: Duyệt — gửi xác nhận + đẩy KiotViet OK
    needs_edit --> synced: Sale kiểm tra rồi Duyệt
    pending_review --> rejected: Từ chối
    needs_edit --> rejected: Từ chối
    synced --> [*]
    rejected --> [*]

    note right of synced
        Duyệt an toàn — gửi Zalo lỗi thì đơn
        GIỮ NGUYÊN trạng thái để duyệt lại ·
        idempotent (synced bấm lại không đẩy trùng) ·
        AUTO_SEND=on thì tự duyệt khi 0 rủi ro
    end note
    note left of needs_edit
        Enum còn draft / approved / sent —
        DỰ PHÒNG cho khi tách bước
        "đã duyệt / đã gửi / đã đồng bộ",
        code hiện CHƯA dùng
    end note
```

> **Đính chính 11/07/2026:** bản cũ vẽ `draft → pending_review → approved → sent → synced` — đó là chuỗi **đích tương lai**, không phải hành vi code. Code thật: đơn sinh ra ở `pending_review`/`needs_edit`, Duyệt nhảy thẳng `synced`, Từ chối → `rejected`.

---

## 9. Bảy loại ý định (intent) và đường đi của từng loại

```mermaid
flowchart TD
    MSG["Tin nhắn mới"] --> INT{"Router (Điều phối)<br/>phân loại intent + danh tính"}

    INT -->|dat_don| EX["Bán hàng: trích xuất TH1/TH2<br/>→ rules → hàng đợi duyệt"]
    INT -->|hoi_gia| RAG1["Chính sách & TC: tra bảng giá sỉ<br/>→ draft trả lời KÈM nguồn"]
    INT -->|hoi_san_pham| RAG2["Tư vấn SP: kho tri thức<br/>→ draft mô tả"]
    INT -->|chinh_sach_cong_no| RAG3["Chính sách & TC: chính sách theo đại lý<br/>→ draft điều kiện áp dụng"]
    INT -->|bao_hanh_khieu_nai| WAR["Hậu mãi: phân nhánh<br/>trong 7 ngày / ngoài 7 ngày / giao thiếu<br/>→ định tuyến kỹ thuật (handoff)"]
    INT -->|van_chuyen| SHIP2["Chính sách & TC: ETA cần API vận đơn (GĐ2)<br/>GĐ1: draft cho Sale trả lời (handoff)"]
    INT -->|khac| HUMAN["Điều phối giữ — soạn câu ghi nhận lịch sự,<br/>AI không đoán · AUTO_ACK=on thì tự nhắn ghi nhận"]

    EX --> SALE2["Sale duyệt"]
    RAG1 --> SALE2
    RAG2 --> SALE2
    RAG3 --> SALE2
    WAR --> TECH["Nhóm kỹ thuật quyết định lỗi<br/>(AI không tự phán)"]

    style HUMAN fill:#f8d7da,stroke:#842029
    style SALE2 fill:#d1e7dd,stroke:#0f5132
```

**Nguyên tắc:** không có dữ liệu trong nguồn sự thật → AI trả lời "cần Sale", tuyệt đối không bịa. Mọi draft đều qua tay Sale ở GĐ1. Mọi tin (kể cả không phải đơn) đều thành bản ghi `pending_review` kèm draft để Sale dùng.

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
- MCP đọc `DATABASE_URL` trực tiếp; chạy `pnpm --filter @ultty/api mcp`.

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
        string status "pending | mapped | ignored (hộp thư nhóm chưa map)"
    }
    MESSAGES {
        string source "copilot_paste | bot_webhook | zca_listener"
        string text
        string image_url "ảnh kèm tin (nếu có)"
    }
    ORDERS {
        string status "pending_review | needs_edit | rejected | synced (as-built)"
        string order_type "TH1 | TH2"
        json view "bản OrderView đầy đủ (round-trip)"
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
        string source "zca_sync | manual"
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
> Schema thật: [apps/api/prisma/schema.prisma](../apps/api/prisma/schema.prisma). Mặc định app chạy in-memory (`PERSISTENCE=memory`).

---

## 13. Runtime & cờ môi trường

```mermaid
flowchart LR
    OP["Máy vận hành<br/>gcloud CLI"]
    SM["GCP Secret Manager"]
    AR["Artifact Registry<br/>image theo git SHA + digest"]
    GCS["GCS backup<br/>7 ngày + 4 tuần"]
    LLM3["DeepSeek TEST / Claude production"]

    CUSTOMER["Khách demo<br/>HTTPS + Basic Auth"]
    OPERATOR["Operator<br/>HTTPS + Basic Auth riêng"]

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

**Cờ env quyết định hành vi** (đủ bộ: [packages/shared/src/env.ts](../packages/shared/src/env.ts) — validate lúc boot, fail fast):

| Cờ | Giá trị (mặc định **đậm**) | Quyết định gì |
|---|---|---|
| `CHANNEL_MODE` | **mock** · bot · zca · hybrid | `hybrid`: chạy đồng thời Bot Platform + zca và định tuyến phản hồi về đúng kênh nguồn |
| `PARSER_MODE` | **mock** · claude · deepseek · flowise | Bộ não parse; `flowise` gọi Agentflow nội bộ, `deepseek` giữ làm rollback pilot |
| `PERSISTENCE` | **memory** · prisma | Lưu đơn + nguồn sự thật (memory = demo/CI không cần DB) |
| `ADMIN_UI` | **off** · on | Mount panel `/admin` (đòi thêm `PERSISTENCE=prisma`) |
| `AUTO_SEND` | **off** · on | Giá trị khởi động. Console có công tắc runtime (bật cần xác nhận), chỉ tự duyệt tin mới 0-rủi-ro; restart API trở về env. GĐ2 vẫn cần văn bản đồng ý khách khi dùng thật |
| `AUTO_ACK` | **off** · on | Tự nhắn "đã ghi nhận" khi intent=khac |
| `STREAM_MODE` | **on** · off | SSE real-time / polling |
| `ZALO_SELF_LISTEN` | **off** · on | zca có nghe tin do chính tài khoản gửi không (chống vòng lặp) |
| Flowise | `FLOWISE_BASE_URL`, `FLOWISE_FLOW_ID`, `FLOWISE_API_KEY`, `FLOWISE_TIMEOUT_MS`=30000 | Bắt buộc và fail-fast khi `PARSER_MODE=flowise`; không dùng `overrideConfig` |
| Bảo vệ API | `API_KEY` | Bắt buộc khi `NODE_ENV=production`; gateway nội bộ gắn header, không đưa key vào browser/query string |
| Khác | `BOT_NAME`, `ZALO_CRED_PATH` (phiên zca — bảo mật như secret), `BROADCAST_THROTTLE_MS`=1500, `BROADCAST_MAX_TARGETS`=50, `STREAM_STEP_DELAY_MS`=280, `ADMIN_EMAIL/PASSWORD/COOKIE_SECRET` (đổi ở production), `DATABASE_URL`, `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `ZALO_BOT_TOKEN` | |

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
        H2 --> H9["Sale duyệt → OutboundChannelRouter<br/>gửi đúng Bot Platform"]
        H4 --> H10["Sale duyệt → OutboundChannelRouter<br/>gửi đúng tài khoản zca"]
    end

    subgraph BOTM["CHANNEL_MODE=bot — kênh phụ (chính thức)"]
        T1["Bot trong nhóm CHỈ nhận tin @mention<br/>(mention-gating gốc Zalo, không tắt được — Phụ lục A)"] --> T2["AI xử lý → đơn chờ duyệt"]
        T2 --> T3["Sale duyệt → Bot gửi (kèm nhãn tin tự động)"]
    end

    subgraph MOCKM["CHANNEL_MODE=mock — offline/CI + dán tay"]
        M1["Ô 'Bơm tin thử' trên console / Sale dán tay"] --> M2["AI + rules y hệt, chỉ khác nguồn tin"]
    end

    HYBRID -.->|"zca lỗi/khóa → chỉ giữ luồng có tag"| BOTM
    HYBRID -.->|"mạng yếu / demo an toàn"| MOCKM
```

**Vì sao an toàn:** `OrderView.replyChannel` được lưu cùng đơn (`bot|zca|mock`); `OrdersService`, auto-ack và auto-send đều đi qua `OutboundChannelRouter`, không dùng một adapter toàn cục để đoán kênh. Đơn cũ thiếu `replyChannel` bị từ chối trong hybrid. Broadcast gửi thật cũng bị khóa trong hybrid tới khi UI buộc chọn kênh/chat ID rõ ràng.

**Map nhóm:** Bot Platform `chat.id` và zca `threadId` là hai ID khác nhau. Cần tạo hai bản ghi Group cùng trỏ về một Dealer. Bot Platform chỉ đưa tin nhóm đã map vào pipeline; zca còn qua allowlist operator riêng trước LLM.

Chi tiết hành vi zca as-built: bỏ tin do chính tài khoản gửi (trừ khi `ZALO_SELF_LISTEN=on`) · **bỏ ảnh KHÔNG có caption** (tin không văn bản chưa vào pipeline) · chống trùng 2.000 id gần nhất · in `chatId` mỗi nhóm 1 lần để lấy ID map đại lý · mỗi tài khoản chỉ 1 listener (mở Zalo Web cùng tài khoản → listener dừng). Trang Operator có nút đăng xuất cục bộ: dừng listener, xóa `zalo-cred.json`, QR và allowlist; lần sau phải quét QR/chọn nhóm lại. Đây không phải thao tác thu hồi phiên phía Zalo vì zca-js không cung cấp API logout.

> **Điều kiện chặn kênh zca:** dùng **tài khoản Zalo phụ** (không dùng tài khoản Sale chính) + **văn bản chấp nhận rủi ro của khách** (vi phạm ToS Zalo, có thể bị khóa tài khoản; Luật BVDLCN 91/2025/QH15 + NĐ 356/2025).

---

## 15. Tích hợp vận hành · KPI · Bảo mật · Rủi ro

### 15.1 Tích hợp (nguyên tắc NetViet: API-first nhưng không phụ thuộc API)

| Hệ thống | Hiện tại | Kế tiếp (Phase 4 / GĐ2+) |
|---|---|---|
| KiotViet | **Mock** (danh mục + tồn kho giả lập từ nguồn sự thật, sinh mã KV-xxxx) | Excel export đúng format import **hoặc** API (OAuth2, token 1h, 5.000 GET/giờ) + map SKU ↔ mã hàng số (vd `8716`) |
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
- Mọi tin bot/hệ thống gửi ra đều nối nhãn "— Tin tự động từ Bot Ultty" (điều khoản Zalo về nội dung AI).
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

*(gốc: `poc-zalo-bot.md` — hợp nhất 11/07/2026; log thô: `tools/poc-zalo-bot/logs/`, chạy lại theo [tools/poc-zalo-bot/README.md](../tools/poc-zalo-bot/README.md))*

**Bot:** `Bot ultty AI orders` · nhóm test `zgr-f8a7101d77709e2ec761`.

| Câu hỏi Beta | Kết quả |
|---|---|
| 1. Bot vào được nhóm cá nhân có sẵn? | ✅ **CÓ** — "Thêm thành viên" tìm tên bot, hoặc link mời của bot (hữu ích onboard 200 nhóm) |
| 2. Nhận mọi tin hay chỉ @mention? | ⚠️ **CHỈ @mention** — 6/6 test nhất quán: text/ảnh/thoại KHÔNG tag đều không về; tin CÓ tag về **trọn nội dung**, **kể cả ẢNH** (event `message.image.received` kèm `photo_url` tải được + `caption`) |
| 3. Giới hạn nhóm / rate limit? | ⬜ chưa test (mới 1 nhóm) |

**Kết luận câu hỏi “tin không tag có về server Bot không?”: KHÔNG.** PoC không thấy 6/6 tin text/ảnh/thoại không tag ở cả `getUpdates`/server nhận Bot; chỉ tin có native @mention mới phát event. Mention-gating là hành vi GỐC của Zalo (Beta), không tắt được — đã loại trừ khả năng cấu hình sai: docs OpenClaw ghi rõ "Groups require an @mention... not configurable"; docs webhook Zalo không có setting privacy/mention nào; `getMe` không có cờ `can_read_all_group_messages`; phía mình sạch (webhook 404, token ok, poller nhận đúng khi có tag).

**Quan sát vận hành:** bot gửi tin nhóm được (kèm nhãn tự động ✅ điều khoản); long-poll `getUpdates` trả HTTP 408 khi rảnh = BÌNH THƯỜNG; độ trễ vài giây ~20s; ⚠️ **tin gửi lúc bot offline KHÔNG được phát lại** → production phải webhook always-on + lưu mọi tin DB ngay.

**Hệ quả kiến trúc — kênh lai đã có code 03/08/2026:** text/ảnh **có native tag** → Bot Platform; **không tag** → zca. Gõ tên Bot bằng chữ nhưng không có `mentions[].uid` vẫn thuộc zca. Phản hồi đi theo `replyChannel` của tin nguồn. Runtime hiện vẫn long-poll; trước production 24/7 phải chuyển/kiểm chứng webhook official Bot và lưu event ngay.

**Còn treo (không chặn):** xác nhận mention từ NGƯỜI KHÁC (mọi test là chủ bot) · thoại-có-tag · đa nhóm + rate limit · chế độ webhook.

---

## Phụ lục B — Eval parser DeepSeek trên 35 tin (08/07/2026)

*(gốc: `poc-parser.md` — hợp nhất 11/07/2026; chạy lại: `pnpm --filter @ultty/poc-parser eval`, bộ đề `tools/poc-parser/eval-set.json`)*

Đo **phân loại 7 intent** qua đúng pipeline thật (`/demo/simulate`, `PARSER_MODE=deepseek`) trên 35 tin tiếng Việt không dấu (phủ 7 intent + bẫy TH2/nhiều SP/glossary/adversarial):

**Kết quả: 35/35 = 100%** (từng intent đều 100%; ngưỡng demo đề ra ≥90% → ĐẠT).

**Chạy lại qua `FlowiseParser` + Flowise 3.1.4 ngày 31/07/2026:** **35/35 = 100%**, ngang baseline gọi DeepSeek trực tiếp; mọi response thành công qua `parseResultSchema` và trace ghi `llmCalls=1`. Bộ đề hiện chỉ có nhãn intent, chưa có golden field — chưa được dùng để tuyên bố field-accuracy; cổng đó vẫn là B1-B2.

**Lịch sử tune (bài học nằm trong code dùng chung [parser-prompt.ts](../apps/api/src/pipeline/parser-prompt.ts)):**

| Mốc | Accuracy | Nguyên nhân / cách sửa |
|---|---|---|
| Ban đầu | 43% | Prompt template luôn có khối `order` rỗng → intent hỏi bị fail schema → fallback `khac` |
| Fix 1 | 91% | Prompt rõ "intent≠dat_don thì KHÔNG có order" + normalizer bỏ `order` thừa trước validate |
| Fix 2 | **100%** | Tiền dạng chuỗi ("11tr5", "1.150k") → ép về số (`coerceVnd`); không đọc được thì bỏ field tùy chọn |

**Lưu ý:** `PARSER_MODE=mock` (tất định) vẫn là lưới an toàn offline. Khi có tin thật của khách (mục B1-B2), thay/bổ sung vào `eval-set.json` + golden output để đo cả **field-accuracy** — đó mới là cổng go-live.
