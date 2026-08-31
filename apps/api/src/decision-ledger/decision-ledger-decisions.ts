import { defineDecisionVocabulary } from '../observability/decision-vocabulary.js';

/**
 * TU VUNG QUYET DINH cua CHINH SO CAI.
 *
 * Doc ky su khac biet: moi bo `*-decisions.ts` khac trong repo mo ta quyet dinh CUA MOT MIEN
 * NGHIEP VU. Bo nay mo ta quyet dinh cua HA TANG GHI SO CAI — "hang nay co vao duoc so cai khong,
 * va neu khong thi mat hay hoan".
 *
 * VI SAO PHAI CO. Khong co no, mot lan ghi that bai o muc `BUSINESS_STANDARD` se im lang tuyet
 * doi: hang khong vao Postgres, va cung khong co gi trong trace de dem. Muc 11 hop dong cam dung
 * dieu do ("Do not silently lose"). Bon ma o day la thu bien mot mat mat thanh mot con so loc duoc.
 *
 * KHONG NHAC MOT THUAT NGU NGHIEP VU NAO — day la tang nen, va `proofs/generic-api.proof.spec.ts`
 * khoa dieu do lai.
 */

export const LEDGER_WRITE_REASONS = [
  /** Da ghi mot hang moi vao so cai. Duong binh thuong. */
  'LEDGER_RECORDED',
  /**
   * Khoa chong trung khop DUNG mot hang da ghi — tra lai ban cu, KHONG ghi them.
   *
   * Tach khoi `LEDGER_RECORDED` co chu y, cung ly do voi `EXPENSE_IDEMPOTENT_REPLAY` cua so quy:
   * gop lai thi khong ai dem duoc so lan that su co mot lan chay lai, tuc khong ai biet
   * Hatchet/HTTP dang thu lai nhieu hon binh thuong hay khong.
   */
  'LEDGER_IDEMPOTENT_REPLAY',
  /**
   * Ghi hong o muc `BUSINESS_STANDARD`: nghiep vu di tiep VA mot yeu cau doi soat da duoc phat.
   * Hang con thieu trong so cai — day la ma de tim ra nhung ca do.
   */
  'LEDGER_WRITE_DEFERRED',
  /**
   * Ghi hong o muc `ADVISORY`: bo qua co chu y. Mot quan sat mat di khong doi mot yeu cau doi soat.
   *
   * Tach khoi `LEDGER_WRITE_DEFERRED` de hai thu dem duoc rieng: mot cai la no phai tra, mot cai
   * la mot con so thong ke bi thieu.
   */
  'LEDGER_WRITE_DROPPED',
] as const;
export type LedgerWriteReason = (typeof LEDGER_WRITE_REASONS)[number];

export const LEDGER_WRITE_VOCABULARY = defineDecisionVocabulary({
  owner: 'decision-ledger',
  points: ['ledger.record'],
  labels: {
    LEDGER_RECORDED: 'Đã ghi bằng chứng quyết định vào sổ cái',
    LEDGER_IDEMPOTENT_REPLAY: 'Ghi lặp cùng khoá chống trùng — trả lại bản đã ghi',
    LEDGER_WRITE_DEFERRED: 'Ghi sổ cái hỏng — nghiệp vụ đi tiếp, đã phát yêu cầu đối soát',
    LEDGER_WRITE_DROPPED: 'Ghi sổ cái hỏng ở mức quan sát — bỏ qua có chủ ý',
  } satisfies Record<LedgerWriteReason, string>,
});
