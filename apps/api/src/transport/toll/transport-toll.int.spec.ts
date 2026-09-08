import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuditLogService } from '../../audit/audit-log.service.js';
import { PrismaService } from '../../config/prisma.service.js';
import { PrismaTollRepository } from './prisma-toll.repository.js';
import { TollApiRegistry } from './toll-api.port.js';
import { TollAccountService } from './toll-account.service.js';
import type { TransportTollPolicy } from './toll-policy.js';
import { FileTollStatementSource } from './toll-statement-source.js';
import { TransportTollCoreFacts, type TollVehicleFacts } from './toll.ports.js';
import { TollService, type ManualTollRow } from './toll.service.js';

/**
 * NAP DU LIEU ETC TREN POSTGRES THAT — Lane J, Issue #269.
 *
 * ===========================================================================
 * VI SAO PHAI LA POSTGRES THAT chu khong `InMemoryTollRepository`
 *
 * Nhung thu quan trong nhat cua lane nay song o RANH GIOI voi CSDL, va kho trong bo nho theo dinh
 * nghia khong co ranh gioi do — no se XANH ca khi khong rang buoc nao ton tai:
 *
 *   · unique MOT PHAN `..._activeVehicle_key` — bat bien PHAP LY cua ND 119 D.11 kh.3, va la thu
 *     DUY NHAT dung khi co HAI nguoi ghi cung luc;
 *   · `CHECK ..._parse_shape` — mot hang "da doc duoc" nhung rong ruot khong duoc ton tai;
 *   · `CHECK ..._amount_range` — bien tien trung bien cua `money()`;
 *   · unique `(provider, sourceDigest)` — chong lap o tang NGUON;
 *   · `FOREIGN KEY` toi `TransportVehicle` — mot `vehicleId` bia phai chet o DB, khong chi o service;
 *   · va tinh NGUYEN TU cua mot lan nap va cua mot lan quyet.
 */
describe.runIf(process.env.RUN_PRISMA_IT === '1')('Nap du lieu ETC tren Postgres THAT', () => {
  const prisma = new PrismaService();

  /**
   * Tien to fixture RIENG cua Lane J, va KHONG duoc la tien to cua bat ky tien to nao khac: cac
   * ham don deu dung `startsWith`, nen mot tien to long nhau se lam bai nay xoa mat fixture cua
   * bai khac — va lo ra CHI khi chay ca thu muc.
   */
  const PLATE_PREFIX = '99ITJ';
  const ACCOUNT_PREFIX = 'ITJTOLL';

  const state = { vehicleA: '', vehicleB: '' };

  class DbCoreFacts extends TransportTollCoreFacts {
    async listVehicles(): Promise<readonly TollVehicleFacts[]> {
      const rows = await prisma.transportVehicle.findMany({
        where: { registrationPlate: { startsWith: PLATE_PREFIX } },
        select: { id: true, registrationPlate: true },
      });
      return rows;
    }
    async findVehicle(id: string): Promise<TollVehicleFacts | null> {
      const row = await prisma.transportVehicle.findUnique({
        where: { id },
        select: { id: true, registrationPlate: true },
      });
      return row;
    }
  }

  const audit = { append: async () => undefined } as unknown as AuditLogService;
  const policy: TransportTollPolicy = {
    timeZone: 'Asia/Ho_Chi_Minh',
    providers: {},
    maxSourceBytes: 1_000_000,
    maxRows: 1_000,
  };

  const repository = new PrismaTollRepository(prisma);
  const core = new DbCoreFacts();
  const toll = new TollService(
    repository,
    new FileTollStatementSource(),
    core,
    new TollApiRegistry(),
    audit,
    policy,
  );
  const accounts = new TollAccountService(repository, core, audit);

  async function cleanup(): Promise<void> {
    const imports = await prisma.transportTollImport.findMany({
      where: { sourceLabel: { startsWith: ACCOUNT_PREFIX } },
      select: { id: true },
    });
    const importIds = imports.map((row) => row.id);
    const candidates = await prisma.transportTollTransactionCandidate.findMany({
      where: { importId: { in: importIds } },
      select: { id: true },
    });
    await prisma.transportTollReviewDecision.deleteMany({
      where: { candidateId: { in: candidates.map((row) => row.id) } },
    });
    await prisma.transportTollTransactionCandidate.deleteMany({
      where: { importId: { in: importIds } },
    });
    await prisma.transportTollImport.deleteMany({ where: { id: { in: importIds } } });

    const accountRows = await prisma.transportTollAccount.findMany({
      where: { accountNo: { startsWith: ACCOUNT_PREFIX } },
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

  /**
   * MOT XE RIENG cho moi bai can mot ban ghi noi.
   *
   * Dung chung mot chiec xe giua cac bai la KHONG dung duoc o day, va ly do chinh la bat bien dang
   * duoc kiem: mot xe chi co DUNG MOT doan dang mo, VINH VIEN — nen bai thu hai muon noi lai chiec
   * xe cua bai thu nhat se bi chan. Lan dau viet bo nay da vap dung vao do.
   */
  const newVehicle = async (suffix: string): Promise<string> => {
    const created = await prisma.transportVehicle.create({
      data: { registrationPlate: `${PLATE_PREFIX}-${suffix}`, vehicleClass: 'TRUCK' },
    });
    return created.id;
  };

  const newAccount = (suffix: string) =>
    accounts.createAccount(
      { provider: 'VETC', accountNo: `${ACCOUNT_PREFIX}-${suffix}`, holderName: 'Cong ty B' },
      'ke-toan',
    );

  const manual = (over: Partial<ManualTollRow> = {}): ManualTollRow => ({
    accountNo: `${ACCOUNT_PREFIX}-A`,
    kind: 'TOLL_PASS',
    vehiclePlate: `${PLATE_PREFIX}-001.11`,
    passedAt: '31/08/2026 23:40',
    businessDate: null,
    amount: '-52.000',
    station: 'Tram Phap Van',
    providerRef: null,
    ...over,
  });

  /**
   * BAT BIEN PHAP LY, DO O TANG DB — va do bang mot duong VONG QUA service.
   *
   * Service da co mot phep kiem, nen mot bai di qua service chi chung minh phep kiem DO. Bai nay
   * ghi THANG bang Prisma de tra loi cau hoi that: neu hai nguoi ghi cung luc va ca hai deu vuot
   * qua phep kiem o tang mien, Postgres co chan khong?
   */
  it('J-INT-01 — unique mot phan chan doan noi thu hai cho CUNG mot xe, KE CA o tai khoan khac', async () => {
    const first = await newAccount('A');
    const second = await newAccount('B');
    await prisma.transportTollAccountVehicleLink.create({
      data: {
        accountId: first.id,
        vehicleId: state.vehicleA,
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
        createdBy: 'ke-toan',
      },
    });

    await expect(
      prisma.transportTollAccountVehicleLink.create({
        data: {
          accountId: second.id,
          vehicleId: state.vehicleA,
          effectiveFrom: '2026-06-01',
          effectiveTo: null,
          createdBy: 'ke-toan',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('J-INT-02 — doan DA DONG khong chan doan moi; lich su giu duoc ca hai', async () => {
    const account = await newAccount('C');
    await prisma.transportTollAccountVehicleLink.create({
      data: {
        accountId: account.id,
        vehicleId: state.vehicleB,
        effectiveFrom: '2026-01-01',
        effectiveTo: '2026-05-31',
        createdBy: 'ke-toan',
      },
    });
    const opened = await accounts.openLink(
      {
        accountId: account.id,
        vehicleId: state.vehicleB,
        providerVehicleRef: 'TAG-B',
        effectiveFrom: '2026-06-01',
        effectiveTo: null,
      },
      'ke-toan',
    );
    expect(opened.effectiveTo).toBeNull();
    expect(await accounts.listLinksForVehicle(state.vehicleB)).toHaveLength(2);
  });

  it('J-INT-03 — CHECK chan mot khoang di lui', async () => {
    const account = await newAccount('D');
    await expect(
      prisma.transportTollAccountVehicleLink.create({
        data: {
          accountId: account.id,
          vehicleId: state.vehicleB,
          effectiveFrom: '2026-05-01',
          effectiveTo: '2026-04-30',
          createdBy: 'ke-toan',
        },
      }),
    ).rejects.toThrow();
  });

  /**
   * MOT HANG "DA DOC DUOC" NHUNG RONG RUOT khong duoc ton tai.
   *
   * Neu no ton tai, no se di tiep vao vong phan loai va khop voi mot cai gi do — mot du kien bia
   * mang nhan "da doc duoc".
   */
  it('J-INT-04 — CHECK chan mot dong ACCEPTED khong co ngay / tien / loai', async () => {
    const account = await newAccount('E');
    const created = await prisma.transportTollImport.create({
      data: {
        provider: 'VETC',
        sourceKind: 'MANUAL',
        sourceLabel: `${ACCOUNT_PREFIX}-shape`,
        sourceDigest: 'j-int-04-digest',
        rowCount: 1,
        acceptedCount: 1,
        rejectedCount: 0,
        importedBy: 'ke-toan',
      },
    });
    await expect(
      prisma.transportTollTransactionCandidate.create({
        data: {
          importId: created.id,
          provider: 'VETC',
          rowNumber: 1,
          parseStatus: 'ACCEPTED',
          accountNoRaw: account.accountNo,
          vehiclePlateRaw: '',
          rawValues: {},
        },
      }),
    ).rejects.toThrow();
  });

  it('J-INT-05 — FOREIGN KEY chan mot `vehicleId` bia', async () => {
    const account = await newAccount('F');
    await expect(
      prisma.transportTollAccountVehicleLink.create({
        data: {
          accountId: account.id,
          vehicleId: 'khong-co-chiec-xe-nao-nhu-the',
          effectiveFrom: '2026-01-01',
          createdBy: 'ke-toan',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' });
  });

  /**
   * NAP LAI DUNG BO BYTE DO — mot lan nhap, khong phai hai.
   *
   * Do tren DB that vi day la cho unique `(provider, sourceDigest)` that su song. Kho trong bo nho
   * cung lam lai bat bien nay, nhung chi DB moi tra loi duoc cau hoi "hai lenh cung luc thi sao".
   */
  it('J-INT-06 — nap lai cung mot nguon tra ve lan nhap CU va khong tao ban thu hai', async () => {
    const account = await newAccount('G');
    const vehicleId = await newVehicle('006.66');
    await accounts.openLink(
      {
        accountId: account.id,
        vehicleId,
        providerVehicleRef: null,
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
      },
      'ke-toan',
    );

    const command = {
      provider: 'VETC' as const,
      sourceKind: 'MANUAL' as const,
      sourceLabel: `${ACCOUNT_PREFIX}-replay`,
      periodStart: null,
      periodEnd: null,
      rows: [manual({ accountNo: account.accountNo, vehiclePlate: `${PLATE_PREFIX}-006.66` })],
    };

    const first = await toll.commitImport(command, 'ke-toan');
    const second = await toll.commitImport(command, 'ke-toan');

    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.import.id).toBe(first.import.id);
    expect(
      await prisma.transportTollImport.count({ where: { sourceLabel: command.sourceLabel } }),
    ).toBe(1);
    expect(
      await prisma.transportTollTransactionCandidate.count({
        where: { importId: first.import.id },
      }),
    ).toBe(1);
  });

  it('J-INT-07 — mot lan nap ghi ca ban ghi nguon VA moi dong trong CUNG mot giao dich', async () => {
    const account = await newAccount('H');
    const result = await toll.commitImport(
      {
        provider: 'VETC',
        sourceKind: 'MANUAL',
        sourceLabel: `${ACCOUNT_PREFIX}-atomic`,
        periodStart: '2026-08-01',
        periodEnd: '2026-08-31',
        rows: [
          manual({ accountNo: account.accountNo }),
          manual({ accountNo: account.accountNo, amount: 'xxx', passedAt: '01/09/2026 08:00' }),
        ],
      },
      'ke-toan',
    );
    expect(result.import.rowCount).toBe(2);
    expect(result.import.acceptedCount).toBe(1);
    expect(result.import.rejectedCount).toBe(1);

    const rows = await prisma.transportTollTransactionCandidate.findMany({
      where: { importId: result.import.id },
      orderBy: { rowNumber: 'asc' },
    });
    expect(rows).toHaveLength(2);
    // Dong hong VAN o lai, va moi o so lieu cua no la NULL — khong gia tri bia nao.
    expect(rows[1]?.parseStatus).toBe('REJECTED');
    expect(rows[1]?.signedAmount).toBeNull();
    expect(rows[1]?.businessDate).toBeNull();
    // Tien luu dang `BIGINT` va doc lai dung dau am.
    expect(rows[0]?.signedAmount).toBe(-52_000n);
    // `INV-25` — 23:40 ngay 31/8 gio Viet Nam VAN la ngay nghiep vu 31/8.
    expect(rows[0]?.businessDate).toBe('2026-08-31');
  });

  it('J-INT-08 — cung mot giao dich ve qua HAI nguon deu bi neu ra', async () => {
    const account = await newAccount('I');
    const vehicleId = await newVehicle('008.88');
    await accounts.openLink(
      {
        accountId: account.id,
        vehicleId,
        providerVehicleRef: null,
        effectiveFrom: '2026-01-01',
        effectiveTo: null,
      },
      'ke-toan',
    );
    const row = manual({
      accountNo: account.accountNo,
      vehiclePlate: `${PLATE_PREFIX}-008.88`,
      station: 'Tram Cau Gie',
    });
    await toll.commitImport(
      {
        provider: 'VETC',
        sourceKind: 'MANUAL',
        sourceLabel: `${ACCOUNT_PREFIX}-file-1`,
        periodStart: null,
        periodEnd: null,
        rows: [row],
      },
      'ke-toan',
    );
    const second = await toll.commitImport(
      {
        provider: 'VETC',
        sourceKind: 'MANUAL',
        sourceLabel: `${ACCOUNT_PREFIX}-file-2`,
        periodStart: null,
        periodEnd: null,
        rows: [
          row,
          manual({
            accountNo: account.accountNo,
            vehiclePlate: `${PLATE_PREFIX}-008.88`,
            station: 'Tram Cau Gie',
            passedAt: '01/09/2026 06:30',
          }),
        ],
      },
      'ke-toan',
    );
    expect(second.replayed).toBe(false);
    expect(second.candidates[0]?.matchState).toBe('DUPLICATE_CANDIDATE');
    expect(second.candidates[1]?.matchState).toBe('MATCHED');
    // Ngay nghiep vu cua dong thu hai: 06:30 sang 01/09 gio Viet Nam la `2026-08-31T23:30Z` —
    // doc bang UTC se lui no ve 31/8. Day la dung cho `INV-25` ton tai de chan.
    expect(second.candidates[1]?.businessDate).toBe('2026-09-01');
  });

  /**
   * MOT LAN QUYET = MOT giao dich, ghi HAI thu.
   *
   * Neu tach lam hai lan goi, mot lan hong o giua de lai mot dong da doi trang thai ma KHONG co ai
   * ky ten — dung cai ma #269 J7 doi phai tranh.
   */
  it('J-INT-09 — mot lan quyet ghi ca trang thai moi VA mot dong lich su khong sua duoc', async () => {
    const account = await newAccount('J');
    const result = await toll.commitImport(
      {
        provider: 'VETC',
        sourceKind: 'MANUAL',
        sourceLabel: `${ACCOUNT_PREFIX}-review`,
        periodStart: null,
        periodEnd: null,
        // Bien so cua doi xe nhung CHUA noi vao tai khoan nay -> VEHICLE_UNRESOLVED.
        rows: [manual({ accountNo: account.accountNo, vehiclePlate: `${PLATE_PREFIX}-001.11` })],
      },
      'ke-toan',
    );
    const candidate = result.candidates[0];
    expect(candidate?.matchState).toBe('VEHICLE_UNRESOLVED');

    const updated = await toll.review(
      {
        candidateId: candidate?.id ?? '',
        action: 'RESOLVE_VEHICLE',
        vehicleId: state.vehicleA,
        duplicateOfCandidateId: null,
        note: 'doi chieu tay theo ban giay',
      },
      'giam-doc',
    );
    expect(updated.vehicleId).toBe(state.vehicleA);
    expect(updated.matchState).toBe('MATCHED');

    const decisions = await prisma.transportTollReviewDecision.findMany({
      where: { candidateId: candidate?.id ?? '' },
    });
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      actor: 'giam-doc',
      action: 'RESOLVE_VEHICLE',
      reason: 'TOLL_REVIEW_VEHICLE_RESOLVED',
      previousVehicleId: null,
      nextVehicleId: state.vehicleA,
      previousMatchState: 'VEHICLE_UNRESOLVED',
      nextMatchState: 'MATCHED',
      note: 'doi chieu tay theo ban giay',
    });
  });

  /**
   * NOI DUNG NHA CUNG CAP LA DU LIEU, KHONG PHAI CU PHAP — do tren duong ghi that.
   *
   * #269 J9: *"provider raw strings cannot become SQL/HTML/shell syntax"*. Prisma tham so hoa moi
   * gia tri, nen mot ten tram mang cu phap SQL di vao va di ra NGUYEN VAN. Bai nay do dieu do thay
   * vi tin vao no.
   */
  it('J-INT-10 — chuoi cua nha cung cap khong tro thanh cu phap', async () => {
    const account = await newAccount('K');
    const nasty = 'Tram \'); DROP TABLE "TransportTollAccount"; --';
    const result = await toll.commitImport(
      {
        provider: 'VETC',
        sourceKind: 'MANUAL',
        sourceLabel: `${ACCOUNT_PREFIX}-injection`,
        periodStart: null,
        periodEnd: null,
        rows: [manual({ accountNo: account.accountNo, station: nasty })],
      },
      'ke-toan',
    );
    const row = await prisma.transportTollTransactionCandidate.findUnique({
      where: { id: result.candidates[0]?.id ?? '' },
    });
    expect(row?.stationLabel).toBe(nasty);
    // Va bang van con day du.
    expect(await prisma.transportTollAccount.count({ where: { id: account.id } })).toBe(1);
  });

  /**
   * CHECK bien tien trung bien cua `money()`.
   *
   * Mot hang VUOT bien chi co the den tu mot duong ghi KHONG di qua ung dung. Neu DB cho phep no,
   * gia tri do se mat chinh xac lang le o phep doi sang `number` luc DOC — cho khong ai dang nhin.
   */
  it('J-INT-11 — CHECK chan mot so tien ngoai khoang bieu dien duoc', async () => {
    const account = await newAccount('L');
    const created = await prisma.transportTollImport.create({
      data: {
        provider: 'VETC',
        sourceKind: 'MANUAL',
        sourceLabel: `${ACCOUNT_PREFIX}-range`,
        sourceDigest: 'j-int-11-digest',
        rowCount: 1,
        acceptedCount: 1,
        rejectedCount: 0,
        importedBy: 'ke-toan',
      },
    });
    await expect(
      prisma.transportTollTransactionCandidate.create({
        data: {
          importId: created.id,
          provider: 'VETC',
          rowNumber: 1,
          parseStatus: 'ACCEPTED',
          accountNoRaw: account.accountNo,
          kind: 'TOLL_PASS',
          vehiclePlateRaw: `${PLATE_PREFIX}-001.11`,
          businessDate: '2026-08-31',
          signedAmount: 9_007_199_254_740_992n,
          rawValues: {},
        },
      }),
    ).rejects.toThrow();
  });
});
