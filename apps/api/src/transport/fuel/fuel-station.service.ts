import { Injectable, Optional } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { BusinessDateError, assertBusinessDate } from '../business-date.js';
import { TransportDomainError } from '../transport.errors.js';
import type { PartyStatus } from '../transport.types.js';
import { TRANSPORT_FUEL_DECISIONS, type TransportFuelDecisionReason } from './fuel-decisions.js';
import {
  normalizeStationCode,
  normalizeStationLabel,
  resolveFuelStation,
  type FuelStationResolution,
} from './fuel-station-identity.js';
import { FuelStationRepository } from './fuel-station.repository.js';
import type {
  FuelIngestChannel,
  FuelStation,
  FuelStationAlias,
  FuelStationDetail,
} from './fuel-station.types.js';
import { FuelRepository } from './fuel.repository.js';
import type { FuelSupplier } from './fuel.types.js';

/**
 * DANH TINH CAY XANG — service cua C1 (Issue #236).
 *
 * ===========================================================================
 * SERVICE NAY KHONG TINH MOT DONG TIEN NAO, va do la mot RANG BUOC chu khong mot dac diem.
 *
 * No khong duoc tiem `FuelCostingPort`, khong duoc tiem `CostingService`, va khong goi mot ham nao
 * cua `fuel-settlement.ts`. Nen khong lan sua nao o day co the lam lech mot con so cua T3/T4/T5 —
 * ke ca lan sua cua nguoi doc tep nay sau sau thang nua.
 *
 * Dieu do quan trong vi C1 mang vao he thong nhung cot NGHE NHU tien: `paymentTermDays`,
 * `contractStartDate`, `contractEndDate`. Chung la SIEU DU LIEU DOC. `Q-08` (R0 §7) chua co loi —
 * chua ai biet B mua dau qua hop dong cay xang hay qua the/app — nen mot luat kieu "qua han
 * `paymentTermDays` thi sinh cong no" se la mot chinh sach KHONG AI QUYET duoc cai vao base roi
 * moi khach van tai sau deu thua huong. `fuel-station.service.spec.ts` doc thang ma nguon cua cac
 * tep tinh tien va do neu mot trong nhung ten cot do xuat hien o do.
 *
 * ===========================================================================
 * KHONG CO `deleteStation`. Xem khoi dau `fuel-station.repository.ts`.
 */

export interface CreateFuelStationCommand {
  readonly supplierId: string;
  readonly name: string;
  readonly code?: string | null;
  readonly address?: string | null;
  readonly latitudeE7?: number | null;
  readonly longitudeE7?: number | null;
  readonly geofenceRadiusM?: number | null;
  readonly status?: PartyStatus;
  readonly note?: string | null;
}

export interface UpdateFuelStationCommand {
  readonly name?: string;
  readonly code?: string | null;
  readonly address?: string | null;
  readonly latitudeE7?: number | null;
  readonly longitudeE7?: number | null;
  readonly geofenceRadiusM?: number | null;
  readonly status?: PartyStatus;
  readonly note?: string | null;
}

export interface UpdateFuelSupplierProfileCommand {
  readonly phone?: string | null;
  readonly address?: string | null;
  readonly contactName?: string | null;
  readonly contactEmail?: string | null;
  readonly contractNo?: string | null;
  readonly contractStartDate?: string | null;
  readonly contractEndDate?: string | null;
  readonly paymentTermDays?: number | null;
  readonly termsNote?: string | null;
  readonly ingestChannels?: readonly FuelIngestChannel[];
  readonly ingestAccountRef?: string | null;
  readonly status?: PartyStatus;
}

export interface ResolveFuelStationQuery {
  readonly supplierId?: string | null;
  readonly code?: string | null;
  readonly label?: string | null;
}

/** HINH HOC cua mot tram sau khi gop ban va — ba truong quyet dinh voi nhau, nen kiem cung nhau. */
interface StationGeometry {
  readonly latitudeE7: number | null;
  readonly longitudeE7: number | null;
  readonly geofenceRadiusM: number | null;
}

type StationDecisionPoint =
  'fuel_station.write' | 'fuel_station.alias' | 'fuel_station.resolve' | 'fuel_supplier.profile';

@Injectable()
export class FuelStationService {
  constructor(
    private readonly stations: FuelStationRepository,
    private readonly fuel: FuelRepository,
    private readonly audit: AuditLogService,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  /* --------------------------- Cay xang --------------------------- */

  async createStation(input: CreateFuelStationCommand, actor: string): Promise<FuelStation> {
    await this.requireSupplier(input.supplierId);

    const nameNormalized = this.requireStationName(input.name);
    const codeNormalized = normalizeStationCode(input.code ?? null);
    if (codeNormalized !== null) {
      await this.requireCodeFree(input.supplierId, codeNormalized, null);
    }
    const geometry = this.requireGeometry({
      latitudeE7: input.latitudeE7 ?? null,
      longitudeE7: input.longitudeE7 ?? null,
      geofenceRadiusM: input.geofenceRadiusM ?? null,
    });

    const station = await this.stations.createStation({
      supplierId: input.supplierId,
      name: input.name.trim(),
      nameNormalized,
      // `code` giu NGUYEN BAN nguoi nhap; `codeNormalized` la khoa. Luu ban chuan hoa vao ca hai
      // se lam mot ma in tren chung tu (`CH-05`) hien ra man hinh thanh `CH05` — khac ban giay.
      code: codeNormalized === null ? null : (input.code ?? '').trim(),
      codeNormalized,
      address: input.address ?? null,
      latitudeE7: geometry.latitudeE7,
      longitudeE7: geometry.longitudeE7,
      geofenceRadiusM: geometry.geofenceRadiusM,
      status: input.status ?? 'ACTIVE',
      note: input.note ?? null,
      at: new Date(),
    });

    await this.audit.append({
      actor,
      action: 'transport.fuel_station.create',
      entityType: 'TransportFuelStation',
      entityId: station.id,
      before: null,
      after: station,
    });
    this.decide('fuel_station.write', 'allowed', 'STATION_CREATED', {
      stationId: station.id,
      supplierId: station.supplierId,
    });
    return station;
  }

  async updateStation(
    id: string,
    patch: UpdateFuelStationCommand,
    actor: string,
  ): Promise<FuelStation> {
    const before = await this.requireStation(id);

    const nameNormalized =
      patch.name === undefined ? undefined : this.requireStationName(patch.name);

    // `code === undefined` la "khong dong toi"; `code === null` la "xoa ma". Hai thu khac nhau, va
    // gop chung se lam mot bieu mau chi doi dia chi xoa mat ma cua hang — thu duy nhat khop duoc
    // chung tu cua nha cung cap voi tram nay.
    const codeTouched = patch.code !== undefined;
    const codeNormalized = codeTouched ? normalizeStationCode(patch.code) : undefined;
    if (codeNormalized != null && codeNormalized !== before.codeNormalized) {
      await this.requireCodeFree(before.supplierId, codeNormalized, id);
    }

    const geometry = this.requireGeometry({
      latitudeE7: patch.latitudeE7 === undefined ? before.latitudeE7 : patch.latitudeE7,
      longitudeE7: patch.longitudeE7 === undefined ? before.longitudeE7 : patch.longitudeE7,
      geofenceRadiusM:
        patch.geofenceRadiusM === undefined ? before.geofenceRadiusM : patch.geofenceRadiusM,
    });

    const after = await this.stations.updateStation(id, {
      name: patch.name === undefined ? undefined : patch.name.trim(),
      nameNormalized,
      code: codeTouched ? (codeNormalized === null ? null : (patch.code ?? '').trim()) : undefined,
      codeNormalized,
      address: patch.address,
      latitudeE7: geometry.latitudeE7,
      longitudeE7: geometry.longitudeE7,
      geofenceRadiusM: geometry.geofenceRadiusM,
      status: patch.status,
      note: patch.note,
      at: new Date(),
    });
    if (!after) throw this.stationNotFound(id);

    await this.audit.append({
      actor,
      action: 'transport.fuel_station.update',
      entityType: 'TransportFuelStation',
      entityId: id,
      before,
      after,
    });
    this.decide('fuel_station.write', 'allowed', 'STATION_UPDATED', { stationId: id });
    return after;
  }

  listStations(supplierId: string | null): Promise<FuelStation[]> {
    return this.stations.listStations(supplierId);
  }

  async stationDetail(id: string): Promise<FuelStationDetail> {
    const station = await this.requireStation(id);
    return { station, aliases: await this.stations.listAliases(id) };
  }

  /* ---------------------------- Bi danh --------------------------- */

  /**
   * DAT MOT BI DANH — mot lan quyet cua NGUOI, ghi lai de khong phai quyet lai.
   *
   * Idempotent theo dung nghia hep: dat lai DUNG bi danh do tren DUNG tram do tra ve hang cu. Dat
   * no len mot tram KHAC thi bi tu choi — khong ghi de. Mot bi danh tro toi hai tram khong tra loi
   * duoc gi ca, va chinh su mo ho la thu bi danh sinh ra de xoa.
   */
  async addAlias(stationId: string, raw: string, actor: string): Promise<FuelStationAlias> {
    await this.requireStation(stationId);

    const normalized = normalizeStationLabel(raw);
    if (normalized === '') {
      this.decide('fuel_station.alias', 'denied', 'ALIAS_INVALID', { stationId });
      throw TransportDomainError.invalid(
        'FUEL_STATION_ALIAS_INVALID',
        'Bi danh chuan hoa ra rong — hay dung mot chuoi co chu hoac so',
      );
    }

    const existing = await this.stations.findAliasByNormalized(normalized);
    if (existing) {
      if (existing.stationId === stationId) {
        this.decide('fuel_station.alias', 'allowed', 'ALIAS_IDEMPOTENT_REPLAY', {
          stationId,
          aliasId: existing.id,
        });
        return existing;
      }
      this.decide('fuel_station.alias', 'denied', 'ALIAS_TAKEN', {
        stationId,
        heldBy: existing.stationId,
      });
      throw TransportDomainError.conflict(
        'FUEL_STATION_ALIAS_TAKEN',
        `Bi danh "${normalized}" da tro toi mot tram khac — hay dat mot chuoi cu the hon`,
      );
    }

    const alias = await this.stations.addAlias({
      stationId,
      normalized,
      raw: raw.trim(),
      createdBy: actor,
      at: new Date(),
    });
    await this.audit.append({
      actor,
      action: 'transport.fuel_station.alias_add',
      entityType: 'TransportFuelStationAlias',
      entityId: alias.id,
      before: null,
      after: alias,
    });
    this.decide('fuel_station.alias', 'allowed', 'ALIAS_ADDED', { stationId, aliasId: alias.id });
    return alias;
  }

  /**
   * GO MOT BI DANH. Idempotent: goi lai tra `false`, khong nem.
   *
   * KHONG phan biet "khong co bi danh do" voi "bi danh do thuoc tram khac" — cung ly le voi
   * `FUEL_EVIDENCE_NOT_FOUND`: phan biet se xac nhan cho nguoi goi rang mot `aliasId` nao do CO
   * TON TAI o dau do trong he thong.
   */
  async removeAlias(stationId: string, aliasId: string, actor: string): Promise<boolean> {
    await this.requireStation(stationId);
    const removed = await this.stations.removeAlias(stationId, aliasId);
    if (!removed) {
      this.decide('fuel_station.alias', 'allowed', 'ALIAS_NOT_FOUND', { stationId, aliasId });
      return false;
    }

    await this.audit.append({
      actor,
      action: 'transport.fuel_station.alias_remove',
      entityType: 'TransportFuelStationAlias',
      entityId: aliasId,
      before: { stationId, aliasId },
      after: null,
    });
    this.decide('fuel_station.alias', 'allowed', 'ALIAS_REMOVED', { stationId, aliasId });
    return true;
  }

  /* --------------------------- Nhan dang -------------------------- */

  /**
   * NHAN MOT CAY XANG TU MOT CHUNG TU — doc, khong ghi.
   *
   * Ba buoc, moi buoc o dung cho cua no: chuan hoa (`fuel-station-identity.ts`), doc ung vien co
   * chi so (`findResolutionCandidates`), roi quyet bang mot ham THUAN. Ket qua di ra NGUYEN VEN —
   * service nay KHONG bien `AMBIGUOUS` thanh mot lua chon, vi do dung la thu `resolveFuelStation`
   * tu choi lam.
   */
  async resolveStation(query: ResolveFuelStationQuery): Promise<FuelStationResolution> {
    const codeNormalized = normalizeStationCode(query.code ?? null);
    const labelNormalized = normalizeStationLabel(query.label ?? null);
    const candidates = await this.stations.findResolutionCandidates({
      codeNormalized,
      labelNormalized,
    });

    const resolution = resolveFuelStation({
      supplierId: query.supplierId ?? null,
      code: codeNormalized,
      label: labelNormalized,
      stations: candidates.stations,
      aliases: candidates.aliases,
    });

    this.decide(
      'fuel_station.resolve',
      resolution.outcome === 'RESOLVED' ? 'allowed' : 'denied',
      RESOLVE_REASON_BY_OUTCOME[resolution.outcome],
      { codeNormalized, labelNormalized, supplierId: query.supplierId ?? null },
    );
    return resolution;
  }

  /* ------------------ Sieu du lieu nha cung cap ------------------- */

  supplierProfile(supplierId: string): Promise<FuelSupplier> {
    return this.requireSupplier(supplierId);
  }

  async updateSupplierProfile(
    supplierId: string,
    patch: UpdateFuelSupplierProfileCommand,
    actor: string,
  ): Promise<FuelSupplier> {
    const before = await this.requireSupplier(supplierId);

    const start = this.readContractDate(patch.contractStartDate, before.contractStartDate);
    const end = this.readContractDate(patch.contractEndDate, before.contractEndDate);
    if (start !== null && end !== null && start > end) {
      this.decide('fuel_supplier.profile', 'denied', 'SUPPLIER_CONTRACT_PERIOD_INVALID', {
        supplierId,
      });
      throw TransportDomainError.invalid(
        'FUEL_PERIOD_RANGE_INVALID',
        `Ngay bat dau hop dong (${start}) sau ngay ket thuc (${end})`,
      );
    }

    const after = await this.fuel.updateSupplierProfile(supplierId, { ...patch, at: new Date() });
    if (!after) throw this.supplierNotFound(supplierId);

    await this.audit.append({
      actor,
      action: 'transport.fuel_supplier.profile_update',
      entityType: 'TransportFuelSupplier',
      entityId: supplierId,
      before,
      after,
    });
    this.decide('fuel_supplier.profile', 'allowed', 'SUPPLIER_PROFILE_UPDATED', { supplierId });
    return after;
  }

  /* ---------------------------- Noi bo ---------------------------- */

  private async requireStation(id: string): Promise<FuelStation> {
    const station = await this.stations.findStation(id);
    if (!station) {
      this.decide('fuel_station.write', 'denied', 'STATION_NOT_FOUND', { stationId: id });
      throw this.stationNotFound(id);
    }
    return station;
  }

  private async requireSupplier(id: string): Promise<FuelSupplier> {
    const supplier = await this.fuel.findSupplier(id);
    if (!supplier) {
      this.decide('fuel_station.write', 'denied', 'STATION_SUPPLIER_NOT_FOUND', { supplierId: id });
      throw this.supplierNotFound(id);
    }
    return supplier;
  }

  private async requireCodeFree(
    supplierId: string,
    codeNormalized: string,
    selfId: string | null,
  ): Promise<void> {
    const holder = await this.stations.findStationByCode(supplierId, codeNormalized);
    if (!holder || holder.id === selfId) return;
    this.decide('fuel_station.write', 'denied', 'STATION_CODE_TAKEN', {
      supplierId,
      codeNormalized,
      heldBy: holder.id,
    });
    throw TransportDomainError.conflict(
      'FUEL_STATION_CODE_TAKEN',
      `Ma cua hang "${codeNormalized}" da thuoc tram "${holder.name}" cua cung nha cung cap`,
    );
  }

  private requireStationName(name: string): string {
    const normalized = normalizeStationLabel(name);
    if (normalized === '') {
      this.decide('fuel_station.write', 'denied', 'STATION_NAME_INVALID', {});
      throw TransportDomainError.invalid(
        'FUEL_STATION_NAME_INVALID',
        'Ten tram phai co it nhat mot chu hoac so',
      );
    }
    return normalized;
  }

  /**
   * BA TRUONG HINH HOC PHAI DUOC KIEM CUNG NHAU, tren trang thai DA GOP.
   *
   * Kiem tung truong tren ban va se cho qua dung cai duong hay gap nhat: mot bieu mau gui
   * `latitudeE7: null` ma khong gui `longitudeE7`, va hang con lai mot nua toa do — mot hang tra
   * loi "co toa do" cho moi phep kiem `IS NOT NULL` nhung khong dat len ban do duoc.
   */
  private requireGeometry(geometry: StationGeometry): StationGeometry {
    const hasLat = geometry.latitudeE7 !== null;
    const hasLng = geometry.longitudeE7 !== null;
    if (hasLat !== hasLng) {
      this.decide('fuel_station.write', 'denied', 'STATION_GEOMETRY_INVALID', {
        detail: 'COORDINATES_INCOMPLETE',
      });
      throw TransportDomainError.invalid(
        'FUEL_STATION_COORDINATES_INCOMPLETE',
        'Toa do phai co ca vi do va kinh do, hoac khong co gi ca',
      );
    }
    if (geometry.geofenceRadiusM !== null && !hasLat) {
      this.decide('fuel_station.write', 'denied', 'STATION_GEOMETRY_INVALID', {
        detail: 'GEOFENCE_WITHOUT_COORDINATES',
      });
      throw TransportDomainError.invalid(
        'FUEL_STATION_GEOFENCE_WITHOUT_COORDINATES',
        'Ban kinh khong co tam thi khong khoanh duoc gi — hay nhap toa do truoc',
      );
    }
    return geometry;
  }

  /**
   * NGAY HOP DONG sau khi gop ban va.
   *
   * `assertBusinessDate` bat ca dang sai LAN ngay khong co that (`2026-02-30`). Bat o day chu khong
   * de DB bat: `CHECK` cua Postgres chi kiem KHUON `^[0-9]{4}-[0-9]{2}-[0-9]{2}$`, nen `2026-02-30`
   * se lot qua no va nam trong bang mai mai.
   */
  private readContractDate(
    patched: string | null | undefined,
    current: string | null,
  ): string | null {
    const value = patched === undefined ? current : patched;
    if (value === null) return null;
    try {
      return assertBusinessDate(value);
    } catch (error) {
      if (error instanceof BusinessDateError) {
        throw TransportDomainError.invalid(
          'BUSINESS_DATE_INVALID',
          `Ngay hop dong khong doc duoc: ${value}`,
        );
      }
      throw error;
    }
  }

  private stationNotFound(id: string): TransportDomainError {
    return TransportDomainError.notFound('FUEL_STATION_NOT_FOUND', `Khong co cay xang ${id}`);
  }

  private supplierNotFound(id: string): TransportDomainError {
    return TransportDomainError.notFound('FUEL_SUPPLIER_NOT_FOUND', `Khong co nha cung cap ${id}`);
  }

  private decide(
    point: StationDecisionPoint,
    outcome: 'allowed' | 'denied',
    reason: TransportFuelDecisionReason,
    detail: Readonly<Record<string, unknown>>,
  ): void {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_FUEL_DECISIONS,
      point,
      outcome,
      reason,
      detail,
    });
  }
}

/** Nam ket cuc cua phep nhan dang -> nam ma quyet dinh. MOT cho anh xa duy nhat. */
const RESOLVE_REASON_BY_OUTCOME = {
  RESOLVED: 'STATION_RESOLVED',
  AMBIGUOUS: 'STATION_AMBIGUOUS',
  SUPPLIER_MISMATCH: 'STATION_SUPPLIER_MISMATCH',
  NO_MATCH: 'STATION_NO_MATCH',
  NO_INPUT: 'STATION_NO_INPUT',
} as const satisfies Record<FuelStationResolution['outcome'], TransportFuelDecisionReason>;
