# POC-6 — runtime-proof handoff: what is proven, and what is deliberately not

## The claim

`CI green` is not `DONE`. A merge is a candidate; only a runtime proof **bound to that exact
release** can close a task.

## What already existed

This PoC builds no new verification infrastructure, because the repository already has it:

| Requirement | Existing mechanism |
|---|---|
| runtime evidence is validated, not trusted | `deploy/netviet/verify-deployment.mjs` |
| evidence is bound to the release under test | `compareObservedRelease()` compares the **observed** release identity read off the running stack against the **declared** one, field by field — `gitSha`, `appDigest`, `flowiseDigest`, `workflowRunId`, `deployedAt` |
| a release identity exists at all | `deploy/netviet/write-release-manifest.sh`, `release-identity.contract.test.mjs` |
| deploy signals are reported | `deploy/netviet/deploy-signals.mjs`, `report-deploy-signals.mjs` |
| deploying is a decision, not a consequence of a push | `deploy-tenant.yml` is `workflow_dispatch` only |

`tools/autopilot-poc-runtime/` adds only the **state machine around** those primitives, and
its test suite calls the real `verifyDeployment` rather than restating what it does.

## What this PoC proves

- CI green with no runtime proof → `BLOCK_NO_RUNTIME_PROOF`. There is no edge to DONE.
- A failed runtime proof → `BLOCKED_RUNTIME`, never a fallback to the CI result.
- A proof gathered at commit A cannot declare commit B done → `BLOCK_STALE_RUNTIME_PROOF`.
- The repository's own verifier independently rejects evidence whose observed `gitSha`
  differs from the declared one, so the binding is enforced on the evidence itself and not
  only by this state machine.

## What this PoC does NOT prove — `BLOCKED_EXTERNAL_ENV`

**No live deployment was performed.** Nothing was deployed to `ultty-gd1-test` or anywhere
else, and no production or tenant credential was read or changed.

Running a real runtime proof requires deploying a tenant stack to a VM over SSH with
tenant secrets. That is an operational decision with a live customer stack on the other end,
it is gated behind `workflow_dispatch` on purpose, and it is not something a PoC should take
on its own initiative.

So the honest split is:

- **State transition and SHA binding: PROVEN**, deterministically, against the real verifier.
- **A live runtime proof executed end to end against a running stack: NOT PERFORMED HERE.**
  The repository has independent evidence of that capability (see the platform status table
  in `CLAUDE.md`); this PoC does not duplicate it and does not claim it.
