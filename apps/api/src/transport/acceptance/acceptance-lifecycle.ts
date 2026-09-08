import type { OrderStatus } from '../movement/movement.types.js';
import type { CommercialAcceptanceDecideReason } from './acceptance-decisions.js';
import type {
  CommercialAcceptanceBasis,
  CommercialAcceptanceOutcome,
  CommercialAcceptanceState,
} from './acceptance.types.js';

/**
 * QUY TAC cua mot lan ket thuc don — ham THUAN, khong cham mang, khong cham dong ho.
 *
 * ============================================================================================
 * DAY KHONG PHAI MOT MAY TRANG THAI THU HAI CUA DON
 * ============================================================================================
 *
 * `movement-lifecycle.ts` quyet dinh mot DON duoc di tu trang thai nao sang trang thai nao. Tep nay
 * khong dung vao do mot chu. No tra loi mot cau khac han: *"mot NGUOI co duoc ghi ket qua ket thuc
 * nay, luc ho so dang o trang thai nay, voi can cu nay khong"*.
 *
 * Trang thai don chi vao day duoi dang MOT dieu kien doc (`orderStatus`), va chi de tra loi dung
 * mot cau hoi cua `#275` K5: khong ket thuc duoc cai chua giao xong.
 *
 * ============================================================================================
 * KHONG MOT DONG NAO O DAY DOC TRANG THAI VONG CHAY — VA DO LA MOT KHANG DINH
 * ============================================================================================
 *
 * `#275` K7 doi chung minh BON dieu, va ca bon deu sup do neu tep nay con nhac toi `VehicleRun`:
 *
 *   1. vong chay dong duoc trong khi mot hay nhieu don van dang cho ket thuc;
 *   2. ke toan ket thuc duoc mot don ma khong sua/mo lai/dong vong chay cua no;
 *   3. mot vong chay cho hai don co the co don A da ket thuc va don B con cho;
 *   4. che do mot-don/vong chay va nhieu-don/vong chay dung CHUNG mot cong.
 *
 * Cach giu bon dieu do khong phai la mot bai test — la viec `AcceptanceEvaluation` KHONG CO truong
 * nao de nhet trang thai vong chay vao. `#271` co truong do (`runStatus`), va chinh no la thu
 * `#275` bo di.
 *
 * ============================================================================================
 * VI SAO `supersedesId` LA BAT BUOC KHI DA CO QUYET DINH TRUOC
 * ============================================================================================
 *
 * `#275` K1 doi giu *"supersedes/correction history"*, va K8 bai 5 doi mot ket cuc cu the cho hai
 * nguoi cung bam. Mot truong giai quyet ca hai:
 *
 *   · bat khai ban dang sua bien mot lan doi y thanh mot hanh dong CO TEN, doc duoc trong lich su;
 *   · va vi `supersedesId` phai bang DUNG ban moi nhat, nguoi thu hai va vao
 *     `ACCEPTANCE_SUPERSEDES_STALE` va phai tai lai — thay vi ghi de len mot quyet dinh ho chua he
 *     nhin thay.
 *
 * Tuc `supersedesId` vua la nhat ky, vua la the danh dau phien ban. Mot truong lam hai viec o day
 * la dung, vi hai viec do LA MOT: "toi dang sua dung ban ma toi vua doc".
 */

/** Trang thai don duy nhat ma mot lan ket thuc thuong mai co nghia. */
const COMPLETABLE_ORDER_STATUS: OrderStatus = 'FULFILLED';

/**
 * DON DA GIAO XONG CHUA — dieu kien tien quyet, dat ten de dung duoc o HAI cho.
 *
 * `evaluateAcceptanceDecision` kiem no dau tien, va tang dich vu cung kiem no truoc khi cham vao
 * chung cu. Hai lan kiem, MOT luat: neu tang dich vu tu viet lai `status !== 'FULFILLED'` thi mot
 * ngay nao do hai cho se noi hai dieu khac nhau.
 *
 * Ly do tang dich vu phai kiem SOM: phep kiem quyen so huu chung cu la mot loi goi ra ngoai, va no
 * co the tu choi truoc. Mot lenh vua sai trang thai vua tro nham chung tu se bao
 * `ACCEPTANCE_EVIDENCE_NOT_FOR_ORDER` — dung ve ky thuat, va vo dung voi nguoi doc: cai ho phai
 * sua truoc la don chua giao xong, khong phai chung tu.
 */
export const isOrderCompletable = (status: OrderStatus): boolean =>
  status === COMPLETABLE_ORDER_STATUS;

export interface AcceptanceEvaluation {
  readonly outcome: CommercialAcceptanceOutcome;
  readonly basis: CommercialAcceptanceBasis;
  readonly orderStatus: OrderStatus;
  /** Trang thai HIEN TAI cua ho so. `PENDING` khi chua co quyet dinh nao. */
  readonly currentState: CommercialAcceptanceState;
  /** Id quyet dinh moi nhat. `null` khi chua co quyet dinh nao. */
  readonly latestDecisionId: string | null;
  /** Ban ma lenh nay khai la dang sua. */
  readonly supersedesId: string | null;
  /** So chung tu duoc tro toi, SAU khi da kiem tra chung thuoc ve don nay. */
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
 * Mot lan ket thuc co duoc ghi khong — tra ve LY DO, khong phai `boolean`.
 *
 * THU TU KIEM la mot phan cua hop dong, khong phai chi tiet thi cong. Don truoc, roi den chuoi
 * sua, cuoi cung moi den can cu:
 *
 *   · mot lenh vua sai trang thai don vua thieu chung tu phai bao SAI TRANG THAI, vi do la cai
 *     nguoi goi phai sua truoc — tai them chung tu cho mot don chua giao xong khong giup gi;
 *   · va mot lenh dua vao ban cu (`STALE`) phai bao dieu do TRUOC khi noi gi ve can cu, vi nguoi
 *     do dang nhin mot man hinh loi thoi va moi nhan xet ve noi dung deu co the sai.
 *
 * Doi thu tu se cho ra mot ma DUNG VE KET QUA nhung SAI VE NGUYEN NHAN — cung bai hoc da ghi o
 * `checkpoint-lifecycle.ts` va `trip-lifecycle.ts`.
 */
export function evaluateAcceptanceDecision(input: AcceptanceEvaluation): AcceptanceDecisionVerdict {
  /*
   * `#275` K5. Ap cho CA BA ket qua chu khong rieng `APPROVED`: mot don chua giao xong thi cung
   * khong co gi de "tu choi" hay "doi bo sung" — truc ket thuc chi mo ra sau khi truc van hanh
   * dong lai. Cho tu choi som se tao ra nhung ho so `REJECTED` cua nhung don van con dang chay, va
   * hang cho se noi sai ve the gioi.
   *
   * HAI ma cho hai duong, khong gop: mot don `OPEN` thi cho giao hang, mot don `CANCELLED` thi
   * khong bao gio den. Nguoi truc phai lam hai viec khac han nhau.
   */
  if (input.orderStatus === 'CANCELLED') return deny('ACCEPTANCE_ORDER_CANCELLED');
  if (!isOrderCompletable(input.orderStatus)) return deny('ACCEPTANCE_ORDER_NOT_FULFILLED');

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
 * thai nao" duoc phat bieu. Neu mot ngay `#275` mo them mot ket qua thu tu, mot cho nay doi va moi
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
 * MOT DON CO DU DIEU KIEN DI VAO MOT KY DOI SOAT MOI KHONG — bat bien trung tam cua `#275` K5.
 *
 * ============================================================================================
 * HAI DIEU KIEN, VA CA HAI DEU PHAI DUNG
 * ============================================================================================
 *
 *     du dieu kien  =  don da `FULFILLED`  VA  ket thuc da `APPROVED`
 *
 * Ve trai la thu `#275` goi la *"delivered/operationally complete"*; ve phai la truc con nguoi.
 * `#275` K5 liet ke bon dong cua bang chan ly nay va tep nay tra loi ca bon:
 *
 *     FULFILLED + PENDING           -> false
 *     FULFILLED + REJECTED          -> false
 *     FULFILLED + NEEDS_CORRECTION  -> false
 *     FULFILLED + APPROVED          -> true
 *     chua FULFILLED + APPROVED     -> false   (khong duong tat nao)
 *
 * Dong cuoi la dong quan trong nhat: *"APPROVED but operational prerequisite false => excluded"*.
 * Giu ve trai o day — chu khong chi tin vao viec tang ket thuc da chan tu truoc — la co y. Hai lop
 * doc lap nhau thi mot lop hong khong lam cai kia hong theo.
 *
 * VA KHONG CO VE THU BA. `#275` K5: *"no dependency on whether the internal VehicleRun is open or
 * closed"*. Chu ky cua ham nay la cho chung minh dieu do: khong co truong nao de truyen mot trang
 * thai vong chay vao, nen khong lan sua nao ve sau nhet duoc no vao ma khong pha kieu.
 *
 * HAM THUAN, va do la ly do no nam o day chu khong nam trong dich vu: mot bat bien tai chinh phai
 * kiem duoc bang mot bai test khong can CSDL, khong can Nest, khong can dong ho.
 */
export const isSettlementEligible = (input: {
  readonly orderStatus: OrderStatus;
  readonly state: CommercialAcceptanceState;
}): boolean => isOrderCompletable(input.orderStatus) && input.state === 'APPROVED';
