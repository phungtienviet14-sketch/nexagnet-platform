# Testing Requirements

## Minimum Test Coverage: 80%

Test Types (ALL required):
1. **Unit Tests** - Individual functions, utilities, components
2. **Integration Tests** - API endpoints, database operations
3. **E2E Tests** - Critical user flows (framework chosen per language)

## Test-Driven Development

MANDATORY workflow:
1. Write test first (RED)
2. Run test - it should FAIL
3. Write minimal implementation (GREEN)
4. Run test - it should PASS
5. Refactor (IMPROVE)
6. Verify coverage (80%+)

## Troubleshooting Test Failures

1. Use **tdd-guide** agent
2. Check test isolation
3. Verify mocks are correct
4. Fix implementation, not tests (unless tests are wrong)

## Agent Support

- **tdd-guide** - Use PROACTIVELY for new features, enforces write-tests-first

## Test Structure (AAA Pattern)

Prefer Arrange-Act-Assert structure for tests:

```typescript
test('calculates similarity correctly', () => {
  // Arrange
  const vector1 = [1, 0, 0]
  const vector2 = [0, 1, 0]

  // Act
  const similarity = calculateCosineSimilarity(vector1, vector2)

  // Assert
  expect(similarity).toBe(0)
})
```

### Test Naming

Use descriptive names that explain the behavior under test:

```typescript
test('returns empty array when no markets match query', () => {})
test('throws error when API key is missing', () => {})
test('falls back to substring search when Redis is unavailable', () => {})
```

## Kiểm thử trước push (bổ sung 21/09/2026)

> Chi tiết: [docs/phat-trien/van-hanh/ci-cd.md](../../../../docs/phat-trien/van-hanh/ci-cd.md) §3

- **Trong lúc code:** chạy test **tập trung** đúng module/spec bị ảnh hưởng (TDD vẫn áp dụng).
- **Trước push:** KHÔNG bắt buộc full monorepo suite (`pnpm test`, build, Playwright, Postgres/Hatchet
  IT, Docker). Hook pre-push của repo chỉ chạy check nhanh theo vùng sửa.
- **Full regression** là trách nhiệm của GitHub CI — 7 check bắt buộc: `verify`, `integration`,
  `workflow-integration`, `tenant-packs`, `e2e`, `audit`, `images`. CI xanh mới review/merge.
- **Báo cáo:** luôn nêu rõ đã chạy test tập trung nào (lệnh + số pass/fail), và cái gì để CI chứng
  minh. Đừng tuyên bố "đã kiểm" cho phần chỉ CI chạy được.
