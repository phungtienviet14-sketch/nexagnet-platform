import type { VehicleOperationalControl } from './asset-ownership.types.js';

/**
 * SU THAT VE MOT CHIEC XE ma mien so huu can — va khong hon.
 *
 * T1 §4.1 luat 4 (`NO_CROSS_CONTEXT_REPOSITORY_WRITE`): cach re nhat de tuan thu la ky luat, va ky
 * luat khong song sot qua sau thang. Nen thay vi tiem `FleetRepository` vao dich vu so huu — thu se
 * cho no ghi vao bang lai xe, bang khach hang va bang doi tac — mien nay khai mot cong HEP va tang
 * lap rap noi cong do voi kho doi xe.
 *
 * Cong co DUNG NAM phuong thuc. Neu mot ngay co nguoi them `createVehicle` vao day, dieu do se hien
 * ra ngay trong `asset-ownership.composition.spec.ts` chu khong lang le xay ra trong mot service.
 */
export interface VehicleOwnershipFacts {
  readonly id: string;
  readonly registrationPlate: string;
  readonly vehicleClass: string;
  readonly status: string;
  readonly currentOdoKm: number;
  readonly operationalControl: VehicleOperationalControl;
  readonly ownershipRegisterComplete: boolean;
}

export abstract class VehicleOwnershipPort {
  abstract findVehicle(vehicleId: string): Promise<VehicleOwnershipFacts | null>;
  abstract listVehicles(): Promise<VehicleOwnershipFacts[]>;

  /**
   * Doi quyen DIEU HANH. Tach khoi `setRegisterComplete` du ca hai deu ghi mot cot tren cung mot
   * hang: hai thao tac tra loi hai cau hoi khac nhau, va gop chung lam mot se cho phep mot lan sua
   * quyen dieu hanh lang le doi luon loi khai ve so dang ky.
   */
  abstract setOperationalControl(
    vehicleId: string,
    control: VehicleOperationalControl,
  ): Promise<VehicleOwnershipFacts | null>;
  abstract setRegisterComplete(
    vehicleId: string,
    complete: boolean,
  ): Promise<VehicleOwnershipFacts | null>;

  /**
   * Ten lai xe DANG cam chiec xe nay, neu co.
   *
   * CHI cai ten. Mot dong so huu hoi "ai dang lai xe cua toi" la mot cau hoi chinh dang ve TAI SAN
   * cua ho; so dien thoai, han GPLX, luong va ho so ca nhan cua nguoi lam cong thi khong — nen
   * cong nay khong tra ve mot doi tuong lai xe, no tra ve mot chuoi.
   */
  abstract activeDriverName(vehicleId: string): Promise<string | null>;
}
