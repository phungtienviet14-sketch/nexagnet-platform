# POC-1 — automated builder write proof

Sandbox for the autopilot builder PoC.

This is the **only** file `.github/workflows/autopilot-poc-builder.yml` is allowed to
change. That is not enforced by asking the model nicely: the workflow runs Claude with
only the `Read` and `Edit` tools (so it cannot create files at all), and then a
deterministic `git status` gate compares the working tree against a single allowed path.
If anything else moved, the job fails and **nothing is pushed**.

STATUS: not yet written by automation

<!-- automation appends below this line -->
