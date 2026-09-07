import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../../config/prisma.service.js';
import type { FuelStationIndexEntry } from './fuel-station-identity.js';
import {
  FuelStationRepository,
  indexEntryOf,
  type AddFuelStationAliasInput,
  type CreateFuelStationInput,
  type FuelStationResolutionCandidates,
  type UpdateFuelStationInput,
} from './fuel-station.repository.js';
import type { FuelStation, FuelStationAlias } from './fuel-station.types.js';

/** Kieu tho tu Prisma — chi lay nhung cot ma mien nay doc. */
interface StationRow {
  id: string;
  supplierId: string;
  name: string;
  nameNormalized: string;
  code: string | null;
  codeNormalized: string | null;
  address: string | null;
  latitudeE7: number | null;
  longitudeE7: number | null;
  geofenceRadiusM: number | null;
  status: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AliasRow {
  id: string;
  stationId: string;
  normalized: string;
  raw: string;
  createdBy: string;
  createdAt: Date;
}

const iso = (value: Date): string => value.toISOString();

const toStation = (row: StationRow): FuelStation => ({
  id: row.id,
  supplierId: row.supplierId,
  name: row.name,
  nameNormalized: row.nameNormalized,
  code: row.code,
  codeNormalized: row.codeNormalized,
  address: row.address,
  latitudeE7: row.latitudeE7,
  longitudeE7: row.longitudeE7,
  geofenceRadiusM: row.geofenceRadiusM,
  status: row.status as FuelStation['status'],
  note: row.note,
  createdAt: iso(row.createdAt),
  updatedAt: iso(row.updatedAt),
});

const toAlias = (row: AliasRow): FuelStationAlias => ({
  id: row.id,
  stationId: row.stationId,
  normalized: row.normalized,
  raw: row.raw,
  createdBy: row.createdBy,
  createdAt: iso(row.createdAt),
});

/**
 * Bo cac khoa `undefined` TRUOC khi dua vao `data` cua Prisma.
 *
 * Prisma coi `{ address: undefined }` la "khong dong toi", nhung mot doi tuong TypeScript co khoa
 * `address: undefined` va mot doi tuong khong co khoa do la hai thu khac nhau voi moi doan ma khac
 * doc no. Loc o day de `null` (xoa gia tri) va `undefined` (khong dong toi) giu dung hai nghia ma
 * `UpdateFuelStationInput` da khai.
 */
function prune<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/*
 * Cung ly le voi `PrismaCounterpartyRepository`: Prisma sinh kieu delegate theo tung ban client,
 * nen goi qua mot ham tra `any` de tang nay khong vo khi ai do chua chay `prisma generate`. Ranh
 * gioi kieu that su nam o hai ham `to*` ben tren.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
const model = (prisma: PrismaService, name: string): any =>
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  (prisma as unknown as Record<string, any>)[name];

@Injectable()
export class PrismaFuelStationRepository extends FuelStationRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async createStation(input: CreateFuelStationInput): Promise<FuelStation> {
    return toStation(
      await model(this.prisma, 'transportFuelStation').create({
        data: {
          supplierId: input.supplierId,
          name: input.name,
          nameNormalized: input.nameNormalized,
          code: input.code,
          codeNormalized: input.codeNormalized,
          address: input.address,
          latitudeE7: input.latitudeE7,
          longitudeE7: input.longitudeE7,
          geofenceRadiusM: input.geofenceRadiusM,
          status: input.status,
          note: input.note,
          createdAt: input.at,
          updatedAt: input.at,
        },
      }),
    );
  }

  async updateStation(id: string, patch: UpdateFuelStationInput): Promise<FuelStation | null> {
    const { at, ...fields } = patch;
    const row = await model(this.prisma, 'transportFuelStation').update({
      where: { id },
      data: { ...prune(fields), updatedAt: at },
    });
    return row ? toStation(row) : null;
  }

  async findStation(id: string): Promise<FuelStation | null> {
    const row = await model(this.prisma, 'transportFuelStation').findUnique({ where: { id } });
    return row ? toStation(row) : null;
  }

  async listStations(supplierId: string | null): Promise<FuelStation[]> {
    const rows: StationRow[] = await model(this.prisma, 'transportFuelStation').findMany({
      where: supplierId === null ? {} : { supplierId },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toStation);
  }

  async findStationByCode(supplierId: string, codeNormalized: string): Promise<FuelStation | null> {
    const row = await model(this.prisma, 'transportFuelStation').findUnique({
      where: { supplierId_codeNormalized: { supplierId, codeNormalized } },
    });
    return row ? toStation(row) : null;
  }

  async listAliases(stationId: string): Promise<FuelStationAlias[]> {
    const rows: AliasRow[] = await model(this.prisma, 'transportFuelStationAlias').findMany({
      where: { stationId },
      orderBy: { normalized: 'asc' },
    });
    return rows.map(toAlias);
  }

  async findAliasByNormalized(normalized: string): Promise<FuelStationAlias | null> {
    const row = await model(this.prisma, 'transportFuelStationAlias').findUnique({
      where: { normalized },
    });
    return row ? toAlias(row) : null;
  }

  async addAlias(input: AddFuelStationAliasInput): Promise<FuelStationAlias> {
    return toAlias(
      await model(this.prisma, 'transportFuelStationAlias').create({
        data: {
          stationId: input.stationId,
          normalized: input.normalized,
          raw: input.raw,
          createdBy: input.createdBy,
          createdAt: input.at,
        },
      }),
    );
  }

  async removeAlias(stationId: string, aliasId: string): Promise<boolean> {
    const result = await model(this.prisma, 'transportFuelStationAlias').deleteMany({
      where: { id: aliasId, stationId },
    });
    return (result?.count ?? 0) > 0;
  }

  /**
   * MOT cau truy van cho tram, MOT cho bi danh — ca hai deu di qua chi so.
   *
   * `OR` giua `codeNormalized` va `nameNormalized` doc duoc bang bitmap cua HAI chi so mot cot ma
   * migration nay tao ra. Neu ai do bo mot trong hai chi so di, cau nay khong sai — no chi lang le
   * tro thanh mot lan quet ca bang tram, va dieu do chi lo ra o quy mo mot chuoi ban le that.
   */
  async findResolutionCandidates(input: {
    readonly codeNormalized: string | null;
    readonly labelNormalized: string;
  }): Promise<FuelStationResolutionCandidates> {
    const or: Array<Record<string, string>> = [];
    if (input.codeNormalized !== null) or.push({ codeNormalized: input.codeNormalized });
    if (input.labelNormalized !== '') or.push({ nameNormalized: input.labelNormalized });

    const rows: StationRow[] =
      or.length === 0
        ? []
        : await model(this.prisma, 'transportFuelStation').findMany({ where: { OR: or } });

    const alias =
      input.labelNormalized === '' ? null : await this.findAliasByNormalized(input.labelNormalized);

    // Tram cua bi danh co the KHONG nam trong `rows` (bi danh khac han ten tram — do la ca ly do
    // no ton tai), nen phai doc them mot hang. `Map` theo `id` khu trung khi no tinh co trung.
    const aliasStation = alias ? await this.findStation(alias.stationId) : null;

    const stations = new Map<string, FuelStationIndexEntry>();
    for (const row of rows) stations.set(row.id, indexEntryOf(toStation(row)));
    if (aliasStation) stations.set(aliasStation.id, indexEntryOf(aliasStation));

    return {
      stations: [...stations.values()],
      aliases: alias ? [{ normalized: alias.normalized, stationId: alias.stationId }] : [],
    };
  }
}
