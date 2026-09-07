import type { CounterpartySubjectKind } from './counterparty.types.js';

/**
 * CONG kiem chu the — thu duy nhat noi xuong song danh tinh voi cac bang chuyen mon.
 *
 * Ton tai vi `TransportCounterpartyLink.subjectId` CO Y khong phai khoa ngoai: no tro toi hai bang
 * khac nhau tuy `kind`, va Postgres khong co khoa ngoai da dich.
 *
 * Nhung ly do sau moi quan trong hon: mot `kind` co the KHONG CO MAT o mot khach. Neu service tu
 * import `FleetRepository` roi doc thang, thi ngay khi co mot `kind` thu ba thuoc mot capability
 * khac, service nay se phai import mot kho ma khach do khong bat — va chieu phu thuoc cua T1 §10.1
 * bi dao nguoc. Voi mot cong, tang lap rap khai dung nhung kho DANG BAT, va cai chua bat tra ve
 * mot ma tu choi CO TEN.
 */
export abstract class CounterpartySubjectPort {
  /**
   * Loai chu the nay co adapter khong.
   *
   * DONG BO co chu y: cau hoi "kho nay co duoc nap khong" duoc tra loi luc lap rap, khong phai
   * bang mot lan doc CSDL — va service can biet no truoc khi di hoi ai.
   */
  abstract supports(kind: CounterpartySubjectKind): boolean;

  /** Hang chuyen mon do co that khong. Chi duoc goi khi `supports(kind)` da dung. */
  abstract exists(kind: CounterpartySubjectKind, subjectId: string): Promise<boolean>;
}
