/**
 * NHAN RA MOT VA CHAM GHI CUA POSTGRES, va chi rieng cai do.
 *
 * Hai unique MOT PHAN (`..._activeTrip_key`, `..._activeVehicle_key`) la thu duy nhat dung khi co
 * HAI nguoi ghi cung luc. Nhung mot unique bi vi pham thi Prisma nem `P2002` — mot ma dung chung
 * cho MOI unique cua bang, ke ca `TransportTrip.code`. Neu tang tren bat `P2002` chung chung thi
 * mot lan trung ma chuyen se bi bao cho nguoi dung la "co nguoi vua phan cong truoc ban", va do la
 * mot cau tra loi sai den muc lam nguoi ta thu lai mai.
 *
 * VI SAO PHAI DOI CHIEU HAI DUONG (do duoc o CI, 29/08/2026 — lan chay dau cua PR #80):
 * Ban dau tep nay chi tim TEN INDEX. Postgres CO bao dung ten (`..._activeTrip_key`), nhung Prisma
 * khong chuyen ten do ra ngoai: no doi nguoc ten constraint thanh TEN TRUONG roi mo ra thanh
 * `meta.target = ['tripId']`, thong diep "Unique constraint failed on the fields: (`tripId`)".
 * Ket qua: DB chan dung, ma tang tren khong dich duoc, nen nguoi dung nhan 500 thay vi 409.
 * Bay gio doi chieu CA HAI dang — ten index (neu ban/driver nao co bao) VA cap (model, cot) — thay
 * vi ghim vao mot dang roi phu thuoc vao chi tiet noi bo cua Prisma.
 *
 * Khong import kieu loi cua Prisma: `@prisma/client` sinh theo tung ban va tang nay CO Y khong phu
 * thuoc vao ban sinh do (xem chu thich `model()` trong cac repository).
 */

const UNIQUE_VIOLATION = 'P2002';

/**
 * MOT unique mot phan, mo ta du de nhan ra no o ca hai dang ma Prisma co the bao.
 *
 * `column` du de phan biet vi tren hai bang phan cong chi co dung hai unique: khoa chinh `id`, va
 * index mot phan nay. Mot `P2002` tren `tripId` khong the la thu gi khac.
 */
export interface ActiveAssignmentIndex {
  /** Ten trong SQL cua migration. */
  readonly indexName: string;
  /** `meta.modelName` cua Prisma. */
  readonly model: string;
  /** Cot khoa cua unique mot phan. */
  readonly column: string;
}

export const ACTIVE_TRIP_ASSIGNMENT: ActiveAssignmentIndex = {
  indexName: 'TransportTripAssignment_activeTrip_key',
  model: 'TransportTripAssignment',
  column: 'tripId',
};

export const ACTIVE_VEHICLE_ASSIGNMENT: ActiveAssignmentIndex = {
  indexName: 'TransportVehicleAssignment_activeVehicle_key',
  model: 'TransportVehicleAssignment',
  column: 'vehicleId',
};

function metaOf(error: unknown): Record<string, unknown> {
  if (typeof error !== 'object' || error === null) return {};
  const meta = (error as { meta?: unknown }).meta;
  return typeof meta === 'object' && meta !== null ? (meta as Record<string, unknown>) : {};
}

/**
 * Tach `meta.target` thanh MOT DANH SACH TEN, khong phai mot chuoi de `includes` len.
 *
 * Khac biet nay khong vun vat: `'id'` la chuoi con cua `'tripId'`, nen mot phep `includes` tren
 * chuoi hoa se bien mot va cham KHOA CHINH thanh "co nguoi vua phan cong truoc ban". So sanh tren
 * tung phan tu thi khong co cho cho nham lan do.
 */
function targetNames(error: unknown): string[] {
  const target = metaOf(error).target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === 'string') return target.split(',').map((name) => name.trim());
  return [];
}

/** Mot so ban Prisma bao ten constraint o `meta.constraint` thay vi `meta.target`. */
function constraintNames(error: unknown): string[] {
  const constraint = metaOf(error).constraint;
  if (Array.isArray(constraint)) return constraint.map(String);
  if (typeof constraint === 'string') return [constraint];
  return [];
}

export function isActiveAssignmentConflict(error: unknown, index: ActiveAssignmentIndex): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if ((error as { code?: unknown }).code !== UNIQUE_VIOLATION) return false;

  // Duong 1 — Prisma (hoac Postgres qua thong diep) bao dung TEN INDEX.
  const named = [...targetNames(error), ...constraintNames(error)];
  if (named.includes(index.indexName)) return true;
  if (error instanceof Error && error.message.includes(index.indexName)) return true;

  // Duong 2 — Prisma da doi ten constraint thanh TEN TRUONG. Day la duong THAT SU xay ra tren
  // Postgres, do duoc o CI; duong 1 giu cho cac ban/driver bao khac.
  const model = metaOf(error).modelName;
  return typeof model === 'string' && model === index.model && named.includes(index.column);
}

/**
 * Mo ta mot loi CHUA duoc dich, du de nguoi doc bao loi test biet phai sua gi.
 *
 * Ton tai vi lan hong dau tien cua bo nay chi noi duoc "expected PrismaClientKnownRequestError to
 * be an instance of TransportDomainError" — dung nhung vo dung: no khong noi Prisma da dat ten
 * rang buoc o dau, nen mat them mot vong CI chi de nhin thay hinh dang that.
 */
export function describeStorageError(error: unknown): string {
  if (typeof error !== 'object' || error === null) return String(error);
  const meta = metaOf(error);
  return JSON.stringify({
    name: (error as { name?: unknown }).name,
    code: (error as { code?: unknown }).code,
    modelName: meta.modelName,
    target: meta.target,
    constraint: meta.constraint,
    message: error instanceof Error ? error.message : undefined,
  });
}
