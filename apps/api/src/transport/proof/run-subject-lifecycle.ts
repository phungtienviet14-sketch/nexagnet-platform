import { isTerminalRunStatus } from '../movement/movement-lifecycle.js';
import type { VehicleRunStatus } from '../movement/movement.types.js';
import type { TransportProofCoreFacts } from './transport-proof-facts.port.js';
import type { TrackingSession } from './tracking.types.js';

/**
 * MOT PHIEN THEO VONG CHAY KHONG SONG LAU HON VONG CHAY CUA NO — `#327`.
 *
 * ==============================================================================================
 * VI SAO QUY TAC NAY NAM MOT MINH TRONG MOT TEP
 * ==============================================================================================
 *
 * No duoc hoi o HAI cho co hau qua hoan toan khac nhau:
 *
 *   · `TrackingService.openSession()` — mot phien cu con ACTIVE la mot CAI KHOA. Postgres chi cho
 *     mot phien ACTIVE moi lai xe (`TransportTrackingSession_activeDriver_key`), nen phien cua
 *     vong chay hom qua chan lai xe bam moc cua vong chay hom nay;
 *   · `LocationHealthService.compute()` — mot phien cu con ACTIVE la mot KY VONG. Bang dieu hanh
 *     se doi vi tri cua mot chiec xe khong con chay chuyen nao, va treo mot `LOST` vinh vien ma
 *     khong ai sua duoc bang cach lam dung viec cua minh.
 *
 * Hai cho do phai dung DUNG MOT dinh nghia. Viet hai lan thi mot ngay nao do mot ben duoc sua —
 * va he thong se vao dung trang thai kho thay nhat: lai xe mo duoc phien moi, trong khi bang dieu
 * hanh van bao dong ve phien cu.
 *
 * ==============================================================================================
 * "KHONG DOC DUOC VONG CHAY" KHONG PHAI LA "DA XONG"
 * ==============================================================================================
 *
 * Ham tra ve `null` khi khong tim thay vong chay, tuc CHUA ket thuc. Mot cau tra loi thieu khong
 * duoc bien thanh mot ket luan: o `openSession` no se dong mot phien ma ta khong xac minh duoc, o
 * `LocationHealthService` no se tat mot bao dong ma ta khong chung minh duoc la thua. Khoa ngoai
 * `TransportTrackingSession.runId -> TransportVehicleRun` lam nhanh nay gan nhu khong toi duoc; no
 * duoc viet ra de neu no toi duoc thi no fail-closed.
 */
export interface EndedRunSubject {
  readonly runId: string;
  readonly status: VehicleRunStatus;
}

export async function findEndedRunSubject(
  core: Pick<TransportProofCoreFacts, 'findRun'>,
  session: Pick<TrackingSession, 'runId'>,
): Promise<EndedRunSubject | null> {
  // Phien theo CHUYEN khong di qua day. Duong cu giu nguyen ngu nghia cua no — ke ca ngu nghia ma
  // ta khong thich — vi khong mot blocker nao doi doi no, va doi no se lam moi bai kiem cua luong
  // chuyen truyen thong noi ve mot he thong khac.
  if (session.runId === null) return null;

  const run = await core.findRun(session.runId);
  if (!run || !isTerminalRunStatus(run.status)) return null;
  return { runId: run.id, status: run.status };
}
