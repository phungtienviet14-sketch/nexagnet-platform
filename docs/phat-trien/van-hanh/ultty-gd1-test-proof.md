# Ultty GD1-test preliminary evidence — BLOCKED

Snapshot time: 2026-08-20T19:00:37+07:00.

This file records read-only evidence from the currently deployed legacy Ultty runtime. It is **not**
a passing GD1-test proof and is not a record of a new deployment from branch
`codex/ultty-gd1-test-deploy`. A controlled release and fresh correlation-based Zalo E2E are still
required before this document can be promoted to PASS.

## Release identity

| Field | Value |
|---|---|
| Tenant | `ultty` |
| Latest deployment workflow input | `production`; code/docs also call this stack pre-pilot TEST, so the boundary is ambiguous |
| Server | GCP VM `netviet`, project `netviet-host-968934832433`, zone `asia-southeast1-b` |
| Hostnames | `demo.35-187-235-82.sslip.io`, `operator.35-187-235-82.sslip.io`, `flowise.35-187-235-82.sslip.io` |
| Compose project | `zalo-ultty` |
| App digest | `sha256:8ae2a9a53cb1fb0bce895ca20c82186e6bc4ede8f0d2dbf40f5a4e8548403cb3` |
| Flowise digest | `sha256:061150b92d19e4de92cc4b341852303aaa654cb03fc802be044f5e83da22f52b` |
| Image revision label | `988754bbf1e71956c6b4fc5a463b80855730ca57` |
| Audit worktree SHA | `63ef2d6b3b550b149c9a75be3cb0b1fcf955fe0f` |

## No-mock proof matrix

| Component | Implementation | Real/Mock | Proof |
|---|---|---|---|
| Web | Next.js production `next start` in app image | REAL | `zalo-ultty-web-1` healthy; public `/` title shows Ultty tenant branding |
| API | NestJS production container | REAL | `zalo-ultty-api-1` healthy; `/health` 200 |
| PostgreSQL | `postgres:16-alpine` tenant silo DB | REAL | `zalo-ultty-postgres-1` healthy; Prisma migration status up to date |
| Tenant package | `/srv/netviet/apps/zalo-ultty/tenant-pack` mounted read-only | REAL | Runtime uses `TENANT_DIR=/srv/tenant`; image excludes tenant data by design |
| Zalo | `zca-js` userbot via `ZaloUserClient`/`ZcaListener` | REAL | Authenticated `/zalo/status`: `channelMode=zca`, `state=ready`, allowed group count 2 |
| Parser | Direct `DeepSeekParser` | REAL for TEST data | `PARSER_MODE=deepseek`; recent orders have `trace.llmCalls=1` |
| LLM/provider | DeepSeek API | REAL for TEST data | DeepSeek secret has enabled version and VM accessor; parser mode active |
| Flowise | Flowise 3.1.4 patched image | REAL service, NOT active parser path | Container and `/api/v1/ping` healthy; current parser mode bypasses Flowise |
| Media storage | GCS `GcsMediaStore` with ADC | REAL | `/health/media` reachability healthy for bucket `netviet-host-968934832433-backups` |
| Rules | TypeScript deterministic rules engine | REAL | Orders persisted with priced/order state; no parser mock mode exists in runtime config |
| Orders | Prisma-backed order repository | REAL historical evidence | `Order` rows and Zalo-linked messages exist; no fresh controlled correlation was created in this audit |
| Auth | Session auth with Postgres-backed sessions | REAL | Anonymous `/zalo/status` returns 401; authenticated status/readiness succeeded |
| Notifications | App capability present | NOT PROVED IN GD1 SCOPE | Needs separate notification smoke if included in pilot scope |
| ERP | GĐ1 manual ERP, no ERP call | NOT IN GD1 SCOPE | Tenant has `kiotviet_mock`, but GĐ1 order path must not call ERP |
| Invoice | No current InvoicePort | NOT IN GD1 SCOPE | Not implemented in current platform |

## Runtime verification results

| Check | Result |
|---|---|
| Container health | PASS: app, web, Flowise and Postgres containers healthy |
| API health | PASS: public `/health` 200 |
| Web health/branding | PASS: Ultty title rendered |
| DB connectivity | PASS: Prisma reports schema up to date |
| Migration status | PASS: 15 migrations found; database schema up to date |
| Docker network isolation | PASS: API resolves a single tenant Flowise address |
| Parser/provider | PASS for GD1-test TEST data; FAIL for Pilot/customer-data readiness because parser is not Claude |
| Media/storage | PASS: GCS reachable by ADC |
| Zalo state | PASS: zca ready, two allowed groups |
| Authentication expectation | PASS: anonymous protected endpoint returns 401 |
| Readiness | FAIL for Pilot: `parser_not_production_ready`, `missing_golden_dataset` |
| Real inbound evidence | HISTORICAL ONLY: DB contains `Message.source=zca_listener`, linked `OrderMessage`, and orders with `trace.llmCalls=1`; no fresh controlled stimulus was sent |
| Real outbound evidence | HISTORICAL ONLY: DB contains `system_outbound`; the last failed deploy itself emitted one live outbound and therefore cannot be treated as a passing smoke |

## Components not in GD1 scope

- ERP API integration.
- Invoice integration.
- WATA UI/backend/integration.
- Amico deployment.
- Production scheduling, finance engine, OCR, CRM, shared DB, Kubernetes or microservices.

## Pilot blockers

- Parser production/data policy is not ready: active runtime is DeepSeek. The code readiness check
  currently names Claude as production-ready, while project security instructions list Codex among
  approved third-party paths. Before customer data, reconcile that policy to a contractually
  approved adapter or complete DeepSeek DPA/approval; do not infer approval from the readiness enum.
- Golden dataset report is missing.
- Dependency audit is not clean: `pnpm audit` reports 11 moderate and 1 low transitive
  advisories (AdminJS React Router, MCP SDK Hono, and Vitest/PostCSS paths). This pre-existing debt
  was not changed inside the deployment-safety increment and must be triaged before Pilot approval.
- Pilot legal/data approvals remain outside code: zca ToS acceptance, secondary Zalo account
  ownership, data-transfer/DPA decisions.
- A fresh controlled Zalo test message was not injected during this audit; current proof uses DB
  runtime history.

## Rollback procedure

Application image rollback keeps the selected real parser and uses an immutable previous digest:

```bash
sudo /srv/netviet/apps/zalo-ultty/rollback.sh \
  asia-southeast1-docker.pkg.dev/netviet-host-968934832433/netviet/zalo-ultty@sha256:<previous-digest> \
  deepseek
```

Do not automatically roll back destructive DB migrations. Verify health, DB connectivity, tenant
identity, network isolation, zca readiness and the real integration path after rollback. The current
script does not restore the Flowise digest, so full two-image rollback remains a blocker rather than
an implied capability.

## Verdict

`ULTYY GD1-test proof: BLOCKED` — this historical snapshot proves individual real components, but
not the requested freshly deployed, correlation-based no-mock release.
