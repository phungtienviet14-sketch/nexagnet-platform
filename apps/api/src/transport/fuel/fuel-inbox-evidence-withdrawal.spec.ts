import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import type { TransportCorePolicy } from '../transport-policy.js';
import { TransportDomainError } from '../transport.errors.js';
import type { TripKind, TripStatus } from '../trips/trip-lifecycle.js';
import { DEFAULT_FUEL_STATEMENT_COLUMNS, type TransportFuelPolicy } from './fuel-policy.js';
import { FuelReadService } from './fuel-read.service.js';
import {
  FUEL_VERIFICATION_STATUSES,
  evaluateFuelEvidenceRemoval,
  type FuelReconciliationStatus,
  type FuelVerificationStatus,
} from './fuel-lifecycle.js';
import { FUEL_INBOX_MAX_LIMIT, fuelEntryInboxQuerySchema } from './fuel.schemas.js';
import {
  FuelCostingPort,
  TransportFuelCoreFacts,
  type FuelCostPostingCommand,
  type FuelDriverFacts,
  type FuelTripFacts,
  type FuelVehicleFacts,
} from './fuel.ports.js';
import { FuelService } from './fuel.service.js';
import { InMemoryFuelRepository } from './in-memory-fuel.repository.js';

/**
 * #222 — HOP THU PHIEU NHIEN LIEU (P1-B) va GO MOT CHUNG TU TAI NHAM (P1-C).
 *
 * ===========================================================================
 * VI SAO BO TEST NAY TON TAI, va no CO Y do nhung gi tu dong hoa T10 da bo lot
 *
 * T10 bao xanh trong khi ban DANG CHAY co hai lo hong mot nguoi dung that gap ngay trong buoi UAT
 * dau tien: mot phieu 62,5 L co that KHONG xuat hien o dau trong menu Nhien lieu, va mot tep PDF
 * tai nham KHONG co duong nao go ra. Ca hai deu la thu ma mot bai kiem "goi API thanh cong" khong
 * bao gio thay.
 *
 * Nen cac bai duoi day do dung nhung CAU HOI NGHIEP VU do:
 *
 *   · mot phieu vua nop CO TIM DUOC bang mot truy van cua ca doi khong, va co len dau khong;
 *   · mot chung tu tai nham CO GO DUOC khong, va co de lai dau vet khong;
 *   · sau khi phieu duoc duyet thi cong do CO DONG lai khong;
 *   · va lai xe A CO BI CHAN khoi chung tu cua lai xe B khong.
 */

const TRIP = 'chuyen-222';
const OTHER_TRIP = 'chuyen-222-b';
const VEHICLE = 'xe-222';
const DRIVER = 'lai-xe-222';
const OTHER_DRIVER = 'lai-xe-222-b';

const CORE_POLICY: TransportCorePolicy = { timeZone: 'Asia/Ho_Chi_Minh' };
const FUEL_POLICY: TransportFuelPolicy = {
  matching: { amountVnd: 1_000, businessDateDays: 1 },
  statement: { columns: DEFAULT_FUEL_STATEMENT_COLUMNS, dateFormat: 'iso' },
  consumption: { normsByVehicleClass: { 'tai-5-tan': 30 }, tolerancePercent: 10 },
};

class StubCoreFacts extends TransportFuelCoreFacts {
  tripKind: TripKind = 'OWN_DIRECT';
  tripStatus: TripStatus = 'IN_TRANSIT';

  async findTrip(tripId: string): Promise<FuelTripFacts | null> {
    if (tripId !== TRIP && tripId !== OTHER_TRIP) return null;
    return {
      id: tripId,
      code: tripId === TRIP ? 'UAT-222-01' : 'UAT-222-02',
      kind: this.tripKind,
      status: this.tripStatus,
    };
  }

  async findTripByCode(code: string): Promise<FuelTripFacts | null> {
    if (code === 'UAT-222-01') return this.findTrip(TRIP);
    if (code === 'UAT-222-02') return this.findTrip(OTHER_TRIP);
    return null;
  }

  async findVehicle(vehicleId: string): Promise<FuelVehicleFacts | null> {
    if (vehicleId !== VEHICLE) return null;
    return { id: VEHICLE, registrationPlate: '15C-556.33', vehicleClass: 'tai-5-tan' };
  }

  async listVehicles(): Promise<FuelVehicleFacts[]> {
    const vehicle = await this.findVehicle(VEHICLE);
    return vehicle ? [vehicle] : [];
  }

  async findDriver(driverId: string): Promise<FuelDriverFacts | null> {
    if (driverId !== DRIVER && driverId !== OTHER_DRIVER) return null;
    return { id: driverId, fullName: driverId === DRIVER ? 'Nguyen Van Binh' : 'Lai xe khac' };
  }

  async listDrivers(): Promise<FuelDriverFacts[]> {
    return [
      { id: DRIVER, fullName: 'Nguyen Van Binh' },
      { id: OTHER_DRIVER, fullName: 'Lai xe khac' },
    ];
  }

  async findDriverByAuthUserId(authUserId: string): Promise<FuelDriverFacts | null> {
    if (authUserId === 'user-binh') return { id: DRIVER, fullName: 'Nguyen Van Binh' };
    if (authUserId === 'user-khac') return { id: OTHER_DRIVER, fullName: 'Lai xe khac' };
    return null;
  }

  async wasDriverEverAssignedToTrip(): Promise<boolean> {
    return true;
  }

  async wasVehicleEverAssignedToTrip(): Promise<boolean> {
    return true;
  }
}

class SilentCostingPort extends FuelCostingPort {
  async postFuelCost(command: FuelCostPostingCommand): Promise<string> {
    return `chi-phi-${command.tripId}`;
  }
}

let repository: InMemoryFuelRepository;
let service: FuelService;
let read: FuelReadService;
let supplierId: string;

beforeEach(async () => {
  repository = new InMemoryFuelRepository();
  const core = new StubCoreFacts();
  const audit = new AuditLogService(new InMemoryAuditLogRepository());
  service = new FuelService(
    repository,
    core,
    new SilentCostingPort(),
    audit,
    CORE_POLICY,
    FUEL_POLICY,
  );
  read = new FuelReadService(repository, core);

  supplierId = (
    await repository.createSupplier({
      name: 'Cay xang Ha Noi',
      code: 'CX-HN',
      phone: null,
      address: null,
      taxCode: null,
      at: new Date('2026-09-01T00:00:00Z'),
    })
  ).id;
});

let keySeed = 0;

const submitSlip = async (
  overrides: {
    readonly tripId?: string;
    readonly driverId?: string;
    readonly businessDate?: string;
  } = {},
) =>
  service.submitFuelEntry(
    {
      tripId: overrides.tripId ?? TRIP,
      vehicleId: VEHICLE,
      driverId: overrides.driverId ?? DRIVER,
      supplierId,
      liters: '62.5',
      amount: 1_437_500,
      odometerKm: 100_500,
      occurredAt: `${overrides.businessDate ?? '2026-09-05'}T06:30:00+07:00`,
      businessDate: overrides.businessDate ?? '2026-09-05',
      paymentMethod: 'DRIVER_CASH',
      invoiceNo: null,
      note: null,
      correlationKey: `khoa-222-${(keySeed += 1)}`,
    },
    'ke-toan',
  );

const attach = (entryId: string, locator: string) =>
  service.attachEvidence(
    entryId,
    { locator, contentType: 'application/pdf', byteSize: 1024 },
    'lx.binh',
  );

const inbox = (overrides: Record<string, unknown> = {}) =>
  read.fuelEntryInbox(fuelEntryInboxQuerySchema.parse(overrides));

/* ================================================================== *
 * P1-B — HOP THU CUA CA DOI
 * ================================================================== */

describe('#222 P1-B — mot phieu vua nop tim duoc ma KHONG phai mo chuyen', () => {
  /**
   * Day la bai do dung trieu chung ma chu so huu gap: phieu 62,500 L / 1.437.500 d co that, va menu
   * Nhien lieu khong co duong nao thay no.
   */
  it('phieu do lai xe khai hien ra o hop thu kem MA CHUYEN, TEN LAI XE va BIEN SO', async () => {
    const entry = await submitSlip();

    const page = await inbox();

    expect(page.total).toBe(1);
    const row = page.rows[0];
    expect(row?.id).toBe(entry.id);
    // Bon dinh danh ky thuat da duoc doi ra CHU o tang doc — khong de man hinh tu ghep.
    expect(row?.tripCode).toBe('UAT-222-01');
    expect(row?.driverName).toBe('Nguyen Van Binh');
    expect(row?.vehiclePlate).toBe('15C-556.33');
    expect(row?.supplierName).toBe('Cay xang Ha Noi');
    expect(row?.litersUnits).toBe(62_500);
    expect(row?.amount).toBe(1_437_500);
  });

  it('KHONG mot dinh vi kho anh nao ra khoi tang doc', async () => {
    const entry = await submitSlip();
    await attach(entry.id, 'media/transport-evidence/2026/09/bien-lai.pdf');

    const page = await inbox();
    const row = page.rows[0];

    expect(row?.evidenceCount).toBe(1);
    expect(row?.evidence[0]?.contentType).toBe('application/pdf');
    // `locator` la chi tiet cua tang luu tru. Mot vong `JSON.stringify` la cach chac chan nhat de
    // bat no du no lot ra o bat ky do sau nao cua doi tuong.
    expect(JSON.stringify(row)).not.toContain('media/transport-evidence');
  });

  it('viec DANG CHO XAC THUC len truoc, moi nhat truoc trong tung nhom', async () => {
    const older = await submitSlip({ businessDate: '2026-09-01' });
    const newer = await submitSlip({ businessDate: '2026-09-05' });
    const verified = await submitSlip({ businessDate: '2026-09-09' });
    await service.verifyFuelEntry(verified.id, 'ke-toan');

    const page = await inbox();

    // `verified` co ngay MOI NHAT nhung nam CUOI — vi no khong con la viec cua ai.
    expect(page.rows.map((row) => row.id)).toEqual([newer.id, older.id, verified.id]);
  });

  it('`N cho xac thuc` KHONG chay theo bo loc trang thai', async () => {
    await submitSlip({ businessDate: '2026-09-01' });
    const verified = await submitSlip({ businessDate: '2026-09-02' });
    await service.verifyFuelEntry(verified.id, 'ke-toan');

    const filtered = await inbox({ verification: 'VERIFIED' });

    // Trang chi con phieu da duyet...
    expect(filtered.total).toBe(1);
    // ...nhung con so "con viec cho ban" van noi that.
    expect(filtered.pendingVerificationCount).toBe(1);
  });

  it('loc theo MA CHUYEN; ma khong ton tai cho ra hop thu RONG, khong phai ca bang', async () => {
    await submitSlip({ tripId: TRIP });
    await submitSlip({ tripId: OTHER_TRIP });

    expect((await inbox({ tripCode: 'UAT-222-01' })).total).toBe(1);
    expect((await inbox({ tripCode: 'UAT-222-02' })).total).toBe(1);
    // Day la cho de sai nhat cua ca tinh nang: `[]` va `null` phai la hai thu khac nhau.
    expect((await inbox({ tripCode: 'KHONG-CO-THAT' })).total).toBe(0);
    expect((await inbox()).total).toBe(2);
  });

  it('loc theo lai xe, cay xang va khoang ngay nghiep vu', async () => {
    await submitSlip({ driverId: DRIVER, businessDate: '2026-09-01' });
    await submitSlip({ driverId: OTHER_DRIVER, businessDate: '2026-09-10' });

    expect((await inbox({ driverId: DRIVER })).total).toBe(1);
    expect((await inbox({ supplierId })).total).toBe(2);
    expect((await inbox({ from: '2026-09-05', to: '2026-09-30' })).total).toBe(1);
    expect((await inbox({ from: '2026-09-01', to: '2026-09-30' })).total).toBe(2);
  });

  it('phan trang co bien, va `total` van la tong cua ca bo loc', async () => {
    for (const day of ['2026-09-01', '2026-09-02', '2026-09-03']) {
      await submitSlip({ businessDate: day });
    }

    const first = await inbox({ limit: 2, offset: 0 });
    const second = await inbox({ limit: 2, offset: 2 });

    expect(first.rows).toHaveLength(2);
    expect(second.rows).toHaveLength(1);
    expect(first.total).toBe(3);
    expect(second.total).toBe(3);
    // Khong dong nao bi tra hai lan.
    expect(new Set([...first.rows, ...second.rows].map((row) => row.id)).size).toBe(3);
  });

  it('bo loc go hong roi ve MAC DINH, khong thanh mot trang loi', () => {
    const parsed = fuelEntryInboxQuerySchema.parse({
      verification: 'KHONG-PHAI-TRANG-THAI',
      from: 'hom-qua',
      limit: 'nhieu-vao',
      offset: '-5',
    });

    expect(parsed.verification).toBeNull();
    expect(parsed.from).toBeNull();
    expect(parsed.limit).toBeGreaterThan(0);
    expect(parsed.offset).toBe(0);
  });

  it('`limit` do client dat bi chan tren — mot trang khong bao gio la ca bang', () => {
    expect(fuelEntryInboxQuerySchema.parse({ limit: 100_000 }).limit).toBe(FUEL_INBOX_MAX_LIMIT);
  });
});

describe('#222 P1-B — thu tu "viec truoc" la mot HOP DONG voi luoc do', () => {
  /**
   * Ca hai kho sap xep theo `verificationStatus` TANG DAN, va viec do chi dung khi `DECLARED` la
   * gia tri DAU TIEN cua enum Postgres. Do la mot su that nam trong `schema.prisma`, khong nam
   * trong ma nguon TypeScript — nen bai nay doc chinh tep do.
   *
   * Neu ai do sap xep lai enum, bai nay do TRUOC khi hop thu lang le dao thu tu tren man hinh cua
   * ke toan.
   */
  it('`DECLARED` la gia tri dau tien cua enum trong `schema.prisma`', () => {
    const schema = readFileSync(
      fileURLToPath(new URL('../../../prisma/schema.prisma', import.meta.url)),
      'utf8',
    );
    const block = /enum TransportFuelVerificationStatus \{([^}]*)\}/.exec(schema)?.[1] ?? '';
    const values = block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('/'));

    expect(values[0]).toBe('DECLARED');
    // Va bo gia tri cua luoc do khop bo cua mien — khong hon, khong kem.
    expect([...values].sort()).toEqual([...FUEL_VERIFICATION_STATUSES].sort());
  });
});

/* ================================================================== *
 * P1-C — GO MOT CHUNG TU TAI NHAM
 * ================================================================== */

describe('#222 P1-C — cong vong doi cua mot lan go', () => {
  const cases: readonly {
    readonly verification: FuelVerificationStatus;
    readonly reconciliation: FuelReconciliationStatus;
    readonly allowed: boolean;
  }[] = [
    { verification: 'DECLARED', reconciliation: 'UNMATCHED', allowed: true },
    // Bi tra lai roi van go duoc: do la ca diem cua viec chup lai va nop lai.
    { verification: 'REJECTED', reconciliation: 'UNMATCHED', allowed: true },
    { verification: 'DECLARED', reconciliation: 'MISMATCHED', allowed: true },
    { verification: 'VERIFIED', reconciliation: 'UNMATCHED', allowed: false },
    { verification: 'DECLARED', reconciliation: 'MATCHED', allowed: false },
    { verification: 'DECLARED', reconciliation: 'SETTLED', allowed: false },
  ];

  for (const item of cases) {
    const label = `${item.verification} + ${item.reconciliation}`;
    it(`${label} -> ${item.allowed ? 'go duoc' : 'tu choi'}`, () => {
      expect(evaluateFuelEvidenceRemoval(item.verification, item.reconciliation).allowed).toBe(
        item.allowed,
      );
    });
  }

  it('hai duong tu choi mang HAI ma khac nhau — nguoi dung phai lam hai viec khac nhau', () => {
    const trusted = evaluateFuelEvidenceRemoval('VERIFIED', 'UNMATCHED');
    const locked = evaluateFuelEvidenceRemoval('DECLARED', 'SETTLED');

    expect(trusted.allowed).toBe(false);
    expect(locked.allowed).toBe(false);
    expect(trusted.allowed === false && trusted.reason).toBe('EVIDENCE_ENTRY_ALREADY_TRUSTED');
    expect(locked.allowed === false && locked.reason).toBe('EVIDENCE_ENTRY_RECONCILIATION_LOCKED');
  });
});

describe('#222 P1-C — go that, tren duong nghiep vu', () => {
  it('chung tu bien mat khoi danh sach hieu luc, nhung HANG va DAU VET o lai', async () => {
    const entry = await submitSlip();
    const evidence = await attach(entry.id, 'media/transport-evidence/2026/09/tai-nham.pdf');
    expect(await repository.listEvidence(entry.id)).toHaveLength(1);

    const withdrawn = await service.withdrawEvidence(entry.id, evidence.id, 'lx.binh');

    expect(withdrawn.withdrawnAt).not.toBeNull();
    expect(withdrawn.withdrawnBy).toBe('lx.binh');
    // Danh sach hieu luc rong...
    expect(await repository.listEvidence(entry.id)).toHaveLength(0);
    // ...nhung dinh vi van con o hang da bia mo, de con don duoc object neu lan xoa byte hong.
    expect(withdrawn.locator).toBe('media/transport-evidence/2026/09/tai-nham.pdf');
  });

  it('go lan hai la MOT MA RIENG, khong phai "khong tim thay"', async () => {
    const entry = await submitSlip();
    const evidence = await attach(entry.id, 'media/transport-evidence/2026/09/a.pdf');
    await service.withdrawEvidence(entry.id, evidence.id, 'lx.binh');

    await expect(service.withdrawEvidence(entry.id, evidence.id, 'lx.binh')).rejects.toMatchObject({
      reason: 'FUEL_EVIDENCE_ALREADY_WITHDRAWN',
    });
  });

  it('SAU KHI DUYET thi may chu tu choi, ke ca khi goi thang', async () => {
    const entry = await submitSlip();
    const evidence = await attach(entry.id, 'media/transport-evidence/2026/09/b.pdf');
    await service.verifyFuelEntry(entry.id, 'ke-toan');

    await expect(service.withdrawEvidence(entry.id, evidence.id, 'lx.binh')).rejects.toMatchObject({
      reason: 'FUEL_EVIDENCE_ENTRY_ALREADY_TRUSTED',
    });

    // Va chung tu VAN CON — mot lan tu choi khong duoc de lai hau qua nao.
    expect(await repository.listEvidence(entry.id)).toHaveLength(1);
  });

  it('bang chung cua PHIEU KHAC khong go duoc bang cach doi id tren duong dan', async () => {
    const mine = await submitSlip({ driverId: DRIVER });
    const theirs = await submitSlip({ driverId: OTHER_DRIVER });
    const theirEvidence = await attach(theirs.id, 'media/transport-evidence/2026/09/cua-ho.pdf');

    await expect(
      service.withdrawEvidence(mine.id, theirEvidence.id, 'lx.binh'),
    ).rejects.toMatchObject({ reason: 'FUEL_EVIDENCE_NOT_FOUND' });

    expect(await repository.listEvidence(theirs.id)).toHaveLength(1);
  });

  it('mot phieu khong ton tai tra ve loi cua mien, khong mot ngoai le tho', async () => {
    await expect(
      service.withdrawEvidence('khong-co-phieu', 'khong-co-bang-chung', 'lx.binh'),
    ).rejects.toBeInstanceOf(TransportDomainError);
  });
});

describe('#222 P1-C — pham vi CUA CHINH TOI chan tu buoc doc, truoc moi phep tim', () => {
  /**
   * Day la doi ban doi cua acceptance 10: *"Driver A cannot remove/read Driver B evidence"*.
   *
   * Cong that nam o `getMyFuelSlip`, va controller goi no TRUOC khi cham vao bang chung. Nen bai
   * nay do dung cai cong do: mot lai xe hoi phieu cua dong nghiep nhan `SELF_FUEL_SCOPE_NOT_OWNED`,
   * KHONG phai mot ban rut gon va cung khong phai mot 404 mo ho.
   */
  it('lai xe khac nhan 403 CO MA, khong phai mot ban rut gon', async () => {
    const theirs = await submitSlip({ driverId: OTHER_DRIVER });

    await expect(read.getMyFuelSlip('user-binh', theirs.id)).rejects.toMatchObject({
      reason: 'SELF_FUEL_SCOPE_NOT_OWNED',
    });
  });

  it('chinh chu doc duoc phieu cua minh', async () => {
    const mine = await submitSlip({ driverId: DRIVER });
    const view = await read.getMyFuelSlip('user-binh', mine.id);
    expect(view.id).toBe(mine.id);
  });

  it('khung nhin cua lai xe khong mang dinh vi kho anh', async () => {
    const mine = await submitSlip({ driverId: DRIVER });
    await attach(mine.id, 'media/transport-evidence/2026/09/cua-toi.pdf');

    const view = await read.getMyFuelSlip('user-binh', mine.id);

    expect(view.evidence).toHaveLength(1);
    expect(JSON.stringify(view)).not.toContain('media/transport-evidence');
  });

  it('sau khi go, phieu cua chinh chu khong con dem tam anh do', async () => {
    const mine = await submitSlip({ driverId: DRIVER });
    const evidence = await attach(mine.id, 'media/transport-evidence/2026/09/go-di.pdf');

    await service.withdrawEvidence(mine.id, evidence.id, 'lx.binh');

    const view = await read.getMyFuelSlip('user-binh', mine.id);
    expect(view.evidenceCount).toBe(0);
    expect(view.evidence).toHaveLength(0);
  });
});
