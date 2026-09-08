import type { VehicleRunStatus } from '../movement/movement.types.js';
import type { CommercialAcceptanceDecideReason } from './acceptance-decisions.js';
import type {
  CommercialAcceptanceBasis,
  CommercialAcceptanceOutcome,
  CommercialAcceptanceState,
} from './acceptance.types.js';

/**
 * QUY TAC cua mot lan nghiem thu — ham THUAN, khong cham mang, khong cham dong ho.
 *
 * ============================================================================================
 * DAY KHONG PHAI MOT MAY TRANG THAI THU HAI CUA VONG CHAY
 * ============================================================================================
 *
 * `movement-lifecycle.ts` quyet dinh mot VONG CHAY duoc di tu trang thai nao sang trang thai nao.
 * Tep nay khong dung vao do mot chu. No tra loi mot cau khac han: *"mot NGUOI co duoc ghi ket qua
 * nghiem thu nay, luc ho so dang o trang thai nay, voi can cu nay khong"*.
 *
 * Trang thai vong chay chi vao day duoi dang MOT dieu kien doc (`runStatus`), va chi de tra loi
 * dung mot cau hoi cua `#268` I5 bai 6: khong duyet duoc cai chua chay xong.
 *
 * ============================================================================================
 * VI SAO `supersedesId` LA BAT BUOC KHI DA CO QUYET DINH TRUOC
 * ============================================================================================
 *
 * `#268` I4 doi hai thu cung luc, va mot truong giai quyet ca hai:
 *
 *   · *"Never silently edit `approvedBy/approvedAt`"* — bat khai ban dang sua bien mot lan doi y
 *     thanh mot hanh dong CO TEN, doc duoc trong lich su;
 *   · va cai khong duoc viet ra nhung se xay ra o hang cho that: hai nguoi cung mo mot ho so, mot
 *     nguoi duyet, nguoi kia bam "tu choi" tren man hinh cu. Vi `supersedesId` phai bang DUNG ban
 *     moi nhat, nguoi thu hai va vao `ACCEPTANCE_SUPERSEDES_STALE` va phai tai lai — thay vi ghi de
 *     len mot quyet dinh ho chua he nhin thay.
 *
 * Tuc `supersedesId` vua la nhat ky, vua la the danh dau phien ban. Mot truong lam hai viec o day
 * la dung, vi hai viec do LA MOT: "toi dang sua dung ban ma toi vua doc".
 */

/** Trang thai vong chay duy nhat ma mot lan nghiem thu co nghia. */
const ACCEPTABLE_RUN_STATUS: VehicleRunStatus = 'COMPLETED';

/**
 * VONG CHAY DA XONG CHUA — dieu kien tien quyet, dat ten de dung duoc o HAI cho.
 *
 * `evaluateAcceptanceDecision` kiem no dau tien, va tang dich vu cung kiem no truoc khi cham vao
 * chung cu. Hai lan kiem, MOT luat: neu tang dich vu tu viet lai `status !== 'COMPLETED'` thi mot
 * ngay nao do hai cho se noi hai dieu khac nhau.
 *
 * Ly do tang dich vu phai kiem SOM: phep kiem quyen so huu chung cu la mot loi goi ra ngoai, va no
 * co the tu choi truoc. Mot lenh vua sai trang thai vua tro nham chung tu se bao
 * `ACCEPTANCE_EVIDENCE_NOT_FOR_RUN` — dung ve ky thuat, va vo dung voi nguoi doc: cai ho phai sua
 * truoc la chuyen chua chay xong, khong phai chung tu.
 */
export const isRunAcceptable = (status: VehicleRunStatus): boolean =>
  status === ACCEPTABLE_RUN_STATUS;

export interface AcceptanceEvaluation {
  readonly outcome: CommercialAcceptanceOutcome;
  readonly basis: CommercialAcceptanceBasis;
  readonly runStatus: VehicleRunStatus;
  /** Trang thai HIEN TAI cua ho so. `PENDING` khi chua co quyet dinh nao. */
  readonly currentState: CommercialAcceptanceState;
  /** Id quyet dinh moi nhat. `null` khi chua co quyet dinh nao. */
  readonly latestDecisionId: string | null;
  /** Ban ma lenh nay khai la dang sua. */
  readonly supersedesId: string | null;
  /** So chung tu duoc tro toi, SAU khi da kiem tra chung thuoc ve vong chay nay. */
  readonly evidenceCount: number;
  /** Ghi chu can cu ngoai, da cat khoang trang. */
  readonly externalNote: string | null;
}

export type AcceptanceDecisionVerdict =
  | { readonly allowed: true; readonly reason: 'ACCEPTANCE_DECIDED' }
  | { readonly allowed: false; readonly reason: CommercialAcceptanceDecideReason };

const ALLOW: AcceptanceDecisionVerdict = { allowed: true, reason: 'ACCEPTANCE_DECIDED' };
const deny = (reason: CommercialAcceptanceDecideReason): AcceptanceDecisionVerdict => ({
  allowed: false,
  reason,
});

/**
 * Mot lan nghiem thu co duoc ghi khong — tra ve LY DO, khong phai `boolean`.
 *
 * THU TU KIEM la mot phan cua hop dong, khong phai chi tiet thi cong. Vong chay truoc, roi den
 * chuoi sua, cuoi cung moi den can cu:
 *
 *   · mot lenh vua sai trang thai vong chay vua thieu chung tu phai bao SAI TRANG THAI, vi do la
 *     cai nguoi goi phai sua truoc — tai them chung tu cho mot chuyen chua chay xong khong giup gi;
 *   · va mot lenh dua vao ban cu (`STALE`) phai bao dieu do TRUOC khi noi gi ve can cu, vi nguoi
 *     do dang nhin mot man hinh loi thoi va moi nhan xet ve noi dung deu co the sai.
 *
 * Doi thu tu se cho ra mot ma DUNG VE KET QUA nhung SAI VE NGUYEN NHAN — cung bai hoc da ghi o
 * `checkpoint-lifecycle.ts` va `trip-lifecycle.ts`.
 */
export function evaluateAcceptanceDecision(input: AcceptanceEvaluation): AcceptanceDecisionVerdict {
  /*
   * `#268` I5 bai 6. Ap cho CA BA ket qua chu khong rieng `APPROVED`: mot vong chay chua chay xong
   * thi cung khong co gi de "tu choi" hay "doi bo sung" — truc nghiem thu chi mo ra sau khi truc
   * van hanh dong lai. Cho tu choi som se tao ra nhung ho so `REJECTED` cua nhung chuyen van con
   * dang chay, va hang cho se noi sai ve the gioi.
   */
  if (input.runStatus !== ACCEPTABLE_RUN_STATUS) return deny('ACCEPTANCE_RUN_NOT_COMPLETED');

  const hasHistory = input.latestDecisionId !== null;
  if (!hasHistory && input.supersedesId !== null) return deny('ACCEPTANCE_SUPERSEDES_UNKNOWN');
  if (hasHistory && input.supersedesId === null) {
    /*
     * Hai cau tra loi khac nhau cho hai tinh huong nhin giong nhau: neu ket qua moi TRUNG ket qua
     * dang co thi khong co gi de doi (`ALREADY_IN_OUTCOME`); neu khac thi day la mot lan doi y that
     * va no phai khai ro dang sua ban nao (`SUPERSEDES_REQUIRED`).
     */
    return deny(
      input.currentState === input.outcome
        ? 'ACCEPTANCE_ALREADY_IN_OUTCOME'
        : 'ACCEPTANCE_SUPERSEDES_REQUIRED',
    );
  }
  if (hasHistory && input.supersedesId !== input.latestDecisionId) {
    return deny('ACCEPTANCE_SUPERSEDES_STALE');
  }

  /*
   * CAN CU chi bat buoc o `APPROVED`, va do la mot su that nghiep vu chu khong phai mot cho noi
   * long: nguoi ta TU CHOI vi thieu chung tu. Bat chung tu de tu choi se lam duong tu choi khong di
   * duoc dung luc no can nhat.
   */
  if (input.outcome === 'APPROVED') {
    if (input.basis === 'DOCUMENT' && input.evidenceCount === 0) {
      return deny('ACCEPTANCE_EVIDENCE_REQUIRED');
    }
    if (
      input.basis === 'EXTERNAL_PHYSICAL_CONFIRMATION' &&
      (input.externalNote === null || input.externalNote.length === 0)
    ) {
      return deny('ACCEPTANCE_EXTERNAL_BASIS_NOTE_REQUIRED');
    }
  }

  return ALLOW;
}

/**
 * TRANG THAI sau mot ket qua — mot phep anh xa MOT-MOT, co ten.
 *
 * Mot ham thay vi mot phep gan thang, vi day la cho duy nhat quy uoc "ket qua nao doc thanh trang
 * thai nao" duoc phat bieu. Neu mot ngay `#268` mo them mot ket qua thu tu, mot cho nay doi va moi
 * cho doc deu dung theo.
 *
 * KIEU TRA VE la `CommercialAcceptanceOutcome`, KHONG phai `CommercialAcceptanceState` — va do la
 * mot khac biet co that chu khong phai mot chi tiet. `PENDING` la mot trang thai DOC DUOC nhung
 * khong bao gio GHI DUOC (no la su vang mat cua mot hang, va enum cua Postgres khong he chua no).
 * Khai rong hon se lam trinh bien dich cho phep mot duong ghi `PENDING` di toi tan tang kho roi
 * moi hong o DB — luc chay, tren du lieu that.
 *
 * `Outcome` la tap con cua `State`, nen moi cho dang doc mot `State` van nhan duoc gia tri nay.
 */
export const stateAfter = (outcome: CommercialAcceptanceOutcome): CommercialAcceptanceOutcome =>
  outcome;

/**
 * MOT HO SO CO DU DIEU KIEN DI VAO MOT KY DOI SOAT MOI KHONG — bat bien trung tam cua `#268` I5.
 *
 * ============================================================================================
 * HAI DIEU KIEN, VA CA HAI DEU PHAI DUNG
 * ============================================================================================
 *
 *     du dieu kien  =  vong chay da `COMPLETED`  VA  nghiem thu da `APPROVED`
 *
 * Ve trai la thu `#268` goi la *"operationally eligible"*; ve phai la truc moi. `#268` I5 liet ke
 * bon dong cua bang chan ly nay va tep nay tra loi ca bon:
 *
 *     COMPLETED + PENDING           -> false
 *     COMPLETED + REJECTED          -> false
 *     COMPLETED + NEEDS_CORRECTION  -> false
 *     COMPLETED + APPROVED          -> true
 *     chua COMPLETED + APPROVED     -> false   (khong duong tat nao)
 *
 * Dong cuoi la dong quan trong nhat: *"non-completed + `APPROVED` cannot bypass operational
 * prerequisites"*. Giu ve trai o day — chu khong chi tin vao viec tang nghiem thu da chan tu truoc —
 * la co y. Hai lop doc lap nhau thi mot lop hong khong lam cai kia hong theo.
 *
 * HAM THUAN, va do la ly do no nam o day chu khong nam trong dich vu: mot bat bien tai chinh phai
 * kiem duoc bang mot bai test khong can CSDL, khong can Nest, khong can dong ho.
 */
export const isSettlementEligible = (input: {
  readonly runStatus: VehicleRunStatus;
  readonly state: CommercialAcceptanceState;
}): boolean => input.runStatus === ACCEPTABLE_RUN_STATUS && input.state === 'APPROVED';
