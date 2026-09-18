# POC-1 — automated builder write proof

Sandbox for the autopilot builder PoC.

This is the **only** file `.github/workflows/autopilot-poc-builder.yml` is allowed to
change. That is not enforced by asking the model nicely: the workflow runs Claude with
only the `Read` and `Edit` tools (so it cannot create files at all), and then a
deterministic `git status` gate compares the working tree against a single allowed path.
If anything else moved, the job fails and **nothing is pushed**.

STATUS: written by automation

<!-- automation appends below this line -->

## Automation run 33676067509

- pr: 136
- run_id: 33676067509
- head_sha_before: 8e73ad349c437547dd8aec4e691130cdb9c9ba96
- package_manager_read_from_repo: pnpm@10.34.4

CLAUDE_BUILDER_WRITE_OK
