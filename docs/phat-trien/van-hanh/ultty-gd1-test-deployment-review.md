# Audit đường triển khai Ultty GD1-test — 20/08/2026

> Phase 0, chỉ đọc. Báo cáo này đối chiếu code tại
> `63ef2d6b3b550b149c9a75be3cb0b1fcf955fe0f`, lịch sử GitHub Actions và snapshot VM lúc
> `2026-08-20T12:01:47Z`. Không có workflow/deploy/runtime nào được thay đổi khi lập báo cáo.
>
> Kết luận chặn: **chưa được deploy Ultty GD1-test**. Target hiện tại không tách `gd1-test` khỏi
> `production`, runtime đang `CHANNEL_MODE=zca` + `AUTO_SEND=on`, deploy smoke không đi qua inbound
> Zalo thật, allowlist live không khớp hai ID trong runbook và chưa có xác nhận hai nhóm live là nhóm
> TEST được phê duyệt.

## 1. Current deployment path — code và runtime thật

```text
commit trên main
  -> ci.yml: verify + integration/Postgres + tenant-packs + Playwright + audit + images
  -> workflow_dispatch deploy-tenant.yml (tenant, environment)
  -> reusable-deploy-tenant.yml (GitHub Environment + OIDC)
  -> deploy-ci.sh
       -> build/push app + Flowise theo git SHA
       -> resolve hai image digest
       -> upload tenant pack ngoài image qua IAP
  -> deploy-remote.sh trên VM netviet
       -> giữ /srv/netviet/apps/zalo-ultty và runtime
       -> render Secret Manager -> .runtime/*.env (0600)
  -> deploy-stack.sh
       -> PostgreSQL -> Flowise -> bootstrap/contract
       -> Prisma migrate deploy -> auth bootstrap
       -> API + Web production runtime
       -> connect shared Caddy edge vào mạng tenant
       -> /demo/simulate smoke -> restart persistence check
       -> HTTPS checks -> backup/restore-check -> soak
```

Khoảng trống quan trọng: smoke hiện gọi `/demo/simulate`; nó không chờ/correlate một event inbound
từ nhóm Zalo TEST. Khi `AUTO_SEND=on`, smoke ngày 20/08 đã tạo order `sent` và một
`system_outbound` tới chính một group live trước khi job kết thúc đỏ.

## 2. Topology đã xác minh

| Câu hỏi | As-built/live answer | Bằng chứng |
|---|---|---|
| 1. Server | GCE VM `netviet`, project `netviet-host-968934832433`, zone `asia-southeast1-b`, đang `RUNNING` | `reusable-deploy-tenant.yml`; `gcloud compute instances describe` |
| 2. Stack | App dir `/srv/netviet/apps/zalo-ultty`; shared edge `/srv/netviet/edge` | `deploy-remote.sh`; live SSH |
| 3. Compose project | `zalo-ultty` | `compose.yaml` `name: zalo-${TENANT_SLUG}`; live labels |
| 4. Volumes | `zalo-ultty_postgres-data`, `zalo-ultty_flowise-data` | live `docker volume ls` |
| 5. DB | PostgreSQL 16; application DB `zalo`, Flowise DB `flowise`; 15 applied Prisma migrations | compose + deploy log run `32348168884`; live DB query |
| 6. Docker networks | `zalo-ultty_backend`, internal `zalo-ultty_data`; shared edge network `netviet-edge` | compose; live `docker network ls` |
| 7. Hostnames | `demo.35-187-235-82.sslip.io`, `operator.35-187-235-82.sslip.io`, `flowise.35-187-235-82.sslip.io` | live runtime env; static address `netviet-public-ip` |
| 8. Secret prefix | `zalo-ultty-*`; VM service account `netviet-vm@netviet-host-968934832433.iam.gserviceaccount.com` | `render-secrets.sh`; live IAM metadata |
| 9. Image path | GitHub OIDC builds neutral app + Flowise images, pushes by SHA, deploys by digest over IAP | workflows + `deploy-ci.sh` |
| 10. Current modes | Prisma, zca, DeepSeek direct, GCS, session auth, `DATA_CLASSIFICATION=test` by validated default, `AUTO_SEND=on` | live runtime + authenticated readiness/summary |
| 11. Chưa production-like | Parser is real DeepSeek but is not an approved production/customer-data parser; golden dataset missing; no separate GD1-test target | live readiness |
| 12. Mock/fallback | ERP is `kiotviet_mock` but **NOT IN GD1 SCOPE** and must not be called. Automated smoke uses `/demo/simulate`, not a mock parser, but is not real channel proof. | tenant v2; smoke code |
| 13. Minimum to real GD1-test | Explicit safe target/profile, preflight before build, `AUTO_SEND=off`, approved TEST allowlist, real inbound correlation verifier, release/rollback metadata, then CI-only rollout | findings below |

## 3. Live artifact and deployment history

| Item | Observed value |
|---|---|
| Running git SHA | `988754bbf1e71956c6b4fc5a463b80855730ca57` |
| Commit message | `feat: enable live pilot auto send by default` |
| App digest | `sha256:8ae2a9a53cb1fb0bce895ca20c82186e6bc4ede8f0d2dbf40f5a4e8548403cb3` |
| Flowise digest | `sha256:061150b92d19e4de92cc4b341852303aaa654cb03fc802be044f5e83da22f52b` |
| Rollback app digest recorded | `sha256:bb6f3c885d198a0affce17766e4cb40bd097f05ed67b999540a1aa290cf6a532` |
| Deploy run | GitHub Actions `32348168884`, input `ultty -> production`, **FAILED** |
| Failure | Smoke expected draft for live transport but order was already `sent` |
| Runtime after failed job | API/Web/Flowise/PostgreSQL all healthy on the new digests |
| Latest backup found | `gs://netviet-host-968934832433-backups/daily/20260819T192853Z/` |

The failed job did not roll the app back. The new image remained healthy and active. DB metadata at
audit time contained 202 messages and 172 orders; latest deploy smoke created a real outbound row at
`2026-08-20 08:31:56.047Z` to one allowlisted group. Runtime group IDs are deliberately redacted.

## 4. Boundary matrix — do not infer from defaults

| Boundary | Current live mode | Required GD1-test mode | Real/mock | Credential ready? | Decision |
|---|---|---|---|---|---|
| Tenant loader | mounted Ultty pack from the pre-v2 deployed SHA | Ultty v2 pack mounted read-only | Current real, but old contract | Current pack loads; v2 deploy not yet proven | BLOCK deploy until v2 artifact is target |
| Persistence | `prisma` / PostgreSQL 16 | `prisma` / PostgreSQL | REAL | DB healthy; 15 migrations | PASS boundary |
| Channel | `zca`, client state `ready` | explicit real Zalo adapter | REAL | credential file 0600, non-empty | PASS transport, FAIL safety plan |
| Zalo allowlist | two live IDs, redacted; exact set differs from the runbook | only approved TEST groups | REAL | file 0600, non-empty | BLOCK: approval of the live exact set is unproven |
| Parser | `deepseek` direct, model `deepseek-v4-flash` | real provider selected explicitly for TEST data | REAL | enabled secret + VM access | Technical PASS; not Pilot/customer-data approved |
| LLM/provider | DeepSeek direct | same explicit provider for GD1-test, or approved alternative | REAL | provider request succeeded in deploy smoke | PASS for TEST data only |
| Flowise | real healthy service, but not selected parser path | NOT REQUIRED when parser is DeepSeek direct | REAL but not in active parser path | Flowise secrets/contract healthy | NOT IN ACTIVE GD1 PARSER PATH |
| Media | `gcs`, bucket `netviet-host-968934832433-backups` | real GCS/object storage | REAL | ADC check reads bucket | PASS boundary |
| Catalog media | tenant catalog mount + public operator base URL | same real public path | REAL, content availability not fully proven | no static secret | Needs explicit URL fetch proof after safe deploy |
| Auth | `session` + Prisma sessions | `session` + Prisma | REAL | operator secret/version + login passed | PASS boundary |
| Rules | TypeScript deterministic rules | unchanged | REAL | tenant source-of-truth present | Current smoke proves rules, not real inbound correlation |
| Orders | Prisma repository | Prisma repository | REAL | DB contains persisted orders | PASS persistence; E2E correlation missing |
| Notifications | capability enabled; not part of GD1 order acceptance scenario | no notification proof required for order E2E | NOT IN GD1 SCOPE | not assessed as release gate | Do not call it mock proof |
| ERP | tenant declares `kiotviet_mock`; order path must not call it | no ERP call in GĐ1 | NOT IN GD1 SCOPE | not required | Contract must assert no ERP call |
| Invoice | no deployed port/runtime boundary | no invoice call in GĐ1 | NOT IN GD1 SCOPE | not required | No fake success allowed |

## 5. Secrets and configuration preflight snapshot

- All 14 secret names consumed by `render-secrets.sh` exist with at least one enabled version.
- The optional Bot token also has an enabled version.
- The VM service account has direct `roles/secretmanager.secretAccessor` on every audited secret.
- Operator and Flowise admin password payloads, plus Bot token, are scalar/non-empty without observed
  CR or embedded LF.
- Several secrets created on 31/07 still contain CR or embedded LF in the raw Secret Manager
  payload. `render-secrets.sh` removes `\r`; the rendered `.runtime/secrets.env` has no CR and
  `docker compose config --quiet` succeeds. This is not currently breaking runtime, but a strict new
  preflight must detect/report source sanitation rather than silently treating it as clean.
- No secret value was printed or copied into this report.

## 6. Coupling and safety findings

| Severity | Finding | Why it blocks or matters | Minimum action |
|---|---|---|---|
| P0 | Failed `production` deploy left new app running with real zca and `AUTO_SEND=on`; smoke emitted to a live allowlisted group | Job status is red but external state changed and outbound occurred | Do not redeploy. Human must decide whether to turn kill switch off; capture incident proof |
| P0 | `dev` and `production` select the same VM/app dir/compose project/DB/hostnames; `ENVIRONMENT` is not consumed by `deploy-ci.sh` | A new label `gd1-test` alone would still overwrite the same live stack | Introduce an explicit deployment target mapping and refuse ambiguous aliases |
| P1 | Deploy smoke posts `/demo/simulate`; no real Zalo inbound proof | Cannot satisfy no-mock E2E | Correlation-based verifier must wait for a real TEST-group event |
| P1 | Runtime default is `AUTO_SEND=on`, and live-channel smoke assumes it cannot send | Smoke itself sent a real outbound then failed | GD1-test profile must be explicit `AUTO_SEND=off`; smoke must assert it before stimulus |
| P1 | Live allowed-group IDs differ from the two IDs documented in `deploy/netviet/README.md` | Could subscribe/send to an unapproved group | Require an approved expected allowlist artifact/variable and exact-set preflight |
| P1 | No preflight before image build/push | Missing secret/IAM/credential/rollback/CI proof is found after expensive or mutating work | Run metadata-only preflight immediately after OIDC and before build |
| P1 | No CI-success gate for the exact deployment SHA | Manual deploy can run a commit whose CI is not known green | Verify exact SHA check/run before rollout |
| P1 | No separate GD1-test GitHub Environment | Test and Pilot approval semantics are conflated | Add `gd1-test` only with an explicit target; preserve `production` approvals |
| P2 | Deploy summary omits image digests, target, schema version, workflow identity and rollback digest | Running release cannot be reconstructed from the summary alone | Emit machine-readable release metadata and job summary |
| P2 | Rollback accepts only app digest/parser; it does not restore Flowise digest or run full generic verification | Partial rollback identity and proof | Record both digests; verify health/DB/tenant/network/auth/integration after rollback |
| P2 | Docs disagree with code about channel/parser/AUTO_SEND | Operators can execute the wrong safety model | Update docs only after the safe contract is implemented |

## 7. Minimal migration plan

### Increment 1 — no-mock/safety preflight

- TDD a deploy contract that rejects `mock`, `memory`, `none`, missing/empty/disabled secrets,
  inaccessible secrets, missing zca credential, unexpected allowlist, missing rollback digest,
  non-main SHA or exact SHA without green CI.
- Print a redacted deployment plan before any image build or server mutation.
- Keep the current server, hostname, compose project, networks, volumes, DB and secret prefix exactly
  unchanged.

### Increment 2 — explicit Ultty GD1-test target/profile

- Define `tenant + environment -> target` separately from tenant pack.
- Reuse the legacy target only after a human confirms it is the GD1-test target; otherwise provision
  or select a distinct existing target. Do not use the `production` environment as a test alias.
- Set every required runtime mode explicitly; no fallback defaults. Keep `AUTO_SEND=off` for the
  technical test and distinguish adapter verification from policy enablement.

### Increment 3 — automatic verification and real E2E

- Verify artifact, tenant v2 identity/branding, containers, DB/migrations, network uniqueness, auth,
  DeepSeek/selected provider, GCS and zca readiness.
- Send a correlation marker from an external test account into one approved Zalo TEST group; poll
  DB/API until the same marker proves listener -> parser -> rules -> order -> operator visibility.
- If outbound is in scope, perform one explicit/manual approval while `AUTO_SEND=off` and verify the
  real adapter/message record separately.

### Increment 4 — only after GD1-test proof

- Extract reusable `DeploymentTarget` lookup and capability-aware verifier.
- Keep Pilot promotion as a separate approval/data/security decision.

## 8. Things intentionally not changing

- No Pilot/production rollout, WATA deployment or Amico deployment.
- No volume/DB reset, secret deletion/rotation, hostname/project/compose rename, network rewire or
  infrastructure migration.
- No ERP/invoice implementation, shared DB, Kubernetes, microservices or control plane.
- No weakening of auth, readiness, parser policy, tenant-pack/image isolation, CI, migration or
  outbound safety gates.

## 9. Phase 0 verdict

`ULTYY GD1-test deploy eligibility: BLOCKED`.

The platform code can support a real technical path, and the existing runtime proves individual real
PostgreSQL, Zalo, DeepSeek, GCS and session-auth components. It does **not** yet prove the requested
release because the target/environment boundary is ambiguous, AUTO_SEND is live, group approval is
unproven, the deployed image predates tenant v2, and the only automated order smoke bypasses inbound
Zalo.
