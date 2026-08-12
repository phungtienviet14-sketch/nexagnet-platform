# PoC Parser — Golden eval trước go-live

Tool này đo parser + rules qua API thật (`POST /demo/simulate`) bằng golden dataset do khách cung cấp.
Dataset không commit vào source.

## Cách chạy

1. Chạy API với runtime cần đo, ví dụ đường production cho dữ liệu khách:

   ```bash
   DATA_CLASSIFICATION=customer PARSER_MODE=claude PERSISTENCE=prisma AUTH_MODE=api-key pnpm dev:api
   ```

2. Chạy eval ở terminal khác:

   ```bash
   GOLDEN_DATASET_PATH=/abs/path/golden-orders.json \
   EVAL_REPORT_PATH=/run/tenant/golden-eval-report.json \
   pnpm --filter @netviet/poc-parser eval
   ```

Nếu mỗi case không có `chatId`, đặt thêm:

```bash
EVAL_CHAT_ID=<zalo-chat-id>
```

`EVAL_REPORT_PATH` là tùy chọn. Khi có, tool ghi báo cáo JSON theo cách atomic để runtime
đọc cho màn hình **Sẵn sàng vận hành**; file này là dữ liệu triển khai của tenant, không đưa vào image.

## Exit code

- `0`: golden pass, `goLiveReady=true`.
- `1`: chạy được nhưng có mismatch hoặc lỗi eval.
- `2`: thiếu golden dataset, output có `goLiveReady=false` và `reason=missing_golden_dataset`.

## Schema dataset tối thiểu

```json
[
  {
    "text": "Meta HN gui 2 FELIX",
    "chatId": "optional-if-EVAL_CHAT_ID-is-set",
    "expected": {
      "intent": "dat_don",
      "dealerName": "Meta HN",
      "policy": "cong_no_30",
      "autoConfirmEligible": true,
      "order": {
        "orderType": "TH1",
        "items": [{ "sku": "FELIX", "quantity": 2 }],
        "grandTotal": 2300000
      }
    }
  }
]
```

## Metrics

Tool tính:

- intent accuracy;
- field accuracy;
- SKU accuracy;
- quantity accuracy;
- dealer accuracy;
- policy resolution accuracy;
- total/rules correctness;
- auto-confirm eligibility accuracy.
