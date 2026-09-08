import type { Vehicle } from '../transport.types.js';
import { EMPTY_TRUCK_PROFILE, type TruckProfile } from './routing/routing.types.js';

/**
 * TU MOT BAN GHI XE RA MOT HO SO DINH TUYEN — va chu yeu la mot ban ke KHAI CAI CON THIEU.
 *
 * ===========================================================================
 * DO LA MOT KET QUA DO DUOC, KHONG PHAI MOT THIEU SOT CUA TEP NAY.
 *
 * `TransportVehicle` tren `main` co dung ba truong lien quan: `vehicleClass` (mot chuoi tu do),
 * `allowedPayloadKg` (nullable) va `currentOdoKm`. KHONG co chieu cao, chieu rong, chieu dai, tong
 * tai trong ky thuat, tai trong truc hay so truc.
 *
 * `#277 M5` viet: *"Do not fabricate missing dimensions. Unknown facts should produce a clearly
 * degraded routing profile rather than silently substituting a random heavy-truck profile."*
 *
 * Nen ham nay tra ve mot ho so gan nhu rong, danh dau `complete: false`, va liet ke tung truong
 * thieu. Hau qua di theo suot: moi ung vien mang nhan `TRUCK_PROFILE_INCOMPLETE`, va tai lieu
 * mien noi ro rang con so dinh tuyen o che do nay dung de XEP HANG (ca doi xe deu thieu nhu nhau)
 * chu khong dung de DAN DUONG (mot gam cau thap khong tha thu cho mot truong `null`).
 *
 * Ngay ma `TransportVehicle` co them cac cot kich thuoc — mot viec cua tang du lieu doi xe, khong
 * phai cua Lane M — chi ham nay doi, va ca duong dinh tuyen tot len ma khong mot cho goi nao phai
 * sua.
 */

const ALL_PROFILE_FIELDS = [
  'heightCm',
  'widthCm',
  'lengthCm',
  'grossWeightKg',
  'weightPerAxleKg',
  'axleCount',
] as const;

/**
 * `allowedPayloadKg` KHONG duoc dat vao `grossWeightKg`, va day la cho de mac loi nhat ca tep.
 *
 * Tai trong CHO PHEP la khoi luong HANG cho phep cho; tong tai trong ky thuat (`grossWeight` cua
 * HERE) la khoi luong CA XE cong hang. Voi mot xe dau keo, hai so nay lech nhau bang chinh khoi
 * luong ban than xe — thuong 15 den 18 tan. Dua con so nho hon vao cho con so lon hon se lam mot
 * cay cau gioi han 24 tan trong nhu di qua duoc voi mot to hop 40 tan.
 *
 * Nen `allowedPayloadKg` chi duoc dung o dung mot cho: doi chieu voi khoi luong hang cua don
 * (`dispatch-suitability.ts`). No khong bao gio di ra nha cung cap dinh tuyen.
 */
export function truckProfileForVehicle(_vehicle: Vehicle): TruckProfile {
  return {
    ...EMPTY_TRUCK_PROFILE,
    missingFields: [...ALL_PROFILE_FIELDS],
  };
}

/** Ho so nay du de dinh tuyen theo dung quy dinh chua. Hom nay luon `false` — xem dau tep. */
export const isRoutingGradeProfile = (profile: TruckProfile): boolean => profile.complete;
