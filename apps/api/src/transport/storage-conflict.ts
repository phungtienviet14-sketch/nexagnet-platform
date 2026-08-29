/**
 * NHAN RA MOT VA CHAM GHI CUA POSTGRES, va chi rieng cai do.
 *
 * Hai unique MOT PHAN (`..._activeTrip_key`, `..._activeVehicle_key`) la thu duy nhat dung khi co
 * HAI nguoi ghi cung luc. Nhung mot unique bi vi pham thi Prisma nem `P2002` — mot ma dung chung
 * cho MOI unique cua bang, ke ca `TransportTrip.code`. Neu tang tren bat `P2002` chung chung thi
 * mot lan trung ma chuyen se bi bao cho nguoi dung la "co nguoi vua phan cong truoc ban", va do la
 * mot cau tra loi sai den muc lam nguoi ta thu lai mai.
 *
 * Nen ham nay doi CA HAI: dung ma loi, VA dung ten index. `meta.target` cua Prisma la ten
 * constraint/cot tuy driver, nen doi chieu bang `includes` tren dang chuoi hoa cua no.
 *
 * Khong import kieu loi cua Prisma: `@prisma/client` sinh theo tung ban va tang nay CO Y khong phu
 * thuoc vao ban sinh do (xem chu thich `model()` trong cac repository).
 */

const UNIQUE_VIOLATION = 'P2002';

/**
 * Gom MOI cho ma Prisma co the dat ten rang buoc vao.
 *
 * Khong chon mot cho duy nhat vi hinh dang do KHONG on dinh: tuy phien ban va tuy driver, ten
 * rang buoc ve o `meta.target` (chuoi hoac mang), o `meta.constraint`, hoac chi nam trong cau
 * thong diep. Voi index MOT PHAN thi kha nang roi vao hai cho sau con cao hon, vi index do khong
 * gan voi mot danh sach cot theo cach Prisma quen xu ly. Doc ca ba re hon nhieu so voi ghim vao
 * mot cho roi phat hien minh ghim sai o dung luc co su co.
 */
function haystack(error: unknown): string {
  const parts: string[] = [];
  if (error instanceof Error) parts.push(error.message);

  const meta = (error as { meta?: unknown }).meta;
  if (typeof meta === 'object' && meta !== null) {
    const target = (meta as { target?: unknown }).target;
    if (Array.isArray(target)) parts.push(target.map(String).join(','));
    else if (typeof target === 'string') parts.push(target);

    const constraint = (meta as { constraint?: unknown }).constraint;
    if (typeof constraint === 'string') parts.push(constraint);
    else if (Array.isArray(constraint)) parts.push(constraint.map(String).join(','));
  }
  return parts.join(' | ');
}

function isUniqueViolationOn(error: unknown, indexName: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ((error as { code?: unknown }).code !== UNIQUE_VIOLATION) return false;
  return haystack(error).includes(indexName);
}

export const ACTIVE_TRIP_ASSIGNMENT_INDEX = 'TransportTripAssignment_activeTrip_key';
export const ACTIVE_VEHICLE_ASSIGNMENT_INDEX = 'TransportVehicleAssignment_activeVehicle_key';

export const isActiveAssignmentConflict = (error: unknown, indexName: string): boolean =>
  isUniqueViolationOn(error, indexName);
