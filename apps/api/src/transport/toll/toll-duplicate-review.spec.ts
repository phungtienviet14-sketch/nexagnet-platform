import { describe, expect, it } from 'vitest';
import type { AuditLogService } from '../../audit/audit-log.service.js';
import type { TelemetryService } from '../../observability/telemetry.service.js';
import { InMemoryTollRepository } from './in-memory-toll.repository.js';
import { TollApiRegistry } from './toll-api.port.js';
import { TollAccountService } from './toll-account.service.js';
import type { TransportTollPolicy } from './toll-policy.js';
import { TollReportService } from './toll-report.service.js';
import { RepositoryTollSpendReader } from './toll-spend.reader.js';
import { FileTollStatementSource } from './toll-statement-source.js';
import { TransportTollCoreFacts, type TollVehicleFacts } from './toll.ports.js';
import { TollService, type ManualTollRow } from './toll.service.js';
import type { TollReviewAction, TollTransactionCandidateRecord } from './toll.types.js';

/**
 * `#318` — CAU HOI TRUNG PHAI DUOC TRA LOI TRUOC KHI MOT DONG DUOC XAC NHAN, va khong co vong trung.
 *
 * ============================================================================================
 * VI SAO BAI NAY DI QUA `TollService.review()` chu khong goi thang ham thuan
 * ============================================================================================
 *
 * `OWNER_DECISIONS_2026_09_17`: *"server phai enforce, khong chi UI"*. Mot bai tren ham thuan chung
 * minh ham thuan dung; no KHONG chung minh duong ghi that di qua ham do. Nen moi bai o day bat dau
 * bang mot lan NAP that roi quyet qua dung cua ma controller goi — va khang dinh ca ba mat: loi co
 * ma, dong khong doi, lich su khong co dong nao cho lan bi tu choi.
 *
 * Kho o day la kho bo nho. Cung nhung bai do tren Postgres that nam o
 * `transport-toll-duplicate.int.spec.ts`.
 */

class FakeCoreFacts extends TransportTollCoreFacts {
  constructor(private readonly vehicles: TollVehicleFacts[]) {
    super();
  }
  async listVehicles(): Promise<readonly TollVehicleFacts[]> {
    return this.vehicles;
  }
  async findVehicle(id: string): Promise<TollVehicleFacts | null> {
    return this.vehicles.find((vehicle) => vehicle.id === id) ?? null;
  }
}

interface RecordedDecision {
  readonly point: string;
  readonly outcome: string;
  readonly reason: string;
  readonly detail?: Record<string, unknown>;
}

const audit = { append: async () => undefined } as unknown as AuditLogService;

const policy: TransportTollPolicy = {
  timeZone: 'Asia/Ho_Chi_Minh',
  providers: {},
  maxSourceBytes: 1_000_000,
  maxRows: 1_000,
};

const AUGUST = { from: '2026-08-01', to: '2026-08-31', provider: null } as const;

const manual = (over: Partial<ManualTollRow> = {}): ManualTollRow => ({
  accountNo: 'TK-001',
  kind: 'TOLL_PASS',
  vehiclePlate: '15C-556.33',
  passedAt: '31/08/2026 23:40',
  businessDate: null,
  amount: '-52.000',
  station: 'Tram Phap Van',
  providerRef: null,
  ...over,
});

const build = async () => {
  const clock = () => new Date('2026-09-16T03:00:00.000Z');
  const repository = new InMemoryTollRepository();
  const core = new FakeCoreFacts([
    { id: 'veh-1', registrationPlate: '15C-556.33' },
    { id: 'veh-2', registrationPlate: '30E-111.22' },
  ]);
  const decisions: RecordedDecision[] = [];
  const telemetry = {
    decision: (input: RecordedDecision) => {
      decisions.push(input);
    },
  } as unknown as TelemetryService;
  const toll = new TollService(
    repository,
    new FileTollStatementSource(),
    core,
    new TollApiRegistry(),
    audit,
    policy,
    telemetry,
    clock,
  );
  const accounts = new TollAccountService(repository, core, audit, policy, undefined, clock);
  const reports = new TollReportService(
    new RepositoryTollSpendReader(repository),
    repository,
    core,
    policy,
    clock,
  );
  const account = await accounts.createAccount(
    { provider: 'VETC', accountNo: 'TK-001', holderName: 'Cong ty B' },
    'ke-toan',
  );
  await accounts.openLink(
    {
      accountId: account.id,
      vehicleId: 'veh-1',
      providerVehicleRef: null,
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
    },
    'ke-toan',
  );
  return { toll, reports, repository, decisions };
};

type Harness = Awaited<ReturnType<typeof build>>;

let importCount = 0;
const importRows = async (
  harness: Harness,
  rows: readonly ManualTollRow[],
): Promise<readonly TollTransactionCandidateRecord[]> => {
  importCount += 1;
  const result = await harness.toll.commitImport(
    {
      provider: 'VETC',
      sourceKind: 'MANUAL',
      sourceLabel: `nhap tay ${String(importCount)}`,
      periodStart: null,
      periodEnd: null,
      rows,
    },
    'ke-toan',
  );
  return result.candidates;
};

/** `n` dong GIONG HET nhau -> ca `n` dong deu `DUPLICATE_CANDIDATE`. */
const suspectedRows = async (harness: Harness, n: number): Promise<readonly string[]> => {
  const candidates = await importRows(
    harness,
    Array.from({ length: n }, () => manual()),
  );
  for (const candidate of candidates) expect(candidate.matchState).toBe('DUPLICATE_CANDIDATE');
  return candidates.map((candidate) => candidate.id);
};

const review = (
  harness: Harness,
  candidateId: string,
  action: TollReviewAction,
  extra: { readonly vehicleId?: string; readonly duplicateOfCandidateId?: string } = {},
) =>
  harness.toll.review(
    {
      candidateId,
      action,
      vehicleId: extra.vehicleId ?? null,
      duplicateOfCandidateId: extra.duplicateOfCandidateId ?? null,
      note: null,
    },
    'ke-toan',
  );

const detailOf = (harness: Harness, id: string) => harness.toll.candidateDetail(id);

const deniedReasons = (harness: Harness): readonly string[] =>
  harness.decisions
    .filter((entry) => entry.point === 'toll_review.resolve' && entry.outcome === 'denied')
    .map((entry) => entry.reason);

/* ============================================================================================ */

describe('#318 — CONFIRM khong vuot qua cau hoi trung', () => {
  it('CONFIRM truc tiep tren dong NGHI TRUNG bi tu choi — dong, lich su va bao cao khong doi', async () => {
    const harness = await build();
    const [first] = await suspectedRows(harness, 2);

    await expect(review(harness, first ?? '', 'CONFIRM')).rejects.toMatchObject({
      kind: 'CONFLICT',
      reason: 'TOLL_REVIEW_DUPLICATE_UNRESOLVED',
    });

    const detail = await detailOf(harness, first ?? '');
    expect(detail.candidate).toMatchObject({
      matchState: 'DUPLICATE_CANDIDATE',
      reviewState: 'PENDING',
      duplicateOfCandidateId: null,
    });
    // Lan bi tu choi KHONG de lai mot dong lich su nao.
    expect(detail.decisions).toEqual([]);
    expect(deniedReasons(harness)).toEqual(['TOLL_REVIEW_DUPLICATE_UNRESOLVED']);

    const report = await harness.reports.spendReport(AUGUST);
    expect(report.vehicles).toEqual([]);
    expect(report.duplicates.map((row) => [row.state, row.total.rowCount, row.total.amount])).toEqual(
      [['SUSPECTED', 2, -104_000]],
    );
  });

  /**
   * CUA SAU: `RESOLVE_VEHICLE` doi dong nghi trung thanh `MATCHED`, roi `CONFIRM` qua duoc — va dong
   * vao chi phi cua xe ma khong ai tra loi cau hoi trung.
   */
  it('RESOLVE_VEHICLE tren dong nghi trung cung bi tu choi — khong doi no thanh MATCHED', async () => {
    const harness = await build();
    const [first] = await suspectedRows(harness, 2);

    await expect(
      review(harness, first ?? '', 'RESOLVE_VEHICLE', { vehicleId: 'veh-2' }),
    ).rejects.toMatchObject({ kind: 'CONFLICT', reason: 'TOLL_REVIEW_DUPLICATE_UNRESOLVED' });

    const detail = await detailOf(harness, first ?? '');
    expect(detail.candidate.matchState).toBe('DUPLICATE_CANDIDATE');
    expect(detail.candidate.vehicleId).toBe('veh-1');
    expect(detail.decisions).toEqual([]);
  });

  it('dong DA GHI TRUNG: CONFIRM va RESOLVE_VEHICLE deu bi tu choi, khai trung KHONG bi xoa', async () => {
    const harness = await build();
    const [first, second] = await suspectedRows(harness, 2);
    await review(harness, second ?? '', 'FLAG_DUPLICATE', { duplicateOfCandidateId: first ?? '' });

    await expect(review(harness, second ?? '', 'CONFIRM')).rejects.toMatchObject({
      kind: 'CONFLICT',
      reason: 'TOLL_REVIEW_DUPLICATE_DECLARED',
    });
    await expect(
      review(harness, second ?? '', 'RESOLVE_VEHICLE', { vehicleId: 'veh-2' }),
    ).rejects.toMatchObject({ kind: 'CONFLICT', reason: 'TOLL_REVIEW_DUPLICATE_DECLARED' });

    const detail = await detailOf(harness, second ?? '');
    expect(detail.candidate.duplicateOfCandidateId).toBe(first);
    expect(detail.decisions.map((entry) => entry.action)).toEqual(['FLAG_DUPLICATE']);
  });

  it('giai trung TRUOC roi moi xac nhan duoc: CLEAR -> REOPEN -> CONFIRM, lich su noi tiep', async () => {
    const harness = await build();
    const [first] = await suspectedRows(harness, 2);

    await review(harness, first ?? '', 'CLEAR_DUPLICATE');
    await review(harness, first ?? '', 'REOPEN');
    const confirmed = await review(harness, first ?? '', 'CONFIRM');

    expect(confirmed).toMatchObject({ matchState: 'MATCHED', reviewState: 'CONFIRMED' });
    const detail = await detailOf(harness, first ?? '');
    expect(detail.decisions.map((entry) => [entry.action, entry.reason])).toEqual([
      ['CLEAR_DUPLICATE', 'TOLL_REVIEW_DUPLICATE_CLEARED'],
      ['REOPEN', 'TOLL_REVIEW_REOPENED'],
      ['CONFIRM', 'TOLL_REVIEW_CONFIRMED'],
    ]);
  });

  it('MO LAI mot dong da ghi trung dua no ve NGHI TRUNG — CONFIRM van bi chan cho toi khi quyet lai', async () => {
    const harness = await build();
    const [first, second] = await suspectedRows(harness, 2);
    await review(harness, second ?? '', 'FLAG_DUPLICATE', { duplicateOfCandidateId: first ?? '' });
    await review(harness, second ?? '', 'REOPEN');

    await expect(review(harness, second ?? '', 'CONFIRM')).rejects.toMatchObject({
      reason: 'TOLL_REVIEW_DUPLICATE_UNRESOLVED',
    });

    await review(harness, second ?? '', 'FLAG_DUPLICATE', { duplicateOfCandidateId: first ?? '' });
    const detail = await detailOf(harness, second ?? '');
    expect(detail.decisions.map((entry) => entry.action)).toEqual([
      'FLAG_DUPLICATE',
      'REOPEN',
      'FLAG_DUPLICATE',
    ]);
  });

  /**
   * DU LIEU CU — dong da `CONFIRMED` khi con nghi trung (qua lo truoc `#318`). Dung lai trang thai do
   * bang MOT lenh ghi thang vao kho, vong qua service, vi service gio khong con cho ra no nua.
   */
  it('dong CU da xac nhan khi con nghi trung: van KHONG vao chi phi, va chi con duong quyet trung', async () => {
    const harness = await build();
    const [first] = await suspectedRows(harness, 2);
    const before = await harness.repository.findCandidate(first ?? '');
    await harness.repository.applyReview({
      candidateId: first ?? '',
      action: 'CONFIRM',
      actor: 'du-lieu-cu',
      at: new Date('2026-09-10T03:00:00.000Z'),
      reason: 'TOLL_REVIEW_CONFIRMED',
      note: null,
      nextVehicleId: before?.vehicleId ?? null,
      nextMatchState: 'DUPLICATE_CANDIDATE',
      nextReviewState: 'CONFIRMED',
      duplicateOfCandidateId: null,
      expected: {
        vehicleId: before?.vehicleId ?? null,
        matchState: before?.matchState ?? null,
        reviewState: before?.reviewState ?? 'PENDING',
        duplicateOfCandidateId: null,
      },
    });

    const report = await harness.reports.spendReport(AUGUST);
    expect(report.vehicles).toEqual([]);
    expect(report.duplicates.map((row) => [row.state, row.total.rowCount])).toEqual([
      ['SUSPECTED', 2],
    ]);

    await expect(review(harness, first ?? '', 'CONFIRM')).rejects.toMatchObject({
      reason: 'TOLL_REVIEW_DUPLICATE_UNRESOLVED',
    });
    const cleared = await review(harness, first ?? '', 'CLEAR_DUPLICATE');
    expect(cleared.matchState).toBe('MATCHED');
  });

  it('CLEAR_DUPLICATE tren dong KHONG nghi trung bi tu choi — trang thai khop khong bi doi', async () => {
    const harness = await build();
    const [topUp] = await importRows(harness, [
      manual({ accountNo: 'TK-999', kind: 'TOP_UP', vehiclePlate: null, amount: '5.000.000' }),
    ]);
    expect(topUp?.matchState).toBe('ACCOUNT_UNRESOLVED');

    await expect(review(harness, topUp?.id ?? '', 'CLEAR_DUPLICATE')).rejects.toMatchObject({
      kind: 'CONFLICT',
      reason: 'TOLL_REVIEW_DUPLICATE_NOT_SUSPECTED',
    });
    const detail = await detailOf(harness, topUp?.id ?? '');
    expect(detail.candidate).toMatchObject({
      matchState: 'ACCOUNT_UNRESOLVED',
      reviewState: 'PENDING',
    });
    expect(detail.decisions).toEqual([]);
  });

  it('dong KHONG nghi trung van xac nhan duoc nhu truoc', async () => {
    const harness = await build();
    const [matched] = await importRows(harness, [manual()]);
    const confirmed = await review(harness, matched?.id ?? '', 'CONFIRM');
    expect(confirmed).toMatchObject({ matchState: 'MATCHED', reviewState: 'CONFIRMED' });
  });
});

/* ============================================================================================ */

describe('#318 — khong co vong trung', () => {
  it('TU TRO: mot dong khong trung voi chinh no', async () => {
    const harness = await build();
    const [first] = await suspectedRows(harness, 2);

    await expect(
      review(harness, first ?? '', 'FLAG_DUPLICATE', { duplicateOfCandidateId: first ?? '' }),
    ).rejects.toMatchObject({ kind: 'INVALID', reason: 'TOLL_REVIEW_DUPLICATE_SELF' });
    expect((await detailOf(harness, first ?? '')).decisions).toEqual([]);
    expect(deniedReasons(harness)).toEqual(['TOLL_REVIEW_DUPLICATE_SELF']);
  });

  it('HAI NUT: B trung A roi A trung B bi tu choi; A giu nguyen', async () => {
    const harness = await build();
    const [a, b] = await suspectedRows(harness, 2);
    await review(harness, b ?? '', 'FLAG_DUPLICATE', { duplicateOfCandidateId: a ?? '' });

    await expect(
      review(harness, a ?? '', 'FLAG_DUPLICATE', { duplicateOfCandidateId: b ?? '' }),
    ).rejects.toMatchObject({ kind: 'CONFLICT', reason: 'TOLL_REVIEW_DUPLICATE_CYCLE' });

    const detail = await detailOf(harness, a ?? '');
    expect(detail.candidate).toMatchObject({ duplicateOfCandidateId: null, reviewState: 'PENDING' });
    expect(detail.decisions).toEqual([]);
    expect(deniedReasons(harness)).toEqual(['TOLL_REVIEW_DUPLICATE_CYCLE']);
  });

  it('BA NUT va TRO LAI giua chuoi: A->B->C roi C->A hoac B->A deu bi tu choi', async () => {
    const harness = await build();
    const [a, b, c] = await suspectedRows(harness, 3);
    await review(harness, a ?? '', 'FLAG_DUPLICATE', { duplicateOfCandidateId: b ?? '' });
    await review(harness, b ?? '', 'FLAG_DUPLICATE', { duplicateOfCandidateId: c ?? '' });

    await expect(
      review(harness, c ?? '', 'FLAG_DUPLICATE', { duplicateOfCandidateId: a ?? '' }),
    ).rejects.toMatchObject({ reason: 'TOLL_REVIEW_DUPLICATE_CYCLE' });
    // Doi dong goc cua B sang A: A->B da co, nen B->A cung khep vong.
    await expect(
      review(harness, b ?? '', 'FLAG_DUPLICATE', { duplicateOfCandidateId: a ?? '' }),
    ).rejects.toMatchObject({ reason: 'TOLL_REVIEW_DUPLICATE_CYCLE' });

    expect((await detailOf(harness, c ?? '')).candidate.duplicateOfCandidateId).toBeNull();
    expect((await detailOf(harness, b ?? '')).candidate.duplicateOfCandidateId).toBe(c);
  });

  /**
   * CHUOI KHONG VONG duoc phep: moi dong da ghi trung bi loai, dong goc cuoi chuoi van dung cho su
   * kien that — nen sau khi dong goc duoc giai, DUNG MOT lan qua tram vao chi phi.
   */
  it('CHUOI khong vong duoc phep, va chi dong goc cuoi chuoi vao chi phi sau khi giai', async () => {
    const harness = await build();
    const [a, b, c] = await suspectedRows(harness, 3);
    await review(harness, a ?? '', 'FLAG_DUPLICATE', { duplicateOfCandidateId: b ?? '' });
    await review(harness, c ?? '', 'FLAG_DUPLICATE', { duplicateOfCandidateId: a ?? '' });

    const pending = await harness.reports.spendReport(AUGUST);
    expect(pending.vehicles).toEqual([]);
    expect(pending.duplicates.map((row) => [row.state, row.total.rowCount])).toEqual([
      ['SUSPECTED', 1],
      ['DECLARED', 2],
    ]);

    await review(harness, b ?? '', 'CLEAR_DUPLICATE');
    const resolved = await harness.reports.spendReport(AUGUST);
    expect(resolved.vehicles.map((row) => [row.vehicleId, row.confirmed, row.open])).toEqual([
      ['veh-1', { rowCount: 1, amount: -52_000 }, { rowCount: 0, amount: 0 }],
    ]);
    expect(resolved.duplicates.map((row) => [row.state, row.total.rowCount])).toEqual([
      ['DECLARED', 2],
    ]);
  });

  /**
   * HAI NGUOI GHI CUNG LUC — A->B va B->A. Ca hai deu doc thay dong kia "chua trung ai" TRUOC khi ben
   * nao ghi, nen mot phep kiem-roi-ghi khong khoa se cho CA HAI qua va de lai mot vong.
   */
  it('HAI lenh ghi trung SONG SONG A->B va B->A: dung MOT ben thang, khong de lai vong', async () => {
    const harness = await build();
    const [a, b] = await suspectedRows(harness, 2);

    const outcomes = await Promise.allSettled([
      review(harness, a ?? '', 'FLAG_DUPLICATE', { duplicateOfCandidateId: b ?? '' }),
      review(harness, b ?? '', 'FLAG_DUPLICATE', { duplicateOfCandidateId: a ?? '' }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const [rejected] = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
    );
    expect(rejected?.reason).toMatchObject({ reason: 'TOLL_REVIEW_DUPLICATE_CYCLE' });

    const pointers = [
      (await detailOf(harness, a ?? '')).candidate.duplicateOfCandidateId,
      (await detailOf(harness, b ?? '')).candidate.duplicateOfCandidateId,
    ];
    expect(pointers.filter((pointer) => pointer !== null)).toHaveLength(1);
  });

  /**
   * ANH CHUP CU — mot CONFIRM quyet tren dong con "khop xe" trong khi mot lenh ghi trung vua lam dong
   * do thanh trung. Ghi de theo `id` se xoa khai trung va dua dong quay lai tong chi phi.
   */
  it('CONFIRM va FLAG_DUPLICATE SONG SONG tren cung mot dong: ben thua nhan va cham, khong ghi de', async () => {
    const harness = await build();
    const [x, y] = await importRows(harness, [
      manual({ passedAt: '31/08/2026 08:00' }),
      manual({ passedAt: '31/08/2026 09:00' }),
    ]);
    expect(x?.matchState).toBe('MATCHED');

    const outcomes = await Promise.allSettled([
      review(harness, x?.id ?? '', 'CONFIRM'),
      review(harness, x?.id ?? '', 'FLAG_DUPLICATE', { duplicateOfCandidateId: y?.id ?? '' }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const [rejected] = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
    );
    expect(rejected?.reason).toMatchObject({
      kind: 'CONFLICT',
      reason: 'TOLL_REVIEW_CONCURRENT_WRITE',
    });

    const detail = await detailOf(harness, x?.id ?? '');
    expect(detail.decisions).toHaveLength(1);
    const winner = detail.decisions[0]?.action;
    expect(detail.candidate.duplicateOfCandidateId).toBe(
      winner === 'FLAG_DUPLICATE' ? (y?.id ?? '') : null,
    );
  });
});
