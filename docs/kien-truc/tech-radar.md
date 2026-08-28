# TECH RADAR — Nexagnet Platform

> **Vai trò tài liệu:** canonical. Phân loại công nghệ theo mức độ cam kết, **kèm bằng chứng**.
> Không chứa trạng thái kế hoạch (✅/⬜) — cái đó ở
> [`phat-trien/ke-hoach/tong-quan.md`](../phat-trien/ke-hoach/tong-quan.md).
>
> **Cập nhật:** 27/08/2026 · **Đối chiếu mã nguồn tại:** `8b0f6ad603495fc90235d350b13550afd36a982d`

---

## 0. Cách đọc radar này

| Vòng | Nghĩa | Điều kiện |
|---|---|---|
| **ADOPT** | Đã cam kết. Mặc định dùng cho việc mới. | Đạt **L5 RUNTIME-PROVEN** trên stack tham chiếu, hoặc là quyết định nền tảng đã được chứng minh bằng chính hệ thống đang chạy |
| **TRIAL** | Đáng thử có kiểm soát, trong một phạm vi hẹp, có tiêu chí thoát. | Có bài toán thật đang đau, và có cách đo kết quả |
| **ASSESS** | Đáng theo dõi, **chưa** cài. | Chưa có bài toán đủ đau, hoặc chưa đủ dữ liệu để so sánh |
| **HOLD** | Không làm bây giờ. Không phải "xấu" — là **chưa tới lúc**. | Có **trigger** viết ra; chạm trigger mới đánh giá lại |
| **AVOID BUILDING** | Không tự viết. Đã có thứ tốt hơn ngoài kia. | Tự viết là đốt thời gian vào việc không tạo khác biệt |

**Nguyên tắc phân loại:** một công nghệ chỉ vào ADOPT khi có **bằng chứng runtime**, không phải khi
"đã cài xong". Bốn ngày 24–27/08/2026 cho ba trường hợp mã đúng nhưng chưa từng chạy — xem
[reference-platform-stack §7](reference-platform-stack.md#7-known-risks--unresolved).

---

## 1. FRAMEWORK DECISION

> §18 của bàn giao yêu cầu mục này. Kết luận: **giữ nguyên toàn bộ khung hiện tại.** Không có bằng
> chứng định lượng nào ủng hộ viết lại, và chi phí viết lại là chắc chắn trong khi lợi ích là giả
> định.

| Khung | Quyết định | Bằng chứng |
|---|---|---|
| **NestJS modular monolith** | **ADOPT** | 10 capability đã tách bằng `app-composition.ts` với chủ sở hữu tường minh (`foundation` + 9 capability). Việc tách `turn-processing` khỏi `sales-order` (PR #38, #40) chứng minh ranh giới module **thật sự chịu được** một lần cắt lớn. Chưa gặp giới hạn nào của monolith ở quy mô 10–20 đơn/ngày |
| **Next.js** | **ADOPT** | Console vận hành chạy thật, `verify` + `e2e` xanh mỗi lần CI |
| **Postgres + Prisma 6** | **ADOPT** (ghim v6, **không** lên v7 — `@adminjs/prisma` chưa hỗ trợ) | Nguồn sự thật runtime; `PERSISTENCE=prisma` chạy trên gd1-test |
| **Hatchet** | **ADOPT** | Engine + 2 worker chạy trên gd1-test; 24 bài integration trên engine thật xanh mỗi lần CI; `durableTask` + `sleepFor` đã chứng minh sống qua SIGKILL |
| **OpenTelemetry** | **ADOPT** (quy ước **và** runtime) | Bộ preload đầy đủ trong `apps/api/src/observability/otel/`, đường triển khai đã nối 28/08. ⚠️ **Chưa bật trên gd1-test** — xem §2 |
| **Docker Compose + Caddy** | **ADOPT cho quy mô hiện tại** | 13 service, TLS tự động, rollout theo digest, health + smoke sau rollout |
| **GitHub Actions** | **ADOPT** | 7 job CI; CD keyless qua Workload Identity Federation; deploy signal machine-readable |

**Không chuyển Kubernetes chỉ vì "enterprise"** — xem §5 HOLD để biết trigger.

---

## 2. ADOPT

| Công nghệ | Mặt phẳng | Mức parity trên gd1-test | Ghi chú |
|---|---|---|---|
| NestJS | 1 | **L5** | — |
| Next.js | 1 | **L5** | — |
| PostgreSQL + Prisma 6 | 1 | **L5** (có backup) | thử khôi phục vẫn nên định kỳ hoá |
| Hatchet | 1 | **L5** | `hatchet-postgres` **chưa** có chính sách retention/backup riêng → đây là khoảng trống **L4** |
| Docker Compose | 1 | **L5** | — |
| Caddy | 1 | **L5** | — |
| GitHub Actions | 2 | **L5** | — |
| **OpenTelemetry** | 1 | **L1 CODE-SUPPORTED** | Mã có đủ: `otel-preload.ts`, `otel-config.ts`, bridge cho worker, `privacy-span-processor`, `span-noise-filter`. Từ 28/08 compose gắn `--import` **có điều kiện** cho **api + 2 worker** và danh tính release dùng chung `release-sha.ts` (§7.6). **Khoá sau `OTEL_TRACING=on`, mặc định tắt** ⇒ vẫn **NOT DEPLOYED** cho tới lần deploy `observability_stack: on` đầu tiên. ADOPT **chưa đạt parity** |
| **ClickStack / HyperDX** | 1 hoặc 2 | **L1 CODE-SUPPORTED** (ClickHouse) · **L0** (HyperDX) | POC 24/08 chấm **GO 8/10**. Từ 28/08 kho ClickHouse + collector nằm ở `deploy/netviet/observability/` sau `profiles: ["observability"]`, cách ly có test khoá — nhưng **chưa container nào chạy trên gd1**. HyperDX **hoãn có chủ ý** (kéo theo MongoDB cho mỗi stack; đường đọc của P2 là `api` → ClickHouse). Hai sai khác so với thiết kế: [reference-platform-stack §8.6](reference-platform-stack.md#86-hai-sai-khác-có-chủ-ý-khi-hiện-thực-28082026) |

> **Hai dòng cuối là lý do `REFERENCE PARITY` chưa CLOSED.** Chúng ở vòng ADOPT vì quyết định đã
> chốt, không phải vì đã chạy.

---

## 3. TRIAL

| Công nghệ | Giải bài gì đang đau | Tiêu chí thoát TRIAL |
|---|---|---|
| **Portainer** | Quản lý container/stack nhiều môi trường mà không SSH từng máy | Điều khiển được stack gd1-test qua API/Edge agent; xem được log; không giành quyền với đường CD hiện tại |
| **OpenTofu** | Hạ tầng đang dựng bằng script + tay ⇒ không tái lập được | Dựng lại được một môi trường mới **từ số 0** bằng plan/apply |
| **Ansible** | Cấu hình host (Docker, thư mục, quyền) chưa khai báo được | Reconcile được đúng host hiện tại mà không làm hỏng stack đang chạy |
| **Langfuse** | Chất lượng LLM đang không đo được; prompt nằm trong code | Có golden dataset chạy được, so được hai prompt trên cùng bộ dữ liệu |
| **Vercel AI SDK** | Trừu tượng provider/tool, thay cho việc tự viết adapter từng nhà cung cấp | Đạt parity với `flowise-parser`/`order-parser` hiện có trên cùng bộ fixture |

### 3.1 Bằng chứng Portainer

Portainer Business Edition có **Edge Stacks**: định nghĩa một ứng dụng Compose và triển khai ra
nhiều điểm cuối, agent **poll** về server thay vì phải SSH vào từng máy; có **REST API** để tạo/cập
nhật stack và **stack webhook** để kích hoạt redeploy từ xa.

Một caveat có thật, và nó **hợp** với ta: build-step bị hạn chế trên môi trường Docker từ xa —
Portainer khuyến nghị build ảnh **bên ngoài** rồi mới deploy. Đường CD hiện tại của Nexagnet đã build
ảnh ở CI và rollout **theo digest**, nên ràng buộc này không phát sinh chi phí gì.

Nguồn: [Portainer — Add a new stack](https://docs.portainer.io/user/docker/stacks/add) ·
[Deploy Edge Stacks to Multiple Environments](https://oneuptime.com/blog/post/2026-03-20-portainer-edge-stacks-multiple-environments/view) ·
[Deploy Stacks via the Portainer API](https://oneuptime.com/blog/post/2026-03-20-deploy-stacks-portainer-api/view)

### 3.2 TRIAL LATER — có bài toán, chưa tới lúc

| Công nghệ | Vì sao chưa | Kích hoạt khi |
|---|---|---|
| **Keycloak** | Hiện `AUTH_MODE=session` đủ dùng cho console một tổ chức | Có khách thứ 2–3 cần SSO/MFA, hoặc cần liên kết danh tính |
| **OpenMeter** | Chưa tính tiền theo mức dùng | Hợp đồng đầu tiên có điều khoản theo hạn mức/lượng dùng |

---

## 4. ASSESS — theo dõi, chưa cài

| Công nghệ | Câu hỏi cần trả lời trước khi động vào |
|---|---|
| **LiteLLM** | Ta đã có `PARSER_MODE` chọn 3 adapter. LiteLLM thêm được gì ngoài một lớp trung gian nữa? Chỉ đáng khi số nhà cung cấp > 3 hoặc cần định tuyến/hạn mức theo chi phí |
| **Sentry Seer** | Xem §4.1 |
| **OpenFGA** | Phân quyền hiện là vai đơn giản. Chỉ đáng khi xuất hiện quan hệ kiểu "đại lý X xem được đơn của nhóm Y" |
| **OpenFeature** | Cờ tính năng hiện là biến môi trường + capability của tenant. Chỉ đáng khi cần bật/tắt **lúc chạy** mà không deploy |

### 4.1 Sentry Seer — bằng chứng và cổng chặn

Seer đã GA. Nhà cung cấp công bố **94,5% độ chính xác tìm nguyên nhân gốc** và hơn 38.000 issue đã
sửa; đáng tin nhất ở các mẫu lỗi phổ biến (null reference, sai kiểu, promise không bắt) và **kém tin
hơn ở lỗi kiến trúc sâu**. Seer Code Review **chỉ hỗ trợ tài khoản GitHub.com** (kể cả GitHub
Enterprise Cloud), không hỗ trợ GitLab/Bitbucket/GHES self-hosted.

Đối chiếu với ta:

- ✅ Repo nằm trên github.com ⇒ tương thích.
- ⚠️ **94,5% là số của nhà cung cấp**, đo trên tập lỗi của họ, không phải của ta. §39 của bàn giao
  yêu cầu **benchmark trên 10–20 lỗi lịch sử thật của Nexagnet** trước khi tin.
- 🚩 **Cổng chặn thật sự là dữ liệu, không phải kỹ thuật:** Seer cần đọc mã nguồn + ngữ cảnh lỗi.
  Danh sách bên thứ ba được duyệt hiện chỉ có **KiotViet + Claude** — DeepSeek đã nằm ngoài và đang
  là một khoản nợ tuân thủ. Thêm một bên thứ ba nữa **phải đi qua thoả thuận xử lý dữ liệu trước**,
  không phải sau.

Nguồn: [Seer GA changelog](https://sentry.io/changelog/seer-sentrys-ai-debugger-is-generally-available) ·
[Seer docs](https://docs.sentry.io/product/ai-in-sentry/seer) ·
[AI code review cookbook](https://sentry.io/cookbook/ai-code-review-seer/)

---

## 5. HOLD — có trigger, chưa chạm

| Công nghệ | Vì sao HOLD | **Trigger đánh giá lại** |
|---|---|---|
| **Kubernetes** | Compose + 1 VM đang phục vụ đủ; K8s đổi lấy độ phức tạp vận hành mà chưa mua được gì | nhiều host và việc xếp chỗ trở nên thủ công · số tenant đủ lớn · cần scale ngang **thường xuyên** · HA trở thành **điều khoản hợp đồng** · Compose/Ansible/Portainer trở thành nút thắt vận hành |
| **Backstage** | Danh mục dịch vụ cho **một** đội và vài chục dịch vụ là chi phí thuần | nhiều đội cùng làm, người mới mất hơn một ngày để tìm ra dịch vụ nào của ai |
| **n8n làm lõi** | Đã có quyết định: durability thuộc về Hatchet. Hai hệ điều phối là hai nguồn sự thật | chỉ dùng như công cụ ngoài rìa cho tích hợp không quan trọng, **không** đưa vào đường nghiệp vụ |
| **Temporal** | Trùng vai với Hatchet, vốn đã chạy thật và đã chứng minh | Hatchet chạm giới hạn thật đo được (thông lượng, vận hành, tính năng) |
| **Durability của LangGraph** | Trùng vai với Hatchet, ở tầng thấp hơn | không — dùng LangGraph (nếu có) **chỉ** cho điều phối agent trong một lượt, **không** cho durability |

---

## 6. AVOID BUILDING — không tự viết

| Thứ | Vì sao không |
|---|---|
| **Cơ sở dữ liệu trace** | ClickHouse/ClickStack đã giải xong. Tự viết là mua lấy bài toán lưu trữ chuỗi thời gian |
| **Nền tảng IAM** | Keycloak/OIDC là hạ tầng đã chín. Tự viết xác thực là tự tạo lỗ hổng |
| **Bộ máy tính tiền** | OpenMeter và tương đương đã có. Sai một dòng ở đây là sai tiền của khách |
| **Runtime cho coding agent** | Đã có nhiều lựa chọn. Khác biệt của Nexagnet nằm ở **bằng chứng nghiệp vụ**, không ở vòng lặp agent |
| **UI quản lý Docker tổng quát** | Portainer đã làm. Fleet View của Nexagnet chỉ nên sở hữu phần **Portainer không biết**: tenant, release, capability, deploy signal, kill switch, độ sẵn sàng nghiệp vụ |

---

## 7. Những gì radar này **không** kết luận

- Không kết luận Flowise phải bị gỡ. Flowise hiện là **1 trong 3** adapter parser
  (`PARSER_ADAPTERS = ['claude', 'deepseek', 'flowise']`) và container của nó nằm ở profile mặc
  định nên **luôn được deploy**, dù `ultty-gd1-test` đang chạy `PARSER_MODE=deepseek`. Quyết định
  thuộc P7 — xem [platform-roadmap-v2](../phat-trien/ke-hoach/platform-roadmap-v2.md).
- Không kết luận về thứ tự triển khai. Đó là việc của roadmap.

---

## 8. Liên quan

- [reference-platform-stack.md](reference-platform-stack.md) — hợp đồng stack tham chiếu, parity levels
- [agentic-ops.md](agentic-ops.md) — bốn mức tự động hoá vận hành
- [workflow-engine-evaluation.md](workflow-engine-evaluation.md) — nghiên cứu gốc dẫn tới ADOPT Hatchet
- [observability-review.md](observability-review.md) — nghiên cứu gốc dẫn tới ADOPT OTel
