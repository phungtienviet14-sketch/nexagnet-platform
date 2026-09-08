import type { RunLegStatus, VehicleRunStatus } from '../movement/movement.types.js';
import { sameSite } from './planning-policy.js';
import type {
  Depot,
  RunClosureBlocker,
  RunClosurePolicy,
  RunClosureVerdict,
} from './planning.types.js';

/**
 * DONG VONG CHAY — ham THUAN, va la trai tim cua `#276` L4.
 *
 * ============================================================================================
 * SEP/KE TOAN KHONG BAM "DONG VONG CHAY"
 * ============================================================================================
 *
 * Cai gi dong no thi phai TAT DINH va suy ra duoc tu su that nguon. Nen o day khong co tham so
 * nao ten la `force`, khong co duong nao nhan mot y muon cua nguoi dung, va ket qua chi phu thuoc
 * vao: trang thai vong chay, trang thai tung chang, so ke hoach con mo, bai xe da khai, nguong
 * nghi da khai, va gio hien tai.
 *
 * ============================================================================================
 * `RUN CLOSED != ORDER COMPLETED`
 * ============================================================================================
 *
 * Ham nay khong biet gi ve `TransportOrder`. Do la co y, va no la mot bat bien cua ca #274: dong
 * mot vong chay la mot su kien VAN HANH; hoan thanh mot nghia vu thuong mai la mot quyet dinh cua
 * ke toan (Lane K). Neu mot ngay ai do them `orderId` vao dau vao cua ham nay, do la dau hieu hai
 * truc dang bi tron lai.
 *
 * ============================================================================================
 * BA TRANG THAI DAU RA, KHONG PHAI HAI
 * ============================================================================================
 *
 *   · `closable`            — dong duoc, va `trigger` noi vi sao;
 *   · `blockers` khong rong — con viec dang chay. KHONG dong;
 *   · `holding`             — het viec roi nhung chua den dieu kien dong (xe xong hang ma chua ve
 *                             bai, khach chua khai nguong nghi). Day KHONG phai loi.
 *
 * Gop `holding` vao `blockers` se lam mot trang thai binh thuong cua doi xe trong nhu mot su co,
 * va bang dieu hanh se do rue len moi buoi chieu.
 */

export interface ClosureLegFacts {
  readonly id: string;
  readonly sequence: number;
  readonly status: RunLegStatus;
  readonly destinationLabel: string;
  /** ISO, hoac `null` khi chang chua ket thuc. */
  readonly completedAt: string | null;
}

export interface RunClosureFacts {
  readonly runStatus: VehicleRunStatus;
  readonly legs: readonly ClosureLegFacts[];
  /**
   * So ke hoach CHUA HUY ma chang co hang cua no chua ket thuc. Trong hau het truong hop no
   * trung voi so chang con mo, nhung khong phai luon: mot ke hoach vua ghi xong ma chang cua no
   * bi ai do huy rieng se de lai mot ke hoach mo coi, va vong chay do khong duoc dong lang le.
   */
  readonly openPlanCount: number;
  /** Bai xe dang hoat dong, hoac `null` khi khach chua khai / khai nhieu qua. */
  readonly depot: Depot | null;
  readonly policy: RunClosurePolicy;
  readonly now: Date;
  /**
   * DIEU KIEN CHAN DEN TU NGOAI `transport-core`.
   *
   * `#276` L4 liet ke *"cargo still carried"* va *"open waiting session"* trong danh sach chan.
   * Hai su that do KHONG song trong `transport-core`: cai thu nhat suy ra tu moc van hanh cua
   * `transport-checkpoint`, cai thu hai la `TransportDeliveryWaitingSession` cua `#243` F3 —
   * chua vao `main`, va thuoc Lane O.
   *
   * `transport-core` KHONG duoc phu thuoc nguoc len hai capability do (chieu phu thuoc di tu
   * chung xuong core, xem `capabilityRequirements`). Nen cho cua chung la mot THAM SO cua ham
   * thuan nay, khong phai mot `@Optional()` DI khong bao gio duoc buoc.
   *
   * Hom nay khong duong chay nao truyen gia tri vao day, va do la mot KHOANG CACH DA GHI TEN chu
   * khong mot cho trong bi bo quen: khi Lane O co phien cho, no truyen `OPEN_WAITING_SESSION` vao
   * day va khong mot dong nao cua tep nay phai doi.
   */
  readonly additionalBlockers?: readonly RunClosureBlocker[];
}

const IS_OPEN = (leg: ClosureLegFacts): boolean =>
  leg.status === 'PLANNED' || leg.status === 'IN_TRANSIT';

const IS_COMPLETED = (leg: ClosureLegFacts): boolean => leg.status === 'COMPLETED';

const HOUR_MS = 3_600_000;

/**
 * Chang HOAN THANH sau cung — `completedAt` truoc, roi `sequence` de PHA HOA.
 *
 * Khoa chinh la dong ho MAY CHU chu khong `sequence`: mot chang so 2 co the ket thuc sau chang so
 * 3 neu dieu xe dao thu tu, va cai quyet dinh "xe dang o dau" la lan ket thuc muon nhat.
 *
 * Nhung `completedAt` mot minh KHONG DU, va day la mot lo hong do duoc chu khong mot gia dinh:
 * hai chang dong lien tiep trong CUNG mot mili giay se hoa, va phep chon se roi vao chang nao
 * duyet truoc — tuc "xe dang o dau" doi theo thu tu doc cua kho. Voi mot vong chay hai chang, do
 * la khac biet giua "xe o cang" va "xe o kho", va no keo theo ca quyet dinh dong vong chay.
 *
 * `sequence` la khoa phu dung: trong cung mot khoanh khac, chang co so lon hon la chang di sau.
 */
function lastCompleted(legs: readonly ClosureLegFacts[]): ClosureLegFacts | null {
  let best: ClosureLegFacts | null = null;
  for (const leg of legs) {
    if (!IS_COMPLETED(leg) || leg.completedAt === null) continue;
    if (best === null) {
      best = leg;
      continue;
    }
    const at = leg.completedAt;
    const bestAt = best.completedAt ?? '';
    if (at > bestAt || (at === bestAt && leg.sequence > best.sequence)) best = leg;
  }
  return best;
}

export function evaluateRunClosure(facts: RunClosureFacts): RunClosureVerdict {
  const blockers: RunClosureBlocker[] = [];

  // `PLANNED` chua chay thi khong co gi de dong; `COMPLETED`/`CANCELLED` thi da xong. Ca hai deu
  // KHONG phai loi — nguoi goi phan biet bang `runStatus`, khong bang mot ngoai le.
  if (facts.runStatus !== 'ACTIVE') blockers.push('RUN_NOT_ACTIVE');

  if (facts.legs.some(IS_OPEN)) blockers.push('LEG_STILL_OPEN');
  if (facts.openPlanCount > 0) blockers.push('PLAN_STILL_OPEN');

  const completed = lastCompleted(facts.legs);
  if (completed === null) blockers.push('NO_COMPLETED_WORK');

  for (const extra of facts.additionalBlockers ?? []) blockers.push(extra);

  if (blockers.length > 0 || completed === null) {
    return { closable: false, trigger: null, blockers, holding: false };
  }

  // TRUONG HOP DONG MANH — xe da ve bai. `#276` L4.
  if (facts.depot !== null && sameSite(completed.destinationLabel, facts.depot.label)) {
    return { closable: true, trigger: 'DEPOT_RETURN', blockers: [], holding: false };
  }

  // TRUONG HOP KET THUC XA BAI. Khong khai nguong = khong dong vi het gio, va vong chay o lai
  // trang thai `holding` cho toi khi xe ve bai hoac nguoi van hanh xu ly. Do la mac dinh bao thu
  // ma `#276` L4 doi: khong doan mot con so ma khach chua noi.
  const idleHours = facts.policy.idleHours;
  if (idleHours !== null && completed.completedAt !== null) {
    const idleMs = facts.now.getTime() - Date.parse(completed.completedAt);
    if (Number.isFinite(idleMs) && idleMs >= idleHours * HOUR_MS) {
      return { closable: true, trigger: 'IDLE_TIMEOUT', blockers: [], holding: false };
    }
  }

  return { closable: false, trigger: null, blockers: [], holding: true };
}
