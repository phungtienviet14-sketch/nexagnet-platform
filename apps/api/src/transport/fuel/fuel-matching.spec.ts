import { describe, expect, it } from 'vitest';
import {
  businessDateDeltaDays,
  runFuelMatching,
  type FuelMatchTolerance,
  type MatchableFuelEntry,
  type MatchableStatementLine,
} from './fuel-matching.js';

/**
 * SO KHOP TAT DINH — hat giong `FUEL-RECON-001`..`006` cua T1 §17, cong `INV-26`.
 *
 * Day la bo test QUAN TRONG NHAT cua T4. Neu phep so khop im lang doan sai o mot cho, ket qua
 * khong phai mot ngoai le ma la mot bang doi soat DEP: khop het, khong chenh lech, va cong ty tra
 * cho cay xang mot so tien khong ai kiem lai. Toan bo gia tri chong that thoat cua `TX-04` nam o
 * cho nay.
 */

const STATEMENT = 'stm-thang-8';
const OTHER_STATEMENT = 'stm-thang-7';
const VEHICLE = 'xe-1';

/** `GD-08` — dung sai mac dinh: tien +-1.000d, ngay +-1, xe khop tuyet doi. */
const TOLERANCE: FuelMatchTolerance = { amountVnd: 1_000, businessDateDays: 1 };

const line = (
  id: string,
  overrides: Partial<MatchableStatementLine> = {},
): MatchableStatementLine => ({
  id,
  statementId: STATEMENT,
  vehicleId: VEHICLE,
  businessDate: '2026-08-05',
  amount: 4_200_000,
  reconciliationStatus: 'UNMATCHED',
  ...overrides,
});

const entry = (id: string, overrides: Partial<MatchableFuelEntry> = {}): MatchableFuelEntry => ({
  id,
  vehicleId: VEHICLE,
  businessDate: '2026-08-05',
  amount: 4_200_000,
  sourceStatementId: null,
  reconciliationStatus: 'UNMATCHED',
  ...overrides,
});

const run = (lines: MatchableStatementLine[], entries: MatchableFuelEntry[]) =>
  runFuelMatching({ statementId: STATEMENT, lines, entries, tolerance: TOLERANCE });

describe('FUEL-RECON-001 — khop', () => {
  it('trung tuyet doi ca tien lan ngay -> MATCH_EXACT', () => {
    const result = run([line('l1')], [entry('e1')]);

    expect(result.discrepancies).toEqual([]);
    expect(result.matches).toEqual([
      {
        statementLineId: 'l1',
        fuelEntryId: 'e1',
        amountDeltaVnd: 0,
        businessDateDeltaDays: 0,
        reason: 'MATCH_EXACT',
      },
    ]);
  });

  /**
   * `GD-08` cho ca hai chieu lech, va bai test doi CA HAI cung luc.
   *
   * Mot bo test chi kiem lech tien se van xanh khi ai do quen mat dung sai ngay — va cac phieu do
   * dau ca dem (rat pho bien voi xe duong dai) se bien thanh chenh lech hang loat.
   */
  it('lech tien 1.000d VA lech ngay 1 -> van khop, nhung la MATCH_WITHIN_TOLERANCE', () => {
    const result = run(
      [line('l1', { amount: 4_201_000, businessDate: '2026-08-06' })],
      [entry('e1')],
    );

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({
      reason: 'MATCH_WITHIN_TOLERANCE',
      amountDeltaVnd: 1_000,
      businessDateDeltaDays: 1,
    });
  });

  it('lech tien 1.001d -> khong con la khop', () => {
    const result = run([line('l1', { amount: 4_201_001 })], [entry('e1')]);

    expect(result.matches).toEqual([]);
    expect(result.discrepancies[0]).toMatchObject({
      kind: 'OUT_OF_TOLERANCE',
      reason: 'MATCH_OUT_OF_TOLERANCE',
      candidateEntryIds: ['e1'],
    });
  });

  it('XE KHOP TUYET DOI — hai bien so khac nhau la hai xe, khong co duong khop mo', () => {
    const result = run([line('l1')], [entry('e1', { vehicleId: 'xe-2' })]);

    expect(result.matches).toEqual([]);
    expect(result.discrepancies.map((item) => item.kind).sort()).toEqual([
      'FUEL_ENTRY_ONLY',
      'STATEMENT_LINE_ONLY',
    ]);
  });
});

describe('FUEL-RECON-002 — lech khong tu tra tien', () => {
  it('dong bang ke khong co phieu tuong ung -> STATEMENT_LINE_ONLY, khong khop gi', () => {
    const result = run([line('l1')], []);

    expect(result.matches).toEqual([]);
    expect(result.discrepancies).toEqual([
      {
        kind: 'STATEMENT_LINE_ONLY',
        statementLineId: 'l1',
        fuelEntryId: null,
        candidateEntryIds: [],
        candidateLineIds: [],
        reason: 'MATCH_STATEMENT_LINE_ONLY',
      },
    ]);
  });

  it('phieu khong thay tren bang ke -> FUEL_ENTRY_ONLY', () => {
    const result = run([], [entry('e1')]);

    expect(result.discrepancies).toEqual([
      {
        kind: 'FUEL_ENTRY_ONLY',
        statementLineId: null,
        fuelEntryId: 'e1',
        candidateEntryIds: [],
        candidateLineIds: [],
        reason: 'MATCH_FUEL_ENTRY_ONLY',
      },
    ]);
  });

  /**
   * Mot phieu da nam trong mot chenh lech KHAC khong duoc hien ra lan thu hai la "khong thay tren
   * bang ke".
   *
   * Hai dong mau thuan nhau tren cung mot man hinh la thu lam nguoi doi soat mat long tin vao ca
   * bang — va ho se quay ve doi chieu bang tay, tuc T4 khong giai quyet duoc gi.
   */
  it('phieu dang nam trong mot chenh lech khac KHONG bi dem hai lan', () => {
    const result = run([line('l1', { amount: 9_000_000 })], [entry('e1')]);

    expect(result.discrepancies).toHaveLength(1);
    expect(result.discrepancies[0]).toMatchObject({ kind: 'OUT_OF_TOLERANCE' });
  });
});

describe('FUEL-RECON-003 / INV-26 — khong tu khop voi chinh minh', () => {
  /**
   * Cap nay TRUNG TUYET DOI. Neu `INV-26` khong duoc cuong che, no se khop — va he thong bao mot ky
   * doi soat sach se trong khi khong co mot bang chung doc lap nao.
   */
  it('phieu de ra tu CHINH bang ke dang doi soat bi loai, kem ly do rieng', () => {
    const result = run([line('l1')], [entry('e1', { sourceStatementId: STATEMENT })]);

    expect(result.matches).toEqual([]);
    expect(result.discrepancies).toEqual([
      {
        kind: 'SELF_SOURCED_BLOCKED',
        statementLineId: 'l1',
        fuelEntryId: null,
        candidateEntryIds: ['e1'],
        candidateLineIds: [],
        reason: 'MATCH_SELF_SOURCED_BLOCKED',
      },
    ]);
  });

  it('phieu de ra tu bang ke KHAC van khop binh thuong', () => {
    const result = run([line('l1')], [entry('e1', { sourceStatementId: OTHER_STATEMENT })]);

    expect(result.matches).toHaveLength(1);
    expect(result.discrepancies).toEqual([]);
  });

  /**
   * Mot phieu tu-nguon nhung lech tien qua xa la mot `OUT_OF_TOLERANCE` binh thuong, KHONG phai mot
   * lan `INV-26` chan.
   *
   * Bao sai ly do o day se lam nguoi doi soat di tim mot van de ve nguon goc du lieu khong ton tai,
   * trong khi viec that su can lam la hoi cay xang ve chenh lech so tien.
   */
  it('lech vuot dung sai duoc bao la OUT_OF_TOLERANCE, khong phai INV-26', () => {
    const result = run(
      [line('l1', { amount: 9_000_000 })],
      [entry('e1', { sourceStatementId: STATEMENT })],
    );

    expect(result.discrepancies[0]).toMatchObject({ kind: 'OUT_OF_TOLERANCE' });
  });
});

describe('FUEL-RECON-006 / GD-09 — nhap nhang thi khong tu chon', () => {
  it('mot dong khop duoc voi HAI phieu -> khong cap nao tu khop', () => {
    const result = run([line('l1')], [entry('e1'), entry('e2')]);

    expect(result.matches).toEqual([]);
    expect(result.discrepancies).toEqual([
      {
        kind: 'AMBIGUOUS_CANDIDATES',
        statementLineId: 'l1',
        fuelEntryId: null,
        candidateEntryIds: ['e1', 'e2'],
        candidateLineIds: [],
        reason: 'MATCH_AMBIGUOUS_CANDIDATES',
      },
    ]);
  });

  /**
   * CHIEU NGUOC LAI — hai dong cung nham toi MOT phieu.
   *
   * Day la nua bi bo sot neu chi kiem mot chieu: moi dong "chi co mot ung vien", nen mot phep khop
   * tham lam se khop CA HAI voi cung mot phieu — va mot lan do dau se doi soat cho hai khoan tien.
   */
  it('HAI dong cung nham toi MOT phieu -> ca hai deu la nhap nhang', () => {
    const result = run([line('l1'), line('l2')], [entry('e1')]);

    expect(result.matches).toEqual([]);
    expect(result.discrepancies).toHaveLength(2);
    for (const discrepancy of result.discrepancies) {
      expect(discrepancy).toMatchObject({
        kind: 'AMBIGUOUS_CANDIDATES',
        fuelEntryId: 'e1',
        candidateLineIds: ['l1', 'l2'],
      });
    }
  });
});

describe('TAT DINH — cung dau vao, cung dau ra', () => {
  /**
   * Dao thu tu mang dau vao KHONG duoc doi ket qua.
   *
   * Neu phep khop phu thuoc thu tu, thi hai lan bam "chay lai" tren cung mot du lieu se cho hai ket
   * qua khac nhau, va khong ai giai thich duoc cai nao dung. Do la ly do phep khop kiem quan he
   * HAI CHIEU thay vi "lay ung vien gan nhat".
   */
  it('dao thu tu dong va phieu cho ra ket qua giong het', () => {
    const lines = [line('l1'), line('l2', { businessDate: '2026-08-20', amount: 1_000_000 })];
    const entries = [entry('e1'), entry('e2', { businessDate: '2026-08-20', amount: 1_000_000 })];

    const forward = runFuelMatching({
      statementId: STATEMENT,
      lines,
      entries,
      tolerance: TOLERANCE,
    });
    const reversed = runFuelMatching({
      statementId: STATEMENT,
      lines: [...lines].reverse(),
      entries: [...entries].reverse(),
      tolerance: TOLERANCE,
    });

    expect(reversed).toEqual(forward);
    expect(forward.matches).toHaveLength(2);
  });

  it('dong/phieu DA khop hoac DA co nguoi quyet khong vao lai vong so khop', () => {
    const result = run(
      [
        line('l1', { reconciliationStatus: 'SETTLED' }),
        line('l2', { reconciliationStatus: 'IGNORED' }),
      ],
      [entry('e1', { reconciliationStatus: 'MATCHED' })],
    );

    expect(result.matches).toEqual([]);
    expect(result.discrepancies).toEqual([]);
  });
});

describe('Do lech ngay — ngay lich, khong mui gio', () => {
  it('dem so ngay tron va giu dau', () => {
    expect(businessDateDeltaDays('2026-08-06', '2026-08-05')).toBe(1);
    expect(businessDateDeltaDays('2026-08-05', '2026-08-06')).toBe(-1);
    expect(businessDateDeltaDays('2026-08-05', '2026-08-05')).toBe(0);
    // Qua moc gio mua he cua nhieu mui gio — van dung mot ngay, vi ca hai dau doc o UTC.
    expect(businessDateDeltaDays('2026-03-30', '2026-03-29')).toBe(1);
    expect(businessDateDeltaDays('2026-09-01', '2026-08-31')).toBe(1);
  });
});
