import { randomUUID } from 'node:crypto';
import type { PartyStatus } from '../transport.types.js';
import type { FuelStationAliasIndexEntry, FuelStationIndexEntry } from './fuel-station-identity.js';
import type { FuelStation, FuelStationAlias } from './fuel-station.types.js';

/**
 * Kho cua DANH TINH CAY XANG.
 *
 * ===========================================================================
 * TACH KHOI `FuelRepository`, va do la mot lua chon co ly do — khong phai vi tep kia dai.
 *
 * `FuelRepository` giu CHUNG TU: phieu, bang ke, ky doi soat, ban giao cong no. Moi lenh ghi cua
 * no di qua mot may trang thai va phan lon bi khoa lai sau khi doi soat dong. Bang tram thi nguoc
 * han: no la MASTER DATA, sua duoc bat cu luc nao, va mot lan sua ten tram KHONG duoc keo theo mot
 * lan kiem "ky nay dong chua". Gop hai thu vao mot kho se lam moi lenh ghi tram phai di qua giao
 * thuc noi tiep hoa cua ky doi soat (`fuel.repository.ts`, khoi "GIAO THUC NOI TIEP HOA") — mot
 * cai gia vo nghia, va mot loi moi de ai do lo tay khoa nham hang.
 *
 * ===========================================================================
 * BA DIEU KHO NAY KHONG CO:
 *
 *   1. KHONG `deleteStation`. Mot tram da tung nhan chung tu ma bien mat se lam moi chung tu cu tro
 *      vao hu khong. Duong dung la `status = INACTIVE` — no giu lich su va van doc duoc.
 *      (Bi danh THI xoa duoc: no la mot lan quyet cua nguoi, khong phai mot su kien nghiep vu.)
 *
 *   2. KHONG mot ham nao ghi vao bang phieu/bang ke. Danh tinh khong duoc phep sua chung tu.
 *
 *   3. KHONG `listAllStations()` cho duong nhan dang. Xem `findResolutionCandidates` ben duoi.
 */

export interface CreateFuelStationInput {
  readonly supplierId: string;
  readonly name: string;
  readonly nameNormalized: string;
  readonly code: string | null;
  readonly codeNormalized: string | null;
  readonly address: string | null;
  readonly latitudeE7: number | null;
  readonly longitudeE7: number | null;
  readonly geofenceRadiusM: number | null;
  readonly status: PartyStatus;
  readonly note: string | null;
  readonly at: Date;
}

/**
 * BAN VA cua mot lan sua tram.
 *
 * `undefined` = khong dong toi; `null` = xoa gia tri. Hai thu do KHAC NHAU va phai phan biet duoc:
 * neu gop lam mot, mot bieu mau chi sua ten se xoa sach toa do va ban kinh cua tram.
 */
export interface UpdateFuelStationInput {
  readonly name?: string;
  readonly nameNormalized?: string;
  readonly code?: string | null;
  readonly codeNormalized?: string | null;
  readonly address?: string | null;
  readonly latitudeE7?: number | null;
  readonly longitudeE7?: number | null;
  readonly geofenceRadiusM?: number | null;
  readonly status?: PartyStatus;
  readonly note?: string | null;
  readonly at: Date;
}

export interface AddFuelStationAliasInput {
  readonly stationId: string;
  readonly normalized: string;
  readonly raw: string;
  readonly createdBy: string;
  readonly at: Date;
}

/** Bo ung vien cho MOT lan nhan dang — xem `findResolutionCandidates`. */
export interface FuelStationResolutionCandidates {
  readonly stations: readonly FuelStationIndexEntry[];
  readonly aliases: readonly FuelStationAliasIndexEntry[];
}

export abstract class FuelStationRepository {
  abstract createStation(input: CreateFuelStationInput): Promise<FuelStation>;
  abstract updateStation(id: string, patch: UpdateFuelStationInput): Promise<FuelStation | null>;
  abstract findStation(id: string): Promise<FuelStation | null>;
  /** `supplierId = null` = moi tram. Doi tram cua mot khach van tai la con so nho co gioi han that. */
  abstract listStations(supplierId: string | null): Promise<FuelStation[]>;
  /** Ma DA CHUAN HOA da thuoc tram nao trong nha cung cap do chua — cong chan mot lan trung ma. */
  abstract findStationByCode(
    supplierId: string,
    codeNormalized: string,
  ): Promise<FuelStation | null>;

  abstract listAliases(stationId: string): Promise<FuelStationAlias[]>;
  /** Bi danh UNIQUE TOAN CUC, nen tra ve toi da mot hang — ke ca khi no thuoc tram khac. */
  abstract findAliasByNormalized(normalized: string): Promise<FuelStationAlias | null>;
  abstract addAlias(input: AddFuelStationAliasInput): Promise<FuelStationAlias>;
  /** `true` neu that su co mot hang bi go. Idempotent — goi lai tra `false`, khong nem. */
  abstract removeAlias(stationId: string, aliasId: string): Promise<boolean>;

  /**
   * BO UNG VIEN cho mot lan nhan dang — hai khoa DA CHUAN HOA vao, mot bo nho ra.
   *
   * ===========================================================================
   * VI SAO KHONG PHAI `listAllStations()` ROI LOC TRONG BO NHO
   *
   * Duong do dung o quy mo mot doi xe, va sai o quy mo mot chuoi ban le: mot nha cung cap Viet Nam
   * co the co hang nghin cua hang, va moi chung tu vao se keo ca bang len RAM. Ba cau truy van co
   * chi so — `codeNormalized`, `nameNormalized`, `normalized` cua bi danh — tra ve dung nhung hang
   * co the khop, va so hang do gan nhu luon la 0, 1 hoac 2.
   *
   * Ket qua VAN la mot SIEU TAP cua cai `resolveFuelStation()` can: no chua ca nhung tram thuoc
   * nha cung cap KHAC, vi do dung la thu de phan biet `SUPPLIER_MISMATCH` voi `NO_MATCH`.
   */
  abstract findResolutionCandidates(input: {
    readonly codeNormalized: string | null;
    readonly labelNormalized: string;
  }): Promise<FuelStationResolutionCandidates>;
}

/**
 * Mot hang tram -> mot muc chi so nhan dang.
 *
 * Duoc chia se voi ban Prisma qua `export`: hai phep anh xa khac nhau la hai co hoi de mot truong
 * bi bo quen o mot ben, va truong de bi bo quen nhat o day (`status`) chinh la thu quyet dinh mot
 * chung tu cua tram da dong co bi bao dong hay khong.
 */
export const indexEntryOf = (station: FuelStation): FuelStationIndexEntry => ({
  id: station.id,
  supplierId: station.supplierId,
  code: station.code,
  codeNormalized: station.codeNormalized,
  name: station.name,
  nameNormalized: station.nameNormalized,
  status: station.status,
});

const clone = <T>(row: T): T => structuredClone(row);
const byName = (a: FuelStation, b: FuelStation): number =>
  a.name.localeCompare(b.name) || a.id.localeCompare(b.id);

/**
 * Ban trong bo nho — duong chay cua `PERSISTENCE=memory` (demo/CI khong can CSDL).
 *
 * PHAI cuong che cung mot bat bien voi ban Prisma. O day co HAI:
 *
 *   · `(supplierId, codeNormalized)` duy nhat — `createStation`/`updateStation` tu choi hang thu hai;
 *   · `normalized` cua bi danh duy nhat TOAN CUC — `addAlias` tu choi hang thu hai.
 *
 * Neu chi ban Prisma giu hai bat bien nay, moi bai test chay tren bo nho se xanh cho mot dong ma DB
 * that se tu choi — va lan dau tien co nguoi biet la tren stack cua khach.
 */
export class InMemoryFuelStationRepository extends FuelStationRepository {
  private readonly stations = new Map<string, FuelStation>();
  private readonly aliases = new Map<string, FuelStationAlias>();

  async createStation(input: CreateFuelStationInput): Promise<FuelStation> {
    if (input.codeNormalized !== null) {
      const taken = await this.findStationByCode(input.supplierId, input.codeNormalized);
      if (taken) throw new Error('TransportFuelStation_supplierId_codeNormalized_key');
    }
    const at = input.at.toISOString();
    const station: FuelStation = {
      id: randomUUID(),
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
      createdAt: at,
      updatedAt: at,
    };
    this.stations.set(station.id, station);
    return clone(station);
  }

  async updateStation(id: string, patch: UpdateFuelStationInput): Promise<FuelStation | null> {
    const current = this.stations.get(id);
    if (!current) return null;

    const next: FuelStation = {
      ...current,
      name: patch.name ?? current.name,
      nameNormalized: patch.nameNormalized ?? current.nameNormalized,
      code: patch.code === undefined ? current.code : patch.code,
      codeNormalized:
        patch.codeNormalized === undefined ? current.codeNormalized : patch.codeNormalized,
      address: patch.address === undefined ? current.address : patch.address,
      latitudeE7: patch.latitudeE7 === undefined ? current.latitudeE7 : patch.latitudeE7,
      longitudeE7: patch.longitudeE7 === undefined ? current.longitudeE7 : patch.longitudeE7,
      geofenceRadiusM:
        patch.geofenceRadiusM === undefined ? current.geofenceRadiusM : patch.geofenceRadiusM,
      status: patch.status ?? current.status,
      note: patch.note === undefined ? current.note : patch.note,
      updatedAt: patch.at.toISOString(),
    };

    if (next.codeNormalized !== null && next.codeNormalized !== current.codeNormalized) {
      const taken = await this.findStationByCode(next.supplierId, next.codeNormalized);
      if (taken && taken.id !== id) {
        throw new Error('TransportFuelStation_supplierId_codeNormalized_key');
      }
    }

    this.stations.set(id, next);
    return clone(next);
  }

  async findStation(id: string): Promise<FuelStation | null> {
    const row = this.stations.get(id);
    return row ? clone(row) : null;
  }

  async listStations(supplierId: string | null): Promise<FuelStation[]> {
    return [...this.stations.values()]
      .filter((station) => supplierId === null || station.supplierId === supplierId)
      .sort(byName)
      .map(clone);
  }

  async findStationByCode(supplierId: string, codeNormalized: string): Promise<FuelStation | null> {
    const row = [...this.stations.values()].find(
      (station) => station.supplierId === supplierId && station.codeNormalized === codeNormalized,
    );
    return row ? clone(row) : null;
  }

  async listAliases(stationId: string): Promise<FuelStationAlias[]> {
    return [...this.aliases.values()]
      .filter((alias) => alias.stationId === stationId)
      .sort((a, b) => a.normalized.localeCompare(b.normalized))
      .map(clone);
  }

  async findAliasByNormalized(normalized: string): Promise<FuelStationAlias | null> {
    const row = [...this.aliases.values()].find((alias) => alias.normalized === normalized);
    return row ? clone(row) : null;
  }

  async addAlias(input: AddFuelStationAliasInput): Promise<FuelStationAlias> {
    const existing = await this.findAliasByNormalized(input.normalized);
    if (existing) throw new Error('TransportFuelStationAlias_normalized_key');

    const alias: FuelStationAlias = {
      id: randomUUID(),
      stationId: input.stationId,
      normalized: input.normalized,
      raw: input.raw,
      createdBy: input.createdBy,
      createdAt: input.at.toISOString(),
    };
    this.aliases.set(alias.id, alias);
    return clone(alias);
  }

  async removeAlias(stationId: string, aliasId: string): Promise<boolean> {
    const alias = this.aliases.get(aliasId);
    if (!alias || alias.stationId !== stationId) return false;
    return this.aliases.delete(aliasId);
  }

  async findResolutionCandidates(input: {
    readonly codeNormalized: string | null;
    readonly labelNormalized: string;
  }): Promise<FuelStationResolutionCandidates> {
    const matched = [...this.stations.values()].filter(
      (station) =>
        (input.codeNormalized !== null && station.codeNormalized === input.codeNormalized) ||
        (input.labelNormalized !== '' && station.nameNormalized === input.labelNormalized),
    );
    const alias =
      input.labelNormalized === '' ? null : await this.findAliasByNormalized(input.labelNormalized);
    const aliasStation = alias ? this.stations.get(alias.stationId) : undefined;

    const stations = new Map<string, FuelStationIndexEntry>();
    for (const station of aliasStation ? [...matched, aliasStation] : matched) {
      stations.set(station.id, indexEntryOf(station));
    }

    return {
      stations: [...stations.values()],
      aliases: alias ? [{ normalized: alias.normalized, stationId: alias.stationId }] : [],
    };
  }
}
