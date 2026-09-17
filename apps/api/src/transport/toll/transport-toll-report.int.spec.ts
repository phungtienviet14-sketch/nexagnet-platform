import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import { PrismaTollSpendReader } from './prisma-toll-spend.reader.js';
import { PrismaTollRepository } from './prisma-toll.repository.js';
import { TollApiRegistry } from './toll-api.port.js';
import { TollAccountService } from './toll-account.service.js';
import type { TransportTollPolicy } from './toll-policy.js';
import { TollReportService } from './toll-report.service.js';
import { FileTollStatementSource } from './toll-statement-source.js';
import { TransportTollCoreFacts, type TollVehicleFacts } from './toll.ports.js';
import { TollService, type ManualTollRow } from './toll.service.js';

/**
 * BAO CAO CHI PHI ETC + DONG DOI UNG TREN POSTGRES THAT — `#314` G8/G9.
 *
 * ===========================================================================
 * VI SAO PHAI LA POSTGRES THAT
 *
 * `PrismaTollSpendReader` gom bang `groupBy` — va nhung cho mot phep gom co the sai IM LANG deu
 * nam o CSDL, khong o bo nho:
 *
 *   · `duplicateOfCandidateId` trong `by` tach nhom dong DA NOI TRUNG ra; neu lenh gom bo cot do,
 *     dong da noi trung se cong lan vao chi phi cua xe va khong bai don vi nao do;
 *   · `_sum` tren cot `BIGINT` ve JS la `bigint`, va mot phep doi sai kieu se lech tien;
 *   · loc `businessDate` la so sanh CHUOI tren `VARCHAR(10)`.
 *
 * ===========================================================================
 * CO LAP KHOI BAI KHAC TREN CUNG MOT POSTGRES
 *
 * Job `integration` chay nhieu tep tren MOT CSDL. Bao cao gom MOI dong trong ky, nen bai nay dung
 * mot ky KHONG bai nao khac dung (thang 3/2031) va khang dinh tren dung nhung xe cua minh. Tien to
 * fixture khong la tien to cua tien to nao khac (`99ITJ`, `ITJTOLL`, `IT-*`): don dep dung
 * `startsWith`, va hai tien to long nhau se xoa fixture cua nhau.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')('Bao cao ETC tren Postgres THAT (#314)', () => {
  const prisma = new PrismaService();

  const PLATE_PREFIX = '98ITV314';
  const PREFIX = 'ITV314TOLL';
  const MARCH_2031 = { from: '2031-03-01', to: '2031-03-31' } as const;

  const state = { vehicleA: '', vehicleB: '' };

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
  const clock = () => new Date('2031-04-02T03:00:00.000Z');

  const repository = new PrismaTollRepository(prisma);
  const core = new DbCoreFacts();
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
  const accounts = new TollAccountService(repository, core, audit, policy, undefined, clock);
  const reports = new TollReportService(
    new PrismaTollSpendReader(prisma),
    repository,
    core,
    policy,
    clock,
  );

  /**
   * DON DEP PHAI SONG SOT QUA TRIGGER CHI-GHI-THEM.
   *
   * Hom nay `TransportTollReviewDecision` va `TransportTollImport` chua co trigger; mot lane khac
   * dang them (#308). `DISABLE TRIGGER USER` tren mot bang KHONG co trigger la mot phep khong lam
   * gi, nen khuon duoi day chay dung ca truoc lan sau khi trigger ton tai — lay tu
   * `customer-ar-test-cleanup.ts` tren `main`: tat trong MOT giao dich roi bat lai ngay.
   */
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
  });

  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  const manual = (over: Partial<ManualTollRow>): ManualTollRow => ({
    accountNo: `${PREFIX}-EP1`,
    kind: 'TOLL_PASS',
    vehiclePlate: `${PLATE_PREFIX}-001.11`,
    passedAt: '15/03/2031 08:00',
    businessDate: null,
    amount: '-52.000',
    station: 'Tram IT 314',
    providerRef: null,
    ...over,
  });

  const importEpass = (label: string, rows: readonly ManualTollRow[]) =>
    toll.commitImport(
      {
        provider: 'EPASS',
        sourceKind: 'MANUAL',
        sourceLabel: `${PREFIX}-${label}`,
        periodStart: null,
        periodEnd: null,
        rows,
      },
      'ke-toan',
    );

  const review = (
    candidateId: string,
    action: 'RESOLVE_VEHICLE' | 'CONFIRM' | 'FLAG_DUPLICATE' | 'CLEAR_DUPLICATE',
    extra: { vehicleId?: string; duplicateOfCandidateId?: string } = {},
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

  it('V314-INT-1 — groupBy tach dung: theo xe / chua gan xe / nghi trung / da noi trung, va di theo quyet dinh', async () => {
    const account = await accounts.createAccount(
      { provider: 'EPASS', accountNo: `${PREFIX}-EP1`, holderName: null },
      'ke-toan',
    );
    await accounts.openLink(
      {
        accountId: account.id,
        vehicleId: state.vehicleA,
        providerVehicleRef: null,
        effectiveFrom: '2031-01-01',
        effectiveTo: null,
      },
      'ke-toan',
    );
    await accounts.openLink(
      {
        accountId: account.id,
        vehicleId: state.vehicleB,
        providerVehicleRef: null,
        effectiveFrom: '2031-01-01',
        effectiveTo: null,
      },
      'ke-toan',
    );

    const imported = await importEpass('thang-3', [
      manual({}),
      manual({
        vehiclePlate: `${PLATE_PREFIX}-999.99`,
        passedAt: '16/03/2031 09:00',
        amount: '-40.000',
      }),
      manual({
        kind: 'TOP_UP',
        vehiclePlate: null,
        station: null,
        passedAt: '01/03/2031 07:00',
        amount: '5.000.000',
      }),
      manual({
        vehiclePlate: `${PLATE_PREFIX}-002.22`,
        passedAt: '20/03/2031 10:00',
        amount: '-35.000',
      }),
      manual({
        vehiclePlate: `${PLATE_PREFIX}-002.22`,
        passedAt: '20/03/2031 10:00',
        amount: '-35.000',
      }),
    ]);
    const [matched, unresolved, , dupFirst, dupSecond] = imported.candidates;

    const fresh = await reports.spendReport({ ...MARCH_2031, provider: 'EPASS' });
    expect(
      fresh.vehicles.map((row) => [row.vehicleId, row.confirmed.amount, row.open.amount]),
    ).toEqual([[state.vehicleA, 0, -52_000]]);
    expect(fresh.unattributed.map((row) => [row.reason, row.kind, row.open.amount])).toEqual([
      ['VEHICLE_UNRESOLVED', 'TOLL_PASS', -40_000],
      ['ACCOUNT_LEVEL', 'TOP_UP', 5_000_000],
    ]);
    // Hai dong giong het -> ca hai deu nghi trung, va KHONG dong nao vao chi phi cua xe B.
    expect(
      fresh.duplicates.map((row) => [row.state, row.total.rowCount, row.total.amount]),
    ).toEqual([['SUSPECTED', 2, -70_000]]);

    await review(unresolved?.id ?? '', 'RESOLVE_VEHICLE', { vehicleId: state.vehicleB });
    await review(matched?.id ?? '', 'CONFIRM');
    await review(dupSecond?.id ?? '', 'FLAG_DUPLICATE', {
      duplicateOfCandidateId: dupFirst?.id ?? '',
    });
    await review(dupFirst?.id ?? '', 'CLEAR_DUPLICATE');

    const decided = await reports.spendReport({ ...MARCH_2031, provider: 'EPASS' });
    const byVehicle = new Map(decided.vehicles.map((row) => [row.vehicleId, row]));
    expect(byVehicle.get(state.vehicleA)?.confirmed).toEqual({ rowCount: 1, amount: -52_000 });
    // Xe B: dong nguoi chi dinh (chua xac nhan) + dong vua bo nghi trung (da xac nhan).
    expect(byVehicle.get(state.vehicleB)?.open).toEqual({ rowCount: 1, amount: -40_000 });
    expect(byVehicle.get(state.vehicleB)?.confirmed).toEqual({ rowCount: 1, amount: -35_000 });
    expect(decided.unattributed.map((row) => row.reason)).toEqual(['ACCOUNT_LEVEL']);
    expect(
      decided.duplicates.map((row) => [row.state, row.total.rowCount, row.total.amount]),
    ).toEqual([['DECLARED', 1, -35_000]]);
    // Moi xe co bien so that tu doi xe, khong phai ma.
    expect(decided.vehicles.map((row) => row.registrationPlate)).toEqual([
      `${PLATE_PREFIX}-001.11`,
      `${PLATE_PREFIX}-002.22`,
    ]);
  });

  it('V314-INT-2 — dong doi ung: cung dau van, qua HAI lan nap, khong gom chinh no', async () => {
    await accounts.createAccount(
      { provider: 'EPASS', accountNo: `${PREFIX}-EP2`, holderName: null },
      'ke-toan',
    );
    const row = manual({
      accountNo: `${PREFIX}-EP2`,
      vehiclePlate: `${PLATE_PREFIX}-777.77`,
      passedAt: '22/03/2031 11:00',
    });
    const first = await importEpass('doi-ung-1', [row]);
    const second = await importEpass('doi-ung-2', [
      row,
      manual({ accountNo: `${PREFIX}-EP2`, amount: '-1.000' }),
    ]);

    const origin = first.candidates[0];
    const replay = second.candidates[0];
    expect(replay?.matchState).toBe('DUPLICATE_CANDIDATE');

    const fromReplay = await reports.duplicatePeers(replay?.id ?? '');
    expect(fromReplay.fingerprintAvailable).toBe(true);
    expect(fromReplay.peers.map((peer) => [peer.candidate.id, peer.importLabel])).toEqual([
      [origin?.id, `${PREFIX}-doi-ung-1`],
    ]);

    const fromOrigin = await reports.duplicatePeers(origin?.id ?? '');
    expect(fromOrigin.peers.map((peer) => peer.candidate.id)).toEqual([replay?.id]);
  });

  it('V314-INT-3 — lich su mot xe qua hai tai khoan: doan cu dong, doan moi mo, cham tai may chu', async () => {
    const oldAccount = await accounts.createAccount(
      { provider: 'VETC', accountNo: `${PREFIX}-VT-CU`, holderName: null },
      'ke-toan',
    );
    const newAccount = await accounts.createAccount(
      { provider: 'EPASS', accountNo: `${PREFIX}-EP-MOI`, holderName: null },
      'ke-toan',
    );
    const vehicle = await prisma.transportVehicle.create({
      data: { registrationPlate: `${PLATE_PREFIX}-003.33`, vehicleClass: 'TRUCK' },
    });
    const oldLink = await accounts.openLink(
      {
        accountId: oldAccount.id,
        vehicleId: vehicle.id,
        providerVehicleRef: null,
        effectiveFrom: '2030-01-01',
        effectiveTo: null,
      },
      'ke-toan',
    );
    await accounts.closeLink(oldLink.id, '2031-02-28', 'ke-toan');
    await accounts.openLink(
      {
        accountId: newAccount.id,
        vehicleId: vehicle.id,
        providerVehicleRef: null,
        effectiveFrom: '2031-03-01',
        effectiveTo: null,
      },
      'ke-toan',
    );

    const history = await accounts.listLinkHistoryForVehicle(vehicle.id);
    expect(history.onDate).toBe('2031-04-02');
    expect(history.links.map((link) => [link.accountId, link.effectiveTo, link.effective])).toEqual(
      [
        [oldAccount.id, '2031-02-28', false],
        [newAccount.id, null, true],
      ],
    );
  });
});
