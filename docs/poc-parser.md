# Kết quả eval parser DeepSeek (AI thật) — 08/07/2026

Đo độ chính xác **phân loại 7 intent** qua đúng pipeline thật (`/demo/simulate`), `PARSER_MODE=deepseek`,
trên **35 tin** Zalo tiếng Việt không dấu (`tools/poc-parser/eval-set.json` — phủ 7 intent + bẫy TH2/nhiều
SP/glossary/adversarial). Chạy lại: `pnpm --filter @ultty/poc-parser eval` (cần API DeepSeek đang chạy).

## Kết quả cuối: 100% (35/35)

| Intent | Đúng/Tổng | % |
|---|---|---|
| bao_hanh_khieu_nai | 3/3 | 100% |
| chinh_sach_cong_no | 3/3 | 100% |
| dat_don | 10/10 | 100% |
| hoi_gia | 6/6 | 100% |
| hoi_san_pham | 5/5 | 100% |
| khac | 5/5 | 100% |
| van_chuyen | 3/3 | 100% |
| **TỔNG** | **35/35** | **100%** |

Ngưỡng đề xuất demo: **≥ 90%**. → **ĐẠT**.

## Đã sửa gì để đạt (lịch sử tune)

| Mốc | Accuracy | Nguyên nhân / cách sửa |
|---|---|---|
| Ban đầu | **43%** | Prompt template luôn có khối `order` rỗng (`skuRaw:""`, `quantity:0`) → mọi intent hỏi bị **fail schema** → fallback `khac`. |
| Sau fix 1 | **91%** | Prompt rõ "intent≠dat_don thì KHÔNG có `order`" + **normalizer** bỏ `order` khi intent≠dat_don trước khi validate. |
| Sau fix 2 | **100%** | DeepSeek trả tiền dạng chuỗi ("11tr5", "1.150k") → **ép về số** (`coerceVnd`) trước khi validate; đọc không được thì bỏ field (chỉ để đối chiếu). |

Kèm: prompt dùng chung [parser-prompt.ts](../apps/api/src/pipeline/parser-prompt.ts) với **định nghĩa 7 intent + few-shot**
([intents.ts](../packages/shared/src/intents.ts)), **retry 1 lần** + timeout, điền `confidence.intent`.

## Lưu ý demo
- Chế độ tất định (`PARSER_MODE=mock`) vẫn là **lưới an toàn offline** nếu mạng/DeepSeek trục trặc.
- Khi có **tin thật của khách** (checklist B1-B2), thay/bổ sung vào `eval-set.json` + thêm golden output để đo cả field-accuracy.
