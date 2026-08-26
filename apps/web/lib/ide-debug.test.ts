import { describe, expect, it } from 'vitest';
import {
  buildEditorFileUri,
  ideRejectionMessage,
  releaseMismatchWarning,
  validateIdeSourceInput,
} from './ide-debug';

const WINDOWS_ROOT = String.raw`C:\repo\nexagnet-platform`;
const ORDERS = 'apps/api/src/orders/orders.service.ts';

describe('buildEditorFileUri', () => {
  /*
   * DANG URI LAY TU TAI LIEU CHINH THUC cua VS Code, khong lay tu tri nho:
   *
   *   vscode://file/{full path to file}:line:column
   *   vscode://file/c:/myProject/package.json:5:10
   *
   * Diem de viet sai nhat la o dia: tai lieu viet `c:/`, KHONG phai `c%3A/`. Bai kiem nay khoa
   * dung cho do lai.
   */
  it('builds the documented VS Code URI for a Windows path and line', () => {
    expect(buildEditorFileUri({ workspaceRoot: WINDOWS_ROOT, filePath: ORDERS, line: 463 })).toBe(
      `vscode://file/C:/repo/nexagnet-platform/${ORDERS}:463`,
    );
  });

  it('accepts a Windows root already written with forward slashes', () => {
    expect(
      buildEditorFileUri({
        workspaceRoot: 'C:/repo/nexagnet-platform/',
        filePath: ORDERS,
        line: 7,
      }),
    ).toBe(`vscode://file/C:/repo/nexagnet-platform/${ORDERS}:7`);
  });

  it('builds a POSIX URI from a POSIX root', () => {
    expect(
      buildEditorFileUri({
        workspaceRoot: '/home/phung/nexagnet-platform',
        filePath: ORDERS,
        line: 12,
      }),
    ).toBe(`vscode://file//home/phung/nexagnet-platform/${ORDERS}:12`);
  });

  it('percent-encodes spaces and unicode segments but never the drive colon', () => {
    expect(
      buildEditorFileUri({
        workspaceRoot: String.raw`C:\repo space\nexagnet-platform`,
        filePath: 'apps/api/src/đơn hàng/orders service.ts',
        line: 7,
      }),
    ).toBe(
      'vscode://file/C:/repo%20space/nexagnet-platform/apps/api/src/%C4%91%C6%A1n%20h%C3%A0ng/orders%20service.ts:7',
    );
  });

  it('opens the file without faking a line when the line is unknown', () => {
    expect(buildEditorFileUri({ workspaceRoot: WINDOWS_ROOT, filePath: ORDERS })).toBe(
      `vscode://file/C:/repo/nexagnet-platform/${ORDERS}`,
    );
  });

  it.each([0, -1, 1.5, Number.NaN])('drops a malformed line %s instead of emitting it', (line) => {
    expect(buildEditorFileUri({ workspaceRoot: WINDOWS_ROOT, filePath: ORDERS, line })).toBe(
      `vscode://file/C:/repo/nexagnet-platform/${ORDERS}`,
    );
  });

  it.each([
    ['vscode-insiders', 'vscode-insiders'],
    ['cursor', 'cursor'],
  ] as const)('uses the %s scheme when that editor is chosen', (ide, scheme) => {
    expect(
      buildEditorFileUri({ ide, workspaceRoot: WINDOWS_ROOT, filePath: ORDERS, line: 5 }),
    ).toBe(`${scheme}://file/C:/repo/nexagnet-platform/${ORDERS}:5`);
  });

  it.each([
    ['traversal', '../../secret'],
    ['nested traversal', 'apps/../../secret.env'],
    ['absolute POSIX path', '/app/secret.ts'],
    ['absolute Windows path', 'C:/server/secret.ts'],
    ['node_modules', 'node_modules/pkg/index.js'],
  ])('refuses to open %s', (_label, filePath) => {
    expect(buildEditorFileUri({ workspaceRoot: WINDOWS_ROOT, filePath })).toBeNull();
  });

  it('returns null — never a bare scheme — when the root is missing', () => {
    expect(buildEditorFileUri({ workspaceRoot: '   ', filePath: ORDERS, line: 1 })).toBeNull();
  });
});

describe('validateIdeSourceInput', () => {
  it('accepts a configured root and a repo-relative path', () => {
    expect(validateIdeSourceInput({ workspaceRoot: WINDOWS_ROOT, filePath: ORDERS })).toEqual({
      ok: true,
    });
  });

  it('reports a missing root separately from a malformed one', () => {
    expect(validateIdeSourceInput({ workspaceRoot: '', filePath: ORDERS })).toEqual({
      ok: false,
      reason: 'missing_root',
    });
    expect(validateIdeSourceInput({ workspaceRoot: 'repo/nexagnet', filePath: ORDERS })).toEqual({
      ok: false,
      reason: 'invalid_root',
    });
  });

  it.each(['../../secret', '/app/secret.ts', 'C:/server/secret.ts', 'node_modules/pkg/index.js'])(
    'rejects invalid relative path %s',
    (filePath) => {
      expect(validateIdeSourceInput({ workspaceRoot: WINDOWS_ROOT, filePath })).toEqual({
        ok: false,
        reason: 'invalid_source_path',
      });
    },
  );

  it('explains every rejection in Vietnamese, and blames the server for a bad path', () => {
    expect(ideRejectionMessage('missing_root')).toContain('thư mục repo');
    expect(ideRejectionMessage('invalid_root')).toContain('tuyệt đối');
    // Duong dan hong la loi cua may chu — cau chu khong duoc chi nguoi dung di sua cau hinh.
    expect(ideRejectionMessage('invalid_source_path')).toContain('Máy chủ');
    expect(ideRejectionMessage('invalid_source_path')).not.toContain('cài đặt');
  });
});

describe('releaseMismatchWarning', () => {
  it('never claims the local checkout matches the running release', () => {
    const warning = releaseMismatchWarning({ filePath: ORDERS, line: 463 }, 'a'.repeat(40));
    expect(warning).toContain('aaaaaaaaaaaa');
    expect(warning).toContain('máy bạn');
    expect(warning).toContain('có thể không khớp');
  });

  it('stays honest when the running release is unknown', () => {
    const warning = releaseMismatchWarning({ filePath: ORDERS });
    expect(warning).toContain('bản phát hành đang chạy');
    expect(warning).toContain('tệp');
  });
});
