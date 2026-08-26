import { describe, expect, it } from 'vitest';
import {
  buildGithubSourceUrl,
  normalizeRepositoryUrl,
  normalizeSourceLocation,
} from '../source-location.js';

const FULL_SHA = 'c'.repeat(40);
const REPO = 'https://github.com/phungtienviet14-sketch/nexagnet-platform';

describe('normalizeSourceLocation', () => {
  it('keeps function, repo-relative path and line', () => {
    expect(
      normalizeSourceLocation({
        functionName: 'OrdersService.sendConfirmation',
        filePath: 'apps/api/src/orders/orders.service.ts',
        line: 463,
      }),
    ).toEqual({
      functionName: 'OrdersService.sendConfirmation',
      filePath: 'apps/api/src/orders/orders.service.ts',
      line: 463,
    });
  });

  it.each([
    ['absolute Windows path', 'C:/Users/phung/source/nexagnet-platform/apps/api/src/a.ts'],
    ['Windows separator', String.raw`apps\api\src\orders\orders.service.ts`],
    ['absolute POSIX server path', '/app/apps/api/dist/orders/orders.service.js'],
    ['traversal path', '../secrets.env'],
    ['traversal in the middle', 'apps/api/../../../etc/passwd'],
    ['node_modules path', 'node_modules/pkg/index.js'],
    ['nested node_modules path', 'apps/api/node_modules/pkg/index.js'],
    ['file URL', 'file:///app/apps/api/src/a.ts'],
    ['empty segment', 'apps//api/src/a.ts'],
    ['empty path', '   '],
  ])('rejects %s', (_label, filePath) => {
    expect(normalizeSourceLocation({ filePath })).toBeNull();
  });

  it('rejects a missing file path even when a function name is known', () => {
    expect(normalizeSourceLocation({ functionName: 'OrdersService.send' })).toBeNull();
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'drops malformed line %s without dropping the file',
    (line) => {
      expect(
        normalizeSourceLocation({
          functionName: 'PipelineService.intake',
          filePath: 'apps/api/src/pipeline/pipeline.service.ts',
          line,
        }),
      ).toEqual({
        functionName: 'PipelineService.intake',
        filePath: 'apps/api/src/pipeline/pipeline.service.ts',
      });
    },
  );

  it('carries nothing but code coordinates — no headers, payload or secrets', () => {
    const dirty = {
      functionName: 'OrdersService.sendConfirmation',
      filePath: 'apps/api/src/orders/orders.service.ts',
      line: 463,
      authorization: 'Bearer super-secret',
      customerPhone: '0987654321',
      headers: { cookie: 'session=abc' },
    };

    expect(Object.keys(normalizeSourceLocation(dirty)!).sort()).toEqual([
      'filePath',
      'functionName',
      'line',
    ]);
  });
});

describe('normalizeRepositoryUrl', () => {
  it.each([
    'https://github.com/phungtienviet14-sketch/nexagnet-platform',
    'https://github.com/phungtienviet14-sketch/nexagnet-platform.git',
    'https://github.com/phungtienviet14-sketch/nexagnet-platform/',
    'git@github.com:phungtienviet14-sketch/nexagnet-platform.git',
    'ssh://git@github.com/phungtienviet14-sketch/nexagnet-platform.git',
  ])('normalizes %s', (raw) => {
    expect(normalizeRepositoryUrl(raw)).toBe(REPO);
  });

  it.each([
    ['a non-GitHub host', 'https://evil.example.com/a/b'],
    ['a look-alike host', 'https://github.com.evil.example.com/a/b'],
    ['a path with an extra segment', 'https://github.com/owner/repo/blob/main/x.ts'],
    ['an empty value', ''],
  ])('refuses %s', (_label, raw) => {
    expect(normalizeRepositoryUrl(raw)).toBeNull();
  });
});

describe('buildGithubSourceUrl', () => {
  it('builds an exact-commit permalink with a line fragment', () => {
    expect(
      buildGithubSourceUrl(
        {
          repositoryUrl: 'git@github.com:phungtienviet14-sketch/nexagnet-platform.git',
          releaseSha: FULL_SHA,
        },
        {
          functionName: 'OrdersService.sendConfirmation',
          filePath: 'apps/api/src/orders/orders.service.ts',
          line: 463,
        },
      ),
    ).toBe(`${REPO}/blob/${FULL_SHA}/apps/api/src/orders/orders.service.ts#L463`);
  });

  it('links the file without a fragment when the line is unknown', () => {
    expect(
      buildGithubSourceUrl(
        { repositoryUrl: REPO, releaseSha: FULL_SHA },
        { filePath: 'apps/api/src/orders/orders.service.ts' },
      ),
    ).toBe(`${REPO}/blob/${FULL_SHA}/apps/api/src/orders/orders.service.ts`);
  });

  it('percent-encodes spaces and unicode segments', () => {
    expect(
      buildGithubSourceUrl(
        { repositoryUrl: REPO, releaseSha: FULL_SHA },
        { filePath: 'tenants/ultty/đơn hàng/bảng giá.json' },
      ),
    ).toBe(
      `${REPO}/blob/${FULL_SHA}/tenants/ultty/%C4%91%C6%A1n%20h%C3%A0ng/b%E1%BA%A3ng%20gi%C3%A1.json`,
    );
  });

  it.each([
    ['the release is missing', { repositoryUrl: REPO }],
    ['the release is unknown', { repositoryUrl: REPO, releaseSha: 'unknown' }],
    ['the release is not a SHA', { repositoryUrl: REPO, releaseSha: 'main' }],
    ['the repository is missing', { releaseSha: FULL_SHA }],
    [
      'the repository is not GitHub',
      { repositoryUrl: 'https://evil.example.com/a/b', releaseSha: FULL_SHA },
    ],
  ])('returns null — never a main permalink — when %s', (_label, context) => {
    expect(
      buildGithubSourceUrl(context, {
        filePath: 'apps/api/src/orders/orders.service.ts',
        line: 463,
      }),
    ).toBeNull();
  });

  it('refuses a source location that slipped past the model', () => {
    expect(
      buildGithubSourceUrl(
        { repositoryUrl: REPO, releaseSha: FULL_SHA },
        {
          filePath: '../../../etc/passwd',
        },
      ),
    ).toBeNull();
  });
});
