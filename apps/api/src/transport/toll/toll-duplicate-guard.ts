import { TransportDomainError } from '../transport.errors.js';
import type { TollReviewReason } from './toll-decisions.js';
import type { TollReviewAction, TollTransactionCandidateRecord } from './toll.types.js';

/**
 * LUAT TRUNG cua doi soat ETC — `#318`, thi hanh `OWNER_DECISIONS_2026_09_17` (muc ETC). THUAN.
 *
 * ============================================================================================
 * HAI BAT BIEN, VA VI SAO CA HAI PHAI O MAY CHU
 * ============================================================================================
 *
 *   1. `DUPLICATE_CANDIDATE` la MOT TRANG THAI TAI CHINH CHUA GIAI. Chi `FLAG_DUPLICATE` (vao dung
 *      dong goc) hoac `CLEAR_DUPLICATE` tra loi duoc no. `CONFIRM` va `RESOLVE_VEHICLE` khong tra
 *      loi — nen chung DONG cho toi khi cau hoi trung da co cau tra loi.
 *   2. Do thi trung KHONG CO VONG. Moi dong co TOI DA MOT con tro `duplicateOfCandidateId`, nen do
 *      thi la do thi ham: tu tro, hai nut, ba nut... deu bieu dien duoc. Mot chuoi KHONG vong van an
 *      toan ve tien (moi dong da ghi trung bi loai, dong goc cuoi chuoi dung cho su kien that); mot
 *      VONG thi khong — ca vong roi khoi moi tong chi phi va khong con dong nao dung cho su kien.
 *
 * Man hinh da chan ca hai tu `#314`, nhung mot cong o man hinh khong chan mot yeu cau HTTP go tay,
 * mot tab cu, hay hai nguoi bam cung luc. Tep nay la LUAT; `planTollReview` goi no truoc de noi mot
 * cau ro rang, va HAI kho goi lai no TRONG lan ghi de hai lenh ghi song song khong cung lot.
 */

/** Chuoi dong goc dai toi da bay nhieu buoc. Thuc te la 1-2; con so nay chi chan du lieu hong. */
export const TOLL_DUPLICATE_CHAIN_MAX_HOPS = 64;

/**
 * `NONE` = khong ai nghi · `SUSPECTED` = may nghi, chua ai ghi dong goc · `DECLARED` = da ghi dong goc.
 *
 * Con tro THANG nhan trung: mot hang co `duplicateOfCandidateId` la DA GHI TRUNG bat ke nhan khop
 * cua no — dung thu tu ma `placeBucket` cua bao cao chi phi dung.
 */
export type TollDuplicateResolution = 'NONE' | 'SUSPECTED' | 'DECLARED';

export function tollDuplicateResolutionOf(
  candidate: Pick<TollTransactionCandidateRecord, 'matchState' | 'duplicateOfCandidateId'>,
): TollDuplicateResolution {
  if (candidate.duplicateOfCandidateId !== null) return 'DECLARED';
  return candidate.matchState === 'DUPLICATE_CANDIDATE' ? 'SUSPECTED' : 'NONE';
}

export type TollDuplicateGateReason = Extract<
  TollReviewReason,
  | 'TOLL_REVIEW_DUPLICATE_UNRESOLVED'
  | 'TOLL_REVIEW_DUPLICATE_DECLARED'
  | 'TOLL_REVIEW_DUPLICATE_NOT_SUSPECTED'
>;

/**
 * VIEC NAY co duoc lam tren mot dong o trang thai trung NAY khong. `null` = duoc.
 *
 * `FLAG_DUPLICATE` va `REOPEN` luon qua cong nay: ca hai la DUONG RA cua cau hoi trung. Ghi trung
 * co cong rieng — chuoi dong goc (`traceTollDuplicateChain`).
 */
export function tollDuplicateGate(
  action: TollReviewAction,
  resolution: TollDuplicateResolution,
): TollDuplicateGateReason | null {
  switch (action) {
    case 'CONFIRM':
    case 'RESOLVE_VEHICLE':
      if (resolution === 'SUSPECTED') return 'TOLL_REVIEW_DUPLICATE_UNRESOLVED';
      if (resolution === 'DECLARED') return 'TOLL_REVIEW_DUPLICATE_DECLARED';
      return null;
    case 'CLEAR_DUPLICATE':
      return resolution === 'NONE' ? 'TOLL_REVIEW_DUPLICATE_NOT_SUSPECTED' : null;
    case 'FLAG_DUPLICATE':
    case 'REOPEN':
      return null;
  }
}

export type TollDuplicateChainVerdict =
  | { readonly kind: 'ACYCLIC'; readonly hops: number }
  | { readonly kind: 'SELF' }
  /** `path` bat dau o dong nguon; phan tu cuoi la dong da gap lai. */
  | { readonly kind: 'CYCLE'; readonly path: readonly string[] }
  | { readonly kind: 'TOO_DEEP'; readonly hops: number };

/**
 * DI THEO CHUOI DONG GOC tu dong dich, NEU dong nguon tro vao no — ket luan co khep vong khong.
 *
 * `duplicateOf` doc con tro cua MOT dong (`null` = dong goc that, hoac dong khong ton tai). Kho
 * Postgres truyen mot ham doc TRONG giao dich dang giu khoa; kho bo nho truyen mot ham doc Map.
 *
 * Gap lai BAT KY dong nao da di qua deu la `CYCLE`, ke ca khi vong do khong chua dong nguon: mot
 * chuoi dich da co vong san (du lieu truoc `#318`) khong ket thuc o mot dong goc that nao, nen noi
 * them vao do la noi vao mot cho khong co su kien nao dung.
 */
export async function traceTollDuplicateChain(input: {
  readonly sourceId: string;
  readonly targetId: string;
  readonly duplicateOf: (candidateId: string) => Promise<string | null>;
  readonly maxHops?: number;
}): Promise<TollDuplicateChainVerdict> {
  if (input.sourceId === input.targetId) return { kind: 'SELF' };
  const maxHops = input.maxHops ?? TOLL_DUPLICATE_CHAIN_MAX_HOPS;

  const path: string[] = [input.sourceId];
  const seen = new Set<string>(path);
  let current = input.targetId;
  for (let hops = 1; hops <= maxHops; hops += 1) {
    if (seen.has(current)) return { kind: 'CYCLE', path: [...path, current] };
    seen.add(current);
    path.push(current);
    const next = await input.duplicateOf(current);
    if (next === null) return { kind: 'ACYCLIC', hops };
    current = next;
  }
  return { kind: 'TOO_DEEP', hops: maxHops };
}

/**
 * CONG GHI cua hai kho: chi `ACYCLIC` qua. Loi mang CUNG ma voi quyet dinh cua service, nen mot
 * lenh thua o tang kho doc ra dung ly do nhu mot lenh bi chan truoc do.
 */
export function assertTollDuplicateChainAcyclic(verdict: TollDuplicateChainVerdict): void {
  if (verdict.kind !== 'ACYCLIC') throw tollDuplicateChainError(verdict);
}

export function tollDuplicateChainError(
  verdict: Exclude<TollDuplicateChainVerdict, { readonly kind: 'ACYCLIC' }>,
): TransportDomainError {
  switch (verdict.kind) {
    case 'SELF':
      return TransportDomainError.invalid(
        'TOLL_REVIEW_DUPLICATE_SELF',
        'Mot dong khong the trung voi chinh no',
      );
    case 'CYCLE':
      return TransportDomainError.conflict(
        'TOLL_REVIEW_DUPLICATE_CYCLE',
        `Ghi trung nhu vay se tao mot vong trung qua ${String(verdict.path.length - 1)} dong — ` +
          'tai lai hang cho roi chon dong goc o cuoi chuoi',
      );
    case 'TOO_DEEP':
      return TransportDomainError.conflict(
        'TOLL_REVIEW_DUPLICATE_CHAIN_TOO_DEEP',
        `Chuoi dong goc dai qua ${String(verdict.hops)} buoc — khong chung minh duoc la khong co vong`,
      );
  }
}
