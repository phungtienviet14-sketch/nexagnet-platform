import { Injectable } from '@nestjs/common';
import type { RunClosureBlocker } from './planning.types.js';

/**
 * CONG DOC SU THAT CHAN DONG — `#293` R4.
 *
 * ============================================================================================
 * VI SAO LA MOT CONG, KHONG PHAI MOT LAN TIEM TRUC TIEP
 * ============================================================================================
 *
 * `evaluateRunClosure()` da nhan `additionalBlockers` tu `#276` L4. Cai con thieu la MOT NGUON:
 * trong `main` hom nay khong duong chay nao truyen gia tri vao do, nen `CARGO_STILL_CARRIED` va
 * `OPEN_WAITING_SESSION` la hai ma chan chi ton tai trong bai kiem.
 *
 * Hai su that do khong song trong `transport-core`: cai thu nhat suy ra tu moc van hanh cua
 * `transport-checkpoint`, cai thu hai thuoc Lane O (#279) va CHUA vao `main`. Nen chieu phu thuoc
 * phai la: capability -> core, khong bao gio nguoc lai. Cong nay la diem gap do — va no nam trong
 * `transport-core` vi do la noi `RunClosureFacts` duoc dung len, chu khong phai vi core biet gi ve
 * checkpoint.
 *
 * ============================================================================================
 * CONG NAY CHI DOC
 * ============================================================================================
 *
 * Mot phuong thuc, tra ve mot danh sach ma chan. Khong `record()`, khong `clear()`, khong mot
 * duong nao de nguon su that bi sua tu day. Mot cong doc ma ghi duoc se som muon bien thanh cho de
 * "tam thoi go vat can ra" — va do dung la thu ma ca lane nay ton tai de chan.
 */

/**
 * NGUON SU THAT CHAN DONG, hoac `null` khi khong co nguon nao duoc cau hinh.
 *
 * Tra ve `[]` la mot cau tra loi THAT: *"da hoi, va khong co gi chan"*. Nem loi la mot cau tra loi
 * khac han: *"khong hoi duoc"*. Hai cau do khong duoc gop lai — xem `collectBlockers()`.
 */
export abstract class RunClosureBlockerSource {
  /**
   * Cac dieu kien chan DEN TU NGOAI `transport-core` cho mot vong chay.
   *
   * Bat buoc la mot lan DOC thuan tuy, va bat buoc KHONG nem vi mot su co tam thoi cua he thong
   * ngoai: nguoi goi (`collectBlockers`) da xu ly ca hai truong hop, nhung no chi phan biet duoc
   * "nguon noi khong chan gi" voi "nguon hong" neu adapter noi that bang cach nem.
   */
  abstract blockersForRun(runId: string): Promise<readonly RunClosureBlocker[]>;
}

/**
 * KHONG CO NGUON NAO DUOC CAU HINH — va do la cau tra loi trung thuc, khong phai mot nguon rong.
 *
 * Khac `[]` o mot cho quan trong: `[]` nghia la *"co nguon, va no khong chan gi"*. Lop nay nghia la
 * *"khong co nguon nao de hoi"* — tinh huong cua mot khach chi bat `transport-core`, hoac cua mot
 * bai kiem don vi dung lop dich vu ma khong dung injector.
 *
 * No KHONG lam cho he thong dong bua: `evaluateRunClosure()` van con nguyen hai dieu kien dong va
 * bon dieu kien chan tinh duoc tu chinh `transport-core`.
 */
@Injectable()
export class NoRunClosureBlockerSource extends RunClosureBlockerSource {
  async blockersForRun(): Promise<readonly RunClosureBlocker[]> {
    return [];
  }
}

/**
 * MA CHAN SINH RA KHI KHONG HOI DUOC NGUON SU THAT.
 *
 * Nam trong `planning.types.ts` cung voi cac ma khac — o day chi la noi tra ve chung.
 */
export const BLOCKER_SOURCE_UNAVAILABLE: RunClosureBlocker = 'EXTERNAL_BLOCKER_SOURCE_UNAVAILABLE';
export const BLOCKER_SOURCE_AMBIGUOUS: RunClosureBlocker = 'EXTERNAL_BLOCKER_SOURCE_AMBIGUOUS';

/** Tap ma chan hop le, doi chieu luc chay. Xem `collectBlockers()`. */
const KNOWN_BLOCKERS: ReadonlySet<string> = new Set<RunClosureBlocker>([
  'RUN_NOT_ACTIVE',
  'LEG_STILL_OPEN',
  'PLAN_STILL_OPEN',
  'NO_COMPLETED_WORK',
  'CARGO_STILL_CARRIED',
  'OPEN_WAITING_SESSION',
  BLOCKER_SOURCE_UNAVAILABLE,
  BLOCKER_SOURCE_AMBIGUOUS,
]);

/**
 * HOI NGUON SU THAT — va FAIL-CLOSED khi khong hoi duoc.
 *
 * ============================================================================================
 * VI SAO KHONG BAO GIO DUOC TRA VE `[]` KHI CO SU CO
 * ============================================================================================
 *
 * `[]` la cau tra loi *"khong co gi chan, cu dong di"*. Mot nguon su that hong tra ve `[]` nghia la
 * he thong lang le dong mot vong chay ma no CHUA TUNG KIEM TRA duoc la con hang tren thung hay con
 * phien cho ngoai kia. Do la kieu hong ma `#293` R4 goi ten: *"fail-closed for a configured blocker
 * source that errors or returns ambiguous state."*
 *
 * Nen co su co thi tra ve CHINH MA NOI VE SU CO — mot ma chan that, di qua dung con duong ma moi ma
 * chan khac di, va hien len o bang dieu hanh nhu moi ly do khac. Khong nem: mot lan dong bi bo qua
 * vi mot su co tam thoi se tu khoi phuc o luot quet sau, con mot lan nem se bien "khong hoi duoc
 * nguon" thanh "khong chay duoc luot quet".
 *
 * ============================================================================================
 * HAI MA, HAI NGUYEN NHAN
 * ============================================================================================
 *
 *   · `..._UNAVAILABLE` — nguon NEM. Khong biet gi ca.
 *   · `..._AMBIGUOUS`   — nguon TRA VE mot thu khong doc duoc (khong phai mang, hoac chua ma la).
 *
 * Gop hai cai lai se lam nguoi truc sua nham cho: mot cai la loi ha tang, mot cai la hop dong cong
 * bi vi pham.
 */
export async function collectBlockers(
  source: RunClosureBlockerSource | null | undefined,
  runId: string,
): Promise<readonly RunClosureBlocker[]> {
  if (!source) return [];

  let reported: unknown;
  try {
    reported = await source.blockersForRun(runId);
  } catch {
    /*
     * KHONG ghi log chi tiet loi o day. Nguon su that co the mang theo du lieu cua khach trong
     * thong bao loi cua no, va mot dong log khong duoc la duong ro ri du lieu ra khoi he thong.
     * Ma chan da noi du de nguoi truc biet cho nao can nhin.
     */
    return [BLOCKER_SOURCE_UNAVAILABLE];
  }

  if (!Array.isArray(reported)) return [BLOCKER_SOURCE_AMBIGUOUS];

  const blockers: RunClosureBlocker[] = [];
  for (const entry of reported) {
    if (typeof entry !== 'string' || !KNOWN_BLOCKERS.has(entry)) return [BLOCKER_SOURCE_AMBIGUOUS];
    blockers.push(entry as RunClosureBlocker);
  }
  return blockers;
}
