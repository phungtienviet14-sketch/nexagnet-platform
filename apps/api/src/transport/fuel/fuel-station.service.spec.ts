import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryAuditLogRepository } from '../../audit/audit-log.repository.js';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { TransportDomainError } from '../transport.errors.js';
import { InMemoryFuelStationRepository } from './fuel-station.repository.js';
import { FuelStationService } from './fuel-station.service.js';
import { InMemoryFuelRepository } from './in-memory-fuel.repository.js';

/**
 * `ST-001`..`ST-023` — danh tinh cay xang (Lane C / C1, Issue #236).
 *
 * Bo test nay do dung mot cau: he thong co the noi "to chung tu nay la cua tram X" MOT CACH TAT
 * DINH khong, va khi khong the thi no co noi ro VI SAO khong.
 */

const ACTOR = 'nguoi-van-hanh';

const HERE = dirname(fileURLToPath(import.meta.url));

const reasonOf = async (run: Promise<unknown>): Promise<string> => {
  try {
    await run;
  } catch (error) {
    if (error instanceof TransportDomainError) return error.reason;
    throw error;
  }
  throw new Error('lenh nay dang le phai bi tu choi');
};

describe('FuelStationService — danh tinh cay xang', () => {
  let fuel: InMemoryFuelRepository;
  let service: FuelStationService;
  let supplierId: string;

  beforeEach(async () => {
    fuel = new InMemoryFuelRepository();
    service = new FuelStationService(
      new InMemoryFuelStationRepository(),
      fuel,
      new AuditLogService(new InMemoryAuditLogRepository()),
    );
    const supplier = await fuel.createSupplier({
      name: 'Cong ty xang dau mien Bac',
      code: 'NCC-01',
      phone: null,
      address: null,
      taxCode: null,
      at: new Date('2026-09-01T00:00:00.000Z'),
    });
    supplierId = supplier.id;
  });

  it('ST-001 — tao tram sinh ra khoa so khop tu ten va ma', async () => {
    const station = await service.createStation(
      { supplierId, name: 'Cửa hàng xăng dầu số 5', code: 'ch-05' },
      ACTOR,
    );

    expect(station.name).toBe('Cửa hàng xăng dầu số 5');
    expect(station.nameNormalized).toBe('CUA HANG XANG DAU SO 5');
    // `code` giu NGUYEN BAN, `codeNormalized` la khoa — hai cot, hai viec.
    expect(station.code).toBe('ch-05');
    expect(station.codeNormalized).toBe('CH05');
    expect(station.status).toBe('ACTIVE');
  });

  it('ST-002 — ma da chuan hoa trung nhau trong cung nha cung cap bi tu choi', async () => {
    await service.createStation({ supplierId, name: 'Tram A', code: 'CH-05' }, ACTOR);
    const reason = await reasonOf(
      service.createStation({ supplierId, name: 'Tram B', code: 'ch05' }, ACTOR),
    );
    expect(reason).toBe('FUEL_STATION_CODE_TAKEN');
  });

  it('ST-003 — cung mot ma o NHA CUNG CAP KHAC thi duoc, vi ma chi duy nhat trong mot chuoi', async () => {
    const other = await fuel.createSupplier({
      name: 'Cong ty xang dau mien Trung',
      code: 'NCC-02',
      phone: null,
      address: null,
      taxCode: null,
      at: new Date('2026-09-01T00:00:00.000Z'),
    });
    await service.createStation({ supplierId, name: 'Tram A', code: 'CH-05' }, ACTOR);
    const twin = await service.createStation(
      { supplierId: other.id, name: 'Tram B', code: 'CH-05' },
      ACTOR,
    );
    expect(twin.codeNormalized).toBe('CH05');
  });

  it('ST-004 — tram khong duoc phep mo coi: nha cung cap phai co that', async () => {
    const reason = await reasonOf(
      service.createStation({ supplierId: 'khong-co-that', name: 'Tram A' }, ACTOR),
    );
    expect(reason).toBe('FUEL_SUPPLIER_NOT_FOUND');
  });

  it('ST-005 — ten chuan hoa ra rong bi tu choi, vi khoa so khop rong khop voi moi thu', async () => {
    const reason = await reasonOf(service.createStation({ supplierId, name: ' --- ' }, ACTOR));
    expect(reason).toBe('FUEL_STATION_NAME_INVALID');
  });

  it('ST-006 — doi ten thi khoa so khop doi theo, khong de lai khoa cu', async () => {
    const station = await service.createStation({ supplierId, name: 'Tram cu' }, ACTOR);
    const renamed = await service.updateStation(station.id, { name: 'Trạm Đồng Đăng' }, ACTOR);
    expect(renamed.nameNormalized).toBe('TRAM DONG DANG');
  });

  /**
   * Duong hong hay gap nhat cua mot bieu mau sua: gui MOT nua toa do. Neu chi kiem ban va thi hang
   * con lai mot nua toa do — no tra loi "co toa do" cho moi phep kiem `IS NOT NULL` nhung khong dat
   * len ban do duoc, va phep kiem geofence cua C4 se im lang bo qua no.
   */
  it('ST-007 — xoa mot nua toa do bi tu choi tren trang thai DA GOP', async () => {
    const station = await service.createStation(
      { supplierId, name: 'Tram co toa do', latitudeE7: 210283000, longitudeE7: 1058541000 },
      ACTOR,
    );
    const reason = await reasonOf(service.updateStation(station.id, { latitudeE7: null }, ACTOR));
    expect(reason).toBe('FUEL_STATION_COORDINATES_INCOMPLETE');
  });

  it('ST-008 — ban kinh khong co tam thi bi tu choi', async () => {
    const reason = await reasonOf(
      service.createStation({ supplierId, name: 'Tram khong toa do', geofenceRadiusM: 200 }, ACTOR),
    );
    expect(reason).toBe('FUEL_STATION_GEOFENCE_WITHOUT_COORDINATES');
  });

  it('ST-009 — tram ngung hoat dong van doc duoc, khong bien mat', async () => {
    const station = await service.createStation({ supplierId, name: 'Tram da dong' }, ACTOR);
    await service.updateStation(station.id, { status: 'INACTIVE' }, ACTOR);

    const detail = await service.stationDetail(station.id);
    expect(detail.station.status).toBe('INACTIVE');
    expect(await service.listStations(supplierId)).toHaveLength(1);
  });

  it('ST-010 — bi danh sinh khoa chuan hoa va giu nguyen ban nguoi nhap', async () => {
    const station = await service.createStation({ supplierId, name: 'Tram A' }, ACTOR);
    const alias = await service.addAlias(station.id, 'CHXD số 5 — Hà Nội', ACTOR);

    expect(alias.normalized).toBe('CHXD SO 5 HA NOI');
    expect(alias.raw).toBe('CHXD số 5 — Hà Nội');
  });

  it('ST-011 — bi danh da tro toi tram khac thi bi tu choi, khong ghi de', async () => {
    const first = await service.createStation({ supplierId, name: 'Tram A' }, ACTOR);
    const second = await service.createStation({ supplierId, name: 'Tram B' }, ACTOR);
    await service.addAlias(first.id, 'CHXD SO 5', ACTOR);

    const reason = await reasonOf(service.addAlias(second.id, 'chxd so 5', ACTOR));
    expect(reason).toBe('FUEL_STATION_ALIAS_TAKEN');

    // Va hang cu VAN tro toi tram dau — tu choi nghia la khong dong gi ca.
    expect(await service.stationDetail(first.id)).toMatchObject({
      aliases: [{ normalized: 'CHXD SO 5' }],
    });
  });

  it('ST-012 — dat lai dung bi danh do tren dung tram do khong ghi hang thu hai', async () => {
    const station = await service.createStation({ supplierId, name: 'Tram A' }, ACTOR);
    const first = await service.addAlias(station.id, 'CHXD SO 5', ACTOR);
    const again = await service.addAlias(station.id, 'chxd  so 5', ACTOR);

    expect(again.id).toBe(first.id);
    expect((await service.stationDetail(station.id)).aliases).toHaveLength(1);
  });

  it('ST-013 — bi danh chuan hoa ra rong bi tu choi', async () => {
    const station = await service.createStation({ supplierId, name: 'Tram A' }, ACTOR);
    const reason = await reasonOf(service.addAlias(station.id, '  ---  ', ACTOR));
    expect(reason).toBe('FUEL_STATION_ALIAS_INVALID');
  });

  it('ST-014 — go bi danh la idempotent, goi lai khong nem', async () => {
    const station = await service.createStation({ supplierId, name: 'Tram A' }, ACTOR);
    const alias = await service.addAlias(station.id, 'CHXD SO 5', ACTOR);

    expect(await service.removeAlias(station.id, alias.id, ACTOR)).toBe(true);
    expect(await service.removeAlias(station.id, alias.id, ACTOR)).toBe(false);
  });
});

describe('FuelStationService — nhan dang qua kho co chi so', () => {
  let service: FuelStationService;
  let supplierId: string;

  beforeEach(async () => {
    const fuel = new InMemoryFuelRepository();
    service = new FuelStationService(
      new InMemoryFuelStationRepository(),
      fuel,
      new AuditLogService(new InMemoryAuditLogRepository()),
    );
    const supplier = await fuel.createSupplier({
      name: 'Cong ty xang dau mien Bac',
      code: null,
      phone: null,
      address: null,
      taxCode: null,
      at: new Date('2026-09-01T00:00:00.000Z'),
    });
    supplierId = supplier.id;
  });

  it('ST-015 — bi danh dan toi dung tram, ke ca khi ten tram khac han', async () => {
    const station = await service.createStation(
      { supplierId, name: 'Cua hang xang dau so 5 Long Bien' },
      ACTOR,
    );
    await service.addAlias(station.id, 'CHXD 5 LB', ACTOR);

    expect(await service.resolveStation({ supplierId, label: 'chxd 5 lb' })).toEqual({
      outcome: 'RESOLVED',
      stationId: station.id,
      via: 'ALIAS',
      status: 'ACTIVE',
    });
  });

  it('ST-016 — chung tu co du kien nhung khong tram nao khop ra `NO_MATCH`', async () => {
    await service.createStation({ supplierId, name: 'Tram A' }, ACTOR);
    expect(await service.resolveStation({ supplierId, label: 'Tram khong co that' })).toEqual({
      outcome: 'NO_MATCH',
    });
  });

  it('ST-017 — chung tu khong noi gi ve tram ra `NO_INPUT`, khac han `NO_MATCH`', async () => {
    expect(await service.resolveStation({ supplierId })).toEqual({ outcome: 'NO_INPUT' });
  });

  it('ST-018 — hai tram cung ten trong mot chuoi ra `AMBIGUOUS`, khong chon bua', async () => {
    const first = await service.createStation({ supplierId, name: 'Cua hang so 5' }, ACTOR);
    const second = await service.createStation({ supplierId, name: 'Cửa hàng số 5' }, ACTOR);

    const resolution = await service.resolveStation({ supplierId, label: 'CUA HANG SO 5' });
    expect(resolution.outcome).toBe('AMBIGUOUS');
    expect(resolution).toMatchObject({ candidateIds: [first.id, second.id].sort() });
  });
});

describe('FuelStationService — sieu du lieu hop dong', () => {
  let service: FuelStationService;
  let supplierId: string;

  beforeEach(async () => {
    const fuel = new InMemoryFuelRepository();
    service = new FuelStationService(
      new InMemoryFuelStationRepository(),
      fuel,
      new AuditLogService(new InMemoryAuditLogRepository()),
    );
    const supplier = await fuel.createSupplier({
      name: 'Cong ty xang dau mien Bac',
      code: null,
      phone: null,
      address: null,
      taxCode: null,
      at: new Date('2026-09-01T00:00:00.000Z'),
    });
    supplierId = supplier.id;
  });

  it('ST-019 — nha cung cap moi khong mang mot dieu khoan mac dinh nao', async () => {
    const profile = await service.supplierProfile(supplierId);
    expect(profile.paymentTermDays).toBeNull();
    expect(profile.contractNo).toBeNull();
    // Mang RONG chu khong `null`: "chua ai khai nguon nao", va giao dien `.map()` duoc ngay.
    expect(profile.ingestChannels).toEqual([]);
  });

  it('ST-020 — ghi va doc lai duoc CA HAI nguon du lieu, `Q-08` khong phai chon mot', async () => {
    const saved = await service.updateSupplierProfile(
      supplierId,
      {
        contactName: 'Nguoi phu trach cong no',
        contractNo: 'HD-2026-07',
        contractStartDate: '2026-01-01',
        contractEndDate: '2026-12-31',
        paymentTermDays: 30,
        ingestChannels: ['STATEMENT_FILE', 'EINVOICE'],
        ingestAccountRef: 'TK-000123',
      },
      ACTOR,
    );

    expect(saved.ingestChannels).toEqual(['STATEMENT_FILE', 'EINVOICE']);
    expect(saved.paymentTermDays).toBe(30);
    expect((await service.supplierProfile(supplierId)).contractNo).toBe('HD-2026-07');
  });

  it('ST-021 — ngay bat dau sau ngay ket thuc bi tu choi', async () => {
    const reason = await reasonOf(
      service.updateSupplierProfile(
        supplierId,
        { contractStartDate: '2026-12-31', contractEndDate: '2026-01-01' },
        ACTOR,
      ),
    );
    expect(reason).toBe('FUEL_PERIOD_RANGE_INVALID');
  });

  /**
   * `CHECK` cua Postgres chi kiem KHUON `^[0-9]{4}-[0-9]{2}-[0-9]{2}$`, nen `2026-02-30` lot qua
   * no. Cong that su nam o `assertBusinessDate` — va bai nay khoa soi day do lai.
   */
  it('ST-022 — mot ngay dung khuon nhung khong co that van bi tu choi', async () => {
    const reason = await reasonOf(
      service.updateSupplierProfile(supplierId, { contractStartDate: '2026-02-30' }, ACTOR),
    );
    expect(reason).toBe('BUSINESS_DATE_INVALID');
  });
});

/**
 * `ST-023` — SIEU DU LIEU HOP DONG KHONG DUOC PHEP DIEU KHIEN MOT DONG TIEN NAO.
 *
 * ===========================================================================
 * VI SAO BAI NAY DOC MA NGUON THAY VI GOI MOT HAM
 *
 * Cai can chan la mot lan sua TUONG LAI: sau sau thang, mot nguoi doc thay `paymentTermDays` nam
 * san trong bang va viet mot luat "qua han thi sinh cong no". Luat do se DUNG ve ky thuat va SAI
 * ve nghiep vu — `Q-08` (R0 §7) chua co loi, chua ai biet B mua dau qua hop dong cay xang hay qua
 * the/app, nen ky han thanh toan trong bang chi la thu nguoi ta ghi lai de DOC.
 *
 * Khong mot bai test hanh vi nao bat duoc lan sua do truoc khi no xay ra. Mot bai doc ma nguon thi
 * co: ngay khi mot ten cot duoi day xuat hien trong mot tep tinh tien, bai nay do — va nguoi viet
 * phai doc khoi chu thich nay truoc khi di tiep.
 */
describe('ST-023 — khong duong tinh tien nao doc sieu du lieu hop dong', () => {
  const CONTRACT_COLUMNS = [
    'paymentTermDays',
    'contractStartDate',
    'contractEndDate',
    'contractNo',
    'termsNote',
    'ingestChannels',
    'ingestAccountRef',
  ] as const;

  /** Nhung tep QUYET DINH mot con so tien cua T3/T4 — noi cac cot tren tuyet doi khong duoc co mat. */
  const moneyPaths = (): string[] => {
    const costingDir = resolve(HERE, '../costing');
    const costing = readdirSync(costingDir)
      .filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'))
      .map((name) => join(costingDir, name));
    return [
      join(HERE, 'fuel-settlement.ts'),
      join(HERE, 'fuel-reconciliation.service.ts'),
      join(HERE, 'fuel-matching.ts'),
      join(HERE, 'fuel.service.ts'),
      join(HERE, 'fuel.ports.ts'),
      ...costing,
    ];
  };

  it.each(moneyPaths())('%s khong nhac mot cot sieu du lieu hop dong nao', (path) => {
    const source = readFileSync(path, 'utf8');
    const mentioned = CONTRACT_COLUMNS.filter((column) => source.includes(column));
    expect(mentioned).toEqual([]);
  });
});
