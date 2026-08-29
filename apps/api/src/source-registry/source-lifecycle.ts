/**
 * VONG DOI CUA MOT NGUON SU THAT — ham THUAN, khong cham DB, khong cham tenant.
 *
 * ```text
 * RECEIVED ─▶ NORMALIZED ─▶ REVIEWED ─▶ APPROVED ─▶ EFFECTIVE ─▶ SUPERSEDED
 *     │            │            │
 *     └────────────┴────────────┴──▶ REJECTED / QUARANTINED
 * ```
 *
 * VI SAO TANG NAY TON TAI. Truoc ban nay, "nguon" trong he thong la mot chuoi tu do
 * (`PricePeriod.source`) va mot ban ghi nhap lieu (`SourceProvenance`). Ca hai deu tra loi duoc
 * "byte nay tu dau ra", va KHONG cai nao tra loi duoc "ai da duyet cho no co hieu luc". Bon that
 * bai dem duoc o Ultty deu nam dung o khoang trong do:
 *
 *   · ban sao noi bo de test bi mo ta nhu "khach da xac nhan";
 *   · nguon thang 07/thang 08 troi phien ban;
 *   · hai nguon gia CUNG NGAY 18/08 noi khac nhau;
 *   · gia rieng dai ly co that nhung dieu kien ap dung thi khong.
 *
 * Bon bat bien duoi day la cau tra loi, va chung deu la CONG DONG chu khong phai loi khuyen:
 *
 *   · **tai len ≠ da duyet**        — `RECEIVED` khong co canh nao di thang toi `EFFECTIVE`;
 *   · **LLM trich xuat ≠ da duyet** — trich xuat chi sinh ra de xuat, no dung o `NORMALIZED`;
 *   · **ban test noi bo ≠ khach xac nhan** — `INTERNAL_TEST` khong bao gio duoc dong dau
 *     `CUSTOMER_CONFIRMED`, du nguoi bam nut co quyen gi;
 *   · **khong kich hoat fail-open** — thieu hash/locator/moc hieu luc thi cong `EFFECTIVE` dong.
 *
 * Moi duong tu choi mang mot ma RIENG: mot cong co N duong tu choi tra ve `false` bat nguoi doc
 * trace phai mo source doc lai N dieu kien roi doan.
 */

export const SOURCE_STATUSES = [
  /** Vua nhan duoc byte/locator. Chua ai doc, chua ai duyet. */
  'RECEIVED',
  /** Da chuan hoa/trich xuat thanh de xuat co cau truc. VAN chua ai duyet. */
  'NORMALIZED',
  /** Da co nguoi doc va doi chieu. VAN chua phai quyet dinh nghiep vu. */
  'REVIEWED',
  /** Co mot ban ghi phe duyet TUONG MINH tro toi. */
  'APPROVED',
  /** Dang la nguon co hieu luc cho cac su that suy ra tu no. */
  'EFFECTIVE',
  /** Da bi mot ban moi hon thay the. Van doc duoc — lich su KHONG bi ghi de. */
  'SUPERSEDED',
  /** Bi tu choi co chu y (sai, khong dung duoc). */
  'REJECTED',
  /** Bi giu lai: nghi ngo ro ri/phan loai sai/chua du dieu kien phap ly. */
  'QUARANTINED',
] as const;
export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const INITIAL_SOURCE_STATUS: SourceStatus = 'RECEIVED';

/**
 * NGUON GOC cua byte — KHONG phai tham quyen, va tach rieng co chu y.
 *
 * "File nay tu dau ra" va "loi noi cua ai thi tinh" la hai cau hoi khac nhau. Gop lam mot chinh
 * la cach mot ban sao noi bo de test tro thanh "khach da xac nhan": no den tu thu muc cua chung
 * ta, va khong con truong nao ghi lai dieu do.
 */
export const SOURCE_ORIGINS = [
  /** Khach gui sang (mail/Zalo/Drive) — chua ky, chua dong dau. */
  'CUSTOMER_PROVIDED',
  /** Van ban khach ky/dong dau — hop dong, phu luc, thong bao gia co chu ky. */
  'CUSTOMER_SIGNED',
  /** Chung ta suy ra/soan ra tu nguon khac. Thiet ke, khong phai loi khach noi. */
  'INTERNAL_DERIVED',
  /** Ban sao dung DE TEST. Khong bao gio duoc dong dau xac nhan cua khach. */
  'INTERNAL_TEST',
  /** Ben thu ba (nha van chuyen, co quan, doi tac). */
  'THIRD_PARTY',
] as const;
export type SourceOrigin = (typeof SOURCE_ORIGINS)[number];

/** Nguon goc DUOC PHEP mang dau xac nhan cua khach. */
const CUSTOMER_ORIGINS: readonly SourceOrigin[] = ['CUSTOMER_PROVIDED', 'CUSTOMER_SIGNED'];

export const isCustomerOrigin = (origin: SourceOrigin): boolean => CUSTOMER_ORIGINS.includes(origin);

/**
 * THAM QUYEN — thu tu doc duoc, nhung CHI la tin hieu goi y.
 *
 * `L1 > L2` KHONG tu dong dong mot xung dot. No chi giup nguoi quyet dinh sap xep thu tu doc.
 * Cong `evaluateConflictResolution` khong bao gio nhin vao truong nay.
 */
export const SOURCE_AUTHORITIES = [
  /** Rang buoc phap ly: hop dong, phu luc da ky. */
  'L1_CONTRACTUAL',
  /** Khach cong bo/tu viet: thong bao gia, tai lieu luong do khach soan. */
  'L2_CUSTOMER_PUBLISHED',
  /** Quy trinh noi bo cua khach. */
  'L3_CUSTOMER_INTERNAL',
  /** Tai lieu tien hop dong, chao gia, trao doi. */
  'L4_PRE_CONTRACT',
  /** Suy dien/thiet ke cua chung ta. Khong bao gio la loi khach noi. */
  'L5_DERIVED',
] as const;
export type SourceAuthority = (typeof SOURCE_AUTHORITIES)[number];

/**
 * PHAN LOAI DU LIEU. La METADATA va phai DIEU KHIEN HANH VI — neu khong no chi la mot nhan trang
 * tri. Hai hanh vi no dieu khien nam ngay duoi: telemetry va noi luu byte.
 */
export const DATA_CLASSIFICATIONS = [
  'PUBLIC',
  'INTERNAL',
  'BUSINESS_SENSITIVE',
  'PII',
  'SECRET',
] as const;
export type DataClassification = (typeof DATA_CLASSIFICATIONS)[number];

const TELEMETRY_SAFE: readonly DataClassification[] = ['PUBLIC', 'INTERNAL'];

/**
 * Gia tri cua su that nay co duoc phep di vao telemetry khong?
 *
 * `false` KHONG co nghia la khong trace. Van trace — nhung chi id/trang thai/ma ly do. Mot he
 * thong khong quan sat duoc thi khong ho tro duoc; mot he thong bum so dien thoai khach vao span
 * thi khong dung duoc.
 */
export const isTelemetrySafeClassification = (classification: DataClassification): boolean =>
  TELEMETRY_SAFE.includes(classification);

/**
 * Byte cua nguon nay CO BAT BUOC nam ngoai repo khong?
 *
 * Day la quy tac ma `tools/customer-source-guardrail` thi hanh o tang git. Giu no o day — canh
 * mien, co kieu — chu khong chi trong script CI: mot quy tac chi ton tai trong CI la mot quy tac
 * ma code chay that khong biet.
 */
export const requiresPrivateVault = (classification: DataClassification): boolean =>
  !isTelemetrySafeClassification(classification);

/* ------------------------------------------------------------------ *
 * Chuyen trang thai
 * ------------------------------------------------------------------ */

const ALLOWED_EDGES: Readonly<Record<SourceStatus, readonly SourceStatus[]>> = {
  RECEIVED: ['NORMALIZED', 'REVIEWED', 'REJECTED', 'QUARANTINED'],
  NORMALIZED: ['REVIEWED', 'REJECTED', 'QUARANTINED'],
  REVIEWED: ['APPROVED', 'REJECTED', 'QUARANTINED'],
  APPROVED: ['EFFECTIVE', 'REJECTED', 'QUARANTINED'],
  EFFECTIVE: ['SUPERSEDED', 'QUARANTINED'],
  SUPERSEDED: [],
  REJECTED: [],
  QUARANTINED: ['REVIEWED', 'REJECTED'],
};

const TERMINAL: readonly SourceStatus[] = ['SUPERSEDED', 'REJECTED'];

export const isTerminalSourceStatus = (status: SourceStatus): boolean => TERMINAL.includes(status);

/**
 * Ngu canh mot lan chuyen. CO Y khong nhan ca entity: ham nay phai test duoc ma khong dung Prisma,
 * va phai doc duoc ma khong biet schema.
 */
export interface SourceTransitionContext {
  readonly origin: SourceOrigin;
  /** Co mot ban ghi phe duyet TUONG MINH tro toi nguon nay khong. */
  readonly hasExplicitApproval: boolean;
  /** SHA-256 cua byte da do duoc. Khong co = khong biet dang duyet cai gi. */
  readonly hasContentHash: boolean;
  /** Biet tim byte o dau. Khong co = khong ai kiem chung lai duoc. */
  readonly hasLocator: boolean;
  /** Moc bat dau hieu luc do nguoi quyet dinh dat. */
  readonly hasEffectiveFrom: boolean;
  /** Ban thay the da ton tai chua (bat buoc khi di toi `SUPERSEDED`). */
  readonly hasSupersedingSource: boolean;
}

export const SOURCE_TRANSITION_DENIED_REASONS = [
  /** Nguon da o diem cuoi (`SUPERSEDED`/`REJECTED`) — khong con duong ra. */
  'SOURCE_ALREADY_TERMINAL',
  /** Da o dung trang thai do. Tach rieng vi thuong la bam hai lan, khong phai loi. */
  'SOURCE_ALREADY_IN_STATE',
  /**
   * Canh nay khong ton tai. Day la cho "tai len ≠ da duyet" duoc thi hanh:
   * `RECEIVED → EFFECTIVE` va `NORMALIZED → APPROVED` deu roi vao ma nay.
   */
  'SOURCE_TRANSITION_NOT_PERMITTED',
  /** Di toi `APPROVED` ma khong co ban ghi phe duyet tuong minh nao. */
  'SOURCE_APPROVAL_MISSING',
  /** Di toi `EFFECTIVE` ma chua do SHA-256 — khong biet dang kich hoat dung byte nao. */
  'SOURCE_HASH_MISSING',
  /** Di toi `EFFECTIVE` ma khong biet byte nam o dau. */
  'SOURCE_LOCATOR_MISSING',
  /** Di toi `EFFECTIVE` ma khong co moc hieu luc — "co hieu luc tu bao gio" khong tra loi duoc. */
  'SOURCE_EFFECTIVE_FROM_MISSING',
  /** Di toi `SUPERSEDED` ma khong chi ra ban nao thay the. Se tao mot khoang trong im lang. */
  'SOURCE_SUPERSEDER_MISSING',
] as const;
export type SourceTransitionDeniedReason = (typeof SOURCE_TRANSITION_DENIED_REASONS)[number];

export type SourceTransitionDecision =
  | { readonly allowed: true; readonly reason: 'SOURCE_TRANSITION_ALLOWED' }
  | { readonly allowed: false; readonly reason: SourceTransitionDeniedReason };

const ALLOW_TRANSITION: SourceTransitionDecision = {
  allowed: true,
  reason: 'SOURCE_TRANSITION_ALLOWED',
};
const denyTransition = (reason: SourceTransitionDeniedReason): SourceTransitionDecision => ({
  allowed: false,
  reason,
});

/**
 * Quyet dinh MOT lan chuyen trang thai nguon.
 *
 * Thu tu kiem tra co y, giong `evaluateTripTransition`: diem cuoi truoc, trung trang thai, hinh
 * dang do thi, roi moi den dieu kien noi dung. Dao thu tu se khien mot nguon da bi thay the tra ve
 * `SOURCE_HASH_MISSING` — dung ve ky thuat, vo dung voi nguoi doc.
 */
export function evaluateSourceTransition(
  from: SourceStatus,
  to: SourceStatus,
  context: SourceTransitionContext,
): SourceTransitionDecision {
  if (isTerminalSourceStatus(from)) return denyTransition('SOURCE_ALREADY_TERMINAL');
  if (from === to) return denyTransition('SOURCE_ALREADY_IN_STATE');
  if (!ALLOWED_EDGES[from].includes(to)) return denyTransition('SOURCE_TRANSITION_NOT_PERMITTED');

  if (to === 'APPROVED' && !context.hasExplicitApproval) {
    return denyTransition('SOURCE_APPROVAL_MISSING');
  }

  // KHONG KICH HOAT FAIL-OPEN: ba dieu kien, ba ma. Gop lai thanh mot `boolean` thi nguoi truc se
  // biet "khong kich hoat duoc" ma khong biet phai di do lai hash hay di hoi moc hieu luc.
  if (to === 'EFFECTIVE') {
    if (!context.hasContentHash) return denyTransition('SOURCE_HASH_MISSING');
    if (!context.hasLocator) return denyTransition('SOURCE_LOCATOR_MISSING');
    if (!context.hasEffectiveFrom) return denyTransition('SOURCE_EFFECTIVE_FROM_MISSING');
  }

  if (to === 'SUPERSEDED' && !context.hasSupersedingSource) {
    return denyTransition('SOURCE_SUPERSEDER_MISSING');
  }

  return ALLOW_TRANSITION;
}

/* ------------------------------------------------------------------ *
 * Phe duyet — cong "ban test noi bo ≠ khach xac nhan"
 * ------------------------------------------------------------------ */

/**
 * MUC DO cua mot phe duyet. Hai gia tri nay KHONG thay the nhau duoc.
 *
 * `INTERNAL_ACCEPTED`  = "chung toi dong y dung ban nay de chay tiep".
 * `CUSTOMER_CONFIRMED` = "khach da xac nhan day la su that cua ho".
 *
 * Ultty da chung minh vi sao phai tach: mot ban sao noi bo tung duoc mo ta nhu ban khach xac nhan,
 * va khong co truong nao trong he thong noi duoc dieu do la sai.
 */
export const APPROVAL_LEVELS = ['INTERNAL_ACCEPTED', 'CUSTOMER_CONFIRMED'] as const;
export type ApprovalLevel = (typeof APPROVAL_LEVELS)[number];

export const APPROVAL_DENIED_REASONS = [
  /** Nguon goc noi bo/test ma doi dong dau `CUSTOMER_CONFIRMED`. Cong DUY NHAT chan dieu do. */
  'APPROVAL_ORIGIN_NOT_CUSTOMER',
  /** Chua co ai/khong biet ai duyet. Phe duyet vo danh khong phai phe duyet. */
  'APPROVAL_ACTOR_MISSING',
  /** Khong co dan chung (so hop dong, link mail, bien ban). */
  'APPROVAL_EVIDENCE_MISSING',
] as const;
export type ApprovalDeniedReason = (typeof APPROVAL_DENIED_REASONS)[number];

export type ApprovalDecision =
  | { readonly allowed: true; readonly reason: 'APPROVAL_RECORDED' }
  | { readonly allowed: false; readonly reason: ApprovalDeniedReason };

export interface ApprovalContext {
  readonly level: ApprovalLevel;
  readonly origin: SourceOrigin;
  readonly actor: string | null;
  readonly evidenceRef: string | null;
}

/**
 * Quyet dinh mot lan phe duyet.
 *
 * Bat bien khoa o day: `CUSTOMER_CONFIRMED` doi nguon goc PHAI la cua khach. Mot ban
 * `INTERNAL_TEST` van duyet duoc — nhung chi len toi `INTERNAL_ACCEPTED`, va cai nhan do di theo
 * no mai mai. Khong co duong nao "nang cap" no ma khong dang ky lai byte tu khach.
 */
export function evaluateApproval(context: ApprovalContext): ApprovalDecision {
  if (!context.actor?.trim()) return { allowed: false, reason: 'APPROVAL_ACTOR_MISSING' };
  if (!context.evidenceRef?.trim()) return { allowed: false, reason: 'APPROVAL_EVIDENCE_MISSING' };
  if (context.level === 'CUSTOMER_CONFIRMED' && !isCustomerOrigin(context.origin)) {
    return { allowed: false, reason: 'APPROVAL_ORIGIN_NOT_CUSTOMER' };
  }
  return { allowed: true, reason: 'APPROVAL_RECORDED' };
}
