import { describe, expect, it } from 'vitest';
import type { TollActiveLinkView } from './toll-account-link.js';
import { classifyTollRows, type ClassifiableTollRow } from './toll-classification.js';

const link = (over: Partial<TollActiveLinkView> = {}): TollActiveLinkView => ({
  vehicleId: 'veh-1',
  vehiclePlate: '15C-556.33',
  providerVehicleRef: null,
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  ...over,
});

const pass = (over: Partial<ClassifiableTollRow> = {}): ClassifiableTollRow => ({
  rowNumber: 2,
  parseStatus: 'ACCEPTED',
  accountNoRaw: 'TK-001',
  kind: 'TOLL_PASS',
  vehiclePlateRaw: '15C-556.33',
  providerRef: null,
  businessDate: '2026-06-01',
  fingerprint: 'fp-a',
  ...over,
});

const classify = (
  rows: readonly ClassifiableTollRow[],
  over: {
    accounts?: ReadonlyMap<string, string>;
    links?: ReadonlyMap<string, readonly TollActiveLinkView[]>;
    known?: ReadonlySet<string>;
  } = {},
) =>
  classifyTollRows({
    rows,
    accountIdByNormalizedNo: over.accounts ?? new Map([['TK001', 'acc-1']]),
    linksByAccountId: over.links ?? new Map([['acc-1', [link()]]]),
    knownFingerprints: over.known ?? new Set<string>(),
  });

describe('phan loai mot dong da doc duoc', () => {
  it('noi duoc ca tai khoan lan xe thi la MATCHED', () => {
    expect(classify([pass()])[0]).toEqual({
      rowNumber: 2,
      accountId: 'acc-1',
      vehicleId: 'veh-1',
      matchState: 'MATCHED',
      ambiguousVehicleIds: [],
    });
  });

  it('so tai khoan chua duoc khai thi khong doc duoc gi ca', () => {
    const [result] = classify([pass()], { accounts: new Map() });
    expect(result?.matchState).toBe('ACCOUNT_UNRESOLVED');
    expect(result?.accountId).toBeNull();
    expect(result?.vehicleId).toBeNull();
  });

  /**
   * #269 J6 — *"Do not require a Run/Leg match for every ETC transaction: account top-up/fee/
   * adjustment may not belong to one trip."* Nap tien la viec cua TAI KHOAN. Doi no phai co xe se
   * lam moi lan nap tien nam vinh vien trong hang cho doi soat.
   */
  it('nap tien va phi tai khoan la MATCHED o muc TAI KHOAN, khong doi xe', () => {
    const [topUp] = classify([pass({ kind: 'TOP_UP', vehiclePlateRaw: '', fingerprint: 'fp-t' })]);
    expect(topUp?.matchState).toBe('MATCHED');
    expect(topUp?.vehicleId).toBeNull();

    const [fee] = classify([
      pass({ kind: 'ACCOUNT_FEE', vehiclePlateRaw: '', fingerprint: 'fp-f' }),
    ]);
    expect(fee?.matchState).toBe('MATCHED');
  });

  it('bien so khong noi ve xe nao cua tai khoan do thi la VEHICLE_UNRESOLVED', () => {
    const [result] = classify([pass({ vehiclePlateRaw: '99Z-999.99' })]);
    expect(result?.matchState).toBe('VEHICLE_UNRESOLVED');
    expect(result?.vehicleId).toBeNull();
  });

  /**
   * D.11 kh.3 cam mot xe nhan chi tra tu hai tai khoan, nen mot dong tren tai khoan X mang bien so
   * cua xe dang noi voi tai khoan Y la mot BAT THUONG THAT — khong phai mot phep doc thanh cong.
   */
  it('bien so cua mot xe thuoc tai khoan KHAC khong duoc doc thanh cong', () => {
    const [result] = classify([pass()], {
      accounts: new Map([
        ['TK001', 'acc-1'],
        ['TK002', 'acc-2'],
      ]),
      links: new Map([['acc-2', [link()]]]),
    });
    expect(result?.matchState).toBe('VEHICLE_UNRESOLVED');
  });

  it('bien so ung voi hai xe thi neu ra ca hai, khong chon bua', () => {
    const [result] = classify([pass()], {
      links: new Map([['acc-1', [link(), link({ vehicleId: 'veh-2' })]]]),
    });
    expect(result?.matchState).toBe('AMBIGUOUS');
    expect(result?.vehicleId).toBeNull();
    expect(result?.ambiguousVehicleIds).toEqual(['veh-1', 'veh-2']);
  });

  it('dong bi tu choi luc doc thi khong duoc phan loai', () => {
    const [result] = classify([
      pass({ parseStatus: 'REJECTED', fingerprint: null, businessDate: null }),
    ]);
    expect(result?.matchState).toBeNull();
    expect(result?.accountId).toBeNull();
  });
});

/**
 * ===========================================================================
 * TRUNG DAU VAN — va vi sao CA HAI dong deu bi danh dau.
 *
 * VETC tu cong bo: loi doc cheo lan sinh ra HAI giao dich cho MOT luot xe, roi he thong hoan mot
 * giao dich (`transport-etc-ingestion.md` §2.1/§5.1). Nghia la hai dong giong het nhau CO THE la
 * hai su kien that, va cung co the la mot su kien bi ghi hai lan.
 *
 * He thong khong biet la cai nao. Nen no khong duoc chon — no phai NEU RA.
 */
describe('trung dau van thi NEU RA, khong bao gio tu loai', () => {
  it('danh dau CA HAI dong, khong chi dong thu hai', () => {
    const results = classify([pass(), pass({ rowNumber: 3 })]);
    expect(results.map((result) => result.matchState)).toEqual([
      'DUPLICATE_CANDIDATE',
      'DUPLICATE_CANDIDATE',
    ]);
    // Va khong dong nao bi vut di — ca hai van o lai trong ket qua.
    expect(results).toHaveLength(2);
  });

  it('van doc duoc xe cho dong trung — de nguoi quyet nhin thay ca hai mat', () => {
    const results = classify([pass(), pass({ rowNumber: 3 })]);
    expect(results[0]?.vehicleId).toBe('veh-1');
  });

  /** #269 J4 — cung mot giao dich ve qua HAI tep nguon phai duoc phat hien. */
  it('trung voi mot dong da nap tu TEP KHAC cung bi danh dau', () => {
    const [result] = classify([pass()], { known: new Set(['fp-a']) });
    expect(result?.matchState).toBe('DUPLICATE_CANDIDATE');
  });

  it('hai dong KHAC dau van thi khong dong nao bi danh dau', () => {
    const results = classify([pass(), pass({ rowNumber: 3, fingerprint: 'fp-b' })]);
    expect(results.map((result) => result.matchState)).toEqual(['MATCHED', 'MATCHED']);
  });
});

/**
 * THU TU UU TIEN khi mot dong roi vao nhieu nhom cung luc.
 *
 * Mot dong chi mang MOT nhan, nen thu tu quyet dinh nguoi doi soat nhin thay viec gi truoc. Thu tu
 * duoc chon theo cau hoi "khong tra loi duoc cai nay thi tra loi cai kia cung vo nghia":
 *
 *   ACCOUNT_UNRESOLVED  — chua biet dong nay thuoc tai khoan nao thi moi cau hoi sau deu treo
 *   DUPLICATE_CANDIDATE — chua biet su kien nay CO THAT hay khong thi gan xe cho no la viec thua
 *   AMBIGUOUS           — biet la that, nhung du lieu noi dang hong
 *   VEHICLE_UNRESOLVED  — biet la that, chi thieu mot ban ghi noi
 */
describe('thu tu uu tien cua nhan', () => {
  it('chua biet tai khoan thi nhan do thang moi nhan khac', () => {
    const results = classify([pass(), pass({ rowNumber: 3 })], { accounts: new Map() });
    expect(results.map((result) => result.matchState)).toEqual([
      'ACCOUNT_UNRESOLVED',
      'ACCOUNT_UNRESOLVED',
    ]);
  });

  it('nghi ngo trung thang cau hoi bien so chua noi duoc', () => {
    const results = classify([
      pass({ vehiclePlateRaw: '99Z-999.99' }),
      pass({ rowNumber: 3, vehiclePlateRaw: '99Z-999.99' }),
    ]);
    expect(results.map((result) => result.matchState)).toEqual([
      'DUPLICATE_CANDIDATE',
      'DUPLICATE_CANDIDATE',
    ]);
  });
});
