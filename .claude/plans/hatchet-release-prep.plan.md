# Plan: Release preparation — Hatchet workflow engine → `main`

**Session type**: RELEASE PREPARATION ONLY. No deployment, no VM mutation, no runtime change.
**Branch**: `feat/hoi-thoai-chot-don-main` @ `65beb6c8b3a34130a3b3a59f918eefc4ad920dc7`
**Target**: `origin/main` @ `84146ab8cc395a607dc6fa2392f688b05293c726`
**Complexity**: Medium — mechanically simple, high blast radius (3 concurrent workstreams in one tree)

---

## A. Audit findings (read-only, already completed)

### A1. Git topology

| Fact | Value |
|---|---|
| HEAD | `65beb6c` |
| `origin/main` | `84146ab` |
| local `main` | `e8de1bb` — **stale: 20 behind, +1 stray local commit** |
| `origin/feat/hoi-thoai-chot-don-main` | `f4ed3ee` (= merge-base; remote branch never advanced) |
| merge-base(`origin/main`, HEAD) | `f4ed3ee` |
| commits `origin/main..HEAD` | **38** |
| `git ls-files apps/mini` | **0 → untracked, confirmed** |

### A2. Commit range inventory — 38 commits, 109 files, +18152 / −59

| Subsystem | Files | Verdict |
|---|---|---|
| `apps/api` | 54 | Hatchet foundation + workflow worker + outbox |
| `tools/poc-workflow-engine` | 23 | PoC compose + evidence docs |
| `packages/tenant` | 10 | workflow binding schema + fixtures |
| `deploy/netviet` | 10 | D2–D6 compose/secrets/backup/bootstrap |
| `.claude/plans` | 4 | plan artifacts |
| `docs/` | 4 | handoff + runbook + architecture |
| `.github/workflows` | 2 | `deploy-tenant.yml`, `reusable-deploy-tenant.yml` |
| `tenants/ultty` | 1 | `tenant.json` workflow binding |
| `pnpm-lock.yaml` | 1 | Hatchet SDK deps |

**All 38 commits are workflow/Hatchet-scoped.** No session-8-only subset needs separating —
the whole range is one coherent workstream spanning sessions 3–8.

### A3. Migrations in range

- `apps/api/prisma/migrations/20260822180000_workflow_outbox/migration.sql` (**new**)
- `apps/api/prisma/schema.prisma` (modified)

### A4. Accidental parallel work — **NONE FOUND**

Every concurrent path checked against the commit range:

| Path | Files in range |
|---|---|
| `apps/mini` | 0 |
| `apps/web` | 0 |
| `tenants/wata` | 0 |
| `docs/.../tong-quan.md` | 0 |
| `observability/decision-reasons.ts` | 0 |
| `apps/api/src/orders` | 0 |
| `van-hanh/debugging.md` | 0 |
| `tools/trace-view.mjs` | 0 |
| `packages/tenant/src/tenant.schema.ts` | **1 — shared file, see A5** |

The dirty working tree (16 modified + 13 untracked paths) is **entirely** parallel work
and is **not** in the push. Dirty is not the same as in-PR, and clean is not the same as
not-in-PR — both directions were checked independently.

### A5. Merge conflict surface — 4 files, **dry-run merge is CLEAN**

`origin/main` advanced 11 commits (WATA work, PRs #30/#31/#32) since the merge-base.
Files touched by *both* sides:

- `.github/workflows/deploy-tenant.yml`
- `deploy/netviet/caddy-route-contract.test.mjs`
- `deploy/netviet/deploy-stack.sh`
- `packages/tenant/src/tenant.schema.ts` (also dirty locally — three-way touch point)

`git merge-tree --write-tree origin/main HEAD` produced tree `3143853`, exit 0, **no conflicts**.

### A6. ECC pre-push hook — bypass mechanism **VERIFIED LEGITIMATE**

Hook is **global**, not repo-local: `core.hooksPath = C:/Users/phung/.codex/git-hooks`.
`.git/hooks/` is empty; there is no `.husky/`.

`pre-push` line 7 — the **first** branch in the script:

```bash
if [[ "${ECC_SKIP_GIT_HOOKS:-0}" == "1" || "${ECC_SKIP_PREPUSH:-0}" == "1" ]]; then
  exit 0
fi
```

Three sanctioned escape hatches exist: `ECC_SKIP_PREPUSH=1`, `ECC_SKIP_GIT_HOOKS=1`, and
sentinel files `.ecc-hooks-disable` / `.git/ecc-hooks-disable`.
**`ECC_SKIP_PREPUSH` is a designed, first-class bypass — not an invented variable.** Gate passes.

The hook runs `lint`, `typecheck`, `test`, `build` **over the working tree**, so it lints
untracked `apps/mini/`. CI checks out from git, where `apps/mini` does not exist.
**The bypass skips nothing real: CI re-runs the same four scripts on exactly the pushed content.**

### A7. Tooling and convention

| Item | Value |
|---|---|
| `gh` CLI | v2.97.0, authed as `phungtienviet14-sketch`, scopes `repo` + `workflow` |
| Remote | `github.com/phungtienviet14-sketch/nexagnet-platform` |
| Open PR for branch | **none** — PRs #22/#24/#25/#26/#27/#28/#29 all MERGED |
| Merge convention | **merge commit** ("Merge pull request #NN from ...") — never squash/rebase |
| Branch reuse | Same branch reused for all 7 prior PRs, so **never `--delete-branch`** |
| `ci.yml` jobs | `verify`, `integration`, `tenant-packs`, `e2e`, `audit`, `images` |
| `ci.yml` triggers | `push: [main]` plus `pull_request` — PR gets CI, merge commit gets CI |

### A8. Deploy gate (`reusable-deploy-tenant.yml`) — read, not run

```bash
[[ "${GITHUB_REF}" == 'refs/heads/main' ]] || exit 1
# then: ci.yml run with head_sha=GITHUB_SHA, branch=main, status=completed -> conclusion == 'success'
```

### A9. Secret scan — CLEAN

All pattern hits in the +18k diff are Vietnamese prose *about* secret handling
(contract test names, `credentialRef`, bootstrap flow). No literal secrets.
Only `.env.example` is tracked. `tools/poc-workflow-engine/.env` is gitignored.

### A10. Local infra for the integration suite — UP

`pocwf-hatchet-engine-1`, `pocwf-hatchet-dashboard-1`, `pocwf-postgres-1` (4h),
`z-postgres-1` (healthy, 12h). `tools/poc-workflow-engine/.env` present.
**The workflow IT suite can run for real this session.**

### A11. Finding for the PR review gate

`deploy/netviet/workflow-isolation.contract.test.mjs` — **added by this branch, 15 tests,
7 negative cases, counted by handoff section 41 as D3 done** — is wired into **nothing**:
no `package.json` script, no CI job. Its only mention outside itself is a prose comment in
`render-secrets.sh:355`. **A contract test CI never runs is not a contract.** See Decision D5.

---

## B. Decisions that shape execution

**D1 — Merge server-side via `gh pr merge`, never locally.**
Local `main` (`e8de1bb`) carries a stray commit absent from `origin/main` and is 20 behind.
A local merge would drag it in and would require touching the dirty working tree.
Server-side merge touches neither. This also satisfies "no stash, no reset, no clean" for free.

**D2 — Never `git add -A` or `git add .`.**
`apps/mini/` is untracked but **not gitignored**; so are `tenants/wata/`, `apps/web/public/`,
5 PNG screenshots, and 3 orders spec files. One wildcard add sweeps three sessions of other
people's work into this PR. **No new commits are needed at all** — the 38 commits already exist;
the push is a pure ref update.

**D3 — Scoped validation, never `pnpm -r` or `eslint .`.**
`pnpm -r test` would run web + orders + observability tests against *dirty parallel code* and
produce red that is not our regression. `eslint .` is precisely what the pre-push hook already
fails on. Validate only what the commit range actually contains.

**D4 — PR CI is the authoritative clean-tree gate.**
Local validation runs against a contaminated tree. GitHub checks out pure git content, which
is exactly what we are pushing. Local checks are for fast feedback; PR CI is the proof.
*(Optional stronger local proof: `git worktree add` a pristine HEAD checkout and validate there.
Costs a full `pnpm install` plus `prisma generate`. Worth it only if local proof is wanted
before push — otherwise it duplicates PR CI.)*

**D5 — The unwired contract test (A11) is a user decision, not a unilateral fix.**
Wiring it changes what CI executes and could turn CI red on content already believed done.
Leaving it means D3 is weaker than the handoff claims. **Raise at the PR review gate; do not
decide alone.** This is not "editing Hatchet code to ease the merge" either way.

---

## C. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `ci.yml` sets `concurrency: cancel-in-progress: true` on `ci-${{ github.ref }}`. A parallel merge to main cancels **our** merge-commit CI, giving `conclusion=cancelled`, and the D8 deploy gate rejects it | **Medium** (WATA session merged 3 PRs recently) | Blocks D8 | After merge, assert `conclusion == success` for the **exact** merge SHA. If cancelled, re-run `ci.yml` on that SHA and re-assert |
| Parallel session commits or pushes mid-flight | Medium | Wrong content merged | **Re-run the Phase 0 audit immediately before push, before PR, and before merge** |
| Full `@netviet/api` suite red from dirty `src/orders` and `src/observability` | Medium | False regression | Classify failures by path: `src/workflow` is ours, `src/orders` and `src/observability` are not |
| `pnpm-lock.yaml` adds Hatchet SDK, so CI `audit` job (`--audit-level high`) fails | Low-Med | PR CI red | Report as blocker; do not silently downgrade the audit gate |
| Stale Prisma client versus changed `schema.prisma` | Low | Local-only false red | Run `prisma generate` before api tests |
| Accidental `--delete-branch` on merge | Low | Breaks the 7-PR reuse workflow | Merge without `--delete-branch` |
| 4-file conflict surface reopens if main advances again | Low | Merge conflict | Re-run `git merge-tree` right before merge |

---

## D. Phases

### Phase 0 — Re-audit (repeat before **every** mutating step)

```bash
git status --short --branch
git rev-parse HEAD
git fetch origin
git rev-parse origin/main
git rev-list --count origin/main..HEAD
git merge-tree --write-tree --name-only origin/main HEAD
```

**Gate**: HEAD still `65beb6c`; count still 38 (or the change explained); merge-tree still clean.

---

### Phase 1 — Scoped validation

**V1 — workflow unit / non-IT** (ours, untouched by parallel work)

```bash
pnpm --filter @netviet/api exec vitest run src/workflow --no-file-parallelism
```

**V2 — workflow integration** (infra confirmed up in A10; sequential is mandatory per handoff section 26)

```bash
set -a; . tools/poc-workflow-engine/.env; set +a
RUN_PRISMA_IT=1 RUN_WORKFLOW_IT=1 \
WORKFLOW_ENGINE_HOST_PORT=localhost:7744 \
WORKFLOW_ENGINE_TLS_STRATEGY=none \
DATABASE_URL=postgresql://netviet:netviet_local@localhost:5432/netviet \
pnpm --filter @netviet/api exec vitest run src/workflow --no-file-parallelism
```

Source the env file; never echo the token.

**V3 — tenant workflow binding** (only the specs this branch added; `tenant.config.spec.ts` is dirty)

```bash
pnpm --filter "@netviet/tenant..." build
pnpm --filter @netviet/tenant exec vitest run src/__tests__/workflow-binding.spec.ts src/__tests__/workflow-fixture.spec.ts
```

**V4 — deploy contracts**

```bash
pnpm test:deploy-routes
pnpm test:deploy-contracts
node --test deploy/netviet/workflow-isolation.contract.test.mjs
```

**V5 — api lint and typecheck, scoped**

```bash
pnpm --filter @netviet/api exec prisma generate
pnpm --filter @netviet/api exec eslint src
pnpm --filter @netviet/api typecheck
```

**Not run, deliberately**: `pnpm lint` (equals `eslint .`, hits untracked `apps/mini`),
`pnpm -r test` (runs dirty web and orders), any `apps/web` gate (**0 web files in range**).

**Gate**: V1–V5 green, or every failure attributed to a path outside the commit range with evidence.

---

### Phase 2 — Push feature branch

Pre-flight:

```bash
git status --short --branch
git diff --cached --name-only
git log --oneline origin/main..HEAD | wc -l
```

`git diff --cached --name-only` must be empty — nothing staged.

Push (bypass justified by A6 plus Phase 1):

```bash
ECC_SKIP_PREPUSH=1 git push origin feat/hoi-thoai-chot-don-main
```

**Never** `--no-verify`. **Never** `--force`. **Never** push `main`.

Verify:

```bash
git rev-parse HEAD
git ls-remote origin refs/heads/feat/hoi-thoai-chot-don-main
```

**Gate**: remote SHA equals local HEAD equals `65beb6c`.

---

### Phase 3 — Open PR and review the full diff

```bash
gh pr create --base main --head feat/hoi-thoai-chot-don-main --title "<title>" --body-file <path>
```

PR body must state: Hatchet foundation; reliability W4–W12; D1 readiness; deployment gates
D2–D7; `WORKFLOW_ENGINE` defaults **off**; **nothing deployed**; known debts;
parallel work explicitly **not** included.

Review the **full 109-file diff**, not the last 9 commits: migrations, `compose.yaml`,
both GitHub Actions files, `tenants/ultty/tenant.json`, secret references, production defaults.

**Gate**: PR contains exactly the 38 audited commits and 109 files. Anything else means **STOP**.
**Raise Decision D5 (unwired contract test) here.**

---

### Phase 4 — PR CI

```bash
gh pr checks <N> --watch
```

Per failure: capture exact job and exact error, then classify as
branch regression, environment, parallel-untracked, or pre-existing-on-main.
Regression means minimal fix plus test plus commit plus push. Not ours means **report it; do not
fix another subsystem to force green**.

**Gate**: all required checks green.

---

### Phase 5 — Merge (hard gate)

Pre-merge assertions: full diff reviewed; no parallel work; no secrets; Phase 1 green;
PR CI green; merge-tree still clean; range still 38.

**Merge is an irreversible, outward-facing action, so confirm with the user before running it,**
unless explicit merge-when-green authority was already granted in the session.

```bash
gh pr merge <N> --merge
git fetch origin && git rev-parse origin/main
```

Merge commit strategy matches repo convention. **No `--delete-branch`.**

**Gate**: merge SHA captured; `refs/heads/main` contains it. **No deploy.**

---

### Phase 6 — CI on `main` (the D8 precondition)

```bash
gh run list --workflow=ci.yml --branch main --limit 5
```

```bash
gh api "repos/phungtienviet14-sketch/nexagnet-platform/actions/workflows/ci.yml/runs" -f head_sha=<MERGE_SHA> -f branch=main -f status=completed --jq '.workflow_runs[0].conclusion'
```

This mirrors the deploy gate byte-for-byte (A8). Feature-branch CI is **not** a substitute.
If the result is `cancelled` (see Risk table), re-run `ci.yml` on that exact SHA and re-assert.

**Gate**: `branch=main`, `head_sha=<MERGE_SHA>`, `conclusion=success` means **RELEASE PREP PASS**.

---

### Phase 7 — Handoff

Append a session-9 appendix to `docs/phat-trien/ke-hoach/ban-giao-workflow-engine.md`:
final branch SHA; PR number; merge SHA; main CI URL and status; exact test totals;
`ECC_SKIP_PREPUSH` usage and justification; commit-range audit; **explicit "no deployment
performed"**; Decision D5 outcome; remaining D8/D9 gates.
**Do not rewrite the section 42bis D8 runbook** — it is unchanged.

Then **STOP** with: `READY TO START D8 IN A NEW SESSION.`

---

## E. Out of scope — record only, do not touch

`apps/mini` unused imports; telemetry shared-secret scrubber; worker instance identity;
40 dangling Flowise images; DRAIN on Linux; worker RAM measurement; worker churn and soak;
dashboard acceptance; `tong-quan.md`; `decision-reasons.ts`.

## F. Prohibited this session

Any deploy (`deploy-tenant`, `reusable-deploy-tenant`, `deploy-stack.sh`,
`bootstrap-workflow-engine.sh`); SSH mutation of gd1-test; enabling `WORKFLOW_ENGINE` on a
server; touching `AUTO_SEND`; WATA or production deploy; force-recreating shared edge;
`docker prune`; editing `apps/mini` or any parallel work; `git stash`, `git clean`,
`git reset --hard`; history rewrite; `--no-verify`; force push.

## G. Stop conditions

PR contains unexpected commits; large history rewrite needed; `apps/mini` edit needed;
`--no-verify` needed; force push needed; merge policy unclear; CI red from a parallel
subsystem; production runtime change needed; deploy needed "to test".

## H. Acceptance

- [ ] Phase 0 audit re-run before each mutating step
- [ ] Phase 1 scoped validation green (or failures attributed off-range with evidence)
- [ ] Push succeeded; remote SHA equals local HEAD
- [ ] PR open, full 109-file diff reviewed, D5 raised
- [ ] PR CI green
- [ ] Merge performed only after explicit gate plus user confirmation
- [ ] `ci.yml` on `main` at the exact merge SHA is `success`
- [ ] Zero deployments, zero gd1-test mutations
- [ ] Parallel work byte-identical to session start
- [ ] Handoff updated; session stopped before D8
