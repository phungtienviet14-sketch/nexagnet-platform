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
  invoiceNo: null,
  reconciliationStatus: 'UNMATCHED',
  ...overrides,
});

const entry = (id: string, overrides: Partial<MatchableFuelEntry> = {}): MatchableFuelEntry => ({
  id,
  vehicleId: VEHICLE,
  businessDate: '2026-08-05',
  amount: 4_200_000,
  invoiceNo: null,
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
        invoiceRelation: 'ABSENT',
        decidedByInvoice: false,
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

  it('dong/phieu DA CO NGUOI QUYET khong vao lai vong so khop', () => {
    const result = run(
      [
        line('l1', { reconciliationStatus: 'SETTLED' }),
        line('l2', { reconciliationStatus: 'IGNORED' }),
      ],
      [entry('e1', { reconciliationStatus: 'SETTLED' })],
    );

    expect(result.matches).toEqual([]);
    expect(result.discrepancies).toEqual([]);
  });

  /**
   * CHAY LAI PHAI CHO RA CUNG KET QUA — va do la ly do `MATCHED` VAO LAI vong so khop.
   *
   * `applyMatchingRun` xoa cac cap tu dong cu roi ghi bo moi. Neu mot cap `MATCHED` khong duoc de
   * nghi lai, lan chay thu hai se xoa ma khong tao lai — ky doi soat mat het cap khop, va con so
   * ban giao cho T5 tut ve 0. Do la mot loi THAT, do duoc tren Postgres o `P10` truoc khi sua.
   */
  it('cap DA KHOP BOI MAY duoc de nghi lai y nguyen o lan chay thu hai', () => {
    const first = run([line('l1')], [entry('e1')]);
    expect(first.matches).toHaveLength(1);

    // Trang thai sau lan chay dau: ca hai dau deu `MATCHED`.
    const second = run(
      [line('l1', { reconciliationStatus: 'MATCHED' })],
      [entry('e1', { reconciliationStatus: 'MATCHED' })],
    );

    expect(second).toEqual(first);
  });
});

/**
 * `#317` G4 — MA TRAN SO HOA DON: bang nhau / xung dot / thieu mot ben / khac dinh dang.
 *
 * Quyet dinh chu so huu: `invoiceNo` la BO PHAN BIET TUY CHON. No chi duoc lam ba viec — tang do
 * chac khi trung, chan tu khop khi xung dot, va IM LANG khi mot ben thieu. Nó khong bao gio tu tao
 * mot cap: xe/ngay/tien van la ba cong bat buoc truoc khi so hoa don duoc hoi toi.
 */
describe('#317 G4 — so hoa don la bo phan biet tuy chon', () => {
  it('BANG NHAU (mot ung vien) -> van khop, va ghi ro so hoa don da xac nhan', () => {
    const result = run([line('l1', { invoiceNo: 'HD-00123' })], [entry('e1', { invoiceNo: 'hd00123' })]);

    expect(result.discrepancies).toEqual([]);
    expect(result.matches).toEqual([
      {
        statementLineId: 'l1',
        fuelEntryId: 'e1',
        amountDeltaVnd: 0,
        businessDateDeltaDays: 0,
        reason: 'MATCH_EXACT',
        invoiceRelation: 'EQUAL',
        decidedByInvoice: false,
      },
    ]);
  });

  it('XUNG DOT -> KHONG tu khop; dua ve INVOICE_CONFLICT, phieu khong bi bao "khong thay"', () => {
    const result = run([line('l1', { invoiceNo: '123' })], [entry('e1', { invoiceNo: '124' })]);

    expect(result.matches).toEqual([]);
    expect(result.discrepancies).toEqual([
      {
        kind: 'INVOICE_CONFLICT',
        statementLineId: 'l1',
        fuelEntryId: null,
        candidateEntryIds: ['e1'],
        candidateLineIds: [],
        reason: 'MATCH_INVOICE_CONFLICT',
      },
    ]);
  });

  it('THIEU MOT BEN (dong khong co so) -> cap von dung VAN khop', () => {
    const result = run([line('l1')], [entry('e1', { invoiceNo: '0000123' })]);

    expect(result.discrepancies).toEqual([]);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({ fuelEntryId: 'e1', invoiceRelation: 'ABSENT' });
  });

  it('THIEU MOT BEN (phieu khong co so, hoac chi khoang trang) -> cap von dung VAN khop', () => {
    const blank = run([line('l1', { invoiceNo: '123' })], [entry('e1', { invoiceNo: '   ' })]);
    const missing = run([line('l1', { invoiceNo: '123' })], [entry('e1')]);

    for (const result of [blank, missing]) {
      expect(result.discrepancies).toEqual([]);
      expect(result.matches[0]).toMatchObject({ fuelEntryId: 'e1', invoiceRelation: 'ABSENT' });
    }
  });

  it('KHAC DINH DANG nhung trung sau chuan hoa (so 0 dau, dau phan cach, chu thuong) -> EQUAL', () => {
    const cases: readonly (readonly [string, string])[] = [
      ['0000123', '123'],
      [' hd-123 ', 'HD123'],
      ['HD/12.3', 'hd 123'],
    ];
    for (const [onLine, onEntry] of cases) {
      const result = run(
        [line('l1', { invoiceNo: onLine })],
        [entry('e1', { invoiceNo: onEntry })],
      );
      expect(result.matches[0], `${onLine} ~ ${onEntry}`).toMatchObject({ invoiceRelation: 'EQUAL' });
    }
  });

  it('so 0 TRONG ma co chu KHONG duoc bo -> `A0123` va `A123` la xung dot', () => {
    const result = run([line('l1', { invoiceNo: 'A0123' })], [entry('e1', { invoiceNo: 'A123' })]);

    expect(result.matches).toEqual([]);
    expect(result.discrepancies[0]).toMatchObject({ kind: 'INVOICE_CONFLICT' });
  });

  /**
   * CHUOI HOA DON KHONG PHAI DANH TINH KINH TE: trung so ma khac xe, hay lech tien vuot dung sai, thi
   * van KHONG khop — va ly do bao ra la ly do cua xe/tien, khong phai cua so hoa don.
   */
  it('trung so hoa don nhung KHAC XE -> khong khop', () => {
    const result = run(
      [line('l1', { invoiceNo: '777' })],
      [entry('e1', { invoiceNo: '777', vehicleId: 'xe-2' })],
    );

    expect(result.matches).toEqual([]);
    expect(result.discrepancies.map((item) => item.kind).sort()).toEqual([
      'FUEL_ENTRY_ONLY',
      'STATEMENT_LINE_ONLY',
    ]);
  });

  it('trung so hoa don nhung LECH TIEN vuot dung sai -> OUT_OF_TOLERANCE, khong khop', () => {
    const result = run(
      [line('l1', { invoiceNo: '777', amount: 9_000_000 })],
      [entry('e1', { invoiceNo: '777' })],
    );

    expect(result.matches).toEqual([]);
    expect(result.discrepancies[0]).toMatchObject({ kind: 'OUT_OF_TOLERANCE' });
  });

  /**
   * BO PHAN BIET: hai phieu cung xe/ngay/tien voi mot dong — truoc G4 la nhap nhang. Mot phieu co
   * so hoa don TRUNG voi dong thi do la bang chung tat dinh; phieu con lai khong co so thi khong noi
   * duoc gi, nen no ra "khong thay tren bang ke" chu khong bi ep vao cap nay.
   */
  it('HAI ung vien, DUNG MOT trung so hoa don -> khop cap do, danh dau quyet bang so hoa don', () => {
    const result = run(
      [line('l1', { invoiceNo: '555' })],
      [entry('e1', { invoiceNo: '555' }), entry('e2')],
    );

    expect(result.matches).toEqual([
      {
        statementLineId: 'l1',
        fuelEntryId: 'e1',
        amountDeltaVnd: 0,
        businessDateDeltaDays: 0,
        reason: 'MATCH_EXACT',
        invoiceRelation: 'EQUAL',
        decidedByInvoice: true,
      },
    ]);
    expect(result.discrepancies).toEqual([
      {
        kind: 'FUEL_ENTRY_ONLY',
        statementLineId: null,
        fuelEntryId: 'e2',
        candidateEntryIds: [],
        candidateLineIds: [],
        reason: 'MATCH_FUEL_ENTRY_ONLY',
      },
    ]);
  });

  it('HAI ung vien deu KHONG co so -> van nhap nhang nhu truoc G4', () => {
    const result = run([line('l1', { invoiceNo: '555' })], [entry('e1'), entry('e2')]);

    expect(result.matches).toEqual([]);
    expect(result.discrepancies[0]).toMatchObject({
      kind: 'AMBIGUOUS_CANDIDATES',
      candidateEntryIds: ['e1', 'e2'],
    });
  });

  it('HAI ung vien deu TRUNG so -> van nhap nhang, khong chon', () => {
    const result = run(
      [line('l1', { invoiceNo: '555' })],
      [entry('e1', { invoiceNo: '555' }), entry('e2', { invoiceNo: '0555' })],
    );

    expect(result.matches).toEqual([]);
    expect(result.discrepancies[0]).toMatchObject({ kind: 'AMBIGUOUS_CANDIDATES' });
  });

  it('HAI DONG cung trung so voi MOT phieu -> chieu nguoc van nhap nhang, khong khop dong nao', () => {
    const result = run(
      [line('l1', { invoiceNo: '555' }), line('l2', { invoiceNo: '555' })],
      [entry('e1', { invoiceNo: '555' })],
    );

    expect(result.matches).toEqual([]);
    for (const discrepancy of result.discrepancies) {
      expect(discrepancy).toMatchObject({
        kind: 'AMBIGUOUS_CANDIDATES',
        fuelEntryId: 'e1',
        candidateLineIds: ['l1', 'l2'],
      });
    }
  });

  /**
   * XUNG DOT LOAI DUNG CAP DO, khong loai ca dong hay ca phieu. `l2` noi mot so hoa don KHAC `e1`,
   * nen `l2` khong con la ung vien cua `e1`; `l1` trung so -> cap `l1-e1` khong con ai tranh. Truoc
   * G4 ca hai dong deu la nhap nhang, nen `decidedByInvoice` phai bat.
   */
  it('HAI DONG, chieu nguoc: mot dong TRUNG, mot dong XUNG DOT -> dong trung khop, dong kia ve soat', () => {
    const result = run(
      [line('l1', { invoiceNo: '555' }), line('l2', { invoiceNo: '999' })],
      [entry('e1', { invoiceNo: '555' })],
    );

    expect(result.matches).toEqual([
      expect.objectContaining({
        statementLineId: 'l1',
        fuelEntryId: 'e1',
        invoiceRelation: 'EQUAL',
        decidedByInvoice: true,
      }),
    ]);
    expect(result.discrepancies).toEqual([
      {
        kind: 'INVOICE_CONFLICT',
        statementLineId: 'l2',
        fuelEntryId: null,
        candidateEntryIds: ['e1'],
        candidateLineIds: [],
        reason: 'MATCH_INVOICE_CONFLICT',
      },
    ]);
  });

  it('HAI DONG, chieu nguoc: dong kia KHONG co so -> dong trung so khop, dong kia la nhap nhang cu', () => {
    const result = run(
      [line('l1', { invoiceNo: '555' }), line('l2')],
      [entry('e1', { invoiceNo: '555' })],
    );

    expect(result.matches).toEqual([
      expect.objectContaining({ statementLineId: 'l1', fuelEntryId: 'e1', decidedByInvoice: true }),
    ]);
    expect(result.discrepancies).toEqual([
      {
        kind: 'AMBIGUOUS_CANDIDATES',
        statementLineId: 'l2',
        fuelEntryId: 'e1',
        candidateEntryIds: ['e1'],
        candidateLineIds: ['l1', 'l2'],
        reason: 'MATCH_AMBIGUOUS_CANDIDATES',
      },
    ]);
  });

  /**
   * XUNG DOT CHI LOAI DUNG CAP XUNG DOT. `e1` noi mot so hoa don KHAC dong nay, nen no khong phai
   * mot ung vien "hop ly" nua; `e2` khong khai so thi theo quyet dinh chu so huu KHONG duoc bi pha.
   * Cap `l1-e2` la cap duy nhat con lai o CA HAI chieu. `e1` khong co dong nao -> `FUEL_ENTRY_ONLY`,
   * tuc van hien ra truoc mat nguoi soat chu khong bien mat.
   */
  it('mot ung vien xung dot + mot ung vien khong so -> khop ung vien khong so, phieu xung dot ra soat', () => {
    const result = run([line('l1', { invoiceNo: '555' })], [entry('e1', { invoiceNo: '999' }), entry('e2')]);

    expect(result.matches).toEqual([
      {
        statementLineId: 'l1',
        fuelEntryId: 'e2',
        amountDeltaVnd: 0,
        businessDateDeltaDays: 0,
        reason: 'MATCH_EXACT',
        invoiceRelation: 'ABSENT',
        decidedByInvoice: true,
      },
    ]);
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

  it('XUNG DOT uu tien hon lech dung sai khi chon ly do cho mot dong khong con ung vien', () => {
    const result = run(
      [line('l1', { invoiceNo: '555' })],
      [entry('e1', { invoiceNo: '999' }), entry('e2', { amount: 9_000_000 })],
    );

    expect(result.matches).toEqual([]);
    expect(result.discrepancies[0]).toMatchObject({
      kind: 'INVOICE_CONFLICT',
      candidateEntryIds: ['e1'],
    });
  });

  it('INV-26 duoc hoi TRUOC so hoa don — phieu tu-nguon trung so van bi chan', () => {
    const result = run(
      [line('l1', { invoiceNo: '555' })],
      [entry('e1', { invoiceNo: '555', sourceStatementId: STATEMENT })],
    );

    expect(result.matches).toEqual([]);
    expect(result.discrepancies[0]).toMatchObject({ kind: 'SELF_SOURCED_BLOCKED' });
  });

  it('TAT DINH voi so hoa don — dao thu tu dau vao cho ra ket qua giong het', () => {
    const lines = [
      line('l1', { invoiceNo: '555' }),
      line('l2', { invoiceNo: '777' }),
      line('l3', { invoiceNo: '999', businessDate: '2026-08-20' }),
    ];
    const entries = [
      entry('e1', { invoiceNo: '777' }),
      entry('e2', { invoiceNo: '0555' }),
      entry('e3', { invoiceNo: '998', businessDate: '2026-08-20' }),
    ];

    const forward = runFuelMatching({ statementId: STATEMENT, lines, entries, tolerance: TOLERANCE });
    const reversed = runFuelMatching({
      statementId: STATEMENT,
      lines: [...lines].reverse(),
      entries: [...entries].reverse(),
      tolerance: TOLERANCE,
    });

    expect(reversed).toEqual(forward);
    expect(forward.matches.map((match) => [match.statementLineId, match.fuelEntryId])).toEqual([
      ['l1', 'e2'],
      ['l2', 'e1'],
    ]);
    expect(forward.discrepancies).toEqual([
      expect.objectContaining({ kind: 'INVOICE_CONFLICT', statementLineId: 'l3' }),
    ]);
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
