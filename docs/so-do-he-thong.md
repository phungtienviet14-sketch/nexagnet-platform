# SƠ ĐỒ HỆ THỐNG — AI AGENT U ULTTY

> Bộ sơ đồ minh hoạ cho [thiet-ke-ky-thuat-hop-nhat.md](thiet-ke-ky-thuat-hop-nhat.md) (kỹ thuật) và [nghiep-vu.md](nghiep-vu.md) (nghiệp vụ). Xem trên GitHub hoặc VS Code (extension Markdown Preview Mermaid).
> **Cập nhật 09/07/2026:** kênh đọc chính GĐ1 là **zca-js** (đọc mọi tin nhóm, không cần @mention); chuyển kênh bằng biến `CHANNEL_MODE=mock|bot|zca`. Lưu trữ demo là **in-memory** (production dùng Postgres).

---

## 1. Bối cảnh tổng thể (ai dùng, hệ thống nói chuyện với gì)

```mermaid
flowchart LR
    DL["👥 Đại lý / CTV<br/>(200-300 đối tác)"]
    GRP["💬 ~200-350 nhóm Zalo"]
    SALE["🧑‍💼 Sale U Ultty<br/>(duyệt 1 chạm)"]
    KT["🧾 Kế toán"]

    subgraph SYS["🤖 Hệ thống AI Agent (NetViet vận hành - cloud)"]
        CONSOLE["🖥️ Console điều hành (demo)<br/>· 📱 PWA 5 tab (sản phẩm)"]
        API["⚙️ Backend NestJS"]
    end

    LLM["🧠 LLM (Claude / DeepSeek)<br/>(intent + trích xuất)"]
    KV["📦 KiotViet<br/>(đơn + tồn kho)"]
    BASE["🗂️ Base<br/>(duyệt + giao vận)"]
    SHIP["🚚 Aha / Viettel"]

    DL -->|"nhắn đặt hàng<br/>(viết tắt, không dấu)"| GRP
    GRP -->|"GĐ1: zca đọc MỌI tin nhóm<br/>(không cần tag); Bot/Co-pilot = dự phòng"| API
    API <-->|"gọi AI (1 lần/tin)"| LLM
    API --> CONSOLE
    SALE -->|duyệt / sửa| CONSOLE
    CONSOLE -->|"format xác nhận TH1/TH2"| GRP
    API -->|"GĐ1: Excel<br/>GĐ2: API"| KV
    API -->|"GĐ1: format dán tay<br/>GĐ2: API"| BASE
    BASE --> SHIP
    KT -->|kiểm tra khi lên hệ thống| KV
```

**Đọc sơ đồ:** đại lý nhắn vào nhóm Zalo như hiện tại — không đổi thói quen, không cần tag. Hệ thống đứng giữa, AI soạn sẵn, Sale luôn là người bấm duyệt trước khi bất kỳ thứ gì đi ra ngoài.

---

## 2. Kiến trúc 6 tầng (NetViet) → module code thực tế

```mermaid
flowchart TB
    subgraph L1["Tầng 1 — Kênh (channels/) — chọn qua CHANNEL_MODE"]
        CA["ChannelAdapter (interface: gửi)"]
        ZCA["ZcaAdapter<br/>(zca-js — kênh chính)"]
        BOT["BotPlatformAdapter<br/>(@mention — kênh phụ)"]
        MOCK["MockAdapter (offline/CI)"]
        COP["Co-pilot dán tay<br/>(fallback)"]
        CA --- ZCA
        CA --- BOT
        CA --- MOCK
        CA --- COP
    end

    subgraph L2["Tầng 2 — Tiếp nhận (ingest/)"]
        LIS["ZcaListener (nghe mọi tin nhóm)<br/>/ BotPoller (@mention)"]
        IDENT["Gán danh tính:<br/>nhóm → đại lý/CTV (theo chatId)"]
        SAVE["Lưu messages NGAY khi nhận<br/>(production; demo = in-memory)"]
    end

    subgraph L3["Tầng 3 — Lõi AI (pipeline/ + agents/)"]
        ORCH["AgentOrchestrator — Router (1 call LLM)<br/>→ dispatch 6 vai chuyên trách → Giám sát<br/>① intent (7 loại) ② trích xuất TH1/TH2 ③ RAG kèm nguồn"]
    end

    subgraph L4["Tầng 4 — Luật nghiệp vụ (rules/) — TypeScript tất định, KHÔNG dùng LLM"]
        PRICE["Giá sỉ (wholesale) + deal riêng"]
        SHIPR["Phí ship<br/>(≥2 SP miễn / TH1 miễn / Grab / Viettel)"]
        POL["Chính sách: công nợ 30-45<br/>ký gửi / trả ngay / COD"]
        VAT["VAT (mặc định off) + format TH1/TH2"]
    end

    subgraph L5["Tầng 5 — Tích hợp (kiotviet/, base/)"]
        XLS["GĐ1: Excel export / format dán"]
        APIS["GĐ2: KiotViet API, Base API, vận đơn"]
    end

    subgraph L6["Tầng 6 — Dữ liệu & quản trị"]
        KNOW["knowledge/ — NGUỒN SỰ THẬT:<br/>19 SKU, bảng giá, chính sách, glossary"]
        ORD["orders/ (state machine)"]
        MET["metrics/ — KPI (GĐ sau)"]
        AUTH["auth/ — phân quyền + audit (GĐ sau)"]
    end

    L1 --> L2 --> L3 --> L4 --> L5
    KNOW -.->|"ngữ cảnh cho AI"| ORCH
    KNOW -.->|"số liệu cho rules"| L4
    L4 --> ORD
    ORD --> MET
```

**Điểm mấu chốt:** tầng 3 (AI) chỉ *hiểu và soạn*; tầng 4 (rules) mới *tính tiền và áp chính sách* — từ nguồn sự thật ở tầng 6. AI sai thì validation + Sale chặn; số tiền không bao giờ do AI "đoán".

---

## 3. Luồng xử lý 1 đơn hàng (từ tin nhắn đến KiotViet)

```mermaid
sequenceDiagram
    autonumber
    actor DL as Đại lý (nhóm Zalo)
    actor S as Sale (console/PWA)
    participant IN as Ingest
    participant AI as AgentOrchestrator (Router + 6 vai)
    participant RU as Rules engine
    participant ST as Lưu trữ (in-memory / Postgres)
    participant KV as KiotViet

    DL->>DL: "gui 10 ghe felix ve TN cho c, ko lay VAT"

    alt CHANNEL_MODE=zca (kênh chính GĐ1)
        DL-->>IN: zca đọc mọi tin nhóm (KHÔNG cần tag)
    else CHANNEL_MODE=bot / Co-pilot
        DL-->>IN: Bot nhận tin @mention / Sale dán tay
    end

    IN->>ST: Lưu message thô + platform + nguồn
    IN->>AI: Đưa vào pipeline
    AI->>ST: Lấy ngữ cảnh: nhóm→đại lý Meta HN,<br/>19 SKU, glossary (TN=Thái Nguyên)
    AI->>AI: intent = dat_don<br/>trích xuất: 10 x Ghế Felix, giao TN, không VAT
    AI->>RU: JSON đơn thô
    RU->>ST: Tra giá sỉ + phí ship + chính sách công nợ
    RU->>RU: Validation: SKU hợp lệ? SL×giá ≈ tổng?<br/>Confidence từng field
    RU->>ST: Tạo order (pending_review) + format TH1
    ST-->>S: 🔔 Đơn chờ duyệt trên console
    S->>S: Kiểm tra (field mờ được tô vàng)
    S->>ST: Duyệt 1 chạm (hoặc sửa → lưu parse_feedback)
    S->>DL: Gửi format xác nhận vào đúng nhóm Zalo
    S->>KV: GĐ1: xuất Excel / mock; GĐ2: API tự đẩy
    ST->>ST: Ghi kpi_events (thời gian chốt, có sửa hay không)
```

---

## 4. Vòng đời một đơn hàng (state machine)

```mermaid
stateDiagram-v2
    [*] --> draft: AI trích xuất xong
    draft --> pending_review: qua validation, đủ tin cậy
    draft --> needs_edit: có field mơ hồ (SKU lạ, tổng lệch, thiếu địa chỉ)
    pending_review --> needs_edit: Giám sát leo thang / Sale phát hiện sai
    pending_review --> approved: Sale duyệt 1 chạm (hoặc AUTO_SEND nếu không rủi ro)
    needs_edit --> approved: Sale sửa xong (bản sửa lưu parse_feedback)
    pending_review --> rejected: không phải đơn thật / trùng
    needs_edit --> rejected
    approved --> sent: gửi xác nhận vào nhóm Zalo
    sent --> synced: đẩy KiotViet (GĐ1 mock / GĐ2 API)
    synced --> [*]
    rejected --> [*]

    note right of needs_edit
        Handoff người thật (NetViet 5.6):
        đơn lớn ≥20tr, đại lý chưa xác định,
        khiếu nại gắt → không auto
    end note
```

---

## 5. Bảy loại ý định (intent) và đường đi của từng loại

```mermaid
flowchart TD
    MSG["Tin nhắn mới"] --> INT{"Router (Điều phối)<br/>phân loại intent + danh tính"}

    INT -->|dat_don| EX["Bán hàng: trích xuất TH1/TH2<br/>→ rules → hàng đợi duyệt"]
    INT -->|hoi_gia| RAG1["Chính sách & TC: tra bảng giá sỉ<br/>→ draft trả lời KÈM nguồn"]
    INT -->|hoi_san_pham| RAG2["Tư vấn SP: kho tri thức<br/>→ draft mô tả"]
    INT -->|chinh_sach_cong_no| RAG3["Chính sách & TC: hồ sơ đại lý<br/>→ draft điều kiện áp dụng"]
    INT -->|bao_hanh_khieu_nai| WAR["Hậu mãi: phân nhánh<br/>7 ngày / ngoài 7 ngày / giao thiếu<br/>→ định tuyến kỹ thuật"]
    INT -->|van_chuyen| SHIP2["Chính sách & TC: tra vận đơn (GĐ2)<br/>GĐ1: draft cho Sale trả lời"]
    INT -->|khac| HUMAN["Chuyển Sale, AI không đoán"]

    EX --> SALE2["Sale duyệt"]
    RAG1 --> SALE2
    RAG2 --> SALE2
    RAG3 --> SALE2
    WAR --> TECH["Nhóm kỹ thuật quyết định lỗi<br/>(AI không tự phán)"]

    style HUMAN fill:#f8d7da,stroke:#842029
    style SALE2 fill:#d1e7dd,stroke:#0f5132
```

**Nguyên tắc:** không có dữ liệu trong nguồn sự thật → AI trả lời "cần Sale", tuyệt đối không bịa. Mọi draft đều qua tay Sale ở GĐ1.

---

## 6. Dữ liệu chính (ERD rút gọn — schema Postgres đích)

```mermaid
erDiagram
    DEALERS ||--o{ GROUPS : "có nhóm"
    GROUPS ||--o{ CONVERSATIONS : ""
    CONVERSATIONS ||--o{ MESSAGES : ""
    MESSAGES ||--o| ORDERS : "AI trích xuất ra"
    ORDERS ||--|{ ORDER_ITEMS : ""
    PRODUCTS ||--o{ ORDER_ITEMS : ""
    PRODUCTS ||--o{ PRICE_TIERS : "giá theo cấp"
    DEALERS ||--o{ ORDERS : "đặt"
    ORDERS ||--o{ PARSE_FEEDBACK : "Sale sửa → học"
    USERS ||--o{ ORDERS : "duyệt"
    MESSAGES ||--o{ WARRANTY_TICKETS : "khiếu nại"

    DEALERS {
        string name
        string tier "đại lý / CTV"
        string default_policy "công nợ 30-45 / ký gửi / trả ngay / COD"
    }
    GROUPS {
        string platform "zalo (GĐ2: messenger...)"
        string external_id "chatId — map nhóm theo ID"
    }
    MESSAGES {
        string source "zca_listener | bot | copilot"
        string raw_text
    }
    ORDERS {
        string status "draft→pending_review→approved→sent→synced"
        string order_type "TH1 | TH2"
        json field_confidence
        int total_amount
    }
    PRODUCTS {
        string sku "19 SKU"
        string name
    }
    PRICE_TIERS {
        string tier
        int wholesale "Đơn giá CTV"
        date valid_month "bảng giá theo tháng"
    }
    PARSE_FEEDBACK {
        json ai_output
        json corrected
    }
```

Ngoài ra còn: `glossary_entries` (TN→Thái Nguyên...), `dealer_price_overrides` (deal riêng), `policies`, `kpi_events`, `audit_logs`, `users`.
> **Lưu ý:** demo hiện chạy **in-memory** ([knowledge/seed.ts](../apps/api/src/knowledge/seed.ts) + `InMemoryOrdersRepository`); schema Postgres trên là đích của Phase 3.

---

## 7. Lộ trình 3 giai đoạn (theo NetViet)

```mermaid
flowchart LR
    subgraph P0["Chuẩn bị"]
        A1["Scaffold monorepo ✅"]
        A2["PoC Bot + zca ✅"]
        A3["Nguồn sự thật:<br/>19 SKU + giá + glossary ✅"]
        A4["Bake-off parser (eval 100%) ✅"]
    end

    subgraph G1["GĐ1 — Đọc tự động + Sale duyệt"]
        B1["Pipeline: intent + trích xuất<br/>+ rules + validation ✅"]
        B2["Console/PWA duyệt 1 chạm ✅ (console)"]
        B3["Excel KiotViet + format Base ⬜"]
        B4["Pilot 1-2 nhóm, đo 4 KPI ⬜<br/>→ go/no-go mở rộng 200 nhóm"]
    end

    subgraph G2["GĐ2 — Tự động hoá & đa kênh"]
        C1["KiotViet API + Base API"]
        C2["Zalo OA 1:1 + ZNS"]
        C3["Messenger / web widget"]
        C4["Tự động đối soát ký gửi, công nợ + AUTO_SEND"]
    end

    subgraph G3["GĐ3 — Tối ưu & chủ động"]
        D1["Dự báo mùa vụ, cảnh báo tồn"]
        D2["Up-sell / nhắc tái đặt"]
        D3["Chuyển giao khi khách có IT"]
    end

    P0 --> G1 --> G2 --> G3
```

> Vị trí hiện tại: **cuối GĐ1** — lõi AI + rules + console demo đã xong trên dữ liệu/kênh thật; còn Excel KiotViet, lưu trữ Postgres, auth, pilot. Chi tiết: [tien-do-va-ke-hoach.md](tien-do-va-ke-hoach.md).

---

## 8. Chọn kênh tiếp nhận bằng `CHANNEL_MODE`

```mermaid
flowchart TB
    subgraph ZCA["CHANNEL_MODE=zca — KÊNH ĐỌC CHÍNH GĐ1"]
        Z1["Đăng nhập tài khoản Zalo PHỤ (quét QR)"] --> Z2["ZcaListener đọc MỌI tin nhóm<br/>(KHÔNG cần @mention)"]
        Z2 --> Z3["AI xử lý → đơn chờ duyệt"]
        Z3 --> Z4["Sale duyệt → gửi xác nhận về nhóm"]
    end

    subgraph BOTM["CHANNEL_MODE=bot — kênh phụ (chính thức)"]
        T1["Bot trong nhóm CHỈ nhận tin @mention<br/>(mention-gating gốc Zalo, không tắt được)"] --> T2["AI xử lý → đơn chờ duyệt"]
        T2 --> T3["Sale duyệt → Bot gửi (kèm nhãn tin tự động)"]
    end

    subgraph MOCKM["CHANNEL_MODE=mock — offline/CI + Co-pilot"]
        M1["Ô 'Bơm tin thử' / Sale dán tay"] --> M2["AI + rules y hệt, chỉ khác nguồn tin"]
    end

    ZCA -.->|"kênh chính lỗi/khoá → phủ nốt"| BOTM
    ZCA -.->|"mạng yếu / demo an toàn"| MOCKM
```

**Vì sao an toàn:** cả 3 chế độ dùng chung toàn bộ pipeline phía sau (`ChannelAdapter`); chuyển kênh chỉ là đổi 1 biến `CHANNEL_MODE`, dữ liệu đơn hàng không phụ thuộc kênh.

> **Điều kiện chặn kênh zca:** dùng **tài khoản Zalo phụ** (không dùng tài khoản Sale chính) + **văn bản chấp nhận rủi ro của khách** (vi phạm ToS Zalo, có thể bị khoá tài khoản; NĐ13/2023 + Luật BVDLCN 2025). Chi tiết PoC Bot: [poc-zalo-bot.md](poc-zalo-bot.md).
