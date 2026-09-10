---
engine:
  id: claude-code-oauth
  version: "2.1.247"
  display-name: Claude Code (Max OAuth)
  description: PoC-only behavior-defined engine binding CLAUDE_CODE_OAUTH_TOKEN
  experimental: true
  auth:
    - role: api-key
      secret: CLAUDE_CODE_OAUTH_TOKEN
  behaviors:
    supported-env-var-keys:
      - CLAUDE_CODE_OAUTH_TOKEN
    installation:
      package-manager: npm
      package-name: "@anthropic-ai/claude-code"
      step-name: Install Claude Code CLI
      binary-name: claude
      include-node-setup: true
      verify-command: claude --version
      verify-step-name: Verify Claude Code CLI installation
    execution:
      command-name: claude
      args:
        - -p
        - --output-format
        - stream-json
        - --verbose
      step-name: Execute Claude Code
      model-env-var: ANTHROPIC_MODEL
      write-timestamp: true
---

<!--
Dinh nghia engine DUNG CHO PHEP DO, khong dung de chay. No ton tai de tra loi dung mot cau hoi:
gh-aw co the giao `CLAUDE_CODE_OAUTH_TOKEN` cho tac nhan hay khong, khi di qua duong
behavior-defined engine thay vi engine `claude` dung san.

Phien ban `2.1.247` dat bang dung phien ban ma gh-aw ghim cho engine `claude` dung san
(`pkg/constants/version_constants.go`), de phep do khong bi lech vi mot bien so khong lien quan.
-->
