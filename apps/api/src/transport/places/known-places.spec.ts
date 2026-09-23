import { describe, expect, it, vi } from 'vitest';
import { InMemoryCounterpartyRepository } from '../counterparty/counterparty.repository.js';
import { InMemoryCounterpartySiteRepository } from '../counterparty/site.repository.js';
import { CounterpartySiteService } from '../counterparty/site.service.js';
import type { CounterpartySiteView } from '../counterparty/site.types.js';
import type { Geofence, GeofenceRepository } from '../proof/geofence.repository.js';
import { KnownPlacesFactsAdapter } from './known-places.port.js';
import { buildKnownPlaces, type KnownSiteName } from './known-places.js';

const fence = (overrides: Partial<Geofence> & Pick<Geofence, 'id' | 'subjectKind'>): Geofence => ({
  label: `Hang rao ${overrides.id}`,
  subjectId: `subject-${overrides.id}`,
  latitude: 21.0,
  longitude: 105.8,
  radiusMetres: 200,
  note: null,
  recordedBy: 'test',
  ...overrides,
});

const NO_SITES: ReadonlyMap<string, KnownSiteName> = new Map();

describe('dia diem da biet tu hang rao', () => {
  /** Cay xang va hang rao tam khong phai diem lay/giao cua mot don. */
  it('chi giu DEPOT, COUNTERPARTY_SITE, CUSTOMER', () => {
    const places = buildKnownPlaces(
      [
        fence({ id: 'f1', subjectKind: 'FUEL_SUPPLIER' }),
        fence({ id: 'f2', subjectKind: 'AD_HOC', subjectId: null }),
        fence({ id: 'f3', subjectKind: 'DEPOT' }),
        fence({ id: 'f4', subjectKind: 'CUSTOMER' }),
        fence({ id: 'f5', subjectKind: 'COUNTERPARTY_SITE' }),
      ],
      NO_SITES,
    );

    expect(places.map((place) => place.id)).toEqual(['f3', 'f5', 'f4']);
  });

  it('COUNTERPARTY_SITE: ten = ten dia diem, dong phu = ten phap nhan', () => {
    const [place] = buildKnownPlaces(
      [
        fence({
          id: 'f1',
          subjectKind: 'COUNTERPARTY_SITE',
          subjectId: 'site-1',
          label: 'Nhan hang rao',
          latitude: 20.8264,
          longitude: 106.7752,
          radiusMetres: 300,
        }),
      ],
      new Map([
        [
          'site-1',
          { siteName: 'Nhà máy thép Đình Vũ', counterpartyName: 'Công ty CP Thép Đông Á' },
        ],
      ]),
    );

    expect(place).toEqual({
      id: 'f1',
      kind: 'COUNTERPARTY_SITE',
      name: 'Nhà máy thép Đình Vũ',
      detail: 'Công ty CP Thép Đông Á',
      point: { latitude: 20.8264, longitude: 106.7752 },
      radiusMetres: 300,
    });
  });

  it('dia diem khong con doc duoc -> lui ve nhan hang rao, khong dong phu', () => {
    const [place] = buildKnownPlaces(
      [fence({ id: 'f1', subjectKind: 'COUNTERPARTY_SITE', subjectId: 'gone', label: 'Kho cu' })],
      NO_SITES,
    );

    expect(place).toMatchObject({ name: 'Kho cu', detail: null });
  });

  it('DEPOT/CUSTOMER: ten = nhan hang rao, khong dong phu', () => {
    const places = buildKnownPlaces(
      [
        fence({ id: 'd', subjectKind: 'DEPOT', label: 'Bãi xe Hà Nội' }),
        fence({ id: 'c', subjectKind: 'CUSTOMER', label: 'Kho khách' }),
      ],
      NO_SITES,
    );

    expect(places.map((place) => [place.name, place.detail])).toEqual([
      ['Bãi xe Hà Nội', null],
      ['Kho khách', null],
    ]);
  });

  it('sap xep: DEPOT, COUNTERPARTY_SITE, CUSTOMER, roi theo ten tieng Viet', () => {
    const places = buildKnownPlaces(
      [
        fence({ id: 'c2', subjectKind: 'CUSTOMER', label: 'Kho Đông' }),
        fence({ id: 'c1', subjectKind: 'CUSTOMER', label: 'Kho Anh' }),
        fence({ id: 's1', subjectKind: 'COUNTERPARTY_SITE', label: 'Xưởng Bắc' }),
        fence({ id: 'd2', subjectKind: 'DEPOT', label: 'Bãi Đà Nẵng' }),
        fence({ id: 'd1', subjectKind: 'DEPOT', label: 'Bãi Cần Thơ' }),
      ],
      NO_SITES,
    );

    expect(places.map((place) => place.id)).toEqual(['d1', 'd2', 's1', 'c1', 'c2']);
  });

  /** Mot dong hong khong duoc thanh mot cham "hop le" ma nguoi dung bam chon lam diem lay hang. */
  it('bo hang rao co toa do hong', () => {
    const places = buildKnownPlaces(
      [
        fence({ id: 'bad', subjectKind: 'DEPOT', latitude: 0, longitude: 0 }),
        fence({ id: 'nan', subjectKind: 'DEPOT', latitude: Number.NaN }),
        fence({ id: 'ok', subjectKind: 'DEPOT' }),
      ],
      NO_SITES,
    );

    expect(places.map((place) => place.id)).toEqual(['ok']);
  });
});

describe('adapter doc so hang rao', () => {
  it('doc theo LO ten dia diem, chi cho hang rao COUNTERPARTY_SITE, khong trung', async () => {
    const geofences = {
      listActive: vi.fn(async () => [
        fence({ id: 'f1', subjectKind: 'COUNTERPARTY_SITE', subjectId: 'site-1' }),
        fence({ id: 'f2', subjectKind: 'COUNTERPARTY_SITE', subjectId: 'site-1' }),
        fence({ id: 'f3', subjectKind: 'DEPOT', subjectId: 'DEPOT-HN', label: 'Bãi xe Hà Nội' }),
      ]),
    } as unknown as GeofenceRepository;
    const view = {
      site: { id: 'site-1', name: 'Kho Nhựa Tân Phú Hưng' },
      counterpartyId: 'cp-1',
      counterpartyName: 'Công ty TNHH Nhựa Tân Phú Hưng',
    } as unknown as CounterpartySiteView;
    const activeViews = vi.fn(async () => [view]);
    const sites = { activeViews } as unknown as CounterpartySiteService;

    const places = await new KnownPlacesFactsAdapter(geofences, sites).listKnownPlaces();

    expect(activeViews).toHaveBeenCalledTimes(1);
    expect(activeViews).toHaveBeenCalledWith(['site-1']);
    expect(places.map((place) => [place.kind, place.name, place.detail])).toEqual([
      ['DEPOT', 'Bãi xe Hà Nội', null],
      ['COUNTERPARTY_SITE', 'Kho Nhựa Tân Phú Hưng', 'Công ty TNHH Nhựa Tân Phú Hưng'],
      ['COUNTERPARTY_SITE', 'Kho Nhựa Tân Phú Hưng', 'Công ty TNHH Nhựa Tân Phú Hưng'],
    ]);
  });

  /**
   * KHONG N+1 phap nhan: ba dia diem cua HAI phap nhan -> MOT lan doc phap nhan theo lo, khong mot
   * lan `find` le nao. Dung service + kho THAT (trong bo nho) chu khong gia `activeViews`: chinh
   * vong doc tung phap nhan ben trong no la cai tung noi tiep.
   */
  it('ten phap nhan doc theo LO: mot lan findMany, khong mot lan find le', async () => {
    const counterparties = new InMemoryCounterpartyRepository();
    const siteRepo = new InMemoryCounterpartySiteRepository();
    const steel = await counterparties.create({ name: 'Công ty CP Thép Đông Á' });
    const plastic = await counterparties.create({ name: 'Công ty TNHH Nhựa Tân Phú Hưng' });
    const siteOf = (counterpartyId: string, name: string) =>
      siteRepo.create({
        counterpartyId,
        name,
        address: null,
        note: null,
        status: 'ACTIVE',
        recordedBy: 'test',
      });
    const sites = [
      await siteOf(steel.id, 'Nhà máy thép Đình Vũ'),
      await siteOf(steel.id, 'Kho thép Hải Dương'),
      await siteOf(plastic.id, 'Kho Nhựa Tân Phú Hưng'),
    ];
    const geofences = {
      listActive: async () =>
        sites.map((site, index) =>
          fence({ id: `f${index}`, subjectKind: 'COUNTERPARTY_SITE', subjectId: site.id }),
        ),
    } as unknown as GeofenceRepository;
    const find = vi.spyOn(counterparties, 'find');
    const findMany = vi.spyOn(counterparties, 'findMany');

    const places = await new KnownPlacesFactsAdapter(
      geofences,
      new CounterpartySiteService(siteRepo, counterparties),
    ).listKnownPlaces();

    expect(find).not.toHaveBeenCalled();
    expect(findMany).toHaveBeenCalledTimes(1);
    expect([...(findMany.mock.calls[0]?.[0] ?? [])].sort()).toEqual([steel.id, plastic.id].sort());
    expect(places.map((place) => [place.name, place.detail])).toEqual([
      ['Kho Nhựa Tân Phú Hưng', 'Công ty TNHH Nhựa Tân Phú Hưng'],
      ['Kho thép Hải Dương', 'Công ty CP Thép Đông Á'],
      ['Nhà máy thép Đình Vũ', 'Công ty CP Thép Đông Á'],
    ]);
  });

  it('khong hang rao dia diem nao -> khong doc bang dia diem', async () => {
    const geofences = {
      listActive: async () => [fence({ id: 'f3', subjectKind: 'DEPOT' })],
    } as unknown as GeofenceRepository;
    const activeViews = vi.fn();

    await new KnownPlacesFactsAdapter(geofences, {
      activeViews,
    } as unknown as CounterpartySiteService).listKnownPlaces();

    expect(activeViews).not.toHaveBeenCalled();
  });
});
