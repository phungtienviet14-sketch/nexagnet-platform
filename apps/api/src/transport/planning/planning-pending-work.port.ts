/**
 * VIEC DANG DO CUA MOT CHIEC XE ma lan lap ke hoach phai hoi truoc khi mo chuyen moi — `#398`.
 *
 * ============================================================================================
 * VI SAO MOT CONG, KHONG PHAI MOT PHEP DOC TRONG `PlanningService`
 * ============================================================================================
 *
 * Nguon su that (viec tai xe nhan truc tiep chua co don) thuoc capability `transport-site-intake`,
 * va capability do phu thuoc `transport-core` — khong duoc nguoc lai. Cung khuon
 * `RunClosureBlockerSource`/`LegFieldTruthSource`: `transport-core` khai cong + ban RONG mac dinh o
 * tang ghep (`app-composition.ts`), capability so huu du lieu GHI DE. `PlanningService` song trong
 * `TransportModule`, noi cong o goc khong nhin thay, nen NGUOI GOI mang cong vao lenh
 * (`CommitPlanCommand.pendingWork`) — dung cach `fieldTruth` di vao `transitionLeg`.
 *
 * CHI DOC. Mot cong doc ma ghi duoc se som thanh cho "tam go vat can ra".
 */
export interface PendingVehicleWork {
  readonly intakeId: string;
  readonly runCode: string;
}

export abstract class PlanningPendingWorkSource {
  /** Viec tai xe nhan truc tiep CHUA co don dang giu mot vong chay con mo cua xe nay. */
  abstract pendingIntakeForVehicle(vehicleId: string): Promise<PendingVehicleWork | null>;
}

/** Khach khong bat `transport-site-intake`: khong co viec nao nhu vay — mot cau tra loi hop le. */
export class NoPlanningPendingWorkSource extends PlanningPendingWorkSource {
  async pendingIntakeForVehicle(): Promise<PendingVehicleWork | null> {
    return null;
  }
}
