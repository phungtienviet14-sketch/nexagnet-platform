# Đọc tín hiệu deploy

> Một lần deploy phát ra **bốn tín hiệu độc lập**, không phải một dấu ✓/✗.
> Bảng chi tiết nằm ở **Step Summary** của run GitHub Actions; bản máy đọc được là artifact
> `deploy-signals-<khách>-<môi-trường>/deploy-signals.json`.
> Danh tính bản phát hành mà các tín hiệu này đối chiếu: [danh-tinh-release.md](danh-tinh-release.md).

## Bốn tín hiệu

| Tín hiệu                        | Trả lời câu hỏi                                                                                                                                                   | Cứng?          |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **ROLLOUT**                     | Bản phát hành này đã thực sự được đặt lên chưa? (image đang chạy khớp digest, `RELEASE_GIT_SHA` **và** `release.json` tới được tiến trình và khớp nhau, service bắt buộc đã start)                   | ✅ chặn deploy |
| **HEALTH**                      | Bản vừa lên có sống không? (api/edge/worker/route công khai qua TLS)                                                                                              | ✅ chặn deploy |
| **DETERMINISTIC RUNTIME SMOKE** | Hợp đồng nền tảng còn đúng không? (auth + guard 401, nguồn sự thật trong Postgres, `/settings/readiness`, SSE, dữ liệu còn nguyên sau restart) — **không có LLM** | ✅ chặn deploy |
| **LIVE AI SMOKE**               | Model/provider có đọc đúng tin mẫu của khách không?                                                                                                               | ❌ báo riêng   |

## Mỗi màu nghĩa là gì

**`ROLLOUT_FAILED`** — bản phát hành chưa lên đầy đủ. Container đang chạy **không** phải image
vừa build, tiến trình `api` báo một git SHA khác, hoặc bản ghi `release.json` mà tiến trình
đọc được nói một commit khác (`RELEASE_IDENTITY_MISMATCH` / `RELEASE_MANIFEST_MISSING` — xem
[danh-tinh-release.md](danh-tinh-release.md)). Đây là lỗi nặng nhất: mọi thứ phía sau
có thể vẫn "khỏe" vì **bản cũ** đang phục vụ. Xem `reasons.rollout`
(`RELEASE_DIGEST_MISMATCH` / `RELEASE_SHA_MISMATCH` / `ROLLOUT_*_FAILED`).

**`RUNTIME_UNHEALTHY`** — bản mới đã lên nhưng runtime không khỏe. `WORKFLOW_WORKER_UNHEALTHY`
nghĩa là khuôn workflow **không có ai phục vụ** — việc bàn giao sẽ nằm trong hàng đợi mà không
ai biết. `PUBLIC_ROUTE_FAILED` thường là Caddy (xem bẫy inode trong `ci-cd.md`).

**`DETERMINISTIC_RUNTIME_CONTRACT_FAILED`** — runtime khỏe nhưng một hợp đồng nền tảng đã hỏng.
Đây là tín hiệu **đáng tin nhất** để chặn: nó không phụ thuộc model, nên nó đỏ là code hoặc dữ
liệu thật sự sai. `AUTH_CONTRACT_FAILED` = guard rơi (nghiêm trọng: dữ liệu khách hở).
`KNOWLEDGE_CONTRACT_FAILED` = nguồn sự thật chưa vào Postgres → rules engine không có gì để đối chiếu.

**`APPLICATION_ROLLED_OUT_HEALTHY__LIVE_AI_SMOKE_FAILED`** — **ứng dụng đã lên và đang khỏe.**
Chỉ có model không phân loại đúng tin mẫu. Đọc `details.liveAiSmoke.expectedIntent` vs
`actualIntent`. Đây **không** phải lý do rollback.

**`…__LIVE_AI_SMOKE_TIMEOUT`** / **`…__LIVE_AI_PROVIDER_UNAVAILABLE`** — provider chậm hoặc chết.
Phân biệt bằng mã HTTP: parser ném lỗi → `/demo/simulate` trả 5xx → `UNAVAILABLE`; parser trả lời
bình thường nhưng chậm → `TIMEOUT`.

**`DEPLOY_SIGNAL_INCOMPLETE`** — tầng shell chết ở một chỗ **chưa được gắn tín hiệu**, hoặc một
tầng chưa báo gì. Coi như **chưa chứng minh được gì** và luôn đỏ. Không bao giờ đọc nó thành
"chắc là ổn".

## Đọc trên GitHub Actions

Nhìn danh sách bước:

- **`Roll out release (…)` đỏ** → tầng cứng hỏng. Bảng ở Step Summary chỉ ra hàng FAIL đầu tiên.
- **`Roll out release (…)` xanh + `LIVE AI SMOKE` đỏ** → ứng dụng đã lên, đang khỏe; thứ không
  đạt là một **phụ thuộc ngoài**. Kết luận tổng của workflow vẫn đỏ theo policy hiện tại — cái
  khác là **nghĩa** của màu đỏ, không phải màu.

## Hai giới hạn đã biết

1. **Provider smoke của preflight vẫn là cổng cứng.** `gd1-test-preflight.mjs` chạy
   `smoke-test.mjs` trên bản **đang chạy** trước khi build; một lần model đoán sai ở đó vẫn chặn
   deploy trước khi bốn tín hiệu này kịp tồn tại. Cố ý giữ: đó là bằng chứng "provider đang hoạt
   động", không phải bằng chứng về bản mới.
2. **`RELEASE_MANIFEST_PATH` vẫn rỗng trên stack.** `.runtime/release.json` chưa được mount vào
   container, nên runtime lấy danh tính bản phát hành từ biến `RELEASE_GIT_SHA` — và cổng ROLLOUT
   **đối chiếu chính biến đó** với bản vừa build, nên tín hiệu không bị ảnh hưởng. Việc mount
   manifest là nợ riêng (đổi `compose.yaml` + thứ tự ghi file, không cùng biên với milestone này).
