---
on:
  issues:
    types: [opened]
permissions: read-all
engine:
  id: claude
  env:
    CLAUDE_CODE_OAUTH_TOKEN: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
safe-outputs:
  add-comment:
---

# Phep do — engine `claude` dung san + ghi de `engine.env`

Duong di THU HAI toi cung mot muc tieu: giu engine dung san, tiem bi mat qua `engine.env`.
