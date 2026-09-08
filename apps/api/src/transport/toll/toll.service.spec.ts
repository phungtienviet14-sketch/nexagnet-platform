import { beforeEach, describe, expect, it } from 'vitest';
import type { AuditLogService } from '../../audit/audit-log.service.js';
import { TransportDomainError } from '../transport.errors.js';
import { InMemoryTollRepository } from './in-memory-toll.repository.js';
import { TollApiRegistry } from './toll-api.port.js';
import { TollAccountService } from './toll-account.service.js';
import type { TransportTollPolicy } from './toll-policy.js';
import { FileTollStatementSource } from './toll-statement-source.js';
import { TransportTollCoreFacts, type TollVehicleFacts } from './toll.ports.js';
import { TollService, type ManualTollRow } from './toll.service.js';

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

const policy = (over: Partial<TransportTollPolicy> = {}): TransportTollPolicy => ({
  timeZone: 'Asia/Ho_Chi_Minh',
  providers: {},
  maxSourceBytes: 1_000_000,
  maxRows: 1_000,
  ...over,
});

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

interface Harness {
  toll: TollService;
  accounts: TollAccountService;
  repository: InMemoryTollRepository;
}

const build = (over: Partial<TransportTollPolicy> = {}): Harness => {
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
    policy(over),
  );
  return { toll, accounts: new TollAccountService(repository, core, audit), repository };
};

const seed = async (harness: Harness): Promise<string> => {
  const account = await harness.accounts.createAccount(
    { provider: 'VETC', accountNo: 'TK-001', holderName: 'Cong ty B' },
    'ke-toan',
  );
  await harness.accounts.openLink(
    {
      accountId: account.id,
      vehicleId: 'veh-1',
      providerVehicleRef: null,
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
    },
    'ke-toan',
  );
  return account.id;
};

const importManual = (harness: Harness, rows: readonly ManualTollRow[]) =>
  harness.toll.commitImport(
    {
      provider: 'VETC',
      sourceKind: 'MANUAL',
      sourceLabel: 'nhap tay thang 8',
      periodStart: null,
      periodEnd: null,
      rows,
    },
    'ke-toan',
  );

/**
 * ===========================================================================
 * `BLOCKED_SAMPLE_REQUIRED` — RIENG cho tung nha cung cap.
 *
 * #269: *"If there is no real provider statement sample: do not fabricate format; mark
 * BLOCKED_SAMPLE_REQUIRED for that provider runtime slice; still complete provider-neutral parts."*
 */
describe('san sang cua tung nha cung cap', () => {
  it('chua khai bo cot thi CA HAI nha cung cap deu bi khoa — va bi khoa RIENG', () => {
    const readiness = build().toll.providerReadiness();
    const vetc = readiness.find((entry) => entry.provider === 'VETC');
    const epass = readiness.find((entry) => entry.provider === 'EPASS');
    expect(vetc?.statementReady).toBe(false);
    expect(vetc?.blockedReason).toBe('BLOCKED_SAMPLE_REQUIRED');
    expect(epass?.statementReady).toBe(false);
    expect(epass?.blockedReason).toBe('BLOCKED_SAMPLE_REQUIRED');
  });

  /** Khoa la RIENG: mot nha cung cap co ban mau truoc thi mo truoc. */
  it('khai bo cot cho ePass thi ePass mo, VETC VAN khoa', () => {
    const readiness = build({
      providers: {
        EPASS: {
          columns: { accountNo: 'So TK', amount: 'So tien', passedAt: 'Thoi diem', kind: 'Loai' },
          dateFormat: 'dmy',
          kinds: { 'Qua tram': 'TOLL_PASS' },
          defaultKind: null,
        },
      },
    }).toll.providerReadiness();
    expect(readiness.find((entry) => entry.provider === 'EPASS')?.statementReady).toBe(true);
    expect(readiness.find((entry) => entry.provider === 'VETC')?.statementReady).toBe(false);
  });

  /**
   * MOT BO COT KHAI DO DANG cung la `BLOCKED`, khong phai `READY`.
   *
   * Bay vap phai khi viet chinh bo test nay: khai `kinds` nhung khong khai COT loai va cung khong
   * khai `defaultKind`. Khi do khong dong nao doc duoc loai giao dich cua no — va neu tinh la
   * "san sang" thi moi dong se bi tu choi voi mot ma noi SAI CHO phai sua.
   */
  it('khai thieu `defaultKind` khi tep khong co cot loai VAN la bi khoa', () => {
    const readiness = build({
      providers: {
        EPASS: {
          columns: { accountNo: 'So TK', amount: 'So tien', passedAt: 'Thoi diem' },
          dateFormat: 'dmy',
          kinds: { 'Qua tram': 'TOLL_PASS' },
          defaultKind: null,
        },
      },
    }).toll.providerReadiness();
    const epass = readiness.find((entry) => entry.provider === 'EPASS');
    expect(epass?.statementReady).toBe(false);
    expect(epass?.blockedReason).toContain('defaultKind');
  });

  it('nap tep cua mot nha cung cap chua khai bo cot thi that bai DONG, co ma rieng', async () => {
    await expect(
      build().toll.previewImport({
        provider: 'VETC',
        sourceKind: 'STATEMENT_FILE',
        sourceLabel: 'sao-ke.csv',
        periodStart: null,
        periodEnd: null,
        format: 'CSV',
        contentBase64: Buffer.from('a,b\n1,2\n').toString('base64'),
      }),
    ).rejects.toMatchObject({ reason: 'TOLL_PROVIDER_MAPPING_NOT_CONFIGURED' });
  });
});

/**
 * ===========================================================================
 * DUONG `API` — THAT BAI DONG, khong tra ve rong.
 *
 * Mot cong tra ve rong trong im lang se lam nguoi dung tuong nha cung cap khong co giao dich nao
 * trong ky — mot cau tra loi sai ma khong ai kiem chung duoc.
 */
describe('duong API chua duoc chung minh', () => {
  it('ca hai nha cung cap deu `NOT_PUBLICLY_PROVEN`', () => {
    const diagnostics = build().toll.apiDiagnostics();
    expect(diagnostics.find((entry) => entry.provider === 'VETC')?.status).toBe(
      'NOT_PUBLICLY_PROVEN',
    );
    expect(diagnostics.find((entry) => entry.provider === 'EPASS')?.status).toBe(
      'NOT_PUBLICLY_PROVEN',
    );
  });

  /** Chan doan phai chi ra DUONG DOI HOI HOP PHAP, khong phai mot cach di vong. */
  it('chan doan kem duong hop phap theo ND 119 D.26 kh.2', () => {
    for (const entry of build().toll.apiDiagnostics()) {
      expect(entry.requestPath).toContain('D.26 kh.2');
    }
  });

  it('nap qua duong API bi tu choi voi dung ma do', async () => {
    await expect(
      build().toll.previewImport({
        provider: 'EPASS',
        sourceKind: 'API',
        sourceLabel: 'keo tu API',
        periodStart: null,
        periodEnd: null,
      }),
    ).rejects.toMatchObject({ reason: 'TOLL_API_NOT_PUBLICLY_PROVEN' });
  });

  it('hoa don PDF cung doi mot ban mau that', async () => {
    await expect(
      build().toll.previewImport({
        provider: 'VETC',
        sourceKind: 'INVOICE_PDF',
        sourceLabel: 'hoa-don.pdf',
        periodStart: null,
        periodEnd: null,
      }),
    ).rejects.toMatchObject({ reason: 'TOLL_PROVIDER_MAPPING_NOT_CONFIGURED' });
  });
});

/**
 * ===========================================================================
 * DUONG NHAP TAY — duong DUY NHAT chay duoc HOM NAY.
 *
 * Bieu nhap la CUA TA, nen no khong bia mot dinh dang cua nha cung cap nao. #237 da noi tu dau:
 * *"`MANUAL` khong bao gio duoc bo"*.
 */
describe('nap tay va doi soat', () => {
  let harness: Harness;
  beforeEach(async () => {
    harness = build();
    await seed(harness);
  });

  it('doc duoc mot dong day du va noi no ve dung chiec xe', async () => {
    const result = await importManual(harness, [manual()]);
    expect(result.replayed).toBe(false);
    expect(result.import.acceptedCount).toBe(1);
    const [candidate] = result.candidates;
    expect(candidate?.matchState).toBe('MATCHED');
    expect(candidate?.vehicleId).toBe('veh-1');
    // `INV-25` — 23:40 ngay 31/8 gio Viet Nam VAN la ngay nghiep vu 31/8.
    expect(candidate?.businessDate).toBe('2026-08-31');
    expect(candidate?.signedAmount).toBe(-52_000);
  });

  it('nap tien khong doi bien so va van MATCHED o muc tai khoan', async () => {
    const result = await importManual(harness, [
      manual({ kind: 'TOP_UP', vehiclePlate: null, amount: '5.000.000' }),
    ]);
    expect(result.candidates[0]?.matchState).toBe('MATCHED');
    expect(result.candidates[0]?.vehicleId).toBeNull();
  });

  it('bien so chua noi vao tai khoan nay thi la VEHICLE_UNRESOLVED', async () => {
    const result = await importManual(harness, [manual({ vehiclePlate: '30E-111.22' })]);
    expect(result.candidates[0]?.matchState).toBe('VEHICLE_UNRESOLVED');
  });

  it('so tai khoan chua khai thi la ACCOUNT_UNRESOLVED', async () => {
    const result = await importManual(harness, [manual({ accountNo: 'TK-999' })]);
    expect(result.candidates[0]?.matchState).toBe('ACCOUNT_UNRESOLVED');
  });

  /** #269 J3 — mot dong hong khong duoc lam mat nhung dong dung. */
  it('giu duoc phan dung khi mot dong hong', async () => {
    const result = await importManual(harness, [
      manual(),
      manual({ amount: 'xxx', passedAt: '01/09/2026 08:00' }),
      manual({ passedAt: '01/09/2026 09:00' }),
    ]);
    expect(result.import.rowCount).toBe(3);
    expect(result.import.acceptedCount).toBe(2);
    expect(result.import.rejectedCount).toBe(1);
    const rejected = result.candidates.find((c) => c.parseStatus === 'REJECTED');
    expect(rejected?.rejectReason).toBe('TOLL_ROW_AMOUNT_INVALID');
    expect(rejected?.signedAmount).toBeNull();
  });
});

/**
 * ===========================================================================
 * CHONG LAP HAI TANG — #269 J4.
 */
describe('chong lap', () => {
  let harness: Harness;
  beforeEach(async () => {
    harness = build();
    await seed(harness);
  });

  it('nap lai DUNG nhung dong do tra ve lan nhap CU, khong tao ban thu hai', async () => {
    const first = await importManual(harness, [manual()]);
    const second = await importManual(harness, [manual()]);
    expect(second.replayed).toBe(true);
    expect(second.import.id).toBe(first.import.id);
    expect(await harness.toll.listImports('VETC')).toHaveLength(1);
  });

  /**
   * HAI DONG GIONG HET NHAU trong cung mot lan nap deu duoc GIU va deu bi DANH DAU.
   *
   * Day chinh la tinh huong VETC tu cong bo: loi doc cheo lan sinh ra hai giao dich cho mot luot
   * xe, roi he thong hoan mot giao dich. Vut mot trong hai di se lam dong hoan tien mo coi.
   */
  it('hai dong trung nhau deu o lai va deu duoc neu ra', async () => {
    const result = await importManual(harness, [manual(), manual()]);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((c) => c.matchState)).toEqual([
      'DUPLICATE_CANDIDATE',
      'DUPLICATE_CANDIDATE',
    ]);
  });

  it('cung mot giao dich ve qua HAI nguon khac nhau van bi phat hien', async () => {
    await importManual(harness, [manual()]);
    // Nguon thu hai co them mot dong khac nen dau nguon KHAC — day khong phai mot lan nap lai.
    const second = await importManual(harness, [
      manual(),
      manual({ passedAt: '01/09/2026 07:00' }),
    ]);
    expect(second.replayed).toBe(false);
    expect(second.candidates[0]?.matchState).toBe('DUPLICATE_CANDIDATE');
    expect(second.candidates[1]?.matchState).toBe('MATCHED');
  });
});

/**
 * ===========================================================================
 * BAT BIEN PHAP LY — ND 119/2024/ND-CP Dieu 11 khoan 3.
 */
describe('mot xe chi nhan chi tra tu MOT tai khoan', () => {
  it('noi mot xe vao tai khoan thu hai khi doan cu con mo thi bi tu choi', async () => {
    const harness = build();
    await seed(harness);
    const other = await harness.accounts.createAccount(
      { provider: 'EPASS', accountNo: 'TK-777', holderName: null },
      'ke-toan',
    );
    await expect(
      harness.accounts.openLink(
        {
          accountId: other.id,
          vehicleId: 'veh-1',
          providerVehicleRef: null,
          effectiveFrom: '2026-06-01',
          effectiveTo: null,
        },
        'ke-toan',
      ),
    ).rejects.toMatchObject({ reason: 'TOLL_VEHICLE_ALREADY_LINKED' });
  });

  it('DONG doan cu roi MO doan moi thi duoc — do la "xe doi tai khoan"', async () => {
    const harness = build();
    const accountId = await seed(harness);
    const [link] = await harness.accounts.listLinksForAccount(accountId);
    await harness.accounts.closeLink(link?.id ?? '', '2026-05-31', 'ke-toan');

    const other = await harness.accounts.createAccount(
      { provider: 'EPASS', accountNo: 'TK-777', holderName: null },
      'ke-toan',
    );
    const opened = await harness.accounts.openLink(
      {
        accountId: other.id,
        vehicleId: 'veh-1',
        providerVehicleRef: null,
        effectiveFrom: '2026-06-01',
        effectiveTo: null,
      },
      'ke-toan',
    );
    expect(opened.effectiveTo).toBeNull();
    // LICH SU duoc giu: doan cu van con, nen mot luot qua tram thang 5 van doc duoc ve tai khoan cu.
    expect(await harness.accounts.listLinksForVehicle('veh-1')).toHaveLength(2);
  });

  it('mot `vehicleId` bia khong tao ra ban ghi noi nao', async () => {
    const harness = build();
    const accountId = await seed(harness);
    await expect(
      harness.accounts.openLink(
        {
          accountId,
          vehicleId: 'veh-khong-co-that',
          providerVehicleRef: null,
          effectiveFrom: '2026-01-01',
          effectiveTo: null,
        },
        'ke-toan',
      ),
    ).rejects.toMatchObject({ reason: 'TOLL_VEHICLE_NOT_FOUND' });
  });
});

/**
 * ===========================================================================
 * HOP THU DOI SOAT — quyet dinh la GHI THEM, va khong quyet dinh nao noi ve TIEN DA TRA.
 */
describe('quyet dinh cua nguoi doi soat', () => {
  let harness: Harness;
  beforeEach(async () => {
    harness = build();
    await seed(harness);
  });

  it('chon xe cho mot dong chua noi duoc, va lich su giu CA HAI dau', async () => {
    const result = await importManual(harness, [manual({ vehiclePlate: '30E-111.22' })]);
    const id = result.candidates[0]?.id ?? '';
    const updated = await harness.toll.review(
      {
        candidateId: id,
        action: 'RESOLVE_VEHICLE',
        vehicleId: 'veh-2',
        duplicateOfCandidateId: null,
        note: 'doi chieu tay',
      },
      'ke-toan',
    );
    expect(updated.vehicleId).toBe('veh-2');
    expect(updated.matchState).toBe('MATCHED');
    // Chon duoc xe KHONG dong nghia voi da doi soat xong.
    expect(updated.reviewState).toBe('PENDING');

    const detail = await harness.toll.candidateDetail(id);
    expect(detail.decisions).toHaveLength(1);
    expect(detail.decisions[0]).toMatchObject({
      actor: 'ke-toan',
      reason: 'TOLL_REVIEW_VEHICLE_RESOLVED',
      previousVehicleId: null,
      nextVehicleId: 'veh-2',
      note: 'doi chieu tay',
    });
  });

  /** Tinh huong doc cheo lan cua VETC — nguoi doi soat noi hai dong giong nhau la HAI su kien that. */
  it('go nhan trung duoc, va lan go do duoc GHI LAI', async () => {
    const result = await importManual(harness, [manual(), manual()]);
    const id = result.candidates[0]?.id ?? '';
    const updated = await harness.toll.review(
      {
        candidateId: id,
        action: 'CLEAR_DUPLICATE',
        vehicleId: null,
        duplicateOfCandidateId: null,
        note: null,
      },
      'ke-toan',
    );
    expect(updated.matchState).toBe('MATCHED');
    const detail = await harness.toll.candidateDetail(id);
    expect(detail.decisions[0]?.reason).toBe('TOLL_REVIEW_DUPLICATE_CLEARED');
    expect(detail.decisions[0]?.previousMatchState).toBe('DUPLICATE_CANDIDATE');
  });

  it('sua nhieu lan thi lich su NOI TIEP, khong ghi de', async () => {
    const result = await importManual(harness, [manual({ vehiclePlate: '30E-111.22' })]);
    const id = result.candidates[0]?.id ?? '';
    const review = (action: 'RESOLVE_VEHICLE' | 'CONFIRM' | 'REOPEN', vehicleId: string | null) =>
      harness.toll.review(
        { candidateId: id, action, vehicleId, duplicateOfCandidateId: null, note: null },
        'ke-toan',
      );
    await review('RESOLVE_VEHICLE', 'veh-2');
    await review('CONFIRM', null);
    await review('REOPEN', null);
    const detail = await harness.toll.candidateDetail(id);
    expect(detail.decisions.map((d) => d.action)).toEqual(['RESOLVE_VEHICLE', 'CONFIRM', 'REOPEN']);
    expect(detail.candidate.reviewState).toBe('REOPENED');
  });

  it('khong gan xe vao mot dong nap tien', async () => {
    const result = await importManual(harness, [
      manual({ kind: 'TOP_UP', vehiclePlate: null, amount: '5.000.000' }),
    ]);
    await expect(
      harness.toll.review(
        {
          candidateId: result.candidates[0]?.id ?? '',
          action: 'RESOLVE_VEHICLE',
          vehicleId: 'veh-1',
          duplicateOfCandidateId: null,
          note: null,
        },
        'ke-toan',
      ),
    ).rejects.toMatchObject({ reason: 'TOLL_CANDIDATE_VEHICLE_NOT_APPLICABLE' });
  });

  it('dong bi tu choi luc doc thi khong doi soat duoc', async () => {
    const result = await importManual(harness, [manual({ amount: 'xxx' })]);
    await expect(
      harness.toll.review(
        {
          candidateId: result.candidates[0]?.id ?? '',
          action: 'CONFIRM',
          vehicleId: null,
          duplicateOfCandidateId: null,
          note: null,
        },
        'ke-toan',
      ),
    ).rejects.toBeInstanceOf(TransportDomainError);
  });
});
