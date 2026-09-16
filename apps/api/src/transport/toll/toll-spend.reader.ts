import { money } from '../money.js';
import type { TollProvider } from './toll-provider.port.js';
import type { TollSpendBucket, TollSpendWindow } from './toll-spend-report.js';
import type { TollRepository } from './toll.repository.js';
import type { TollTransactionCandidateRecord } from './toll.types.js';

/**
 * CUA DOC CHO BAO CAO ETC — `#314` G8/G9. CHI DOC, khong mot ham ghi nao.
 *
 * ============================================================================================
 * VI SAO LA MOT CONG RIENG chu khong them ham vao `TollRepository`
 * ============================================================================================
 *
 * Hai cau hoi o day (*"tong theo xe/ngay"* va *"dong nao cung dau van voi dong nay"*) deu can mot
 * phep loc ma `TollCandidateFilter` khong co. Them no vao `TollRepository` la sua `whereOf` o kho
 * Postgres va `matching` o kho bo nho — hai tep dang thuoc mot lane khac (#308). Mot cong rieng
 * cho phep ca hai cau hoi di vao ma khong cham mot dong nao cua hai kho do.
 *
 * Va no con mot ly do ben hon lich lam viec: gom TREN POSTGRES mot bao cao tien la mot phep KHAC
 * han phep liet ke tung dong cho hang cho. Tron chung vao mot cong se de mot ngay ai do "toi uu"
 * hang cho bang cach phan trang phep gom — va bao cao se lang le chi cong trang dau.
 */
export interface TollDuplicatePeerQuery {
  readonly candidateId: string;
  readonly provider: TollProvider;
  readonly fingerprint: string;
  /** Tra ve TOI DA bay nhieu ma. Nguoi goi xin them mot de biet con sot hay khong. */
  readonly limit: number;
}

export abstract class TollSpendReader {
  /**
   * Cac nhom dong `ACCEPTED` co ngay nghiep vu trong `[from, to]`, trong MOT anh chup nhat quan.
   *
   * Nhieu nhom cung khoa la HOP LE — `buildTollSpendReport` cong chung lai. Cong khong duoc tra ve
   * dong bi tu choi: dong do khong co so tien de cong.
   */
  abstract spendBuckets(window: TollSpendWindow): Promise<readonly TollSpendBucket[]>;

  /**
   * Ma cac dong `ACCEPTED` KHAC cua CUNG nha cung cap co CUNG dau van — dung tap ma
   * `toll-classification.ts` da dua vao de nghi trung. Cu nhat truoc.
   */
  abstract duplicatePeerIds(query: TollDuplicatePeerQuery): Promise<readonly string[]>;
}

/**
 * HIEN THUC CHO `PERSISTENCE=memory` — doc qua chinh `TollRepository`.
 *
 * Mot lan goi `listCandidates` voi gioi han vo cung la MOT anh chup: kho bo nho cat mang dong bo.
 * KHONG dung hien thuc nay voi kho Postgres — no se keo ca bang ve Node. Postgres co
 * `PrismaTollSpendReader`, va `transport-toll.module.ts` chon theo `PERSISTENCE`.
 */
export class RepositoryTollSpendReader extends TollSpendReader {
  constructor(private readonly repository: TollRepository) {
    super();
  }

  async spendBuckets(window: TollSpendWindow): Promise<readonly TollSpendBucket[]> {
    const candidates = await this.everyCandidate(window.provider);
    return candidates.flatMap((candidate): TollSpendBucket[] => {
      if (
        candidate.parseStatus !== 'ACCEPTED' ||
        candidate.businessDate === null ||
        candidate.kind === null ||
        candidate.matchState === null ||
        candidate.signedAmount === null ||
        candidate.businessDate < window.from ||
        candidate.businessDate > window.to
      ) {
        return [];
      }
      return [
        {
          vehicleId: candidate.vehicleId,
          businessDate: candidate.businessDate,
          kind: candidate.kind,
          matchState: candidate.matchState,
          reviewState: candidate.reviewState,
          currencyCode: candidate.currencyCode,
          duplicateDeclared: candidate.duplicateOfCandidateId !== null,
          rowCount: 1,
          amount: money(candidate.signedAmount).amount,
        },
      ];
    });
  }

  async duplicatePeerIds(query: TollDuplicatePeerQuery): Promise<readonly string[]> {
    const candidates = await this.everyCandidate(query.provider);
    return candidates
      .filter(
        (candidate) =>
          candidate.id !== query.candidateId &&
          candidate.parseStatus === 'ACCEPTED' &&
          candidate.fingerprint === query.fingerprint,
      )
      .sort(olderFirst)
      .slice(0, query.limit)
      .map((candidate) => candidate.id);
  }

  private everyCandidate(
    provider: TollProvider | null,
  ): Promise<readonly TollTransactionCandidateRecord[]> {
    return this.repository.listCandidates({
      ...(provider === null ? {} : { provider }),
      limit: Number.MAX_SAFE_INTEGER,
      offset: 0,
    });
  }
}

/** Cu nhat truoc, roi theo lan nap va so dong — cung thu tu voi `PrismaTollSpendReader`. */
function olderFirst(
  left: TollTransactionCandidateRecord,
  right: TollTransactionCandidateRecord,
): number {
  const byTime = left.createdAt.getTime() - right.createdAt.getTime();
  if (byTime !== 0) return byTime;
  if (left.importId !== right.importId) return left.importId < right.importId ? -1 : 1;
  return left.rowNumber - right.rowNumber;
}
