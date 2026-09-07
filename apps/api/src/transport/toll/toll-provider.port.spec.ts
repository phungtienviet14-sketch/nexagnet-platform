import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  TOLL_IMPORT_REJECTION_REASONS,
  TOLL_PROVIDERS,
  TOLL_SOURCE_KINDS,
  TOLL_TRANSACTION_KINDS,
  TollProviderPort,
  type TollImportCandidate,
  type TollNeverTouchesDriverFund,
  type TollSourceKind,
} from './toll-provider.port.js';

/**
 * `TX-08` — HOP DONG ETC, va ba bat bien no ton tai de giu.
 *
 * Tep nay khong kiem mot phep trich xuat nao (chua co hien thuc nao, va do la co y — #237: *"stops
 * at safe reusable primitives/contract"*). No kiem rang HINH DANG cua hop dong khong troi.
 */

/** Hien thuc GIA, chi de chung minh hop dong dung duoc. Khong phai mot adapter that. */
class FakeCsvTollProvider extends TollProviderPort {
  readonly provider = 'VETC' as const;
  readonly supports: readonly TollSourceKind[] = ['STATEMENT_FILE', 'MANUAL'];

  async parse(input: {
    readonly sourceKind: TollSourceKind;
    readonly sourceLabel: string;
    readonly content: Buffer;
  }): Promise<TollImportCandidate> {
    const lines = input.content.toString('utf8').trim().split('\n');
    return {
      provider: this.provider,
      sourceKind: input.sourceKind,
      sourceLabel: input.sourceLabel,
      accounts: [
        {
          provider: this.provider,
          accountNo: 'TK-001',
          holderName: 'Cong ty B',
          vehiclePlates: ['15C-556.33', '15C-777.11'],
        },
      ],
      transactions: lines.slice(0, 1).map((raw) => ({
        provider: this.provider,
        accountNo: 'TK-001',
        kind: 'TOLL_PASS' as const,
        vehiclePlate: '15C-556.33',
        passedAt: '2027-03-01T09:12:00.000Z',
        businessDate: '2027-03-01',
        signedAmount: 52_000,
        currencyCode: 'VND',
        stationLabel: 'Tram Phap Van',
        reference: 'HD-0001',
        raw,
      })),
      rejected: lines.slice(1).map((raw, index) => ({
        line: index + 2,
        reason: 'TOLL_ROW_UNPARSEABLE' as const,
        raw,
      })),
    };
  }
}

describe('hop dong TollProviderPort', () => {
  it('khai du BON duong nap ma #237 doi', () => {
    expect([...TOLL_SOURCE_KINDS]).toEqual(['API', 'STATEMENT_FILE', 'INVOICE_PDF', 'MANUAL']);
  });

  it('hai nha cung cap do duoc, cong mot cho cho nha khac', () => {
    expect([...TOLL_PROVIDERS]).toEqual(['VETC', 'EPASS', 'OTHER']);
  });

  /**
   * Phi tai khoan la MOT LOAI DONG, khong phai mot cot.
   *
   * Phi 6.600d/thang duoc cong bo 01/08/2026 roi tam dung ~20/08/2026. Mot cot rieng cho no la mot
   * cot chet; mot gia tri enum thi khong ton gi.
   */
  it('phi tai khoan la mot loai giao dich, khong phai mot truong rieng', () => {
    expect([...TOLL_TRANSACTION_KINDS]).toContain('ACCOUNT_FEE');
  });

  it('moi duong tu choi co mot ma RIENG, khong gop thanh mot co', () => {
    expect(new Set(TOLL_IMPORT_REJECTION_REASONS).size).toBe(TOLL_IMPORT_REJECTION_REASONS.length);
    expect(TOLL_IMPORT_REJECTION_REASONS.length).toBeGreaterThan(1);
  });

  it('mot tai khoan doanh nghiep lien ket NHIEU xe', async () => {
    const result = await new FakeCsvTollProvider().parse({
      sourceKind: 'STATEMENT_FILE',
      sourceLabel: 'sao-ke-thang-3.csv',
      content: Buffer.from('dong-1\ndong-hong\n', 'utf8'),
    });
    expect(result.accounts[0]?.vehiclePlates).toHaveLength(2);
  });

  /**
   * Dong hong PHAI o lai trong ket qua.
   *
   * Mot bang ke 400 dong doc duoc 397 la ket qua BINH THUONG. Nem ca lan doc di se lam nguoi dung
   * mat ca 397 dong dung — va ho se khong biet ba dong kia ton tai.
   */
  it('dong khong doc duoc nam trong ket qua, khong bi nuot', async () => {
    const result = await new FakeCsvTollProvider().parse({
      sourceKind: 'STATEMENT_FILE',
      sourceLabel: 'sao-ke-thang-3.csv',
      content: Buffer.from('dong-1\ndong-hong\n', 'utf8'),
    });
    expect(result.transactions).toHaveLength(1);
    expect(result.rejected).toEqual([
      { line: 2, reason: 'TOLL_ROW_UNPARSEABLE', raw: 'dong-hong' },
    ]);
  });
});

/**
 * ===========================================================================
 * ETC LA CONG TY TRA — VA DIEU DO DUOC GIU BANG KIEU.
 *
 * #229 §8 va #237 deu chot. Neu ai do them `driverId` vao mot kieu ung vien,
 * `TollNeverTouchesDriverFund` thoi la `never` va bai duoi day do — TRUOC khi mot dong phi duong
 * bo kip di vao so quy lai xe.
 */
describe('ETC khong bao gio cham so quy lai xe', () => {
  it('khong kieu ung vien nao co truong `driverId`', () => {
    expectTypeOf<TollNeverTouchesDriverFund>().toBeNever();
  });

  /**
   * PHEP DO O TANG MA NGUON — chi cho nhung thu KIEU khong noi duoc.
   *
   * `driverId` CO Y khong nam trong danh sach nay, va do khong phai bo sot: chinh
   * `TollNeverTouchesDriverFund` phai NHAC TEN truong do de khang dinh no vang mat, nen mot phep
   * quet van ban se bat dung cai bay bao ve. Bat bien do da duoc bai ngay tren giu bang KIEU, la
   * cho dung de giu no.
   *
   * Cai con lai o day la ba cai TEN HAM: he kieu khong noi duoc "khong co ham nao ten `settle`",
   * va do la thu #237 cam — *"Do not invent business settlement rules"*.
   */
  it('cong khong co mot ham GHI hay DOI SOAT nao', () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), 'toll-provider.port.ts'),
      'utf8',
    );
    const statements = source
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('/*'))
      .join('\n');
    for (const forbidden of ['settle(', 'match(', 'reconcile(']) {
      expect(statements, forbidden).not.toContain(forbidden);
    }
    // Va cong chi phoi DUNG MOT ham — mot ham doc.
    expect(statements.match(/^\s+abstract \w+\(/gm) ?? []).toHaveLength(1);
  });

  /**
   * KHONG DANG KY. Mot capability rong hien ra tren giao dien la mot loi hua sai — dung kieu ma
   * `F-09` da day. Khi B mo ta quy trinh that, viec dang ky la mot buoc CONG THEM co y thuc.
   */
  it('cong nay CHUA duoc dang ky o app-composition', () => {
    const composition = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../../app-composition.ts'),
      'utf8',
    );
    expect(composition).not.toContain('TollProvider');
  });
});
