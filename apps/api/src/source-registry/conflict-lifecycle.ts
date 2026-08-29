/**
 * XUNG DOT NGUON — ham THUAN.
 *
 * ```text
 * OPEN ──▶ RESOLVED     (chi bang BANG CHUNG TUONG MINH)
 *   ├──▶ SUPERSEDED     (ca hai ben deu da bi mot nguon moi hon thay the)
 *   └──▶ WITHDRAWN      (doc lai thi hai ben khong thuc su mau thuan)
 * ```
 *
 * VI SAO XUNG DOT PHAI LA THUC THE HANG NHAT. Mot xung dot khong duoc mo hinh hoa khong bien mat
 * — no bien thanh mot dong `if` o mot cho nao do, hoac thanh mot cau trong tai lieu ma runtime
 * khong doc. Ultty co ba xung dot dang mo that; van tai co bay. Truoc ban nay khong cai nao trong
 * so do ton tai duoi dang DU LIEU, nen khong cai nao chan duoc mot cau tra loi tu tin gui di.
 *
 * BON CACH CHON NGAM BI CAM. Khong cai nao trong so nay duoc dong mot xung dot:
 *
 *   · ngay moi hon thang       — hai nguon gia Ultty CUNG NGAY 18/08;
 *   · tham quyen cao hon thang — `L1 > L3` la goi y doc truoc, khong phai phan quyet;
 *   · LLM phan xu              — LLM khong duoc quyet chinh sach, day la bat bien cua he thong;
 *   · "cu the hon" thang       — mot bang chi tiet hon khong co nghia la no dung hon.
 *
 * Ca bon van duoc GHI LAI — o `recommendation`, va chi o do. Mot goi y co ghi so giup nguoi quyet
 * dinh di nhanh; mot goi y duoc phep tu bam nut thi khong con la goi y.
 */

export const CONFLICT_STATUSES = [
  /** Dang mo. Moi su that dinh vao no deu KHONG dung duoc cho viec doi `CONFIRMED_ONLY`. */
  'OPEN',
  /** Da co nguoi co tham quyen chot, kem bang chung. */
  'RESOLVED',
  /** Ca hai ben deu da bi thay the — xung dot tu het y nghia, khong ai phai chot. */
  'SUPERSEDED',
  /** Doc lai thi khong phai mau thuan (vd hai luat dung cho hai su kien khac nhau). */
  'WITHDRAWN',
] as const;
export type ConflictStatus = (typeof CONFLICT_STATUSES)[number];

export const INITIAL_CONFLICT_STATUS: ConflictStatus = 'OPEN';

const TERMINAL: readonly ConflictStatus[] = ['RESOLVED', 'SUPERSEDED', 'WITHDRAWN'];

export const isTerminalConflictStatus = (status: ConflictStatus): boolean =>
  TERMINAL.includes(status);

/** Xung dot dang mo = dang CHAN. Mot ham co ten cho cau hoi se con quay lai o Tenant Doctor. */
export const isBlockingConflictStatus = (status: ConflictStatus): boolean => status === 'OPEN';

/**
 * MUC ANH HUONG — de sap thu tu hang viec, KHONG de tu dong hoa.
 *
 * `BLOCKING` khong co nghia la "he thong tu dung"; no co nghia la moi su that dinh vao xung dot
 * nay deu tra `FACT_BLOCKED_BY_OPEN_CONFLICT` khi ai do doi muc `CONFIRMED_ONLY`.
 */
export const CONFLICT_IMPACTS = [
  /** Chan mot nang luc: khong tra loi duoc cho khach cho den khi co nguoi chot. */
  'BLOCKING',
  /** Chay tiep duoc nhung co rui ro nghiep vu that (vd bao lech mot cot gia tham chieu). */
  'DEGRADING',
  /** Ghi nhan de khong quen; chua cham vao duong chay nao. */
  'ADVISORY',
] as const;
export type ConflictImpact = (typeof CONFLICT_IMPACTS)[number];

/**
 * TIN HIEU GOI Y — co ghi so, va khong bao gio tu dong.
 *
 * Truong nay ton tai de nguoi doc khong phai dung lai lap luan mot lan nua. No KHONG duoc xuat
 * hien trong bat ky nhanh `if` nao cua `evaluateConflictResolution`, va co mot bai test khoa dieu
 * do lai.
 */
export interface ConflictRecommendation {
  /** Ben duoc goi y, dang id cua mot su that dang tranh chap. */
  readonly suggestedFactId: string;
  /** Vi sao goi y the — cau chu cho nguoi doc. */
  readonly rationale: string;
}

export interface ConflictResolutionContext {
  /** Ai chot. Vo danh thi khong phai mot quyet dinh. */
  readonly actor: string | null;
  /**
   * Dan chung cua quyet dinh: so hop dong, link mail khach tra loi, bien ban hop.
   * KHONG duoc la "theo goi y cua he thong" — do la ly luan vong tron.
   */
  readonly evidenceRef: string | null;
  /** Ben duoc chon PHAI la mot trong cac ben dang tranh chap cua chinh xung dot nay. */
  readonly winningFactId: string | null;
  readonly competingFactIds: readonly string[];
}

export const CONFLICT_RESOLUTION_DENIED_REASONS = [
  /** Xung dot da dong roi. */
  'CONFLICT_ALREADY_TERMINAL',
  /** Khong biet ai chot. */
  'CONFLICT_ACTOR_MISSING',
  /**
   * Chot ma khong co dan chung.
   *
   * Day la ma quan trong nhat cua tep nay: no chan "dong xung dot cho sach bang" — mot hanh vi
   * rat de xay ra luc chuan bi go-live, va rat kho phat hien ve sau vi ket qua nhin y het mot
   * quyet dinh that.
   */
  'CONFLICT_EVIDENCE_MISSING',
  /** Chua chi ra ben nao thang. */
  'CONFLICT_WINNER_MISSING',
  /** Ben duoc chon khong nam trong so cac ben dang tranh chap. */
  'CONFLICT_WINNER_NOT_COMPETING',
] as const;
export type ConflictResolutionDeniedReason = (typeof CONFLICT_RESOLUTION_DENIED_REASONS)[number];

export type ConflictResolutionDecision =
  | { readonly allowed: true; readonly reason: 'CONFLICT_RESOLUTION_RECORDED' }
  | { readonly allowed: false; readonly reason: ConflictResolutionDeniedReason };

/**
 * Quyet dinh mot lan DONG xung dot.
 *
 * Chu y cai ham nay KHONG nhan: khong nhan ngay thang, khong nhan tham quyen, khong nhan
 * `recommendation`. Do la THIET KE, khong phai thieu sot — noi nao khong nhin thay du lieu thi noi
 * do khong the len dua vao no de tu quyet.
 */
export function evaluateConflictResolution(
  from: ConflictStatus,
  context: ConflictResolutionContext,
): ConflictResolutionDecision {
  if (isTerminalConflictStatus(from)) {
    return { allowed: false, reason: 'CONFLICT_ALREADY_TERMINAL' };
  }
  if (!context.actor?.trim()) return { allowed: false, reason: 'CONFLICT_ACTOR_MISSING' };
  if (!context.evidenceRef?.trim()) return { allowed: false, reason: 'CONFLICT_EVIDENCE_MISSING' };
  if (!context.winningFactId?.trim()) return { allowed: false, reason: 'CONFLICT_WINNER_MISSING' };
  if (!context.competingFactIds.includes(context.winningFactId)) {
    return { allowed: false, reason: 'CONFLICT_WINNER_NOT_COMPETING' };
  }
  return { allowed: true, reason: 'CONFLICT_RESOLUTION_RECORDED' };
}
