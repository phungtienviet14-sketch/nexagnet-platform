import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AuthApiError } from '../../../../lib/auth';
import {
  ADMIN_REASON_MESSAGES,
  adminErrorMessage,
  openWorkOf,
  reasonMessage,
  violationMessage,
  violationsOf,
} from '../admin-reasons';

/**
 * MOI MA LY DO CUA API QUAN TRI DEU CO MOT CAU TIENG VIET (`#395`).
 *
 * Web khong import duoc `apps/api`, nen bai nay DOC tep nguon cua API tu dia (cung khuon bai drift
 * `transport-actions.spec.ts`) va lay tung ma trong cac mang tu vung. Mot ma moi phia API ma quen
 * cau phia web lam DO bai nay — thay vi lot ra man hinh cua Giam doc duoi dang `SOD_CONFLICT`.
 *
 * Hai loai tep:
 *   · BAT BUOC — tu vung da co tu hop dong nen (S0): tep va mang PHAI ton tai;
 *   · TUY CHON — tu vung cua lat cat song song (tai khoan, lien ket, loi dia diem): co tep/mang thi
 *     moi ma phai co cau; chua co (nhanh chua gop) thi bo qua, sau khi gop bai tu siet lai.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const API = resolve(HERE, '../../../../../api/src');

const literalsInArray = (source: string, name: string): readonly string[] | null => {
  const declaration = new RegExp(`\\b${name}\\b(?:\\s*:[^=\\n]*)?\\s*=\\s*\\[`);
  const found = declaration.exec(source);
  if (found === null) return null;
  const start = found.index + found[0].length;
  const end = source.indexOf('\n]', start);
  if (end < 0) return null;
  const body = source
    .slice(start, end)
    // Bo chu thich — ten ma trong chu thich khong phai mot ma.
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  return [...body.matchAll(/'([A-Z][A-Z0-9_]+)'/g)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
};

const REQUIRED: readonly (readonly [string, string])[] = [
  ['auth/account-decisions.ts', 'ACCOUNT_ACCESS_REASONS'],
  ['transport/places/place-admin-decisions.ts', 'PLACE_WRITE_REASONS'],
  ['transport/permissions/transport-permission-rules.ts', 'TRANSPORT_GRANT_VIOLATION_CODES'],
];

const OPTIONAL: readonly (readonly [string, string])[] = [
  ['auth/account-errors.ts', 'NON_DECISION_REASONS'],
  ['transport/fleet/account-link-decisions.ts', 'ACCOUNT_LINK_REASONS'],
  ['transport/permissions/transport-access-errors.ts', 'TRANSPORT_ACCESS_ERROR_REASONS'],
  ['transport/places/place-errors.ts', 'TRANSPORT_PLACE_ERROR_REASONS'],
  ['transport/places/place-errors.ts', 'PLACE_ADMIN_ERROR_REASONS'],
];

describe('bang cau cho moi ly do cua API quan tri', () => {
  it.each(REQUIRED)('%s › %s: tep ton tai, va MOI ma co cau', (file, array) => {
    const source = readFileSync(resolve(API, file), 'utf8');
    const codes = literalsInArray(source, array);
    expect(codes, `${array} trong ${file}`).not.toBeNull();
    expect(codes?.length).toBeGreaterThan(0);
    const missing = (codes ?? []).filter((code) => ADMIN_REASON_MESSAGES[code] === undefined);
    expect(missing).toEqual([]);
  });

  it.each(OPTIONAL)('%s › %s: neu da co, MOI ma co cau', (file, array) => {
    const path = resolve(API, file);
    const codes = existsSync(path) ? literalsInArray(readFileSync(path, 'utf8'), array) : null;
    const missing = (codes ?? []).filter((code) => ADMIN_REASON_MESSAGES[code] === undefined);
    expect(missing).toEqual([]);
  });

  it('bai doc tu vung khong xanh gia: rut dung ma tu mot mang mau', () => {
    const sample = "export const X = [\n  /** 'NOT_A_CODE' */\n  'ALPHA_ONE',\n  'BETA',\n] as const;";
    expect(literalsInArray(sample, 'X')).toEqual(['ALPHA_ONE', 'BETA']);
  });

  it('moi cau deu la tieng Viet co dau, khong lo ma liet ke', () => {
    for (const code of Object.keys(ADMIN_REASON_MESSAGES)) {
      const message = reasonMessage(code, {}) ?? '';
      expect(message.length, code).toBeGreaterThan(10);
      expect(message, code).not.toMatch(/\b[A-Z]+_[A-Z_]+\b/);
      expect(message, code).toMatch(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i);
    }
  });
});

describe('cau goi TEN thu dang xung dot, lay tu `detail`', () => {
  it('trung ten dia diem: noi ten, loai va chu cua dia diem kia', () => {
    expect(
      reasonMessage('PLACE_NAME_TAKEN', {
        conflictName: 'Kho Hải Phòng',
        conflictKindLabel: 'Nhà máy / kho đối tác',
        ownerName: 'Công ty Y',
      }),
    ).toBe(
      'Tên này đã dùng cho nhà máy / kho đối tác “Kho Hải Phòng” của Công ty Y. Đặt tên khác để lái xe và điều hành không nhầm hai nơi.',
    );
  });

  it('xung dot tach nhiem: noi ten HAI quyen bang nhan cua danh muc', () => {
    const labels: Record<string, string> = {
      'transport.commercial_acceptance.decide': 'Duyệt nghiệm thu chứng từ',
      'transport.checkpoint.record': 'Ghi bù mốc hiện trường từ văn phòng',
    };
    const message = violationMessage(
      {
        code: 'SOD_CONFLICT',
        permission: 'transport.checkpoint.record',
        detail: {
          decision: 'transport.commercial_acceptance.decide',
          evidence: 'transport.checkpoint.record',
        },
      },
      (code) => labels[code],
    );
    expect(message).toContain('“Duyệt nghiệm thu chứng từ”');
    expect(message).toContain('“Ghi bù mốc hiện trường từ văn phòng”');
    expect(message).not.toContain('transport.');
  });

  it('ACCESS_INVALID: mot cau dau + tung dong vi pham', () => {
    const error = new AuthApiError('Bo quyen khong hop le', 409, 'ACCESS_INVALID', {
      violations: [
        { code: 'DIRECTOR_ONLY_ACTION', permission: 'transport.costing.period.reopen' },
        { code: 'nonsense' },
      ],
    });
    expect(violationsOf(error)).toHaveLength(2);
    const message = adminErrorMessage(error, (code) =>
      code === 'transport.costing.period.reopen' ? 'Mở lại kỳ kế toán đã đóng' : undefined,
    );
    expect(message.split('\n')).toEqual([
      'Bộ quyền chưa hợp lệ — xem các dòng cần sửa bên dưới.',
      '• “Mở lại kỳ kế toán đã đóng” chỉ Giám đốc làm được — không cấp cho vai khác.',
      '• Một quyền đã chọn chưa hợp lệ cho vai này.',
    ]);
  });

  it('viec dang mo cua bai xe: tach dung danh sach vong xe va don', () => {
    const error = new AuthApiError('x', 409, 'DEPOT_CHANGE_AFFECTS_OPEN_WORK', {
      runs: [{ id: 'r1', code: 'VX-01' }, { bad: true }],
      orders: [{ id: 'o1' }],
      idleHours: 12,
    });
    expect(openWorkOf(error)).toEqual({
      runs: [{ id: 'r1', code: 'VX-01' }],
      orders: [{ id: 'o1' }],
      idleHours: 12,
    });
    expect(adminErrorMessage(error)).toBe(
      'Còn 1 vòng xe và 1 đơn đang dùng bãi xe này. Xem danh sách và xác nhận trước khi đổi.',
    );
    expect(openWorkOf(new AuthApiError('x', 409, 'PLACE_NAME_TAKEN'))).toBeNull();
  });

  it('loi khong co ly do giu NGUYEN cau cua may chu', () => {
    expect(adminErrorMessage(new AuthApiError('Máy chủ bận', 503))).toBe('Máy chủ bận');
    expect(adminErrorMessage(null)).toBe('Không thực hiện được yêu cầu. Hãy thử lại.');
  });
});
