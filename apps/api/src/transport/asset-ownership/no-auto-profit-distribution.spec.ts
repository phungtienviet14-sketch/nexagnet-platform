import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * TY LE SO HUU KHONG PHAI CONG THUC CHIA LOI — #241 §1, #242 E4.
 *
 * *"Ownership percentage does not imply a profit-sharing formula. Do not auto-pay
 * `vehicle profit x ownership%` unless a future business agreement explicitly defines that."*
 *
 * Day la mot yeu cau ve thu KHONG DUOC TON TAI, nen khong mot bai test hanh vi nao chung minh duoc
 * no: khong co duong nao de goi thi khong co gi de khang dinh. Cach do duy nhat la doc chinh MA
 * NGUON va do rang khong co mot truong tien nao trong ca mien.
 *
 * Bai nay se do vao dung ngay co nguoi them `payoutAmount` hay `profitShare` vao day — tuc dung
 * luc mot ranh gioi nghiep vu bi vuot qua ma khong ai o phia B da quyet.
 *
 * NEU MOT NGAY CO THOA THUAN KINH TE THAT: no vao mot bang RIENG
 * (`TransportVehicleEconomicAgreement`) o mot thu muc RIENG, tro toi day bang `interestId`. Luc do
 * bai nay VAN dung — va do chinh la diem: ranh gioi mo rong nam ngoai mien nay, khong phai bang
 * cach noi long no.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA = resolve(HERE, '../../../prisma/schema.prisma');

/**
 * Bo chu thich truoc khi quet.
 *
 * Chinh cac khoi chu thich cua mien nay GIAI THICH vi sao khong co tien o day, nen chung chua day
 * tu "tien"/"profit". Quet ca chu thich se lam bai nay do vi mot ly do sai — va te hon, se day
 * nguoi sua sau nay di xoa loi giai thich thay vi xoa ma.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * Tu vung TIEN. Moi tu o day deu la mot cot/truong that trong cac mien khac cua repo
 * (`TransportPayslip.netAmount`, `TransportTripExpense.amount`, ...), nen su xuat hien cua chung o
 * day co nghia la mot nghia vu tien da lan vao mien so huu.
 */
const MONEY_TOKENS = [
  'amount',
  'payout',
  'payable',
  'profit',
  'revenue',
  'margin',
  'price',
  'currency',
  'money',
  'settlement',
  'dividend',
  'distribution',
];

const sourceFiles = readdirSync(HERE)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
  .sort();

describe('TX-08 — ty le so huu khong sinh ra mot nghia vu tien nao (#242 E4)', () => {
  it('mien so huu co du cac tep can quet', () => {
    // Neu ai do doi ten tep, bai quet ben duoi se lang le quet 0 tep va luon xanh.
    expect(sourceFiles.length).toBeGreaterThanOrEqual(8);
  });

  it.each(sourceFiles)('%s khong khai mot truong tien nao', (name) => {
    const code = stripComments(readFileSync(join(HERE, name), 'utf8')).toLowerCase();
    for (const token of MONEY_TOKENS) {
      expect(code, `"${token}" xuat hien trong ${name}`).not.toContain(token);
    }
  });

  /**
   * Hai BANG cung khong duoc mang mot cot tien nao.
   *
   * Quet o tang schema chu khong chi o tang TypeScript: mot cot ton tai trong DB ma khong co o
   * kieu van la mot cot co that, va lan sau co nguoi doc no bang SQL tho thi no se thanh nguon cho
   * mot phep chia loi tu dong.
   */
  it.each(['model TransportAssetStakeholder', 'model TransportVehicleOwnershipInterest'])(
    '`%s` khong co cot tien',
    (header) => {
      const schema = readFileSync(SCHEMA, 'utf8');
      const start = schema.indexOf(header);
      expect(start, `khong tim thay ${header}`).toBeGreaterThan(-1);
      const body = schema
        .slice(start, schema.indexOf('\n}', start))
        .replace(/^\s*\/\/\/.*$/gm, ' ')
        .toLowerCase();
      for (const token of MONEY_TOKENS) {
        expect(body, `"${token}" xuat hien trong ${header}`).not.toContain(token);
      }
    },
  );
});
