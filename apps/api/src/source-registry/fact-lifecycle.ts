import type { DataClassification } from './source-lifecycle.js';

/**
 * VONG DOI CUA MOT SU THAT NGHIEP VU — ham THUAN.
 *
 * Mot "su that" o day la mot cap `(domain, key) → value` DUOC SUY RA TU MOT NGUON, khong phai mot
 * o trong bang cau hinh. Khac biet do la toan bo diem cua tang nay: `maxAutoConfirmQuantity = 50`
 * trong `tenant.json` tra loi duoc "he thong dang lam gi" nhung khong tra loi duoc "vi sao 50, ai
 * noi the, va neu co nguoi noi khac thi sao".
 *
 * ```text
 * PROPOSED ──▶ CONFIRMED ──▶ SUPERSEDED
 *     │            ▲
 *     ├──▶ WORKING_ASSUMPTION ─┘   (chi qua PHE DUYET TUONG MINH — khong tu troi sang)
 *     └──▶ REJECTED
 * ```
 *
 * `WORKING_ASSUMPTION` la trang thai QUAN TRONG NHAT o day va no phai TON TAI RIENG.
 *
 * Ultty dang chay that tren ba gia dinh (`ASM-01..03`) do chinh chung ta dat ra vi chua hoi duoc
 * khach. Ba cai do KHONG phai su that cua khach, va cung KHONG phai cho trong — he thong dang
 * chay bang chung. Neu mo hinh chi co `CONFIRMED`/thieu-du-lieu, thi hoac ta noi doi (ghi
 * `CONFIRMED`), hoac ta chan mot he thong dang chay duoc. Ca hai deu tung xay ra that. Trang thai
 * thu ba la cach duy nhat noi dung su that: *dang chay, tren mot gia dinh co ghi so, dao nguoc
 * duoc*.
 *
 * Vi the mot gia dinh BAT BUOC mang du bon truong — ly do, rui ro, cach dao nguoc, chu so huu.
 * Mot gia dinh khong ghi duoc cach dao nguoc thi tren thuc te la mot quyet dinh vinh vien ma
 * khong ai ky.
 */

export const FACT_STATUSES = [
  /** Da trich xuat/de xuat. Chua ai duyet. Mac dinh cua moi thu LLM sinh ra. */
  'PROPOSED',
  /**
   * DANG CHAY tren mot gia dinh do CHUNG TA dat, vi chua hoi duoc nguoi co tham quyen.
   * KHONG phai su that cua khach. KHONG dong xung dot tuong ung.
   */
  'WORKING_ASSUMPTION',
  /** Nguoi co tham quyen da xac nhan. Day moi la su that nghiep vu. */
  'CONFIRMED',
  /** Da bi mot ban moi hon thay the. Van doc duoc — lich su KHONG bi ghi de. */
  'SUPERSEDED',
  /** Bi bac bo co chu y. */
  'REJECTED',
] as const;
export type FactStatus = (typeof FACT_STATUSES)[number];

const TERMINAL: readonly FactStatus[] = ['SUPERSEDED', 'REJECTED'];

export const isTerminalFactStatus = (status: FactStatus): boolean => TERMINAL.includes(status);

/** Su that dang O TRANG THAI co the phuc vu runtime (con `canUseFact` moi quyet dinh that). */
const USABLE: readonly FactStatus[] = ['CONFIRMED', 'WORKING_ASSUMPTION'];

export const isUsableFactStatus = (status: FactStatus): boolean => USABLE.includes(status);

/**
 * Bon truong bat buoc cua mot GIA DINH LAM VIEC. Doc thang tu `ASM-01..03` cua Ultty — nhung o
 * day chung la KIEU, khong phai mot muc trong mot tep markdown.
 */
export interface WorkingAssumptionEvidence {
  /** Vi sao chon cach doc nay. Khong phai "vi no tien". */
  readonly rationale: string;
  /** Neu gia dinh SAI thi hong cai gi, rong bao nhieu. */
  readonly risk: string;
  /** Dao nguoc bang gi. `ASM-02` dao nguoc bang mot so trong `tenant.json` — do la ly do no duoc chon. */
  readonly reversibility: string;
  /** Ai chiu trach nhiem di hoi cho ra cau tra loi that. */
  readonly owner: string;
}

const ALLOWED_EDGES: Readonly<Record<FactStatus, readonly FactStatus[]>> = {
  PROPOSED: ['WORKING_ASSUMPTION', 'CONFIRMED', 'REJECTED'],
  WORKING_ASSUMPTION: ['CONFIRMED', 'REJECTED', 'SUPERSEDED'],
  CONFIRMED: ['SUPERSEDED', 'REJECTED'],
  SUPERSEDED: [],
  REJECTED: [],
};

export interface FactTransitionContext {
  /** Nguon suy ra su that nay da `EFFECTIVE` chua. */
  readonly sourceEffective: boolean;
  /** Co ban ghi phe duyet TUONG MINH cho chinh lan chuyen nay khong. */
  readonly hasExplicitApproval: boolean;
  /** Phe duyet do co phai muc `CUSTOMER_CONFIRMED` khong. */
  readonly approvalIsCustomerConfirmed: boolean;
  /** Du bon truong cua mot gia dinh (chi bat buoc khi di toi `WORKING_ASSUMPTION`). */
  readonly hasAssumptionEvidence: boolean;
  /** Ban thay the da ton tai chua (bat buoc khi di toi `SUPERSEDED`). */
  readonly hasSupersedingFact: boolean;
}

export const FACT_TRANSITION_DENIED_REASONS = [
  'FACT_ALREADY_TERMINAL',
  'FACT_ALREADY_IN_STATE',
  'FACT_TRANSITION_NOT_PERMITTED',
  /** Su that khong duoc vuot len truoc nguon cua chinh no. */
  'FACT_SOURCE_NOT_EFFECTIVE',
  /** Di toi `CONFIRMED` ma khong co phe duyet tuong minh. */
  'FACT_APPROVAL_MISSING',
  /**
   * `WORKING_ASSUMPTION → CONFIRMED` ma phe duyet KHONG phai `CUSTOMER_CONFIRMED`.
   *
   * Day la cong chan "gia dinh tu troi thanh su that". Mot gia dinh do chung ta dat ra chi tro
   * thanh su that khi NGUOI CO THAM QUYEN noi the — khong phai khi no da chay du lau, va khong
   * phai khi mot ban duyet noi bo di qua.
   */
  'FACT_ASSUMPTION_NEEDS_CUSTOMER_CONFIRMATION',
  /** Di toi `WORKING_ASSUMPTION` ma thieu ly do/rui ro/cach dao nguoc/chu so huu. */
  'FACT_ASSUMPTION_EVIDENCE_MISSING',
  /** Di toi `SUPERSEDED` ma khong chi ra ban nao thay the. */
  'FACT_SUPERSEDER_MISSING',
] as const;
export type FactTransitionDeniedReason = (typeof FACT_TRANSITION_DENIED_REASONS)[number];

export type FactTransitionDecision =
  | { readonly allowed: true; readonly reason: 'FACT_TRANSITION_ALLOWED' }
  | { readonly allowed: false; readonly reason: FactTransitionDeniedReason };

const ALLOW: FactTransitionDecision = { allowed: true, reason: 'FACT_TRANSITION_ALLOWED' };
const deny = (reason: FactTransitionDeniedReason): FactTransitionDecision => ({
  allowed: false,
  reason,
});

export function evaluateFactTransition(
  from: FactStatus,
  to: FactStatus,
  context: FactTransitionContext,
): FactTransitionDecision {
  if (isTerminalFactStatus(from)) return deny('FACT_ALREADY_TERMINAL');
  if (from === to) return deny('FACT_ALREADY_IN_STATE');
  if (!ALLOWED_EDGES[from].includes(to)) return deny('FACT_TRANSITION_NOT_PERMITTED');

  if (to === 'WORKING_ASSUMPTION' && !context.hasAssumptionEvidence) {
    return deny('FACT_ASSUMPTION_EVIDENCE_MISSING');
  }

  if (to === 'CONFIRMED') {
    if (!context.sourceEffective) return deny('FACT_SOURCE_NOT_EFFECTIVE');
    if (!context.hasExplicitApproval) return deny('FACT_APPROVAL_MISSING');
    if (from === 'WORKING_ASSUMPTION' && !context.approvalIsCustomerConfirmed) {
      return deny('FACT_ASSUMPTION_NEEDS_CUSTOMER_CONFIRMATION');
    }
  }

  if (to === 'SUPERSEDED' && !context.hasSupersedingFact) {
    return deny('FACT_SUPERSEDER_MISSING');
  }

  return ALLOW;
}

/* ------------------------------------------------------------------ *
 * canUseFact — cong runtime
 * ------------------------------------------------------------------ */

/**
 * Muc DAM BAO ma noi goi doi hoi.
 *
 * Tach hai muc vi hai loai viec that su khac nhau: bao mot con so ra mieng khach
 * (`CONFIRMED_ONLY`) va chay mot luong noi bo dung duoc gia dinh (`ASSUMPTION_ALLOWED`). Neu chi
 * co mot muc, thi hoac moi thu bi chan boi ba gia dinh dang mo, hoac mot gia dinh se di thang ra
 * mieng khach.
 */
export const FACT_ASSURANCE_LEVELS = ['CONFIRMED_ONLY', 'ASSUMPTION_ALLOWED'] as const;
export type FactAssuranceLevel = (typeof FACT_ASSURANCE_LEVELS)[number];

export interface FactUsageContext {
  readonly status: FactStatus;
  readonly classification: DataClassification;
  /** Co xung dot dang OPEN cham vao dung su that nay khong. */
  readonly hasOpenBlockingConflict: boolean;
  readonly required: FactAssuranceLevel;
  /** Thoi diem dang hoi nam trong `[effectiveFrom, effectiveTo)` cua ban ghi khong. */
  readonly withinEffectiveWindow: boolean;
}

export const FACT_USAGE_DENIED_REASONS = [
  /** Chua duyet — `PROPOSED`. Trich xuat khong phai xac nhan. */
  'FACT_NOT_APPROVED',
  /** Da bi thay the/bac bo. */
  'FACT_NO_LONGER_EFFECTIVE',
  /** Ngoai cua so hieu luc tai thoi diem hoi. */
  'FACT_OUTSIDE_EFFECTIVE_WINDOW',
  /**
   * Co xung dot dang mo cham vao su that nay.
   *
   * FAIL-SAFE: dung lai, khong chon ben nao. Day la cho "xung dot khong co ke thang im lang"
   * duoc thi hanh o tang runtime chu khong chi trong tai lieu.
   */
  'FACT_BLOCKED_BY_OPEN_CONFLICT',
  /** Noi goi doi su that da xac nhan, ban ghi nay moi la gia dinh cua chung ta. */
  'FACT_IS_WORKING_ASSUMPTION',
  /**
   * HAI BAN TRO LEN cung song tai mot dia chi, va chua ai phan xu.
   *
   * Khac `FACT_BLOCKED_BY_OPEN_CONFLICT` o dung mot cho, va cho do la ca van de: kia la "co nguoi
   * da NHIN THAY hai nguon noi khac nhau va da mo phieu"; day la "hai nguon noi khac nhau va
   * KHONG AI NHIN THAY". Truong hop thu hai nguy hiem hon han — no la truong hop mac dinh, vi mo
   * xung dot la mot hanh dong co nguoi lam, con hai ban cung song thi tu no xay ra.
   */
  'FACT_AMBIGUOUS_LIVE_VERSIONS',
] as const;
export type FactUsageDeniedReason = (typeof FACT_USAGE_DENIED_REASONS)[number];

export type FactUsageDecision =
  | { readonly allowed: true; readonly reason: 'FACT_USABLE' }
  | { readonly allowed: false; readonly reason: FactUsageDeniedReason };

/**
 * `canUseFact()` — nguyen ban cho Tenant Doctor tuong lai, va la cong that o runtime hom nay.
 *
 * Thu tu kiem tra co y: trang thai truoc (cai nay khong sua duoc bang cach doi thoi diem hoi),
 * roi cua so hieu luc, roi xung dot, cuoi cung moi den muc dam bao. Dat xung dot len truoc trang
 * thai se bao "co xung dot" cho mot su that da bi bac bo tu lau.
 */
export function canUseFact(context: FactUsageContext): FactUsageDecision {
  if (context.status === 'PROPOSED') return { allowed: false, reason: 'FACT_NOT_APPROVED' };
  if (isTerminalFactStatus(context.status)) {
    return { allowed: false, reason: 'FACT_NO_LONGER_EFFECTIVE' };
  }
  if (!context.withinEffectiveWindow) {
    return { allowed: false, reason: 'FACT_OUTSIDE_EFFECTIVE_WINDOW' };
  }
  if (context.hasOpenBlockingConflict) {
    return { allowed: false, reason: 'FACT_BLOCKED_BY_OPEN_CONFLICT' };
  }
  if (context.status === 'WORKING_ASSUMPTION' && context.required === 'CONFIRMED_ONLY') {
    return { allowed: false, reason: 'FACT_IS_WORKING_ASSUMPTION' };
  }
  return { allowed: true, reason: 'FACT_USABLE' };
}

/* ------------------------------------------------------------------ *
 * Thay the — DONG HO cua mot dia chi su that
 * ------------------------------------------------------------------ */

/**
 * Dinh danh DONG HO cua mot ban su that: ban thay the phai dung o CUNG mot dia chi voi ban bi
 * thay the.
 *
 * Vi sao phai la mot cong chu khong phai mot cau chu thich: "ban moi thay ban cu tai cung
 * `(domain, key)`" truoc day chi duoc ghi trong tai lieu cua `supersedeFact()`. Neu goi nham id —
 * hai tab, mot bien dat sai, mot vong lap lech mot buoc — thi mot su that cua `pricing/ELNI` co
 * the dong mot su that cua `order_policy/max_quantity` lai. Luc do lich su cua CA HAI dia chi deu
 * sai: mot ben mat ban dang hieu luc ma khong ai bam nut, mot ben tro toi mot to tien khong lien
 * quan. Khong loi nao trong hai cai do noi ra thanh tieng.
 */
export interface FactLineage {
  readonly id: string;
  readonly domain: string;
  readonly key: string;
}

export const FACT_SUPERSESSION_DENIED_REASONS = [
  /** Ban thay the va ban bi thay the la MOT. Mot ban ghi khong tu thay chinh no. */
  'FACT_SUPERSEDE_SELF_REFERENCE',
  /** Hai ban ghi khong cung `(domain, key)` — khong phai hai phien ban cua cung mot su that. */
  'FACT_SUPERSEDE_LINEAGE_MISMATCH',
] as const;
export type FactSupersessionDeniedReason = (typeof FACT_SUPERSESSION_DENIED_REASONS)[number];

export type FactSupersessionDecision =
  | { readonly allowed: true; readonly reason: 'FACT_SUPERSESSION_ALLOWED' }
  | { readonly allowed: false; readonly reason: FactSupersessionDeniedReason };

export function evaluateFactSupersession(
  previous: FactLineage,
  next: FactLineage,
): FactSupersessionDecision {
  if (previous.id === next.id) {
    return { allowed: false, reason: 'FACT_SUPERSEDE_SELF_REFERENCE' };
  }
  if (previous.domain !== next.domain || previous.key !== next.key) {
    return { allowed: false, reason: 'FACT_SUPERSEDE_LINEAGE_MISMATCH' };
  }
  return { allowed: true, reason: 'FACT_SUPERSESSION_ALLOWED' };
}

/* ------------------------------------------------------------------ *
 * Phan xu KHI CO NHIEU BAN CUNG SONG tai mot dia chi
 * ------------------------------------------------------------------ */

/**
 * Ket qua phan xu mot dia chi su that tai mot thoi diem.
 *
 * `ambiguous` la trang thai QUAN TRONG NHAT o day, va no phai TON TAI RIENG — y het ly do
 * `WORKING_ASSUMPTION` phai ton tai rieng. Neu chi co `none`/`single`, thi hai ban cung song se
 * bi ep thanh mot `single` nao do, va cai "nao do" chinh la KE THANG IM LANG ma ca tang nay sinh
 * ra de cam.
 */
export type LiveFactResolution =
  | { readonly kind: 'none' }
  | { readonly kind: 'single'; readonly factId: string }
  | { readonly kind: 'ambiguous'; readonly factIds: readonly string[] };

/**
 * MOT XUNG DOT DA DUOC NGUOI DONG — ben thang, VA toan bo cac ben da tham gia.
 *
 * Danh sach ben tham gia la phan bat buoc, khong phai phan trang tri. Xem `resolveLiveFact`: mot
 * ban thang o CUOC NAY khong duoc phep thang CUOC KHAC ma no chua tung du.
 */
export interface SettledConflict {
  readonly winnerFactId: string;
  /** Moi su that duoc neu ten trong chinh xung dot do — ke ca ben thang. */
  readonly participantFactIds: readonly string[];
}

/**
 * Chon ban dang hieu luc trong so cac ban CON SONG tai mot dia chi — hoac tu choi chon.
 *
 * KHONG CO KE THANG IM LANG. Duong ghi cho phep hai su that canh tranh cung ton tai o trang thai
 * song: do la dung, vi lich su la mot so ghi va hai nguon noi khac nhau la mot su kien co that
 * can ghi lai. Nhung duong DOC thi khong duoc phep tu chon mot trong hai. Truoc ban nay,
 * `getEffectiveFact()` lay `live.at(-1)` — tuc ban nao tao sau thi thang, va khong ai duoc bao.
 *
 * Chi CO MOT cach thoat khoi trang thai nhap nhang: mot xung dot da duoc NGUOI dong bang dan
 * chung tuong minh — khong phai goi y (`recommendedFactId`), khong phai tham quyen (`L1 > L2`),
 * khong phai ngay thang. Ba thu do deu la cach chon ngam ma `evaluateConflictResolution` da tu
 * choi nhan.
 *
 * ## VI SAO PHAI DOI TOAN BO BEN THUA DA BI PHAN XU (sua 30/08/2026)
 *
 * Ban truoc chi nhan mot danh sach `settledWinnerIds` — nhung ID tung thang MOT xung dot nao do
 * cua khach. Ma `openConflict()` khong bat cac ben cua mot xung dot phai cung mot dia chi. Nen:
 *
 * ```text
 * A va B cung song tai pricing/ELNI.price   — chua ai phan xu A voi B
 * truoc do: A thang mot xung dot voi X      — X o mot dia chi HOAN TOAN KHAC
 *   -> A co mat trong settledWinnerIds
 *   -> A duoc chon lam ban hieu luc cua pricing/ELNI.price
 * ```
 *
 * Tuc ke thang im lang quay lai bang duong vong: mot chien thang o cuoc khac duoc tinh thanh
 * phan xu cho cuoc nay. Chien thang khong chuyen nhuong duoc.
 *
 * Gio mot ban chi thang khi MOI ban con song con lai deu da bi phan xu THUA CHINH NO — moi cap
 * (thang, thua) phai nam chung trong mot xung dot da dong. Hai ban cung "thang moi ben con lai"
 * (du lieu mau thuan: A thang B va B thang A) thi van la `ambiguous`: cong nay fail closed.
 *
 * Neu hai ban con song va CHUA ai mo xung dot, ket qua van la `ambiguous`: khong mo xung dot
 * khong lam cho su nhap nhang bien mat, no chi lam cho khong ai nhin thay.
 */
export function resolveLiveFact(
  liveFactIds: readonly string[],
  settled: readonly SettledConflict[] = [],
): LiveFactResolution {
  const [only] = liveFactIds;
  if (only === undefined) return { kind: 'none' };
  if (liveFactIds.length === 1) return { kind: 'single', factId: only };

  const beat = (winner: string, loser: string): boolean =>
    settled.some(
      (conflict) =>
        conflict.winnerFactId === winner &&
        conflict.participantFactIds.includes(winner) &&
        conflict.participantFactIds.includes(loser),
    );

  const winners = liveFactIds.filter((candidate) =>
    liveFactIds.every((other) => other === candidate || beat(candidate, other)),
  );
  const [winner] = winners;
  if (winner !== undefined && winners.length === 1) return { kind: 'single', factId: winner };

  return { kind: 'ambiguous', factIds: [...liveFactIds] };
}
