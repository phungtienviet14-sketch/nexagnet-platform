# SƠ ĐỒ HỆ THỐNG — AI AGENT U ULTTY

Bộ sơ đồ minh họa cho [thiet-ke-ky-thuat-hop-nhat.md](thiet-ke-ky-thuat-hop-nhat.md). Xem trực tiếp trên GitHub hoặc VS Code (extension Markdown Preview Mermaid).

---

## 1. Bối cảnh tổng thể (ai dùng, hệ thống nói chuyện với gì)

```mermaid
flowchart LR
    DL["👥 Đại lý / CTV<br/>(200-300 đối tác)"]
    GRP["💬 ~200-350 nhóm Zalo"]
    SALE["🧑‍💼 Sale U Ultty<br/>(duyệt 1 chạm)"]
    KT["🧾 Kế toán"]

    subgraph SYS["🤖 Hệ thống AI Agent (NetViet vận hành - cloud)"]
        PWA["📱 App PWA 5 tab"]
        API["⚙️ Backend NestJS"]
    end

    CLAUDE["🧠 Claude API<br/>(intent + trích xuất)"]
    KV["📦 KiotViet<br/>(đơn + tồn kho)"]
    BASE["🗂️ Base<br/>(duyệt + giao vận)"]
    SHIP["🚚 Aha / Viettel"]

    DL -->|"nhắn đặt hàng<br/>(viết tắt, không dấu)"| GRP
    GRP -->|"GĐ1: Sale dán tin nhắn<br/>hoặc Bot tự đọc (nếu PoC đạt)"| API
    API <-->|"gọi AI"| CLAUDE
    API --> PWA
    SALE -->|duyệt / sửa| PWA
    PWA -->|"format xác nhận TH1/TH2"| GRP
    API -->|"GĐ1: Excel<br/>GĐ2: API"| KV
    API -->|"GĐ1: format dán tay<br/>GĐ2: API"| BASE
    BASE --> SHIP
    KT -->|kiểm tra khi lên hệ thống| KV
```

**Đọc sơ đồ:** đại lý nhắn vào nhóm Zalo như hiện tại — không phải đổi thói quen. Hệ thống đứng giữa, AI soạn sẵn, Sale luôn là người bấm duyệt trước khi bất kỳ thứ gì đi ra ngoài.

---

## 2. Kiến trúc 6 tầng (NetViet) → module code thực tế

```mermaid
flowchart TB
    subgraph L1["Tầng 1 — Kênh (channels/)"]
        CA["ChannelAdapter (interface)"]
        COP["CopilotAdapter<br/>(Sale dán tin)"]
        BOT["BotPlatformAdapter<br/>(webhook - feature flag)"]
        MOCK["MockAdapter (test)"]
        CA --- COP
        CA --- BOT
        CA --- MOCK
    end

    subgraph L2["Tầng 2 — Tiếp nhận (ingest/)"]
        SAVE["Lưu messages NGAY khi nhận<br/>(idempotent theo message_id)"]
        IDENT["Gán danh tính:<br/>nhóm → đại lý/CTV"]
        Q["BullMQ queue"]
    end

    subgraph L3["Tầng 3 — Lõi AI (pipeline/)"]
        ORCH["AgentOrchestrator — Router (1 call Claude)<br/>→ dispatch 6 vai chuyên trách → Giám sát<br/>① intent (7 loại) ② trích xuất TH1/TH2 ③ RAG kèm nguồn"]
    end

    subgraph L4["Tầng 4 — Luật nghiệp vụ (rules/) — TypeScript tất định, KHÔNG dùng LLM"]
        PRICE["Giá theo cấp đại lý"]
        SHIPR["Phí ship<br/>(≥2 SP miễn / Grab / Viettel)"]
        POL["Chính sách: công nợ 30-45<br/>ký gửi / trả ngay / COD"]
        VAT["VAT + format TH1/TH2"]
    end

    subgraph L5["Tầng 5 — Tích hợp (kiotviet/, base/)"]
        XLS["GĐ1: Excel export / format dán"]
        APIS["GĐ2: KiotViet API, Base API, vận đơn"]
    end

    subgraph L6["Tầng 6 — Dữ liệu & quản trị"]
        KNOW["knowledge/ — NGUỒN SỰ THẬT:<br/>SKU, bảng giá, chính sách, glossary"]
        ORD["orders/ + warranty/"]
        MET["metrics/ — KPI"]
        AUTH["auth/ — phân quyền + audit log"]
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
    actor S as Sale (PWA)
    participant IN as Ingest
    participant AI as AgentOrchestrator (Router + 6 vai)
    participant RU as Rules engine
    participant DB as PostgreSQL
    participant KV as KiotViet

    DL->>DL: "gui 10 ghe felix ve TN cho c, ko lay VAT"

    alt Chế độ Co-pilot (baseline GĐ1)
        S->>IN: Dán tin nhắn vào tab Tin nhắn
    else Bot Platform (nếu PoC đạt)
        DL-->>IN: Webhook message.text.received
    end

    IN->>DB: Lưu message thô + platform + nguồn
    IN->>AI: Enqueue (BullMQ)
    AI->>DB: Lấy ngữ cảnh: nhóm→đại lý Meta HN,<br/>18-20 SKU, glossary (TN=Thái Nguyên), rules bật
    AI->>AI: intent = dat_don<br/>trích xuất: 10 x Ghế Felix, giao TN, không VAT
    AI->>RU: JSON đơn thô
    RU->>DB: Tra giá cấp đại lý + phí ship + chính sách công nợ
    RU->>RU: Validation: SKU hợp lệ? SL×giá ≈ tổng?<br/>Confidence từng field
    RU->>DB: Tạo order (pending_review) + format TH1
    DB-->>S: 🔔 Đơn chờ duyệt trên PWA
    S->>S: Kiểm tra (field mờ được tô vàng)
    S->>DB: Duyệt 1 chạm (hoặc sửa → lưu parse_feedback)
    S->>DL: Copy format xác nhận → gửi vào nhóm
    S->>KV: GĐ1: xuất Excel import / GĐ2: API tự đẩy
    DB->>DB: Ghi kpi_events (thời gian chốt, có sửa hay không)
```

---

## 4. Vòng đời một đơn hàng (state machine)

```mermaid
stateDiagram-v2
    [*] --> draft: AI trích xuất xong
    draft --> pending_review: qua validation, đủ tin cậy
    draft --> needs_edit: có field mơ hồ (SKU lạ, tổng lệch, thiếu địa chỉ)
    pending_review --> approved: Sale duyệt 1 chạm
    pending_review --> needs_edit: Sale phát hiện sai
    needs_edit --> approved: Sale sửa xong (bản sửa lưu parse_feedback)
    pending_review --> rejected: không phải đơn thật / trùng
    needs_edit --> rejected
    approved --> exported: xuất Excel KiotViet (GĐ1) hoặc sync API (GĐ2)
    exported --> [*]
    rejected --> [*]

    note right of needs_edit
        Handoff người thật (NetViet 5.6):
        đơn lớn bất thường, deal riêng,
        khiếu nại gắt → không auto
    end note
```

---

## 5. Bảy loại ý định (intent) và đường đi của từng loại

```mermaid
flowchart TD
    MSG["Tin nhắn mới"] --> INT{"Router (Điều phối)<br/>phân loại intent + danh tính"}

    INT -->|dat_don| EX["Trích xuất TH1/TH2<br/>→ rules → hàng đợi duyệt"]
    INT -->|hoi_gia| RAG1["RAG: bảng giá theo cấp đại lý<br/>→ draft trả lời KÈM nguồn"]
    INT -->|hoi_san_pham| RAG2["RAG: kho tri thức SP<br/>→ draft mô tả + ảnh/video"]
    INT -->|chinh_sach_cong_no| RAG3["RAG: chính sách + hồ sơ đại lý<br/>→ draft điều kiện áp dụng"]
    INT -->|bao_hanh_khieu_nai| WAR["Tạo warranty_ticket<br/>phân nhánh 7 ngày / ngoài 7 ngày / giao thiếu<br/>→ định tuyến nhóm kỹ thuật"]
    INT -->|van_chuyen| SHIP2["Tra trạng thái vận đơn (GĐ2)<br/>GĐ1: draft cho Sale trả lời"]
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

## 6. Dữ liệu chính (ERD rút gọn)

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
        string tier "cấp đại lý / CTV"
        string default_policy "công nợ 30-45 / ký gửi / trả ngay / COD"
    }
    GROUPS {
        string platform "zalo (GĐ2: messenger...)"
        string external_id
    }
    MESSAGES {
        string source "copilot_paste | webhook"
        string raw_text
    }
    ORDERS {
        string status "draft→pending_review→approved→exported"
        string order_type "TH1 | TH2"
        json field_confidence
        int total_amount
    }
    PRODUCTS {
        string sku "18-20 SKU"
        string name
    }
    PRICE_TIERS {
        string tier
        int price
        date valid_month "bảng giá theo tháng"
    }
    PARSE_FEEDBACK {
        json ai_output
        json corrected
    }
```

Ngoài ra còn: `glossary_entries` (TN→Thái Nguyên...), `prompt_rules` (tab Prompt AI bật/tắt), `policies`, `kpi_events`, `audit_logs`, `users`.

---

## 7. Lộ trình 3 giai đoạn (theo NetViet, đã ghép PoC)

```mermaid
flowchart LR
    subgraph P0["Tuần 1 — Chuẩn bị"]
        A1["Scaffold monorepo"]
        A2["PoC Zalo Bot Platform<br/>(3 câu hỏi Beta)"]
        A3["Nguồn sự thật:<br/>SKU + giá + chính sách + glossary"]
        A4["Bake-off parser<br/>trên 20-30 tin thật"]
    end

    subgraph G1["GĐ1 — Co-pilot (tuần 2-4)"]
        B1["Pipeline: intent + trích xuất<br/>+ rules + validation"]
        B2["PWA 5 tab, duyệt 1 chạm"]
        B3["Excel KiotViet + format Base"]
        B4["Pilot 1-2 nhóm, đo 4 KPI<br/>→ go/no-go mở rộng 200 nhóm"]
    end

    subgraph G2["GĐ2 — Tự động hóa & đa kênh"]
        C1["KiotViet API + Base API"]
        C2["Zalo OA 1:1 + ZNS"]
        C3["Messenger / web widget"]
        C4["Tự động đối soát ký gửi, công nợ"]
    end

    subgraph G3["GĐ3 — Tối ưu & chủ động"]
        D1["Dự báo mùa vụ, cảnh báo tồn"]
        D2["Up-sell / nhắc tái đặt"]
        D3["Chuyển giao khi khách có IT"]
    end

    P0 --> G1 --> G2 --> G3
    A2 -.->|"nếu PoC đạt: bot tự đọc tin<br/>thay dán tay ngay trong GĐ1"| B1
```

---

## 8. Hai chế độ tiếp nhận tin nhắn (quyết định bởi PoC)

```mermaid
flowchart TB
    subgraph COP["Chế độ A — Co-pilot (baseline, luôn hoạt động)"]
        S1["Sale thấy tin nhắn trong nhóm Zalo"] --> S2["Mở PWA → dán tin nhắn<br/>(hoặc ảnh chụp bảng)"]
        S2 --> S3["AI xử lý → đơn chờ duyệt"]
        S3 --> S4["Sale duyệt → copy format<br/>→ tự gửi lại nhóm"]
    end

    subgraph BOTM["Chế độ B — Bot Platform (nếu PoC đạt 3 câu hỏi)"]
        T1["Bot trong nhóm nhận tin realtime<br/>(webhook chính thức)"] --> T2["AI xử lý → đơn chờ duyệt<br/>+ thông báo đẩy cho Sale"]
        T2 --> T3["Sale duyệt trên PWA"]
        T3 --> T4["Bot gửi format xác nhận<br/>kèm nhãn tin tự động"]
    end

    COP -.->|"PoC đạt → nâng cấp<br/>không đổi kiến trúc (cùng ChannelAdapter)"| BOTM
    BOTM -.->|"bot bị khóa / Beta đổi chính sách<br/>→ quay về ngay lập tức"| COP
```

**Vì sao an toàn:** hai chế độ dùng chung toàn bộ pipeline phía sau; chuyển qua lại chỉ là bật/tắt adapter, dữ liệu đơn hàng không phụ thuộc kênh.

> **Cập nhật sau PoC 07/07/2026 ([poc-zalo-bot.md](poc-zalo-bot.md)):** Chế độ B (Bot Platform) đã xác nhận khả thi NHƯNG trong nhóm bot **chỉ nhận tin @mention nó** (mention-gating gốc của Zalo, không tắt được). ⇒ hai chế độ **chạy SONG SONG (kênh lai)**, không phải thay thế: đơn text-có-tag → Bot tự đọc; đơn không tag / ảnh / thoại → Co-pilot dán tay. Điều kiện bật Bot mode: khách đồng ý để đại lý tag bot (checklist D2).
