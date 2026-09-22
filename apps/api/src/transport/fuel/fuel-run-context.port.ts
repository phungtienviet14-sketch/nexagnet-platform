import { Injectable } from '@nestjs/common';
import { MovementRepository } from '../movement/movement.repository.js';
import type {
  RunLeg,
  RunLegKind,
  RunLegStatus,
  VehicleRun,
  VehicleRunStatus,
} from '../movement/movement.types.js';

/**
 * CUA SO THU BA tu `transport-fuel` nhin ra ngoai — `#364`, CHI DOC: vong chay / chang / phan cong
 * cua `transport-core` lam NGU CANH VAN HANH cho mot lan do dau.
 *
 * ===========================================================================
 * VI SAO MOT CONG RIENG chu khong them ham vao `TransportFuelCoreFacts`
 *
 * `TransportFuelCoreFacts` tra loi ve CHUYEN v1 va DOI XE — hai thu `#364` giu nguyen. Vong chay la
 * mot truc KHAC (`D-01`: Run khong la cha hay con cua Trip), va dat hai truc vao mot cong se lam
 * moi ben goi cua cong cu (va moi bai kiem dung no) phai biet toi vong chay. Nhieu cong hep dung
 * khuon voi `TransportCheckpointCoreFacts` / `TransportProofCoreFacts` o hai capability kia.
 *
 * ===========================================================================
 * KHONG CO MOT HAM GHI NAO, va khong co khoa vong chay
 *
 * Lan do dau KHONG doi trang thai vong chay, va ngu canh chi kiem nhung dieu KHONG DOI sau khi tao:
 * `vehicleId` cua vong chay, `runId` cua chang, va lich su phan cong (chi them). Nen khong co cua
 * so TOCTOU nao can khoa `underRunLock` dong lai — xem `FuelService.resolveRunContext()`.
 *
 * `FuelRunFacts` co y NGHEO: khong doanh thu, khong don hang. Mot khung nhin phieu dau cua lai xe
 * khong co duong nao cham toi gia cuoc (`INV-09`).
 */

export interface FuelRunFacts {
  readonly id: string;
  /** MA DOC DUOC (`RUN-...`) — cai nguoi dung go va doc, khong phai `id`. */
  readonly code: string;
  /** Vong chay LA vong chay cua mot chiec xe — nguon su that cua xe tren phieu Run-first. */
  readonly vehicleId: string;
  readonly status: VehicleRunStatus;
}

export interface FuelLegFacts {
  readonly id: string;
  readonly runId: string;
  /** Thu tu trong vong chay, tu 1 — "Chang 2" tren man hinh. */
  readonly sequence: number;
  readonly kind: RunLegKind;
  readonly status: RunLegStatus;
  readonly originLabel: string;
  readonly destinationLabel: string;
}

export abstract class FuelRunContextFacts {
  abstract findRun(runId: string): Promise<FuelRunFacts | null>;
  /** MA -> vong chay, cho bo loc hop thu. Phep doi thuoc `transport-core` nen di qua day. */
  abstract findRunByCode(code: string): Promise<FuelRunFacts | null>;
  abstract findLeg(legId: string): Promise<FuelLegFacts | null>;
  /** Chang cua mot vong chay, theo `sequence` tang dan. */
  abstract listLegs(runId: string): Promise<FuelLegFacts[]>;
  /**
   * Lai xe nay CO TUNG duoc phan cong vao vong chay do — ke ca ban phan cong DA DONG.
   *
   * "Tung", khong phai "dang": cung ly le voi `wasDriverEverAssignedToTrip` (`GD-06`) va voi
   * `CheckpointService`/`WaitingSessionService` tren chinh vong chay: nguoi bi thay ca van chiu
   * trach nhiem — va van khai duoc — lan do dau cua phan duong ho da chay.
   */
  abstract wasDriverEverAssignedToRun(runId: string, driverId: string): Promise<boolean>;
  /**
   * Vong chay DANG MO (`PLANNED`/`ACTIVE`) ma lai xe DANG duoc phan cong — cai man Hien truong
   * hien. Dung de DE XUAT ngu canh tren o khai phieu; lenh nop van kiem lai bang
   * `wasDriverEverAssignedToRun`, khong tin nhung gi client gui len.
   */
  abstract listOpenRunsForDriver(driverId: string): Promise<FuelRunFacts[]>;

  /**
   * Vong chay theo MOT BO id — de doi `id -> ma` cho MOT TRANG hop thu. Mac dinh la `findRun` tung
   * id: `ids` luon la id cua mot trang (co tran cung o `fuel.schemas.ts`), cung ly le voi
   * `TransportFuelCoreFacts.listTripsByIds`.
   */
  async listRunsByIds(ids: readonly string[]): Promise<FuelRunFacts[]> {
    const unique = [...new Set(ids)];
    const found = await Promise.all(unique.map((id) => this.findRun(id)));
    return found.filter((run): run is FuelRunFacts => run !== null);
  }

  /** Nhu tren, cho chang. */
  async listLegsByIds(ids: readonly string[]): Promise<FuelLegFacts[]> {
    const unique = [...new Set(ids)];
    const found = await Promise.all(unique.map((id) => this.findLeg(id)));
    return found.filter((leg): leg is FuelLegFacts => leg !== null);
  }
}

const toRunFacts = (run: VehicleRun): FuelRunFacts => ({
  id: run.id,
  code: run.code,
  vehicleId: run.vehicleId,
  status: run.status,
});

const toLegFacts = (leg: RunLeg): FuelLegFacts => ({
  id: leg.id,
  runId: leg.runId,
  sequence: leg.sequence,
  kind: leg.kind,
  status: leg.status,
  originLabel: leg.originLabel,
  destinationLabel: leg.destinationLabel,
});

/**
 * Hien thuc DUY NHAT — qua `MovementRepository` cua `transport-core`, capability ma `transport-fuel`
 * da phu thuoc san (`tenant.schema.ts`). Khong them mot phu thuoc capability nao.
 */
@Injectable()
export class MovementFuelRunContextAdapter extends FuelRunContextFacts {
  constructor(private readonly movement: MovementRepository) {
    super();
  }

  async findRun(runId: string): Promise<FuelRunFacts | null> {
    const run = await this.movement.findRun(runId);
    return run ? toRunFacts(run) : null;
  }

  async findRunByCode(code: string): Promise<FuelRunFacts | null> {
    const run = await this.movement.findRunByCode(code);
    return run ? toRunFacts(run) : null;
  }

  async findLeg(legId: string): Promise<FuelLegFacts | null> {
    const leg = await this.movement.findLeg(legId);
    return leg ? toLegFacts(leg) : null;
  }

  async listLegs(runId: string): Promise<FuelLegFacts[]> {
    return (await this.movement.listLegs(runId)).map(toLegFacts);
  }

  async wasDriverEverAssignedToRun(runId: string, driverId: string): Promise<boolean> {
    const history = await this.movement.listRunAssignments(runId);
    return history.some((assignment) => assignment.driverId === driverId);
  }

  async listOpenRunsForDriver(driverId: string): Promise<FuelRunFacts[]> {
    return (await this.movement.listOpenRunsForDriver(driverId)).map(toRunFacts);
  }
}
