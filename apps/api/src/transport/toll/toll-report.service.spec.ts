import { describe, expect, it } from 'vitest';
import type { AuditLogService } from '../../audit/audit-log.service.js';
import { TransportDomainError } from '../transport.errors.js';
import { InMemoryTollRepository } from './in-memory-toll.repository.js';
import { TollApiRegistry } from './toll-api.port.js';
import { TollAccountService } from './toll-account.service.js';
import type { TransportTollPolicy } from './toll-policy.js';
import { TollReportService } from './toll-report.service.js';
import { RepositoryTollSpendReader } from './toll-spend.reader.js';
import { FileTollStatementSource } from './toll-statement-source.js';
import { TransportTollCoreFacts, type TollVehicleFacts } from './toll.ports.js';
import { TollService, type ManualTollRow } from './toll.service.js';

/**
 * BE MAT DOC cua ke toan ETC — `#314` G8/G9, chay tren kho bo nho qua DUNG duong nap/quyet that.
 *
 * Moi bai o day bat dau bang mot lan NAP that roi doc bao cao, chu khong dung nhom gia: cai can
 * chung minh la bao cao noi DUNG ve nhung gi `TollService` da ghi, khong phai rang ham gom cong
 * dung (viec do la cua `toll-spend-report.spec.ts`).
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

const audit = { append: async () => undefined } as unknown as AuditLogService;

const policy: TransportTollPolicy = {
  timeZone: 'Asia/Ho_Chi_Minh',
  providers: {},
  maxSourceBytes: 1_000_000,
  maxRows: 1_000,
};

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

const build = (now = '2026-09-16T03:00:00.000Z') => {
  const clock = () => new Date(now);
  const repository = new InMemoryTollRepository();
  const core = new FakeCoreFacts([
    { id: 'veh-1', registrationPlate: '15C-556.33' },
    { id: 'veh-2', registrationPlate: '30E-111.22' },
  ]);
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
    new RepositoryTollSpendReader(repository),
    repository,
    core,
    policy,
    clock,
  );
  return { toll, accounts, reports };
};

type Harness = ReturnType<typeof build>;

const seedAccount = async (
  harness: Harness,
  input: { provider?: 'VETC' | 'EPASS'; accountNo?: string; vehicleId?: string } = {},
): Promise<string> => {
  const account = await harness.accounts.createAccount(
    {
      provider: input.provider ?? 'VETC',
      accountNo: input.accountNo ?? 'TK-001',
      holderName: null,
    },
    'ke-toan',
  );
  await harness.accounts.openLink(
    {
      accountId: account.id,
      vehicleId: input.vehicleId ?? 'veh-1',
      providerVehicleRef: null,
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
    },
    'ke-toan',
  );
  return account.id;
};

const importRows = (
  harness: Harness,
  rows: readonly ManualTollRow[],
  input: { provider?: 'VETC' | 'EPASS'; label?: string } = {},
) =>
  harness.toll.commitImport(
    {
      provider: input.provider ?? 'VETC',
      sourceKind: 'MANUAL',
      sourceLabel: input.label ?? 'nhap tay thang 8',
      periodStart: null,
      periodEnd: null,
      rows,
    },
    'ke-toan',
  );

const AUGUST = { from: '2026-08-01', to: '2026-08-31', provider: null } as const;

describe('nap xong KHONG co nghia la da doi soat', () => {
  it('ngay sau lan nap, MOI dong deu o cot "chua xong" — ke ca dong da khop xe', async () => {
    const harness = build();
    await seedAccount(harness);
    await importRows(harness, [
      manual(),
      manual({ vehiclePlate: '99Z-000.00', passedAt: '30/08/2026 10:00', amount: '-40.000' }),
      manual({
        kind: 'TOP_UP',
        vehiclePlate: null,
        station: null,
        passedAt: '01/08/2026 09:00',
        amount: '5.000.000',
      }),
      manual({ accountNo: 'TK-KHONG-CO', passedAt: '29/08/2026 08:00', amount: '-35.000' }),
    ]);

    const report = await harness.reports.spendReport(AUGUST);

    expect(report.vehicles).toEqual([
      {
        vehicleId: 'veh-1',
        registrationPlate: '15C-556.33',
        month: '2026-08',
        kind: 'TOLL_PASS',
        currencyCode: 'VND',
        confirmed: { rowCount: 0, amount: 0 },
        open: { rowCount: 1, amount: -52_000 },
      },
    ]);
    expect(report.unattributed.map((row) => [row.reason, row.kind, row.open.amount])).toEqual([
      ['ACCOUNT_UNRESOLVED', 'TOLL_PASS', -35_000],
      ['VEHICLE_UNRESOLVED', 'TOLL_PASS', -40_000],
      ['ACCOUNT_LEVEL', 'TOP_UP', 5_000_000],
    ]);
    // PARSED_IMPLIES_ACCOUNTED=NO — khong mot dong nao da o cot "da co nguoi xac nhan".
    for (const row of [...report.vehicles, ...report.unattributed]) {
      expect(row.confirmed.rowCount).toBe(0);
    }
  });

  it('NGUOI chi dinh xe cho dong chua ro -> vao bang theo xe, VAN chua xong cho toi khi xac nhan', async () => {
    const harness = build();
    await seedAccount(harness);
    const imported = await importRows(harness, [
      manual(),
      manual({ vehiclePlate: '99Z-000.00', passedAt: '30/08/2026 10:00', amount: '-40.000' }),
    ]);
    const [matched, unresolved] = imported.candidates;

    await harness.toll.review(
      {
        candidateId: unresolved?.id ?? '',
        action: 'RESOLVE_VEHICLE',
        vehicleId: 'veh-2',
        duplicateOfCandidateId: null,
        note: null,
      },
      'ke-toan',
    );
    const afterResolve = await harness.reports.spendReport(AUGUST);
    expect(afterResolve.unattributed).toEqual([]);
    expect(afterResolve.vehicles.map((row) => [row.registrationPlate, row.open.amount])).toEqual([
      ['15C-556.33', -52_000],
      ['30E-111.22', -40_000],
    ]);

    await harness.toll.review(
      {
        candidateId: matched?.id ?? '',
        action: 'CONFIRM',
        vehicleId: null,
        duplicateOfCandidateId: null,
        note: null,
      },
      'ke-toan',
    );
    const afterConfirm = await harness.reports.spendReport(AUGUST);
    expect(afterConfirm.vehicles[0]?.confirmed).toEqual({ rowCount: 1, amount: -52_000 });
    expect(afterConfirm.vehicles[0]?.open).toEqual({ rowCount: 0, amount: 0 });
  });
});

describe('dong trung trong bao cao di theo QUYET DINH cua nguoi', () => {
  it('may nghi -> tach rieng; noi trung -> loai; bo nghi trung -> quay lai bang theo xe', async () => {
    const harness = build();
    await seedAccount(harness);
    const imported = await importRows(harness, [manual(), manual()]);
    const [first, second] = imported.candidates;
    expect(first?.matchState).toBe('DUPLICATE_CANDIDATE');
    expect(second?.matchState).toBe('DUPLICATE_CANDIDATE');

    const suspected = await harness.reports.spendReport(AUGUST);
    expect(suspected.vehicles).toEqual([]);
    expect(suspected.duplicates.map((row) => [row.state, row.total.rowCount])).toEqual([
      ['SUSPECTED', 2],
    ]);

    await harness.toll.review(
      {
        candidateId: second?.id ?? '',
        action: 'FLAG_DUPLICATE',
        vehicleId: null,
        duplicateOfCandidateId: first?.id ?? '',
        note: 'cung mot luot qua tram',
      },
      'ke-toan',
    );
    await harness.toll.review(
      {
        candidateId: first?.id ?? '',
        action: 'CLEAR_DUPLICATE',
        vehicleId: null,
        duplicateOfCandidateId: null,
        note: null,
      },
      'ke-toan',
    );

    const decided = await harness.reports.spendReport(AUGUST);
    expect(
      decided.vehicles.map((row) => [row.vehicleId, row.confirmed.amount, row.open.amount]),
    ).toEqual([['veh-1', -52_000, 0]]);
    expect(
      decided.duplicates.map((row) => [row.state, row.total.rowCount, row.total.amount]),
    ).toEqual([['DECLARED', 1, -52_000]]);
  });
});

describe('dong doi ung de quyet trung', () => {
  it('la dong KHAC cung dau van, kem nhan nguon — o ca cung lan nap lan lan nap sau', async () => {
    const harness = build();
    await seedAccount(harness);
    const first = await importRows(harness, [manual(), manual()], { label: 'VETC thang 8' });
    const again = await importRows(harness, [manual(), manual({ amount: '-1.000' })], {
      label: 'VETC thang 8 ban bo sung',
    });
    const [a, b] = first.candidates;
    const [c] = again.candidates;

    const listing = await harness.reports.duplicatePeers(a?.id ?? '');
    expect(listing.candidateId).toBe(a?.id);
    expect(listing.fingerprintAvailable).toBe(true);
    expect(listing.truncated).toBe(false);
    expect(listing.peers.map((peer) => peer.candidate.id).sort()).toEqual([b?.id, c?.id].sort());
    expect(new Set(listing.peers.map((peer) => peer.importLabel))).toEqual(
      new Set(['VETC thang 8', 'VETC thang 8 ban bo sung']),
    );
    // Dong khac so tien khong phai dong doi ung — no khong cung dau van.
    expect(listing.peers.map((peer) => peer.candidate.signedAmount)).not.toContain(-1_000);
  });

  it('dong bi tu choi luc doc -> noi RO la khong de xuat duoc, KHONG noi "khong trung"', async () => {
    const harness = build();
    await seedAccount(harness);
    const imported = await importRows(harness, [manual({ amount: 'khong phai so' })]);
    const listing = await harness.reports.duplicatePeers(imported.candidates[0]?.id ?? '');
    expect(listing).toEqual({
      candidateId: imported.candidates[0]?.id,
      fingerprintAvailable: false,
      peers: [],
      truncated: false,
    });
  });

  it('dong khong ton tai -> `TOLL_CANDIDATE_NOT_FOUND`', async () => {
    const harness = build();
    await expect(harness.reports.duplicatePeers('khong-co')).rejects.toMatchObject({
      reason: 'TOLL_CANDIDATE_NOT_FOUND',
    });
  });
});

describe('ky va nha cung cap', () => {
  it('loc theo nha cung cap: VETC khong keo dong ePass vao', async () => {
    const harness = build();
    await seedAccount(harness);
    await seedAccount(harness, { provider: 'EPASS', accountNo: 'EP-9', vehicleId: 'veh-2' });
    await importRows(harness, [manual()]);
    await importRows(
      harness,
      [manual({ accountNo: 'EP-9', vehiclePlate: '30E-111.22', amount: '-60.000' })],
      { provider: 'EPASS' },
    );

    const vetc = await harness.reports.spendReport({ ...AUGUST, provider: 'VETC' });
    const epass = await harness.reports.spendReport({ ...AUGUST, provider: 'EPASS' });
    const both = await harness.reports.spendReport(AUGUST);

    expect(vetc.provider).toBe('VETC');
    expect(vetc.vehicles.map((row) => row.vehicleId)).toEqual(['veh-1']);
    expect(epass.vehicles.map((row) => row.vehicleId)).toEqual(['veh-2']);
    expect(both.vehicles.map((row) => row.vehicleId)).toEqual(['veh-1', 'veh-2']);
  });

  /**
   * `INV-25` — 00:30 ngay 1/9 gio Viet Nam la 17:30 ngay 31/8 theo UTC. "Thang nay" phai la thang
   * CUA KHACH, nen luot qua tram 23:40 ngay 31/8 KHONG thuoc bao cao mac dinh luc do.
   */
  it('ky mac dinh = thang nghiep vu HIEN TAI theo dong ho may chu va mui gio khach', async () => {
    const harness = build('2026-08-31T17:30:00.000Z');
    await seedAccount(harness);
    await importRows(harness, [manual()]);

    const report = await harness.reports.spendReport({ from: null, to: null, provider: null });
    expect([report.from, report.to, report.generatedOn]).toEqual([
      '2026-09-01',
      '2026-09-01',
      '2026-09-01',
    ]);
    expect(report.vehicles).toEqual([]);
  });

  it('ky sai -> loi `BUSINESS_DATE_INVALID` (400), khong phai mot loi may chu', async () => {
    const harness = build();
    const attempt = harness.reports.spendReport({
      from: '2026-09-02',
      to: '2026-09-01',
      provider: null,
    });
    await expect(attempt).rejects.toBeInstanceOf(TransportDomainError);
    await expect(attempt).rejects.toMatchObject({
      kind: 'INVALID',
      reason: 'BUSINESS_DATE_INVALID',
    });
  });
});

describe('lich su nhan chi tra cua MOT xe qua moi tai khoan', () => {
  /**
   * "Xe doi tai khoan" = DONG doan cu roi MO doan moi. Man hinh theo tai khoan chi thay mot nua cau
   * chuyen; man hinh theo xe phai thay CA HAI doan, kem ket luan "dang hieu luc" do MAY CHU cham.
   */
  it('doan cu da dong va doan moi dang hieu luc deu con, dung thu tu', async () => {
    const harness = build();
    const oldAccount = await harness.accounts.createAccount(
      { provider: 'VETC', accountNo: 'TK-CU', holderName: null },
      'ke-toan',
    );
    const newAccount = await harness.accounts.createAccount(
      { provider: 'EPASS', accountNo: 'EP-MOI', holderName: null },
      'ke-toan',
    );
    const oldLink = await harness.accounts.openLink(
      {
        accountId: oldAccount.id,
        vehicleId: 'veh-1',
        providerVehicleRef: null,
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
      },
      'ke-toan',
    );
    await harness.accounts.closeLink(oldLink.id, '2026-06-30', 'ke-toan');
    await harness.accounts.openLink(
      {
        accountId: newAccount.id,
        vehicleId: 'veh-1',
        providerVehicleRef: null,
        effectiveFrom: '2026-07-01',
        effectiveTo: null,
      },
      'ke-toan',
    );

    const history = await harness.accounts.listLinkHistoryForVehicle('veh-1');
    expect(history.onDate).toBe('2026-09-16');
    expect(
      history.links.map((link) => [
        link.accountId,
        link.effectiveFrom,
        link.effectiveTo,
        link.effective,
      ]),
    ).toEqual([
      [oldAccount.id, '2026-01-01', '2026-06-30', false],
      [newAccount.id, '2026-07-01', null, true],
    ]);
  });

  it('xe chua tung noi -> danh sach RONG kem moc ngay, khong phai mot loi', async () => {
    const harness = build();
    expect(await harness.accounts.listLinkHistoryForVehicle('veh-2')).toEqual({
      onDate: '2026-09-16',
      links: [],
    });
  });
});
