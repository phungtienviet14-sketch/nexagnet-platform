import { describe, expect, it } from 'vitest';
import type { TollProviderMappingPolicy } from './toll-policy.js';
import { mapTollRows, missingTollColumns, type RawTollRow } from './toll-statement-mapping.js';

const HCM = 'Asia/Ho_Chi_Minh';

const mapping: TollProviderMappingPolicy = {
  columns: {
    accountNo: 'So tai khoan',
    kind: 'Loai',
    vehiclePlate: 'Bien so',
    passedAt: 'Thoi diem',
    amount: 'So tien',
    station: 'Tram',
    providerRef: 'Tham chieu',
  },
  dateFormat: 'dmy',
  kinds: { 'Qua tram': 'TOLL_PASS', 'Nap tien': 'TOP_UP', 'Phi tai khoan': 'ACCOUNT_FEE' },
  defaultKind: null,
};

const row = (values: Record<string, string>, rowNumber = 2): RawTollRow => ({ rowNumber, values });

const full = {
  'So tai khoan': 'TK-001',
  Loai: 'Qua tram',
  'Bien so': '15C-556.33',
  'Thoi diem': '31/08/2026 23:40',
  'So tien': '-52.000',
  Tram: 'Tram Phap Van',
  'Tham chieu': 'HD-0001',
};

const run = (rows: readonly RawTollRow[], over: Partial<TollProviderMappingPolicy> = {}) =>
  mapTollRows({ rows, provider: 'VETC', mapping: { ...mapping, ...over }, timeZone: HCM });

describe('doc mot dong sao ke ETC', () => {
  it('doc duoc mot dong day du', () => {
    const [line] = run([row(full)]);
    expect(line?.parseStatus).toBe('ACCEPTED');
    expect(line?.rejectReason).toBeNull();
    expect(line?.kind).toBe('TOLL_PASS');
    expect(line?.signedAmount).toBe(-52_000);
    expect(line?.stationLabel).toBe('Tram Phap Van');
    expect(line?.providerRef).toBe('HD-0001');
    expect(line?.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ngay nghiep vu duoc tinh tu thoi diem qua tram theo mui gio TENANT', () => {
    const [line] = run([row(full)]);
    expect(line?.businessDate).toBe('2026-08-31');
    expect(line?.passedAt?.toISOString()).toBe('2026-08-31T16:40:00.000Z');

    const [early] = run([row({ ...full, 'Thoi diem': '01/09/2026 06:30' })]);
    expect(early?.businessDate).toBe('2026-09-01');
    expect(early?.passedAt?.toISOString()).toBe('2026-08-31T23:30:00.000Z');
  });

  it('cot ngay nghiep vu rieng duoc dung khi goi khach khai no', () => {
    const [line] = mapTollRows({
      rows: [row({ ...full, Ngay: '31/08/2026' })],
      provider: 'VETC',
      mapping: { ...mapping, columns: { ...mapping.columns, businessDate: 'Ngay' } },
      timeZone: HCM,
    });
    expect(line?.businessDate).toBe('2026-08-31');
  });

  /**
   * COT NGAY NGHIEP VU THANG, ke ca khi o gio qua tram ben canh no HONG.
   *
   * Ban dau khoi doc `passedAt` truoc va tu choi ca dong khi gio hong — nen mot dong CO ngay hach
   * toan doc duoc van bi vut di vi mot o gio sai dinh dang. Neo cua ky doi soat la cot NGAY, khong
   * phai o gio.
   */
  it('gio qua tram hong KHONG giet mot dong da co ngay nghiep vu doc duoc', () => {
    const [line] = mapTollRows({
      rows: [row({ ...full, Ngay: '31/08/2026', 'Thoi diem': '31/02/2026 10:00' })],
      provider: 'VETC',
      mapping: { ...mapping, columns: { ...mapping.columns, businessDate: 'Ngay' } },
      timeZone: HCM,
    });
    expect(line?.parseStatus).toBe('ACCEPTED');
    expect(line?.businessDate).toBe('2026-08-31');
    // TRUNG THUC: khong doc duoc gio thi de trong, khong bia mot khoanh khac nao.
    expect(line?.passedAt).toBeNull();
    // Va chuoi goc van con de doi chieu.
    expect(line?.rawValues['Thoi diem']).toBe('31/02/2026 10:00');
  });

  it('gio qua tram hong VAN giet dong khi do la nguon ngay DUY NHAT', () => {
    const [line] = run([row({ ...full, 'Thoi diem': '31/02/2026 10:00' })]);
    expect(line?.parseStatus).toBe('REJECTED');
    expect(line?.rejectReason).toBe('TOLL_ROW_DATE_INVALID');
  });

  it('`defaultKind` duoc dung khi tep khong co cot loai', () => {
    const [line] = mapTollRows({
      rows: [row({ ...full, Loai: '' })],
      provider: 'VETC',
      mapping: {
        ...mapping,
        columns: { ...mapping.columns, kind: undefined },
        defaultKind: 'TOLL_PASS',
      },
      timeZone: HCM,
    });
    expect(line?.kind).toBe('TOLL_PASS');
  });
});

describe('moi duong tu choi co MOT ma rieng', () => {
  const reasonFor = (values: Record<string, string>) => run([row(values)])[0]?.rejectReason;

  it('thieu so tai khoan', () => {
    expect(reasonFor({ ...full, 'So tai khoan': '  ' })).toBe('TOLL_ROW_ACCOUNT_MISSING');
  });

  it('thieu so tien va so tien khong doc duoc la HAI ma khac nhau', () => {
    expect(reasonFor({ ...full, 'So tien': '' })).toBe('TOLL_ROW_MISSING_AMOUNT');
    expect(reasonFor({ ...full, 'So tien': '4.20' })).toBe('TOLL_ROW_AMOUNT_INVALID');
  });

  it('thieu ngay va ngay khong doc duoc la HAI ma khac nhau', () => {
    expect(reasonFor({ ...full, 'Thoi diem': '' })).toBe('TOLL_ROW_MISSING_DATE');
    expect(reasonFor({ ...full, 'Thoi diem': '31/02/2026 10:00' })).toBe('TOLL_ROW_DATE_INVALID');
  });

  it('loai giao dich khong co trong bang khai thi bi TU CHOI, khong bi doan thanh qua tram', () => {
    expect(reasonFor({ ...full, Loai: 'Dieu chinh cuoi ky' })).toBe('TOLL_ROW_KIND_UNKNOWN');
  });

  it('mot luot qua tram khong co bien so thi khong gan duoc vao xe nao', () => {
    expect(reasonFor({ ...full, 'Bien so': '' })).toBe('TOLL_ROW_PLATE_MISSING');
  });

  it('nap tien va phi tai khoan KHONG doi bien so', () => {
    const [topUp] = run([row({ ...full, Loai: 'Nap tien', 'Bien so': '' })]);
    expect(topUp?.parseStatus).toBe('ACCEPTED');
    expect(topUp?.kind).toBe('TOP_UP');
    expect(topUp?.vehiclePlateRaw).toBe('');
  });

  /**
   * #269 J3 — *"preserve partial success"*. Dong hong PHAI o lai, voi cac o so lieu de `null`.
   * Dat mot gia tri mac dinh vao mot o khong doc duoc se cho mot du kien BIA di tiep vao vong so
   * khop nhu that.
   */
  it('dong bi tu choi VAN o lai, khong o so lieu nao bi dat gia tri bia', () => {
    const lines = run([row(full), row({ ...full, 'So tien': 'xxx' }, 3)]);
    expect(lines).toHaveLength(2);
    const rejected = lines[1];
    expect(rejected?.parseStatus).toBe('REJECTED');
    expect(rejected?.signedAmount).toBeNull();
    expect(rejected?.businessDate).toBeNull();
    expect(rejected?.fingerprint).toBeNull();
    expect(rejected?.rawValues['So tien']).toBe('xxx');
    expect(rejected?.rowNumber).toBe(3);
  });
});

/**
 * ===========================================================================
 * HAI DONG GIONG HET NHAU DEU DUOC NHAN — day la cho ETC KHAC nhien lieu.
 *
 * `fuel-statement-mapping.ts` tu choi dong trung voi `DUPLICATE_ROW`. O ETC dieu do se SAI: VETC
 * tu cong bo rang loi doc cheo lan sinh ra HAI giao dich cho MOT luot xe, roi hoan mot giao dich.
 * Vut mot trong hai di se lam dong hoan tien mo coi.
 */
describe('trung dong khong bi vut o tang doc', () => {
  it('hai dong giong het nhau deu duoc nhan va co CUNG dau van', () => {
    const lines = run([row(full), row(full, 3)]);
    expect(lines.map((line) => line.parseStatus)).toEqual(['ACCEPTED', 'ACCEPTED']);
    expect(lines[0]?.fingerprint).toBe(lines[1]?.fingerprint);
  });
});

describe('noi dung nha cung cap la DU LIEU, khong phai cu phap', () => {
  it('mot o bat dau bang `=` duoc giu nguyen van, khong duoc tinh', () => {
    const [line] = run([row({ ...full, Tram: '=cmd|/c calc' })]);
    expect(line?.stationLabel).toBe('=cmd|/c calc');
    expect(line?.rawValues.Tram).toBe('=cmd|/c calc');
  });
});

describe('kiem bo cot o cap TEP truoc khi doc dong nao', () => {
  it('neu ten cot khai khong co trong hang tieu de', () => {
    expect(missingTollColumns(['So tai khoan', 'So tien'], mapping)).toEqual(
      expect.arrayContaining(['Loai', 'Bien so', 'Thoi diem', 'Tram', 'Tham chieu']),
    );
    expect(missingTollColumns(Object.keys(full), mapping)).toEqual([]);
  });
});
