import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * HAI DIEU KHONG DUOC TON TAI TRONG MIEN NAY — `#279` O6.
 *
 * ============================================================================================
 *     1. KHONG CO CONG THUC doi thoi luong cho thanh tien.
 *     2. KHONG CO KHOAN PHAI THU nao cua KHACH sinh ra tu mot khoang cho.
 * ============================================================================================
 *
 * Ca hai deu la yeu cau ve thu KHONG DUOC CO, nen khong mot bai test hanh vi nao chung minh duoc
 * chung: khong co duong nao de goi thi khong co gi de khang dinh. Cach do duy nhat la doc chinh MA
 * NGUON — cung khuon `no-auto-profit-distribution.spec.ts` cua `TX-08`.
 *
 * `#279` O6 viet ro:
 *
 *     PHU CAP CHO CUA LAI XE  = B CO THE tra them cho lai xe
 *     TIEN LUU BAI CUA KHACH  = B CO THE thu them cua khach
 *
 * *"This lane implements only driver waiting allowance."* Va: *"no automatic amount from duration
 * unless later source-backed policy exists"*.
 *
 * NEU MOT NGAY CHU KHACH DUA RA MOT CONG THUC THAT: no vao mot bang chinh sach RIENG, doc duoc,
 * sua duoc, co lich su — va no de nghi mot con so cho NGUOI DUYET, khong tu tra. Luc do bai nay
 * VAN dung, va do chinh la diem: ranh gioi mo rong nam ngoai mien nay, khong phai bang cach noi
 * long no.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA = resolve(HERE, '../../../prisma/schema.prisma');

/**
 * Bo chu thich truoc khi quet.
 *
 * Chinh cac khoi chu thich cua mien nay GIAI THICH vi sao khong co cong thuc, nen chung chua day tu
 * "cong thuc"/"don gia". Quet ca chu thich se lam bai nay do vi mot ly do sai — va te hon, se day
 * nguoi sua sau nay di xoa loi giai thich thay vi xoa ma.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const sourceFiles = readdirSync(HERE)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
  .sort();

const codeOf = (name: string): string => stripComments(readFileSync(join(HERE, name), 'utf8'));

describe('Khong mot cong thuc nao doi thoi luong thanh tien — WA-020', () => {
  it('co du tep de quet — mot thu muc rong se lam moi bai duoi day xanh gia', () => {
    expect(sourceFiles.length).toBeGreaterThan(10);
  });

  /**
   * DAU HIEU cua mot cong thuc: mot con so tien nhan/chia voi mot con so thoi gian.
   *
   * Quet tren TEN, khong tren toan tu: mot phep `a * b` khong noi len gi, nhung mot dinh danh mang
   * ca hai khai niem thi co. Moi ten duoi day deu la mot ten that ai do se dat khi ho viet cong
   * thuc do.
   */
  const FORMULA_TOKENS = [
    'perHour',
    'perMinute',
    'ratePerHour',
    'hourlyRate',
    'allowanceRate',
    'waitingRate',
    'freeWaitingMinutes',
    'graceMinutes',
    'billableHours',
    'chargeableHours',
    'computeAllowance',
    'calculateAllowance',
    'deriveAllowance',
  ];

  for (const token of FORMULA_TOKENS) {
    it(`khong mot tep nao khai \`${token}\``, () => {
      const offenders = sourceFiles.filter((name) => codeOf(name).includes(token));
      expect(offenders, `\`${token}\` xuat hien o: ${offenders.join(', ')}`).toEqual([]);
    });
  }

  /**
   * `elapsedSecondsOf` la phep do thoi luong, va no o `waiting.types.ts`. Mien PHU CAP khong duoc
   * goi no: goi duoc nghia la co mot cho de nhan no voi mot don gia.
   *
   * Thoi luong van hien tren man hinh nguoi duyet — nhung qua `WaitingSessionView`, mot duong DOC,
   * khong qua mot phep tinh trong ho so tien.
   */
  it('mien phu cap khong doc thoi luong cua mot phien', () => {
    const allowanceFiles = sourceFiles.filter((name) => name.startsWith('allowance'));
    expect(allowanceFiles.length).toBeGreaterThan(5);
    for (const name of allowanceFiles) {
      expect(codeOf(name), name).not.toContain('elapsedSeconds');
    }
  });
});

describe('Khong mot khoan phai thu nao cua KHACH sinh tu mot khoang cho — WA-021', () => {
  /**
   * Tu vung CONG NO KHACH. Moi tu deu la mot khai niem that o `transport-settlement`
   * (`TransportSettlementDocument`, `arAging`, ...), nen su xuat hien cua chung o day co nghia la
   * mot nghia vu cua KHACH da lan vao mien phu cap cua LAI XE.
   */
  const CUSTOMER_CHARGE_TOKENS = [
    'detention',
    'demurrage',
    'receivable',
    'arAging',
    'invoice',
    'customerCharge',
    'SettlementDocument',
    'SettlementService',
  ];

  for (const token of CUSTOMER_CHARGE_TOKENS) {
    it(`khong mot tep nao nhac \`${token}\``, () => {
      const offenders = sourceFiles.filter((name) => codeOf(name).includes(token));
      expect(offenders, `\`${token}\` xuat hien o: ${offenders.join(', ')}`).toEqual([]);
    });
  }

  /**
   * Va o TANG LUU TRU: bang phu cap khong duoc co mot khoa ngoai nao tro sang khach hang hay sang
   * mot chung tu quyet toan. Khong co cot thi khong co cho de ai do noi hai thu lai.
   */
  it('bang phu cap khong co khoa ngoai nao tro sang khach hang hay chung tu quyet toan', () => {
    const schema = readFileSync(SCHEMA, 'utf8');
    const start = schema.indexOf('model TransportDriverWaitingAllowance {');
    expect(start).toBeGreaterThan(0);
    const model = stripComments(schema.slice(start, schema.indexOf('\n}\n', start)));

    for (const forbidden of [
      'customerId',
      'TransportCustomer',
      'TransportSettlementDocument',
      'TransportSettlementAllocation',
      'counterpartyId',
    ]) {
      expect(model, forbidden).not.toContain(forbidden);
    }
  });

  /**
   * VA MOT PHEP DO NGUOC LAI: bang phu cap PHAI tro toi lai xe va toi mot phien cho.
   *
   * Khong co no, cac bai tren van xanh tren mot bang khong tro toi dau ca — dung hinh dang
   * "xanh vi khong do gi ca".
   */
  it('bang phu cap tro toi DUNG hai thu: mot lai xe va mot phien cho', () => {
    const schema = readFileSync(SCHEMA, 'utf8');
    const start = schema.indexOf('model TransportDriverWaitingAllowance {');
    const model = stripComments(schema.slice(start, schema.indexOf('\n}\n', start)));
    expect(model).toContain('TransportDeliveryWaitingSession');
    expect(model).toContain('TransportDriver ');
  });
});
