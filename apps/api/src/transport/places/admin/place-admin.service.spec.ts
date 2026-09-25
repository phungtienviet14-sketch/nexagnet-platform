import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryAuditLogRepository } from '../../../audit/audit-log.repository.js';
import { AuditLogService } from '../../../audit/audit-log.service.js';
import type { TelemetryService } from '../../../observability/telemetry.service.js';
import { InMemoryCounterpartyRepository } from '../../counterparty/counterparty.repository.js';
import { InMemoryCounterpartySiteRepository } from '../../counterparty/site.repository.js';
import { InMemoryFleetRepository } from '../../fleet/fleet.repository.js';
import {
  ConfigDepotDirectory,
  DepotDirectoryHub,
} from '../../planning/depot-directory.js';
import type { DepotOpenWork, DepotOpenWorkReader } from '../../planning/depot-open-work.js';
import { resolveDepotFrom } from '../../planning/planning-policy.js';
import type { TransportPlanningPolicy } from '../../planning/planning.types.js';
import {
  InMemoryGeofenceRepository,
  RepositoryGeofenceOwnerLookup,
} from '../../proof/geofence.repository.js';
import { InMemoryPlaceWriteStore, placeStorageConflict } from '../../proof/place-write.store.js';
import { DEFAULT_TRANSPORT_PROOF_POLICY } from '../../proof/tracking-policy.js';
import { TransportDomainError } from '../../transport.errors.js';
import { PlaceAdminError } from './place-admin-error.js';
import { PlaceAdminService, nextDepotCode } from './place-admin.service.js';
import type { CreatePlaceCommand, PlaceWriteCaller } from './place-admin.types.js';
import { GeofenceDepotDirectory } from './place-registrations.js';

/**
 * MAN "DIA DIEM VAN HANH" — moi luat cua `PlaceAdminService` tren kho TRONG BO NHO (`#395`).
 *
 * Kho trong bo nho cuong che CUNG hai chi muc bai xe voi Postgres va nem cung hinh dang `P2002`,
 * nen duong dich va cham ra ly do co kieu cung duoc kiem o day. Bai tren Postgres that (khoa,
 * giao dich, hai lan tao song song) nam o `place-admin.int.spec.ts`.
 */

const DIRECTOR: PlaceWriteCaller = { actor: 'giam-doc', canManageCounterparties: true };
/** Nguoi CHI co quyen hang rao (vd Dieu hanh duoc cap rieng `transport.geofence.manage`). */
const FENCE_ONLY: PlaceWriteCaller = { actor: 'dieu-hanh', canManageCounterparties: false };

const HA_NOI = { latitude: 20.9652, longitude: 105.8468 };
const DINH_VU = { latitude: 20.8264, longitude: 106.7752 };
const PARIS = { latitude: 48.8566, longitude: 2.3522 };

const NO_CONFIG: TransportPlanningPolicy = {
  grouping: 'ONE_ORDER_PER_RUN',
  depots: [],
  closure: { idleHours: 12 },
  sweep: { intervalSeconds: 60, batchSize: 50 },
};

const NO_WORK: DepotOpenWork = { runs: [], orders: [], idleHours: 12 };

function world() {
  const counterparties = new InMemoryCounterpartyRepository();
  const sites = new InMemoryCounterpartySiteRepository();
  const fleet = new InMemoryFleetRepository();
  const geofences = new InMemoryGeofenceRepository(
    new RepositoryGeofenceOwnerLookup(sites, counterparties, fleet),
  );
  const store = new InMemoryPlaceWriteStore({ geofences, sites, counterparties, customers: fleet });
  const depots = new DepotDirectoryHub(NO_CONFIG);
  depots.register(new GeofenceDepotDirectory(geofences, new ConfigDepotDirectory(NO_CONFIG)));
  const openWork = { openWorkAt: vi.fn(async (): Promise<DepotOpenWork> => NO_WORK) };
  const auditRows = new InMemoryAuditLogRepository();
  const decisions: { reason: string; outcome: string; detail: Record<string, unknown> }[] = [];
  const steps: string[] = [];
  const telemetry = {
    step: async (name: string, run: () => Promise<unknown>) => {
      steps.push(name);
      return run();
    },
    decision: (input: { reason: string; outcome: string; detail: Record<string, unknown> }) =>
      decisions.push(input),
  } as unknown as TelemetryService;
  const service = new PlaceAdminService(
    store,
    geofences,
    sites,
    counterparties,
    fleet,
    depots,
    openWork as unknown as DepotOpenWorkReader,
    DEFAULT_TRANSPORT_PROOF_POLICY,
    new AuditLogService(auditRows),
    telemetry,
  );
  const audit = (action?: string) =>
    auditRows.list({ ...(action === undefined ? {} : { action }), limit: 200 });
  return { service, geofences, sites, counterparties, fleet, depots, openWork, audit, decisions, steps };
}

type World = ReturnType<typeof world>;

const depot = (name: string, over: Partial<CreatePlaceCommand> = {}): CreatePlaceCommand => ({
  kind: 'DEPOT',
  name,
  point: HA_NOI,
  radiusMetres: 250,
  ...over,
});

const site = (name: string, over: Partial<CreatePlaceCommand> = {}): CreatePlaceCommand => ({
  kind: 'COUNTERPARTY_SITE',
  name,
  point: DINH_VU,
  radiusMetres: 300,
  ...over,
});

const reasonOf = async (run: () => Promise<unknown>): Promise<string> => {
  try {
    await run();
  } catch (error) {
    if (error instanceof TransportDomainError) return error.reason;
    throw error;
  }
  return 'KHONG BI TU CHOI';
};

const errorOf = async (run: () => Promise<unknown>): Promise<PlaceAdminError> => {
  try {
    await run();
  } catch (error) {
    if (error instanceof PlaceAdminError) return error;
    throw error;
  }
  throw new Error('khong nem loi nao');
};

describe('tao bai xe (#395)', () => {
  let w: World;
  beforeEach(() => {
    w = world();
  });

  it('bai dau tien: dang bat, ma do may chu sinh, khau lap ke hoach DANG DUNG', async () => {
    const view = await w.service.create(depot('Bãi xe Hà Nội', { address: 'Thanh Trì, Hà Nội' }), DIRECTOR);

    expect(view).toMatchObject({
      kind: 'DEPOT',
      displayKind: 'DEPOT',
      kindLabel: 'Bãi xe',
      name: 'Bãi xe Hà Nội',
      status: 'ACTIVE',
      effectiveStatus: 'ACTIVE',
      address: 'Thanh Trì, Hà Nội',
      depot: { code: 'DEPOT-BAI-XE-HA-NOI', plannerStatus: 'IN_USE', source: 'MANAGED' },
      owner: null,
      conflicts: [],
    });
    expect(resolveDepotFrom(await w.depots.list())).toMatchObject({
      kind: 'RESOLVED',
      depot: { label: 'Bãi xe Hà Nội' },
    });
    expect(w.steps).toEqual(['place.write']);
    expect(w.decisions.map((entry) => entry.reason)).toEqual(['PLACE_WRITE_ALLOWED']);
  });

  it('da co bai dang bat -> bai moi la bai DU PHONG (tat)', async () => {
    await w.service.create(depot('Bãi xe Hà Nội'), DIRECTOR);

    const standby = await w.service.create(depot('Bãi xe Gia Lâm'), DIRECTOR);

    expect(standby).toMatchObject({
      status: 'INACTIVE',
      depot: { plannerStatus: 'STANDBY', source: 'MANAGED' },
    });
  });

  /** Dau vet song sot qua che du lieu: KHONG khoa `address` tho, CO `addressChanged`. */
  it('dau vet transport.place.create giu nhan, toa do, ban kinh; khong dia chi tho', async () => {
    const view = await w.service.create(depot('Bãi xe Hà Nội', { address: 'Thanh Trì' }), DIRECTOR);

    const [row] = await w.audit('transport.place.create');
    expect(row).toMatchObject({ entityType: 'TransportGeofence', entityId: view.id, before: null });
    expect(row?.after).toMatchObject({
      label: 'Bãi xe Hà Nội',
      kind: 'DEPOT',
      code: 'DEPOT-BAI-XE-HA-NOI',
      point: HA_NOI,
      radiusMetres: 250,
      status: 'ACTIVE',
      addressChanged: true,
    });
    expect(JSON.stringify(row?.after)).not.toContain('Thanh Trì');
  });

  it('bai xe kem chu -> PLACE_OWNER_INVALID', async () => {
    expect(
      await reasonOf(() =>
        w.service.create(depot('Bãi A', { owner: { counterpartyId: 'x' } }), DIRECTOR),
      ),
    ).toBe('PLACE_OWNER_INVALID');
  });

  it('ma bai: chu khong dau, trung thi them hau to — ke ca voi bai da tat', () => {
    expect(nextDepotCode('Bãi xe Hà Nội', [])).toBe('DEPOT-BAI-XE-HA-NOI');
    expect(nextDepotCode('Bãi xe Hà Nội', ['DEPOT-BAI-XE-HA-NOI', 'DEPOT-BAI-XE-HA-NOI-2'])).toBe(
      'DEPOT-BAI-XE-HA-NOI-3',
    );
    expect(nextDepotCode('!!!', [])).toBe('DEPOT-BAI');
  });
});

describe('luat dau vao chung (#395)', () => {
  let w: World;
  beforeEach(() => {
    w = world();
  });

  it('ngoai vung phuc vu -> PLACE_OUTSIDE_SERVICE_AREA (co ghi quyet dinh)', async () => {
    expect(await reasonOf(() => w.service.create(depot('Bãi Paris', { point: PARIS }), DIRECTOR))).toBe(
      'PLACE_OUTSIDE_SERVICE_AREA',
    );
    expect(w.decisions).toContainEqual(
      expect.objectContaining({ outcome: 'denied', reason: 'PLACE_OUTSIDE_SERVICE_AREA' }),
    );
  });

  it('toa do hong (0,0) -> GEOFENCE_COORDINATE_REJECTED; ban kinh ngoai chinh sach -> tu choi', async () => {
    expect(
      await reasonOf(() =>
        w.service.create(depot('Bãi 0', { point: { latitude: 0, longitude: 0 } }), DIRECTOR),
      ),
    ).toBe('GEOFENCE_COORDINATE_REJECTED');
    expect(
      await reasonOf(() => w.service.create(depot('Bãi to', { radiusMetres: 5 }), DIRECTOR)),
    ).toBe('GEOFENCE_RADIUS_OUT_OF_RANGE');
  });

  it('dia diem cua don vi khac doi quyen quan ly phap nhan -> 403 co ma', async () => {
    const error = await errorOf(() =>
      w.service.create(site('Kho A', { owner: { newCounterparty: { name: 'Công ty A' } } }), FENCE_ONLY),
    );

    expect(error).toMatchObject({ kind: 'DENIED', reason: 'PLACE_SITE_REQUIRES_COUNTERPARTY_MANAGE' });
    // Bai xe KHONG can quyen do.
    expect((await w.service.create(depot('Bãi A'), FENCE_ONLY)).status).toBe('ACTIVE');
  });

  it('dia diem cua don vi khac khong noi chu -> PLACE_OWNER_REQUIRED', async () => {
    expect(await reasonOf(() => w.service.create(site('Kho A'), DIRECTOR))).toBe(
      'PLACE_OWNER_REQUIRED',
    );
  });
});

describe('trung ten (#395)', () => {
  let w: World;
  beforeEach(() => {
    w = world();
  });

  it('trung nhan bai xe sau chuan hoa -> PLACE_NAME_TAKEN, noi ro la cai gi', async () => {
    await w.service.create(depot('Bãi xe Hà Nội'), DIRECTOR);

    const error = await errorOf(() =>
      w.service.create(site('BAI XE  HA NOI', { owner: { newCounterparty: { name: 'Công ty B' } } }), DIRECTOR),
    );

    expect(error).toMatchObject({ kind: 'CONFLICT', reason: 'PLACE_NAME_TAKEN' });
    expect(error.detail).toEqual({ conflictName: 'Bãi xe Hà Nội', conflictKindLabel: 'Bãi xe' });
    expect(error.message).toContain('Bãi xe Hà Nội');
    // Tu choi TRUOC moi lan ghi: khong mot phap nhan / dia diem nao bi tao do dang.
    expect(await w.counterparties.list()).toEqual([]);
  });

  it('trung voi MOI loai hang rao con hieu luc (vd hang rao tam cu) va voi ten dia diem', async () => {
    await w.geofences.register({
      label: 'Điểm hẹn cũ',
      subjectKind: 'AD_HOC',
      subjectId: null,
      ...HA_NOI,
      radiusMetres: 100,
      note: null,
      recordedBy: 'test',
    });
    await w.service.create(site('Kho Đình Vũ', { owner: { newCounterparty: { name: 'Công ty C' } } }), DIRECTOR);

    expect(await reasonOf(() => w.service.create(depot('diem hen cu'), DIRECTOR))).toBe('PLACE_NAME_TAKEN');
    const error = await errorOf(() => w.service.create(depot('KHO DINH VU'), DIRECTOR));
    expect(error.detail).toEqual({
      conflictName: 'Kho Đình Vũ',
      conflictKindLabel: 'Nhà máy / kho đối tác',
      ownerName: 'Công ty C',
    });
  });

  it('dia diem da tat khong chiem ten', async () => {
    const first = await w.service.create(depot('Bãi A'), DIRECTOR);
    await w.service.deactivate(first.id, { reason: 'doi bai' }, DIRECTOR);

    const again = await w.service.create(depot('Bãi A'), DIRECTOR);

    expect(again.depot?.code).toBe('DEPOT-BAI-A-2');
  });

  /** Du lieu cu da trung ten: sua ban kinh van qua; man hinh hien va cham de nguoi dung tu sua. */
  it('sua khong dung ten van qua ke ca khi du lieu cu da trung ten', async () => {
    const base = { subjectKind: 'CUSTOMER' as const, ...HA_NOI, radiusMetres: 100, note: null, recordedBy: 'test' };
    const customer = await w.fleet.createCustomer({ name: 'Khách K' });
    const legacy = await w.geofences.register({ ...base, label: 'Kho K', subjectId: customer.id });
    await w.geofences.register({ ...base, label: 'KHO K', subjectId: customer.id });

    const view = await w.service.update(legacy.id, { radiusMetres: 150 }, DIRECTOR);

    expect(view).toMatchObject({ radiusMetres: 150, conflicts: ['KHO K'], kindLabel: 'Điểm khách hàng (kiểu cũ)' });
    expect(await reasonOf(() => w.service.update(legacy.id, { name: 'kho k ' }, DIRECTOR))).toBe(
      'PLACE_NAME_TAKEN',
    );
  });

  /** Hai lan tao cung ten CUNG LUC: khoa xep hang, dung MOT lan thang. */
  it('hai lan tao cung ten song song -> dung mot PLACE_NAME_TAKEN', async () => {
    const results = await Promise.allSettled([
      w.service.create(depot('Bãi Song Song'), DIRECTOR),
      w.service.create(depot('Bai song song'), DIRECTOR),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect((rejected.reason as TransportDomainError).reason).toBe('PLACE_NAME_TAKEN');
  });
});

describe('chu cua dia diem: khach hang, don vi co san, don vi moi, dia diem co san (#395)', () => {
  let w: World;
  beforeEach(() => {
    w = world();
  });

  it('khach chua co phap nhan -> tao phap nhan + lien ket + dia diem + hang rao, MOT lan', async () => {
    const customer = await w.fleet.createCustomer({ name: 'Công ty CP Thép Đông Á', taxCode: '0200788341' });

    const view = await w.service.create(
      site('Nhà máy thép Đình Vũ', { owner: { customerId: customer.id }, address: 'KCN Đình Vũ' }),
      DIRECTOR,
    );

    expect(view).toMatchObject({
      kind: 'COUNTERPARTY_SITE',
      displayKind: 'CUSTOMER_SITE',
      kindLabel: 'Địa điểm khách hàng',
      owner: {
        counterpartyName: 'Công ty CP Thép Đông Á',
        customerId: customer.id,
        customerName: 'Công ty CP Thép Đông Á',
        siteName: 'Nhà máy thép Đình Vũ',
      },
    });
    const [party] = await w.counterparties.list();
    expect(party).toMatchObject({ name: 'Công ty CP Thép Đông Á', taxCode: '0200788341' });
    expect(await w.counterparties.findLinkBySubject('CUSTOMER', customer.id)).toMatchObject({
      counterpartyId: party?.id,
    });
    expect(await w.sites.listForCounterparty(party?.id ?? '')).toEqual([
      expect.objectContaining({ name: 'Nhà máy thép Đình Vũ', address: 'KCN Đình Vũ', status: 'ACTIVE' }),
    ]);
    expect((await w.audit()).map((row) => row.action).sort()).toEqual(
      [
        'transport.counterparty.create',
        'transport.counterparty.link',
        'transport.counterparty_site.create',
        'transport.place.create',
      ].sort(),
    );
  });

  it('khach da co phap nhan cung ma so thue -> noi vao phap nhan do, khong tao ban thu hai', async () => {
    const existing = await w.counterparties.create({ name: 'Thép Đông Á', taxCode: '0200788341' });
    const customer = await w.fleet.createCustomer({ name: 'Công ty CP Thép Đông Á', taxCode: '0200788341' });

    const view = await w.service.create(site('Kho thép', { owner: { customerId: customer.id } }), DIRECTOR);

    expect(view.owner?.counterpartyId).toBe(existing.id);
    expect(await w.counterparties.list()).toHaveLength(1);
  });

  it('khach da ngung hoat dong -> PLACE_OWNER_INACTIVE', async () => {
    const customer = await w.fleet.createCustomer({ name: 'Khách nghỉ', status: 'INACTIVE' });

    expect(
      await reasonOf(() => w.service.create(site('Kho X', { owner: { customerId: customer.id } }), DIRECTOR)),
    ).toBe('PLACE_OWNER_INACTIVE');
  });

  it('don vi moi: nha may / kho doi tac; ma so thue da co -> noi ro don vi nao', async () => {
    const view = await w.service.create(
      site('Nhà máy nhựa', { owner: { newCounterparty: { name: 'Công ty Nhựa', taxCode: '4600921537' } } }),
      DIRECTOR,
    );
    expect(view).toMatchObject({ displayKind: 'PARTNER_SITE', kindLabel: 'Nhà máy / kho đối tác' });

    const error = await errorOf(() =>
      w.service.create(
        site('Kho nhựa 2', { owner: { newCounterparty: { name: 'Nhựa khác', taxCode: '4600921537' } } }),
        DIRECTOR,
      ),
    );
    expect(error).toMatchObject({ reason: 'COUNTERPARTY_TAX_CODE_TAKEN' });
    expect(error.detail).toMatchObject({ counterpartyName: 'Công ty Nhựa' });
  });

  it('don vi co san da ngung hoat dong -> PLACE_OWNER_INACTIVE', async () => {
    const party = await w.counterparties.create({ name: 'Công ty nghỉ', status: 'INACTIVE' });

    expect(
      await reasonOf(() => w.service.create(site('Kho Y', { owner: { counterpartyId: party.id } }), DIRECTOR)),
    ).toBe('PLACE_OWNER_INACTIVE');
  });

  it('gan vi tri vao dia diem co san chua co hang rao: ten dia diem di theo', async () => {
    const party = await w.counterparties.create({ name: 'Công ty D' });
    const legacySite = await w.sites.create({
      counterpartyId: party.id,
      name: 'Kho cũ',
      address: null,
      note: null,
      status: 'ACTIVE',
      recordedBy: 'ke-toan',
    });

    const view = await w.service.create(site('Kho D Hải Phòng', { siteId: legacySite.id }), DIRECTOR);

    expect(view.owner).toMatchObject({ siteId: legacySite.id, siteName: 'Kho D Hải Phòng' });
    expect(await reasonOf(() => w.service.create(site('Kho D khác', { siteId: legacySite.id }), DIRECTOR))).toBe(
      'PLACE_SITE_ALREADY_FENCED',
    );
    const other = await w.counterparties.create({ name: 'Công ty E' });
    expect(
      await reasonOf(() =>
        w.service.create(site('Kho E', { siteId: legacySite.id, owner: { counterpartyId: other.id } }), DIRECTOR),
      ),
    ).toBe('PLACE_SITE_OWNER_MISMATCH');
  });
});

describe('sua, tat, bat, doi bai chinh (#395)', () => {
  let w: World;
  beforeEach(() => {
    w = world();
  });

  const openWork: DepotOpenWork = {
    runs: [{ id: 'run-1', code: 'VR-1' }],
    orders: [{ id: 'ord-1', code: 'ORD-1' }],
    idleHours: 12,
  };

  it('doi ten bai dang dung khi con viec mo -> DEPOT_CHANGE_AFFECTS_OPEN_WORK; xac nhan thi qua', async () => {
    const view = await w.service.create(depot('Bãi xe Hà Nội'), DIRECTOR);
    w.openWork.openWorkAt.mockResolvedValue(openWork);

    const error = await errorOf(() => w.service.update(view.id, { name: 'Bãi xe Thanh Trì' }, DIRECTOR));
    expect(error).toMatchObject({ kind: 'CONFLICT', reason: 'DEPOT_CHANGE_AFFECTS_OPEN_WORK' });
    expect(error.detail).toEqual({ runs: openWork.runs, orders: openWork.orders, idleHours: 12 });
    expect(w.openWork.openWorkAt).toHaveBeenCalledWith('Bãi xe Hà Nội');

    const renamed = await w.service.update(
      view.id,
      { name: 'Bãi xe Thanh Trì', acknowledgeOpenWork: true },
      DIRECTOR,
    );
    expect(renamed.name).toBe('Bãi xe Thanh Trì');
    expect(w.decisions.at(-1)?.reason).toBe('PLACE_WRITE_OPEN_WORK_ACKNOWLEDGED');
    const [row] = await w.audit('transport.place.update');
    expect(row?.after).toMatchObject({
      label: 'Bãi xe Thanh Trì',
      acknowledgedOpenWork: { runs: openWork.runs, orders: openWork.orders },
    });
  });

  it('sua bai du phong hay sua ban kinh: khong hoi viec dang mo', async () => {
    await w.service.create(depot('Bãi xe Hà Nội'), DIRECTOR);
    const standby = await w.service.create(depot('Bãi dự phòng'), DIRECTOR);
    w.openWork.openWorkAt.mockResolvedValue(openWork);

    await w.service.update(standby.id, { name: 'Bãi dự phòng 2' }, DIRECTOR);

    expect(w.openWork.openWorkAt).not.toHaveBeenCalled();
  });

  it('doi ten dia diem doi tac: ten dia diem di theo; thieu quyen phap nhan -> 403', async () => {
    const view = await w.service.create(
      site('Kho A', { owner: { newCounterparty: { name: 'Công ty A' } } }),
      DIRECTOR,
    );

    expect(await reasonOf(() => w.service.update(view.id, { name: 'Kho A2' }, FENCE_ONLY))).toBe(
      'PLACE_SITE_REQUIRES_COUNTERPARTY_MANAGE',
    );
    // Sua hinh hoc khong doi ten: quyen hang rao la du.
    await w.service.update(view.id, { radiusMetres: 400 }, FENCE_ONLY);

    const renamed = await w.service.update(view.id, { name: 'Kho A2', address: 'Số 1' }, DIRECTOR);
    expect(renamed.owner?.siteName).toBe('Kho A2');
    const [row] = await w.audit('transport.place.update');
    expect(row?.after).toMatchObject({ label: 'Kho A2', addressChanged: true });
    expect(JSON.stringify(row?.after)).not.toContain('Số 1');
  });

  it('tat dia diem doi tac: dia diem VA moi hang rao cua no tat; tat lan hai khong ghi gi', async () => {
    const view = await w.service.create(
      site('Kho A', { owner: { newCounterparty: { name: 'Công ty A' } } }),
      DIRECTOR,
    );
    const siteId = view.owner?.siteId ?? '';
    const gate = await w.geofences.register({
      label: 'Cổng kho A',
      subjectKind: 'COUNTERPARTY_SITE',
      subjectId: siteId,
      ...DINH_VU,
      radiusMetres: 50,
      note: null,
      recordedBy: 'test',
    });

    expect(await reasonOf(() => w.service.deactivate(view.id, { reason: 'x' }, FENCE_ONLY))).toBe(
      'PLACE_SITE_REQUIRES_COUNTERPARTY_MANAGE',
    );
    const off = await w.service.deactivate(view.id, { reason: 'ngừng hợp tác' }, DIRECTOR);

    expect(off).toMatchObject({ status: 'INACTIVE', effectiveStatus: 'INACTIVE' });
    expect((await w.geofences.find(gate.id))?.status).toBe('INACTIVE');
    expect((await w.sites.find(siteId))?.status).toBe('INACTIVE');
    const rows = await w.audit('transport.place.deactivate');
    expect(rows).toHaveLength(2);

    await w.service.deactivate(view.id, { reason: 'lại' }, DIRECTOR);
    expect(await w.audit('transport.place.deactivate')).toHaveLength(2);
  });

  it('tat bai dang dung: can xac nhan viec mo; sau do khau lap ke hoach NOT_CONFIGURED', async () => {
    const view = await w.service.create(depot('Bãi xe Hà Nội'), DIRECTOR);
    w.openWork.openWorkAt.mockResolvedValue(openWork);

    expect(await reasonOf(() => w.service.deactivate(view.id, { reason: 'x' }, DIRECTOR))).toBe(
      'DEPOT_CHANGE_AFFECTS_OPEN_WORK',
    );
    await w.service.deactivate(view.id, { reason: 'x', acknowledgeOpenWork: true }, DIRECTOR);

    expect(resolveDepotFrom(await w.depots.list())).toEqual({ kind: 'NOT_CONFIGURED' });
  });

  it('bat lai: bai khac dang bat -> DEPOT_ALREADY_ACTIVE; chu da nghi -> PLACE_OWNER_INACTIVE', async () => {
    await w.service.create(depot('Bãi xe Hà Nội'), DIRECTOR);
    const standby = await w.service.create(depot('Bãi dự phòng'), DIRECTOR);
    const error = await errorOf(() => w.service.activate(standby.id, DIRECTOR));
    expect(error).toMatchObject({ reason: 'DEPOT_ALREADY_ACTIVE' });
    expect(error.detail).toMatchObject({ activeDepot: { name: 'Bãi xe Hà Nội' } });

    const place = await w.service.create(site('Kho B', { owner: { newCounterparty: { name: 'Công ty B' } } }), DIRECTOR);
    await w.service.deactivate(place.id, { reason: 'x' }, DIRECTOR);
    const party = await w.counterparties.find(place.owner?.counterpartyId ?? '');
    await w.counterparties.update(party?.id ?? '', { status: 'INACTIVE' });
    expect(await reasonOf(() => w.service.activate(place.id, DIRECTOR))).toBe('PLACE_OWNER_INACTIVE');

    await w.counterparties.update(party?.id ?? '', { status: 'ACTIVE' });
    const on = await w.service.activate(place.id, DIRECTOR);
    expect(on).toMatchObject({ status: 'ACTIVE', effectiveStatus: 'ACTIVE' });
    expect((await w.sites.find(place.owner?.siteId ?? ''))?.status).toBe('ACTIVE');
  });

  it('bat lai kiem lai trung ten', async () => {
    const first = await w.service.create(depot('Bãi A'), DIRECTOR);
    await w.service.deactivate(first.id, { reason: 'x' }, DIRECTOR);
    await w.service.create(site('BÃI A', { owner: { newCounterparty: { name: 'Công ty' } } }), DIRECTOR);

    expect(await reasonOf(() => w.service.activate(first.id, DIRECTOR))).toBe('PLACE_NAME_TAKEN');
  });

  it('doi bai chinh: MOT lan ghi, bai cu tat, bai moi dang dung', async () => {
    const main = await w.service.create(depot('Bãi xe Hà Nội'), DIRECTOR);
    const standby = await w.service.create(depot('Bãi xe Gia Lâm'), DIRECTOR);

    const primary = await w.service.makePrimaryDepot(standby.id, {}, DIRECTOR);

    expect(primary.depot).toMatchObject({ plannerStatus: 'IN_USE' });
    expect((await w.geofences.find(main.id))?.status).toBe('INACTIVE');
    expect(resolveDepotFrom(await w.depots.list())).toMatchObject({
      kind: 'RESOLVED',
      depot: { label: 'Bãi xe Gia Lâm' },
    });
    expect((await w.audit('transport.place.make_primary_depot'))[0]?.after).toMatchObject({
      primaryDepot: { id: standby.id },
    });
    expect(await w.audit('transport.place.deactivate')).toEqual([
      expect.objectContaining({ entityId: main.id }),
    ]);
  });

  it('doi bai chinh khi bai cu con viec mo -> can xac nhan; khong phai bai xe -> PLACE_NOT_A_DEPOT', async () => {
    await w.service.create(depot('Bãi xe Hà Nội'), DIRECTOR);
    const standby = await w.service.create(depot('Bãi xe Gia Lâm'), DIRECTOR);
    w.openWork.openWorkAt.mockResolvedValue(openWork);

    expect(await reasonOf(() => w.service.makePrimaryDepot(standby.id, {}, DIRECTOR))).toBe(
      'DEPOT_CHANGE_AFFECTS_OPEN_WORK',
    );
    expect(w.openWork.openWorkAt).toHaveBeenCalledWith('Bãi xe Hà Nội');
    await w.service.makePrimaryDepot(standby.id, { acknowledgeOpenWork: true }, DIRECTOR);

    const place = await w.service.create(site('Kho C', { owner: { newCounterparty: { name: 'C' } } }), DIRECTOR);
    expect(await reasonOf(() => w.service.makePrimaryDepot(place.id, {}, DIRECTOR))).toBe(
      'PLACE_NOT_A_DEPOT',
    );
  });

  it('hang rao khong quan ly o day (cay xang) -> PLACE_NOT_FOUND', async () => {
    const fuel = await w.geofences.register({
      label: 'Cây xăng',
      subjectKind: 'FUEL_SUPPLIER',
      subjectId: 'cx-1',
      ...HA_NOI,
      radiusMetres: 100,
      note: null,
      recordedBy: 'test',
    });

    expect(await reasonOf(() => w.service.update(fuel.id, { radiusMetres: 120 }, DIRECTOR))).toBe(
      'PLACE_NOT_FOUND',
    );
  });
});

describe('danh sach va lich su (#395)', () => {
  it('loc theo loai / trang thai / tu khoa; chu da nghi -> OWNER_INACTIVE', async () => {
    const w = world();
    await w.service.create(depot('Bãi xe Hà Nội'), DIRECTOR);
    const customer = await w.fleet.createCustomer({ name: 'Công ty Khách' });
    const customerSite = await w.service.create(site('Kho khách', { owner: { customerId: customer.id } }), DIRECTOR);
    const partner = await w.service.create(site('Nhà máy đối tác', { owner: { newCounterparty: { name: 'Đối tác P' } } }), DIRECTOR);
    await w.counterparties.update(partner.owner?.counterpartyId ?? '', { status: 'INACTIVE' });

    const all = await w.service.list();
    expect(all.map((view) => [view.displayKind, view.name, view.effectiveStatus])).toEqual([
      ['DEPOT', 'Bãi xe Hà Nội', 'ACTIVE'],
      ['CUSTOMER_SITE', 'Kho khách', 'ACTIVE'],
      ['PARTNER_SITE', 'Nhà máy đối tác', 'OWNER_INACTIVE'],
    ]);
    expect((await w.service.list({ kind: 'CUSTOMER_SITE' })).map((view) => view.id)).toEqual([
      customerSite.id,
    ]);
    expect((await w.service.list({ status: 'inactive' })).map((view) => view.id)).toEqual([partner.id]);
    expect((await w.service.list({ q: 'doi tac p' })).map((view) => view.id)).toEqual([partner.id]);
  });

  it('lich su: dong cua dia diem va cua dia diem phap nhan, moi nhat truoc', async () => {
    const w = world();
    const view = await w.service.create(site('Kho A', { owner: { newCounterparty: { name: 'A' } } }), DIRECTOR);
    await w.service.update(view.id, { name: 'Kho A2' }, DIRECTOR);

    const history = await w.service.history(view.id);

    expect(history.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        'transport.place.create',
        'transport.place.update',
        'transport.counterparty_site.create',
        'transport.counterparty_site.update',
      ]),
    );
    expect(history).toHaveLength(4);
  });
});

/** Nguoi ghi KHONG di qua khoa (may gieo, psql): chi muc DB chan, va loi thanh ly do co kieu. */
describe('va cham chi muc bai xe thanh ly do co kieu (#395)', () => {
  it('P2002 tren (1) / subjectId -> DEPOT_ALREADY_ACTIVE / DEPOT_CODE_TAKEN', async () => {
    const geofences = new InMemoryGeofenceRepository();
    const input = {
      label: 'Bãi A',
      subjectKind: 'DEPOT' as const,
      subjectId: 'DEPOT-A',
      ...HA_NOI,
      radiusMetres: 100,
      note: null,
      recordedBy: 'seed',
    };
    await geofences.register(input);

    const twoActive = await geofences.register({ ...input, label: 'Bãi B', subjectId: 'DEPOT-B' }).catch((e: unknown) => e);
    const sameCode = await geofences
      .register({ ...input, label: 'Bãi C', status: 'INACTIVE' })
      .catch((e: unknown) => e);

    expect(placeStorageConflict(twoActive)?.reason).toBe('DEPOT_ALREADY_ACTIVE');
    expect(placeStorageConflict(sameCode)?.reason).toBe('DEPOT_CODE_TAKEN');
    // Hinh dang Prisma THAT do tren Postgres: `meta.target` la '(1)' / 'subjectId'.
    const prisma = (target: string) =>
      Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: { modelName: 'TransportGeofence', target },
      });
    expect(placeStorageConflict(prisma('(1)'))?.reason).toBe('DEPOT_ALREADY_ACTIVE');
    expect(placeStorageConflict(prisma('subjectId'))?.reason).toBe('DEPOT_CODE_TAKEN');
    expect(placeStorageConflict(new Error('khac'))).toBeNull();
  });
});
