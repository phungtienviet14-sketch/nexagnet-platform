# Code Review Standards

## Purpose

Code review ensures quality, security, and maintainability before code is merged. This rule defines when and how to conduct code reviews.

## When to Review

**MANDATORY review triggers:**

- After writing or modifying code
- Before any commit to shared branches
- When security-sensitive code is changed (auth, payments, user data)
- When architectural changes are made
- Before merging pull requests

**Pre-Review Requirements:**

Before requesting review, ensure:

- All automated checks (CI/CD) are passing
- Merge conflicts are resolved
- Branch is up to date with target branch

## Review Checklist

Before marking code complete:

- [ ] Code is readable and well-named
- [ ] Functions are focused (<50 lines)
- [ ] Files are cohesive (<800 lines)
- [ ] No deep nesting (>4 levels)
- [ ] Errors are handled explicitly
- [ ] No hardcoded secrets or credentials
- [ ] No console.log or debug statements
- [ ] Tests exist for new functionality
- [ ] Test coverage meets 80% minimum

## Security Review Triggers

**STOP and use security-reviewer agent when:**

- Authentication or authorization code
- User input handling
- Database queries
- File system operations
- External API calls
- Cryptographic operations
- Payment or financial code

## Review Severity Levels

| Level | Meaning | Action |
|-------|---------|--------|
| CRITICAL | Security vulnerability or data loss risk | **BLOCK** - Must fix before merge |
| HIGH | Bug or significant quality issue | **WARN** - Should fix before merge |
| MEDIUM | Maintainability concern | **INFO** - Consider fixing |
| LOW | Style or minor suggestion | **NOTE** - Optional |

## Agent Usage

Use these agents for code review:

| Agent | Purpose |
|-------|---------|
| **code-reviewer** | General code quality, patterns, best practices |
| **security-reviewer** | Security vulnerabilities, OWASP Top 10 |
| **typescript-reviewer** | TypeScript/JavaScript specific issues |
| **python-reviewer** | Python specific issues |
| **go-reviewer** | Go specific issues |
| **rust-reviewer** | Rust specific issues |

## Review Workflow

```
1. Run git diff to understand changes
2. Check security checklist first
3. Review code quality checklist
4. Run relevant tests
5. Verify coverage >= 80%
6. Use appropriate agent for detailed review
```

## Common Issues to Catch

### Security

- Hardcoded credentials (API keys, passwords, tokens)
- SQL injection (string concatenation in queries)
- XSS vulnerabilities (unescaped user input)
- Path traversal (unsanitized file paths)
- CSRF protection missing
- Authentication bypasses

### Code Quality

- Large functions (>50 lines) - split into smaller
- Large files (>800 lines) - extract modules
- Deep nesting (>4 levels) - use early returns
- Missing error handling - handle explicitly
- Mutation patterns - prefer immutable operations
- Missing tests - add test coverage

### Performance

- N+1 queries - use JOINs or batching
- Missing pagination - add LIMIT to queries
- Unbounded queries - add constraints
- Missing caching - cache expensive operations

## Approval Criteria

- **Approve**: No CRITICAL or HIGH issues
- **Warning**: Only HIGH issues (merge with caution)
- **Block**: CRITICAL issues found

## Integration with Other Rules

This rule works with:

- [testing.md](testing.md) - Test coverage requirements
- [security.md](security.md) - Security checklist
- [git-workflow.md](git-workflow.md) - Commit standards
- [agents.md](agents.md) - Agent delegation

## Observability (bổ sung 21/08/2026)

> Nền tảng: [docs/kien-truc/observability-review.md](../../../../docs/kien-truc/observability-review.md) ·
> Runbook: [docs/phat-trien/van-hanh/debugging.md](../../../../docs/phat-trien/van-hanh/debugging.md)

### Definition of Done cho một tính năng nghiệp vụ

Ngoài checklist ở trên, thêm:

- [ ] **Ranh giới nghiệp vụ quan trọng** được bọc `telemetry.step('<mien>.<viec>')`
- [ ] **Mỗi quyết định quan trọng** gọi `telemetry.decision()` kèm **lý do có mã**
- [ ] **Chuyển trạng thái** của thực thể có máy trạng thái gọi `telemetry.stateChange()`
- [ ] **Lỗi** tương quan được với trace (tự động nếu nằm trong một `step`)
- [ ] **Không rò bí mật** — mọi giá trị đi qua `sanitizeTelemetry`, không sanitize rải rác

### KHÔNG trace mọi hàm

| Nên trace | Không trace |
|---|---|
| `conversation.resolve`, `order.persist`, `outbound.decide` | `normalizeString`, `mapFoo`, `validateX`, `formatY` |

Một lượt chạy 50 hàm vẫn chỉ nên nhìn ra **5–15 bước**. Quy tắc nhanh: tên bước phải là
`<miền>.<việc>` và đọc lên nghe ra **việc nghiệp vụ**, không phải tên hàm.

### Lý do quyết định phải CÓ KIỂU

```ts
// SAI — không lọc được, hai người viết hai câu khác nhau cho cùng một lý do
telemetry.decision({ point, outcome: 'denied', reason: 'đơn quá lớn nên không gửi' });

// ĐÚNG — thêm mã vào apps/api/src/observability/decision-reasons.ts trước
telemetry.decision({
  point: 'order.auto_confirm',
  outcome: 'denied',
  reason: 'QUANTITY_ABOVE_THRESHOLD',
  detail: { totalQuantity, threshold },
});
```

Một cổng nghiệp vụ có N đường từ chối phải phân biệt được **N lý do**, không gộp thành một
`boolean`. Mẫu tham chiếu: `evaluateAutoConfirm()` trong
`apps/api/src/pipeline/order-auto-confirmation.ts`.

### Observability KHÔNG được là dependency của thành công nghiệp vụ

`TelemetryService` luôn tiêm dạng `@Optional()`, và mọi lời gọi telemetry đều fail-open.
Nếu bạn viết code mà **thiếu telemetry thì nghiệp vụ hỏng**, đó là lỗi cần sửa.

### Observability là NỀN TẢNG, không phải capability

Đăng ký ở `app-composition.ts` với owner `foundation`. Mọi khách đều được quan sát; cái khác nhau
giữa các khách là **mức chi tiết nội dung** (`privacyModeFor`), không phải có trace hay không.
