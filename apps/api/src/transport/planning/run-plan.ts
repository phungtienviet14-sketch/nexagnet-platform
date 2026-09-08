import { isTerminalRunStatus } from '../movement/movement-lifecycle.js';
import type { RunLegKind, RunLegStatus, VehicleRunStatus } from '../movement/movement.types.js';
import type { PlanGroupingReason } from './planning-decisions.js';
import { sameSite } from './planning-policy.js';
import type {
  Depot,
  PlanStartSource,
  PlannedLeg,
  RunGrouping,
  RunPlanProposal,
} from './planning.types.js';

/**
 * BO LAP KE HOACH — ham THUAN. Khong I/O, khong dong ho, khong sinh ma.
 *
 * ============================================================================================
 * MOT LAN LAP KE HOACH SINH RA NHIEU NHAT HAI CHANG
 * ============================================================================================
 *
 *   · MOT chang `EMPTY` — chi khi diem ket thuc truoc do KHAC diem lay hang;
 *   · MOT chang `LOADED` — luon co, va no LA cai duoc lap ke hoach.
 *
 * Khong bao gio co chang thu ba. Dac biet: KHONG sinh chang rong ve bai o cuoi. `#276` L2 viet
 * dung chu: *"Do not fabricate a return-to-depot leg just to close the Run."* Xe co ve bai hay
 * khong la mot su that van hanh se duoc ghi khi no xay ra, khong phai mot dong ma bao cao can.
 *
 * ============================================================================================
 * VI SAO CHANG RONG LA `PLANNED` VA `plannedDistanceKm`, KHONG PHAI KM DA GHI NHAN
 * ============================================================================================
 *
 * Chang do la mot DU DINH. Neu xe khong di no (don bi huy, dieu lai xe khac), no se bi huy va —
 * theo `summariseRunMovement()` — khong mot km nao cua no duoc dem vao so THUC TE. Do la cach
 * `#276` L6 doi phan biet *"planned empty leg"* voi *"cancelled/future planned leg that was never
 * executed"*: bang TRANG THAI cua chang, khong bang mot cot co/khong.
 */

export interface PlannerOrderFacts {
  readonly id: string;
  readonly code: string;
  readonly originLabel: string;
  readonly destinationLabel: string;
}

/** Chang cua vong chay, thu gon con dung nhung gi khau lap ke hoach doc. */
export interface PlannerLegFacts {
  readonly sequence: number;
  readonly kind: RunLegKind;
  readonly status: RunLegStatus;
  readonly destinationLabel: string;
}

/**
 * Vong chay GAN NHAT cua chiec xe — ke ca khi no da ket thuc.
 *
 * Nhan ca vong chay da ket thuc chu khong loc san o tang goi, va do la co y: `#276` L4 doi phan
 * biet *"xe chua co vong chay nao"* voi *"vong chay cu da dong roi"*. Hai tinh huong cho ra cung
 * mot ket qua (mot vong chay moi) nhung KHAC ly do, va nguoi doc so quyet dinh phai thay duoc
 * rang he thong da nhin thay lich su chu khong bo qua no.
 */
export interface PlannerRunFacts {
  readonly id: string;
  readonly code: string;
  readonly status: VehicleRunStatus;
  readonly legs: readonly PlannerLegFacts[];
}

/**
 * Km DU KIEN do nguoi goi mang toi — vd Lane M sau khi tinh duong di.
 *
 * `undefined`/`null` deu la CHUA BIET. Khong co duong nao dat 0 mac dinh: `#276` L6 viet
 * *"If distance is unknown: preserve null/unknown; do not use 0."*
 */
export interface PlannedDistanceHint {
  readonly emptyKm?: number | null;
  readonly loadedKm?: number | null;
}

export interface PlanOrderAssignmentInput {
  readonly order: PlannerOrderFacts;
  readonly vehicleId: string;
  readonly grouping: RunGrouping;
  /** `null` khi khach chua khai bai, hoac khai nhieu bai den muc khong chon duoc. */
  readonly depot: Depot | null;
  /** Vong chay gan nhat cua chinh chiec xe do. `null` khi xe chua co vong chay nao. */
  readonly latestRun: PlannerRunFacts | null;
  readonly distanceHint?: PlannedDistanceHint;
}

export interface RunPlanDecision {
  readonly proposal: RunPlanProposal;
  readonly groupingReason: PlanGroupingReason;
}

const NOT_CANCELLED = (leg: PlannerLegFacts): boolean => leg.status !== 'CANCELLED';

/**
 * Diem ma xe se dung sau nhung gi da co tren vong chay.
 *
 * Doc chang KHONG HUY co `sequence` lon nhat. Chang da huy khong dua xe di dau ca, nen lay no lam
 * diem xuat phat se sinh mot chang rong tu mot noi xe chua tung den.
 */
function lastPosition(legs: readonly PlannerLegFacts[]): string | null {
  const live = legs.filter(NOT_CANCELLED);
  if (live.length === 0) return null;
  const last = live.reduce((best, leg) => (leg.sequence > best.sequence ? leg : best));
  return last.destinationLabel;
}

/**
 * So thu tu ke tiep — tinh tren MOI chang, ke ca chang da huy.
 *
 * `@@unique([runId, sequence])` khong loai tru hang da huy, nen dung lai mot so cua chang huy se
 * dung o kho. Day la mot chi tiet cua tang luu tru lot len tang thuan, va no phai lot len: bo
 * lap ke hoach ma de nghi mot so trung se sinh ra mot loi ma nguoi dung khong hieu.
 */
function nextSequence(legs: readonly PlannerLegFacts[]): number {
  return legs.reduce((max, leg) => Math.max(max, leg.sequence), 0) + 1;
}

/**
 * CHE DO GOM NHOM quyet dinh mot dieu duy nhat: co noi vao vong chay dang chay hay khong.
 *
 * `ONE_ORDER_PER_RUN` khong bao gio noi — ke ca khi xe dang chay do. Do la dinh nghia cua che do,
 * va `#276` L9 bai 6 kiem dung dieu do.
 */
function chooseTarget(input: PlanOrderAssignmentInput): {
  readonly appendTo: PlannerRunFacts | null;
  readonly reason: PlanGroupingReason;
} {
  if (input.grouping === 'ONE_ORDER_PER_RUN') {
    return { appendTo: null, reason: 'GROUPING_ONE_ORDER_PER_RUN' };
  }
  if (input.latestRun === null) {
    return { appendTo: null, reason: 'GROUPING_MULTI_NO_OPEN_RUN' };
  }
  if (isTerminalRunStatus(input.latestRun.status)) {
    // `#276` L4: *"Never silently reopen old history merely to make chaining convenient."*
    return { appendTo: null, reason: 'GROUPING_MULTI_OPEN_RUN_TERMINAL' };
  }
  return { appendTo: input.latestRun, reason: 'GROUPING_MULTI_APPENDED_TO_OPEN_RUN' };
}

export function planOrderAssignment(input: PlanOrderAssignmentInput): RunPlanDecision {
  const { appendTo, reason } = chooseTarget(input);

  const previous = appendTo === null ? (input.depot?.label ?? null) : lastPosition(appendTo.legs);

  /**
   * BA nguon, va chung khong thay the nhau duoc.
   *
   * Mot vong chay noi tiep ma chang cu deu bi huy (`previous === null`) roi ve dung nhanh nhu mot
   * vong chay khong co bai: khong biet xe o dau, nen khong sinh chang rong. Do la cau tra loi
   * dung — cai sai duy nhat o day la bia ra mot diem xuat phat.
   */
  const startSource: PlanStartSource =
    previous === null ? 'ORDER_ORIGIN' : appendTo === null ? 'DEPOT' : 'PREVIOUS_LEG_DESTINATION';

  const startsFrom = previous ?? input.order.originLabel;
  const emptyLegRequired = previous !== null && !sameSite(previous, input.order.originLabel);

  const first = appendTo === null ? 1 : nextSequence(appendTo.legs);
  const legs: PlannedLeg[] = [];

  if (emptyLegRequired) {
    legs.push({
      sequence: first,
      kind: 'EMPTY',
      orderId: null,
      originLabel: startsFrom,
      destinationLabel: input.order.originLabel,
      plannedDistanceKm: input.distanceHint?.emptyKm ?? null,
    });
  }

  legs.push({
    sequence: emptyLegRequired ? first + 1 : first,
    kind: 'LOADED',
    orderId: input.order.id,
    originLabel: input.order.originLabel,
    destinationLabel: input.order.destinationLabel,
    plannedDistanceKm: input.distanceHint?.loadedKm ?? null,
  });

  return {
    groupingReason: reason,
    proposal: {
      orderId: input.order.id,
      vehicleId: input.vehicleId,
      grouping: input.grouping,
      outcome: appendTo === null ? 'NEW_RUN' : 'APPENDED',
      runId: appendTo?.id ?? null,
      runCode: appendTo?.code ?? null,
      startsFrom,
      startSource,
      legs,
      emptyLegRequired,
    },
  };
}

/**
 * MA VONG CHAY do MAY CHU sinh — `#276` L2: sep/ke toan khong go ma vong chay.
 *
 * `S` sau phan ngay la mot nhan doc duoc: van hanh nhin ma la biet vong chay nay do he thong lap
 * ke hoach sinh ra, khong tu mot lan dieu xe go tay hay mot lan lai xe nhan viec tai A (`RUN-A…`).
 *
 * Phan duoi la MOT PHAN CUA KHOA CHONG LAP, khong phai so ngau nhien — cung ly le da ghi o
 * `runCodeFor()` cua `site-intake.service.ts`. Hai yeu cau cua cung mot khoa den cung luc deu qua
 * duoc phep doc chong lap o dau ham (ban kia chua commit); bam tat dinh dua cong chan trung LEN
 * lan ghi DAU TIEN, noi unique cua `TransportVehicleRun.code` chan ngay ban thu hai truoc khi no
 * kip tao mot chang nao.
 */
export function planRunCode(businessDate: string, digest: string): string {
  const compact = businessDate.replaceAll('-', '').slice(2);
  return `RUN-S${compact}-${digest.slice(0, 8).toUpperCase()}`;
}
