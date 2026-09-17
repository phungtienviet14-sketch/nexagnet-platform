import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import { PrismaTollSpendReader } from './prisma-toll-spend.reader.js';
import { PrismaTollRepository, TOLL_DUPLICATE_GRAPH_LOCK } from './prisma-toll.repository.js';
import { TollApiRegistry } from './toll-api.port.js';
import { TollAccountService } from './toll-account.service.js';
import type { TransportTollPolicy } from './toll-policy.js';
import { TollReportService } from './toll-report.service.js';
import type { TollVehicleSpendRow } from './toll-spend-report.js';
import { FileTollStatementSource } from './toll-statement-source.js';
import {
  TransportTollCoreFacts,
  type ApplyTollReviewInput,
  type TollVehicleFacts,
} from './toll.ports.js';
import { TollService, type ManualTollRow } from './toll.service.js';
import type { TollReviewAction, TollTransactionCandidateRecord } from './toll.types.js';

/**
 * `#318` — CONG TRUNG va CHONG VONG TRUNG tren POSTGRES THAT.
 *
 * ===========================================================================
 * VI SAO PHAI LA POSTGRES THAT
 *
 * Hai cong cua lane nay song o RANH GIOI voi CSDL, va kho bo nho chi lam LAI chung:
 *
 *   · CAS — `updateMany` voi anh chup trong `WHERE` phai la MOT lenh `UPDATE`, va ben thua phai nhan
 *     `count = 0` sau khi doi khoa hang;
 *   · khoa tu van — hai lenh ghi trung song song ghi HAI hang khac nhau (write skew), nen chi mot
 *     khoa CHUNG giu duoc "khong vong". Chi Postgres tra loi duoc "lenh thu hai co that su DOI khong".
 *
 * ===========================================================================
 * DOI CHUNG AM
 *
 * Moi bang chung "may chu moi chan" di kem mot lan chay NGUYEN VAN lenh ghi cua
 * `PrismaTollRepository.applyReview` truoc `#318` (`e748305`) tren CUNG trang thai do, va khang dinh
 * no LOT — tao ra dung hinh dang loi (khai trung bi xoa / vong trung) va dung hau qua tien trong bao
 * cao. Khong co vo nay, mot canh dung sai (khong tai hien duoc loi) van cho bai XANH vo nghia.
 *
 * ===========================================================================
 * CO LAP
 *
 * Job `integration` chay nhieu tep tren MOT CSDL. Moi bai dung MOT ngay rieng cua thang 5/2032 (khong
 * tep nao khac dung) va bao cao chi doc DUNG ngay do. Tien to `97IT318` / `ITX318DUP` khong long
 * voi tien to nao dang co (`99ITJ`, `ITJTOLL`, `98ITV314`, `ITV314TOLL`, `IT-*`).
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')('#318 — trung ETC tren Postgres THAT', () => {
  const prisma = new PrismaService();

  const PLATE_PREFIX = '97IT318';
  const PREFIX = 'ITX318DUP';
  const ACCOUNT_NO = `${PREFIX}-VT`;
  const state = { vehicleA: '', vehicleB: '' };

  /**
   * Dong ho BUOC tung giay. `listDecisions` sap theo `at`, va hai quyet dinh cung mot khoanh khac se
   * doc ra theo mot thu tu tuy y cua Postgres — dung cho bai doc lai lich su can mot thu tu.
   */
  let tick = 0;
  const clock = () => new Date(Date.UTC(2032, 5, 1, 0, 0, (tick += 1)));

  class DbCoreFacts extends TransportTollCoreFacts {
    async listVehicles(): Promise<readonly TollVehicleFacts[]> {
      return prisma.transportVehicle.findMany({
        where: { registrationPlate: { startsWith: PLATE_PREFIX } },
        select: { id: true, registrationPlate: true },
      });
    }
    async findVehicle(id: string): Promise<TollVehicleFacts | null> {
      return prisma.transportVehicle.findUnique({
        where: { id },
        select: { id: true, registrationPlate: true },
      });
    }
  }

  const audit = { append: async () => undefined } as unknown as AuditLogService;
  const policy: TransportTollPolicy = {
    timeZone: 'Asia/Ho_Chi_Minh',
    providers: {},
    maxSourceBytes: 1_000_000,
    maxRows: 1_000,
  };
  const core = new DbCoreFacts();

  const build = (client: PrismaService) => {
    const repository = new PrismaTollRepository(client);
    const toll = new TollService(
      repository,
      new FileTollStatementSource(),
      core,
      new TollApiRegistry(),
      audit,
      policy,
      undefined,
      clock,
    );
    return { repository, toll };
  };

  const { repository, toll } = build(prisma);
  const accounts = new TollAccountService(repository, core, audit, policy, undefined, clock);
  const reports = new TollReportService(
    new PrismaTollSpendReader(prisma),
    repository,
    core,
    policy,
    clock,
  );

  async function cleanup(): Promise<void> {
    const imports = await prisma.transportTollImport.findMany({
      where: { sourceLabel: { startsWith: PREFIX } },
      select: { id: true },
    });
    const importIds = imports.map((row) => row.id);
    const candidates = await prisma.transportTollTransactionCandidate.findMany({
      where: { importId: { in: importIds } },
      select: { id: true },
    });
    /* Tat trigger CHI-GHI-THEM trong MOT giao dich roi bat lai ngay — khuon cua hai tep toll kia. */
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('ALTER TABLE "TransportTollReviewDecision" DISABLE TRIGGER USER');
      await tx.transportTollReviewDecision.deleteMany({
        where: { candidateId: { in: candidates.map((row) => row.id) } },
      });
      await tx.$executeRawUnsafe('ALTER TABLE "TransportTollReviewDecision" ENABLE TRIGGER USER');

      await tx.transportTollTransactionCandidate.deleteMany({
        where: { importId: { in: importIds } },
      });

      await tx.$executeRawUnsafe('ALTER TABLE "TransportTollImport" DISABLE TRIGGER USER');
      await tx.transportTollImport.deleteMany({ where: { id: { in: importIds } } });
      await tx.$executeRawUnsafe('ALTER TABLE "TransportTollImport" ENABLE TRIGGER USER');
    });

    const accountRows = await prisma.transportTollAccount.findMany({
      where: { accountNo: { startsWith: PREFIX } },
      select: { id: true },
    });
    const accountIds = accountRows.map((row) => row.id);
    await prisma.transportTollAccountVehicleLink.deleteMany({
      where: { accountId: { in: accountIds } },
    });
    await prisma.transportTollAccount.deleteMany({ where: { id: { in: accountIds } } });
    await prisma.transportVehicle.deleteMany({
      where: { registrationPlate: { startsWith: PLATE_PREFIX } },
    });
  }

  beforeAll(async () => {
    await cleanup();
    const a = await prisma.transportVehicle.create({
      data: { registrationPlate: `${PLATE_PREFIX}-001.11`, vehicleClass: 'TRUCK' },
    });
    const b = await prisma.transportVehicle.create({
      data: { registrationPlate: `${PLATE_PREFIX}-002.22`, vehicleClass: 'TRUCK' },
    });
    state.vehicleA = a.id;
    state.vehicleB = b.id;
    const account = await accounts.createAccount(
      { provider: 'VETC', accountNo: ACCOUNT_NO, holderName: 'Cong ty B' },
      'ke-toan',
    );
    await accounts.openLink(
      {
        accountId: account.id,
        vehicleId: state.vehicleA,
        providerVehicleRef: null,
        effectiveFrom: '2032-01-01',
        effectiveTo: null,
      },
      'ke-toan',
    );
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  /* ------------------------------ Tien ich ------------------------------ */

  /** Moi bai MOT ngay: dau van, dau nguon va bao cao cua bai do khong dung bai khac. */
  const row = (day: string, over: Partial<ManualTollRow> = {}): ManualTollRow => ({
    accountNo: ACCOUNT_NO,
    kind: 'TOLL_PASS',
    vehiclePlate: `${PLATE_PREFIX}-001.11`,
    passedAt: `${day}/05/2032 08:00`,
    businessDate: null,
    amount: '-52.000',
    station: `Tram IT 318 ngay ${day}`,
    providerRef: null,
    ...over,
  });

  const importRows = async (
    label: string,
    rows: readonly ManualTollRow[],
  ): Promise<readonly TollTransactionCandidateRecord[]> => {
    const result = await toll.commitImport(
      {
        provider: 'VETC',
        sourceKind: 'MANUAL',
        sourceLabel: `${PREFIX}-${label}`,
        periodStart: null,
        periodEnd: null,
        rows,
      },
      'ke-toan',
    );
    expect(result.replayed).toBe(false);
    return result.candidates;
  };

  const idOf = (candidate: TollTransactionCandidateRecord | undefined): string => {
    if (candidate === undefined) throw new Error('lan nap khong tra ve du dong');
    return candidate.id;
  };

  const review = (
    candidateId: string,
    action: TollReviewAction,
    extra: { readonly vehicleId?: string; readonly duplicateOfCandidateId?: string } = {},
  ) =>
    toll.review(
      {
        candidateId,
        action,
        vehicleId: extra.vehicleId ?? null,
        duplicateOfCandidateId: extra.duplicateOfCandidateId ?? null,
        note: `${PREFIX} ${action}`,
      },
      'ke-toan',
    );

  const rowOf = (id: string) =>
    prisma.transportTollTransactionCandidate.findUniqueOrThrow({
      where: { id },
      select: {
        matchState: true,
        reviewState: true,
        duplicateOfCandidateId: true,
        vehicleId: true,
      },
    });

  const decisionCount = (ids: readonly string[]) =>
    prisma.transportTollReviewDecision.count({ where: { candidateId: { in: [...ids] } } });

  const dayReport = (day: string) =>
    reports.spendReport({ from: `2032-05-${day}`, to: `2032-05-${day}`, provider: 'VETC' });

  const mine = (entry: TollVehicleSpendRow): boolean =>
    entry.vehicleId === state.vehicleA || entry.vehicleId === state.vehicleB;

  const countedRows = (entries: readonly TollVehicleSpendRow[]): number =>
    entries
      .filter(mine)
      .reduce((sum, entry) => sum + entry.confirmed.rowCount + entry.open.rowCount, 0);

  const snapshotOf = async (id: string): Promise<ApplyTollReviewInput['expected']> => {
    const current = await repository.findCandidate(id);
    if (current === null) throw new Error(`khong co dong ${id}`);
    return {
      vehicleId: current.vehicleId,
      matchState: current.matchState,
      reviewState: current.reviewState,
      duplicateOfCandidateId: current.duplicateOfCandidateId,
    };
  };

  /** DUNG ke hoach ma `planTollReview` lap cho `FLAG_DUPLICATE` — tren anh chup doc LUC NAY. */
  const flagInput = async (sourceId: string, targetId: string): Promise<ApplyTollReviewInput> => ({
    candidateId: sourceId,
    action: 'FLAG_DUPLICATE',
    actor: 'ke-toan',
    at: clock(),
    reason: 'TOLL_REVIEW_DUPLICATE_FLAGGED',
    note: null,
    nextVehicleId: null,
    nextMatchState: 'DUPLICATE_CANDIDATE',
    nextReviewState: 'CONFIRMED',
    duplicateOfCandidateId: targetId,
    expected: await snapshotOf(sourceId),
  });

  /** DUNG ke hoach ma `planTollReview` lap cho `CONFIRM` — tren anh chup doc LUC NAY. */
  const confirmInput = async (id: string): Promise<ApplyTollReviewInput> => {
    const expected = await snapshotOf(id);
    return {
      candidateId: id,
      action: 'CONFIRM',
      actor: 'ke-toan',
      at: clock(),
      reason: 'TOLL_REVIEW_CONFIRMED',
      note: null,
      nextVehicleId: expected.vehicleId,
      nextMatchState: expected.matchState,
      nextReviewState: 'CONFIRMED',
      duplicateOfCandidateId: null,
      expected,
    };
  };

  /**
   * NGUYEN VAN than `PrismaTollRepository.applyReview` o `e748305` (truoc `#318`) — DOI CHUNG AM.
   * Doc `before` roi ghi theo `id`: khong khoa, khong CAS, khong lan chuoi dong goc.
   */
  const legacyApplyReview = (input: ApplyTollReviewInput) =>
    prisma.$transaction(async (tx) => {
      const before = await tx.transportTollTransactionCandidate.findUnique({
        where: { id: input.candidateId },
      });
      if (before === null) throw new Error(`khong co dong ${input.candidateId}`);
      const updated = await tx.transportTollTransactionCandidate.update({
        where: { id: input.candidateId },
        data: {
          vehicleId: input.nextVehicleId ?? before.vehicleId,
          matchState: input.nextMatchState ?? before.matchState,
          reviewState: input.nextReviewState,
          duplicateOfCandidateId: input.duplicateOfCandidateId,
        },
      });
      await tx.transportTollReviewDecision.create({
        data: {
          candidateId: input.candidateId,
          action: input.action,
          actor: input.actor,
          at: input.at,
          reason: input.reason,
          note: input.note,
          previousVehicleId: before.vehicleId,
          nextVehicleId: input.nextVehicleId,
          previousMatchState: before.matchState,
          nextMatchState: input.nextMatchState,
          duplicateOfCandidateId: input.duplicateOfCandidateId,
        },
      });
      return updated;
    });

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  /** `'settled'` neu lenh xong (thang hay thua) trong `ms`, `'blocked'` neu no van dang doi. */
  const settlesWithin = (work: Promise<unknown>, ms: number): Promise<'settled' | 'blocked'> =>
    Promise.race([
      work.then(
        () => 'settled' as const,
        () => 'settled' as const,
      ),
      sleep(ms).then(() => 'blocked' as const),
    ]);

  /**
   * MOT NGUOI GHI KHAC da qua phep kiem, DANG GIU khoa do thi trung va vua ghi `sourceId -> targetId`
   * nhung CHUA commit. Tra ve ham `release` de commit.
   */
  const holdGraphLockWhileWriting = async (sourceId: string, targetId: string) => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let markHeld!: () => void;
    const held = new Promise<void>((resolve) => {
      markHeld = resolve;
    });
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${TOLL_DUPLICATE_GRAPH_LOCK}, 0))`;
        await tx.transportTollTransactionCandidate.update({
          where: { id: sourceId },
          data: {
            duplicateOfCandidateId: targetId,
            matchState: 'DUPLICATE_CANDIDATE',
            reviewState: 'CONFIRMED',
          },
        });
        markHeld();
        await released;
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
    await held;
    return {
      commit: async () => {
        release();
        await holder;
      },
    };
  };

  /* ========================== Cong trung truoc CONFIRM ========================== */

  it('V318-INT-1 — CONFIRM va RESOLVE_VEHICLE tren dong NGHI TRUNG bi tu choi; hang, lich su, bao cao khong doi', async () => {
    const [first, second] = await importRows('confirm', [row('01'), row('01')]);
    const a = idOf(first);
    expect(first?.matchState).toBe('DUPLICATE_CANDIDATE');
    expect(second?.matchState).toBe('DUPLICATE_CANDIDATE');

    await expect(review(a, 'CONFIRM')).rejects.toMatchObject({
      kind: 'CONFLICT',
      reason: 'TOLL_REVIEW_DUPLICATE_UNRESOLVED',
    });
    await expect(review(a, 'RESOLVE_VEHICLE', { vehicleId: state.vehicleB })).rejects.toMatchObject(
      { kind: 'CONFLICT', reason: 'TOLL_REVIEW_DUPLICATE_UNRESOLVED' },
    );

    expect(await rowOf(a)).toEqual({
      matchState: 'DUPLICATE_CANDIDATE',
      reviewState: 'PENDING',
      duplicateOfCandidateId: null,
      vehicleId: state.vehicleA,
    });
    expect(await decisionCount([a])).toBe(0);

    const report = await dayReport('01');
    expect(countedRows(report.vehicles)).toBe(0);
    expect(
      report.duplicates.map((entry) => [entry.state, entry.total.rowCount, entry.total.amount]),
    ).toEqual([['SUSPECTED', 2, -104_000]]);
  });

  it('V318-INT-2 — giai trung roi moi xac nhan; lich su chi-ghi-them doc lai qua client Prisma MOI', async () => {
    const [first, second] = await importRows('resolve', [row('02'), row('02')]);
    const a = idOf(first);
    const b = idOf(second);

    await review(b, 'FLAG_DUPLICATE', { duplicateOfCandidateId: a });
    await expect(review(b, 'CONFIRM')).rejects.toMatchObject({
      reason: 'TOLL_REVIEW_DUPLICATE_DECLARED',
    });

    const pending = await dayReport('02');
    expect(countedRows(pending.vehicles)).toBe(0);
    expect(pending.duplicates.map((entry) => [entry.state, entry.total.rowCount])).toEqual([
      ['SUSPECTED', 1],
      ['DECLARED', 1],
    ]);

    await review(a, 'CLEAR_DUPLICATE');
    await review(a, 'REOPEN');
    await review(a, 'CONFIRM');

    const resolved = await dayReport('02');
    expect(
      resolved.vehicles.filter(mine).map((entry) => [entry.vehicleId, entry.confirmed, entry.open]),
    ).toEqual([[state.vehicleA, { rowCount: 1, amount: -52_000 }, { rowCount: 0, amount: 0 }]]);
    expect(resolved.duplicates.map((entry) => [entry.state, entry.total.rowCount])).toEqual([
      ['DECLARED', 1],
    ]);

    /* "Khoi dong lai": client Prisma MOI, kho MOI, service MOI — doc qua dung duong san pham. */
    const restarted = new PrismaService();
    try {
      const fresh = build(restarted);
      const detailA = await fresh.toll.candidateDetail(a);
      expect(detailA.decisions.map((entry) => [entry.action, entry.reason, entry.actor])).toEqual([
        ['CLEAR_DUPLICATE', 'TOLL_REVIEW_DUPLICATE_CLEARED', 'ke-toan'],
        ['REOPEN', 'TOLL_REVIEW_REOPENED', 'ke-toan'],
        ['CONFIRM', 'TOLL_REVIEW_CONFIRMED', 'ke-toan'],
      ]);
      const detailB = await fresh.toll.candidateDetail(b);
      // Lan CONFIRM bi tu choi KHONG de lai dong nao — chi co lan ghi trung.
      expect(
        detailB.decisions.map((entry) => [entry.action, entry.duplicateOfCandidateId]),
      ).toEqual([['FLAG_DUPLICATE', a]]);
      expect(detailB.candidate).toMatchObject({
        matchState: 'DUPLICATE_CANDIDATE',
        reviewState: 'CONFIRMED',
        duplicateOfCandidateId: a,
      });
      // Va lich su van KHONG sua duoc sau khi doc lai.
      await expect(
        restarted.transportTollReviewDecision.update({
          where: { id: detailB.decisions[0]?.id ?? '' },
          data: { actor: 'nguoi-khac' },
        }),
      ).rejects.toThrow(/transport_toll_review_decision_append_only/);
    } finally {
      await restarted.$disconnect();
    }
  });

  /* =============================== Chong vong =============================== */

  it('V318-INT-3 — tu tro, hai nut, ba nut deu bi tu choi; dong nguon khong doi', async () => {
    const [first, second, third] = await importRows('cycle', [row('03'), row('03'), row('03')]);
    const a = idOf(first);
    const b = idOf(second);
    const c = idOf(third);

    await expect(review(a, 'FLAG_DUPLICATE', { duplicateOfCandidateId: a })).rejects.toMatchObject({
      kind: 'INVALID',
      reason: 'TOLL_REVIEW_DUPLICATE_SELF',
    });
    await review(b, 'FLAG_DUPLICATE', { duplicateOfCandidateId: a });
    await expect(review(a, 'FLAG_DUPLICATE', { duplicateOfCandidateId: b })).rejects.toMatchObject({
      kind: 'CONFLICT',
      reason: 'TOLL_REVIEW_DUPLICATE_CYCLE',
    });
    await review(c, 'FLAG_DUPLICATE', { duplicateOfCandidateId: b });
    await expect(review(a, 'FLAG_DUPLICATE', { duplicateOfCandidateId: c })).rejects.toMatchObject({
      reason: 'TOLL_REVIEW_DUPLICATE_CYCLE',
    });

    expect(await rowOf(a)).toMatchObject({ duplicateOfCandidateId: null, reviewState: 'PENDING' });
    expect(await decisionCount([a])).toBe(0);
    expect((await rowOf(c)).duplicateOfCandidateId).toBe(b);
  });

  /**
   * WRITE SKEW, TAT DINH: mot nguoi ghi khac DANG GIU khoa va vua ghi `B -> A` (chua commit). Lenh
   * `A -> B` cua kho phai DOI — va sau khi ben kia commit, phai thay canh `B -> A` roi tu choi.
   */
  it('V318-INT-4 — lenh ghi trung DOI khoa do thi, roi thay canh vua commit va tu choi vong', async () => {
    const [first, second] = await importRows('lock', [row('04'), row('04')]);
    const a = idOf(first);
    const b = idOf(second);

    const other = await holdGraphLockWhileWriting(b, a);
    const write = repository.applyReview(await flagInput(a, b));
    expect(await settlesWithin(write, 750)).toBe('blocked');
    await other.commit();

    await expect(write).rejects.toMatchObject({ reason: 'TOLL_REVIEW_DUPLICATE_CYCLE' });
    expect((await rowOf(a)).duplicateOfCandidateId).toBeNull();
    expect((await rowOf(b)).duplicateOfCandidateId).toBe(a);
    expect(await decisionCount([a])).toBe(0);
  });

  it('V318-INT-5 — hai lenh ghi trung SONG SONG A->B va B->A tu hai ke hoach da lap: dung mot ben thang', async () => {
    for (const round of ['1', '2']) {
      const amount = `-${round}1.000`;
      const [first, second] = await importRows(`race-${round}`, [
        row('05', { amount }),
        row('05', { amount }),
      ]);
      const a = idOf(first);
      const b = idOf(second);
      const [ab, ba] = await Promise.all([flagInput(a, b), flagInput(b, a)]);

      const outcomes = await Promise.allSettled([
        repository.applyReview(ab),
        repository.applyReview(ba),
      ]);

      expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
      const [lost] = outcomes.filter(
        (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected',
      );
      expect(lost?.reason).toMatchObject({ reason: 'TOLL_REVIEW_DUPLICATE_CYCLE' });
      const pointers = [
        (await rowOf(a)).duplicateOfCandidateId,
        (await rowOf(b)).duplicateOfCandidateId,
      ];
      expect(pointers.filter((pointer) => pointer !== null)).toHaveLength(1);
      expect(await decisionCount([a, b])).toBe(1);
    }
  });

  /* ====================== CAS + doi chung am tren anh chup cu ====================== */

  it('V318-INT-6 — CONFIRM tren anh chup cu thua mot FLAG vua commit; doi chung am: lenh ghi cu xoa khai trung va dem tien hai lan', async () => {
    const [first, second] = await importRows('cas', [
      row('06', { passedAt: '06/05/2032 08:00' }),
      row('06', { passedAt: '06/05/2032 09:00' }),
    ]);
    const x = idOf(first);
    const y = idOf(second);
    expect(first?.matchState).toBe('MATCHED');
    expect(second?.matchState).toBe('MATCHED');

    const staleConfirm = await confirmInput(x);
    await review(x, 'FLAG_DUPLICATE', { duplicateOfCandidateId: y });

    await expect(repository.applyReview(staleConfirm)).rejects.toMatchObject({
      kind: 'CONFLICT',
      reason: 'TOLL_REVIEW_CONCURRENT_WRITE',
    });
    expect(await rowOf(x)).toMatchObject({
      matchState: 'DUPLICATE_CANDIDATE',
      reviewState: 'CONFIRMED',
      duplicateOfCandidateId: y,
    });
    expect(await decisionCount([x])).toBe(1);
    expect(countedRows((await dayReport('06')).vehicles)).toBe(1);

    /*
     * DOI CHUNG AM — SAU khang dinh chinh vi no lam ban trang thai. Cung ke hoach cu, qua lenh ghi
     * cu: LOT, xoa con tro dong goc, va dong trung quay lai chi phi xe.
     */
    await legacyApplyReview(staleConfirm);
    expect(await rowOf(x)).toMatchObject({
      matchState: 'MATCHED',
      reviewState: 'CONFIRMED',
      duplicateOfCandidateId: null,
    });
    expect(countedRows((await dayReport('06')).vehicles)).toBe(2);
  });

  /* ======================= Doi chung am cho vong + duong ra ======================= */

  it('V318-INT-7 — doi chung am: lenh ghi cu KHONG doi khoa va tao VONG; may chu moi chan noi vao vong va van go duoc', async () => {
    const [first, second, third] = await importRows('legacy-cycle', [
      row('07'),
      row('07'),
      row('07'),
    ]);
    const p = idOf(first);
    const q = idOf(second);
    const r = idOf(third);

    /* Dung CUNG canh V318-INT-4, nhung qua lenh ghi cu. */
    const other = await holdGraphLockWhileWriting(q, p);
    const legacyWrite = legacyApplyReview(await flagInput(p, q));
    expect(await settlesWithin(legacyWrite, 750)).toBe('settled');
    await legacyWrite;
    await other.commit();

    expect((await rowOf(p)).duplicateOfCandidateId).toBe(q);
    expect((await rowOf(q)).duplicateOfCandidateId).toBe(p);
    const looped = await dayReport('07');
    // Hai ban ghi cua mot su kien that deu roi khoi chi phi — tien bien mat ma khong ai quyet.
    expect(countedRows(looped.vehicles)).toBe(0);
    expect(looped.duplicates.map((entry) => [entry.state, entry.total.rowCount])).toEqual([
      ['SUSPECTED', 1],
      ['DECLARED', 2],
    ]);

    /* May chu moi: noi them vao mot chuoi DA CO VONG bi tu choi (fail-closed)... */
    await expect(review(r, 'FLAG_DUPLICATE', { duplicateOfCandidateId: p })).rejects.toMatchObject({
      reason: 'TOLL_REVIEW_DUPLICATE_CYCLE',
    });
    expect((await rowOf(r)).duplicateOfCandidateId).toBeNull();

    /* ...va vong go duoc bang duong ra co san: mo lai mot dong trong vong roi quyet lai. */
    await review(p, 'REOPEN');
    await review(p, 'CLEAR_DUPLICATE');
    expect(countedRows((await dayReport('07')).vehicles)).toBe(1);
  });
});
