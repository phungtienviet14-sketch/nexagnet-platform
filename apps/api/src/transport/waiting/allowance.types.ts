import type { BusinessDate } from '../business-date.js';

/**
 * PHU CAP CHO CUA LAI XE — `#279` O6, tiep tuc `#243` F4.
 *
 * ============================================================================================
 * HAI KHAI NIEM, VA TEP NAY CHI LAM MOT
 * ============================================================================================
 *
 *     PHU CAP CHO CUA LAI XE      = B CO THE tra them cho lai xe
 *     TIEN LUU BAI CUA KHACH      = B CO THE thu them cua khach
 *
 * `#279` O6 tach bach hai thu do va giao cho lane nay DUNG cai thu nhat. Khong mot duong nao trong
 * mien nay sinh ra mot khoan phai thu, mot chung tu quyet toan hay mot dong cong no
 * (`no-customer-detention.spec.ts` quet ca thu muc va do neu mot cai xuat hien).
 *
 * ============================================================================================
 * KHONG CO CONG THUC. DO LA MOT KHANG DINH, KHONG PHAI MOT BO SOT
 * ============================================================================================
 *
 * `#279` O6: *"no automatic amount from duration unless later source-backed policy exists"*, va
 * `#243` F4 noi ro chu khach CHUA dua ra mot cong thuc nao.
 *
 * Nen o day khong co mot phep nhan nao giua thoi luong va mot don gia. Thoi luong la DAU VAO VAN
 * HANH ma nguoi nhap nhin thay; con so tien la mot con so NGUOI GO VAO. Bia ra mot muc
 * "50.000d/gio" se la mot chinh sach tien luong ma khong ai o phia khach hang da quyet — va no se
 * tra vao luong that cua nhung con nguoi that.
 *
 * ============================================================================================
 * BA TRANG THAI, VA `PENDING` KHONG PHAI MOT SU VANG MAT
 * ============================================================================================
 *
 * Khac `CommercialAcceptance` cua Lane K (noi `PENDING` la su vang mat cua mot hang): o day mot de
 * nghi CHO DUYET la mot hang CO THAT — ai do da go mot con so vao va dang doi. Thap dieu hanh doc
 * chinh nhung hang do de phat muc `DRIVER_WAITING_ALLOWANCE_AWAITING_APPROVAL`.
 */
export const WAITING_ALLOWANCE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type WaitingAllowanceStatus = (typeof WAITING_ALLOWANCE_STATUSES)[number];

export const WAITING_ALLOWANCE_OUTCOMES = ['APPROVED', 'REJECTED'] as const;
export type WaitingAllowanceOutcome = (typeof WAITING_ALLOWANCE_OUTCOMES)[number];

/**
 * MOT DE NGHI PHU CAP CHO.
 *
 * `candidateAmount` la so NGUOI VAN PHONG go vao; `approvedAmount` la so NGUOI DUYET chot. Hai
 * truong chu khong mot, va do la ca diem: nguoi duyet co the chot mot so KHAC (thuong la thap hon)
 * va ca hai con so phai doc lai duoc. Mot truong duy nhat bi ghi de se lam bien mat cau hoi
 * *"nguoi duyet da cat bot bao nhieu"*.
 *
 * `approvedAmount` la `null` khi va chi khi `status !== 'APPROVED'` — cuong che bang `CHECK`
 * `TransportDriverWaitingAllowance_decision_shape`.
 *
 * KHONG CO TRUONG NAO MANG THOI LUONG. Thoi luong doc duoc tu `waitingSessionId`, va no la mot
 * PHEP TRU tren gio may chu (`elapsedSecondsOf`). Chep no vao day se tao ban thu hai cua mot con so
 * co the doi — va ban chep se la ban duoc doc khi hai ban lech nhau.
 */
export interface DriverWaitingAllowance {
  readonly id: string;
  readonly waitingSessionId: string;
  /** Lai xe HUONG khoan nay. Lay tu chinh phien cho, khong tu than yeu cau. */
  readonly driverId: string;
  readonly status: WaitingAllowanceStatus;
  readonly currencyCode: string;
  /** So NGUYEN, DUONG. Nguoi van phong go vao. */
  readonly candidateAmount: number;
  /** So NGUYEN, KHONG AM. `null` khi chua duyet hoac bi tu choi. */
  readonly approvedAmount: number | null;
  /** Vi sao van phong de nghi khoan nay — cau chu cua con nguoi, bat buoc. */
  readonly reason: string;
  readonly proposedBy: string;
  readonly proposedAt: Date;
  readonly decidedBy: string | null;
  readonly decidedAt: Date | null;
  readonly decisionNote: string | null;
  /** Khoa chong ghi trung cua lan QUYET DINH. `null` khi chua ai quyet. */
  readonly decisionIdempotencyKey: string | null;
  readonly businessDate: BusinessDate;
  readonly createdAt: Date;
}

/** Lenh DE NGHI. Danh tinh tu PHIEN, gio tu MAY CHU — ca hai deu khong co mat o day. */
export interface ProposeWaitingAllowanceCommand {
  readonly waitingSessionId: string;
  readonly candidateAmount: number;
  readonly reason: string;
  readonly authUserId: string;
}

/** Lenh QUYET DINH. `approvedAmount` chi co nghia khi `outcome === 'APPROVED'`. */
export interface DecideWaitingAllowanceCommand {
  readonly allowanceId: string;
  readonly outcome: WaitingAllowanceOutcome;
  readonly approvedAmount: number | null;
  readonly note: string | null;
  readonly idempotencyKey: string;
  readonly authUserId: string;
}
