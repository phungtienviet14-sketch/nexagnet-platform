import type { DispatchOrderingKey } from './dispatch-policy.js';

/**
 * XEP HANG UNG VIEN — tat dinh, va CO Y khong phai mot diem so (`#277 M6`/`M7`).
 *
 * ===========================================================================
 * VI SAO KHONG CO MOT CON SO NAO O DAY
 *
 * Duong de nhat la cham diem: `score = w1*km + w2*eta + w3*...`. No hong theo mot kieu rat cu the
 * ma khong ai phat hien ra trong nhieu thang: hai dai luong KHAC DON VI duoc cong lai qua mot bo
 * trong so ma khong ai co the bao ve bang mot ly le nghiep vu. Khi nguoi dieu hanh hoi *"vi sao
 * xe 29H-123.45 dung tren xe 29H-678.90"*, cau tra loi trung thuc duy nhat la *"vi 0,73 > 0,71"*
 * — tuc khong tra loi duoc gi ca.
 *
 * `#277 M6` cam dieu do bang chu: *"Do not create one opaque magic score whose meaning cannot be
 * inspected."*
 *
 * Nen o day la mot chuoi KHOA co ten, ap theo dung thu tu, moi khoa mot cau hoi nhi phan hoac mot
 * dai luong DUY NHAT mot don vi. Cau tra loi cho cau hoi tren tro thanh: *"vi ca hai deu kip gio,
 * ca hai deu khong cat ngang viec dang lam, va xe dau chay rong it hon 12 km."*
 *
 * Ca danh sach khoa di ra DTO (`DispatchSuggestionView.orderingKeys`), nen mot man hinh giai
 * thich duoc thu tu ma khong phai doc lai tep nay.
 *
 * ===========================================================================
 * TANG NAY KHONG DOC DONG HO, khong doc DB, khong goi mang, va khong doi mang dau vao.
 */

export interface RankableCandidate {
  readonly vehicleId: string;
  readonly registrationPlate: string;
  /** `null` khi don khong co han lay hang — khoa `DEADLINE_FEASIBILITY` bo qua ca bang. */
  readonly meetsRequiredPickupAt: boolean | null;
  readonly interruptsCommittedWork: boolean;
  readonly emptyRoadMetresToPickup: number;
  /** Milli giay tu epoch. `null` khi khong biet gio xe ranh. */
  readonly pickupEtaEpochMs: number | null;
}

/** `true` xep truoc `false`. `null` khong noi gi nen coi nhu hoa. */
const preferTrue = (left: boolean | null, right: boolean | null): number => {
  if (left === right) return 0;
  if (left === null || right === null) return 0;
  return left ? -1 : 1;
};

/**
 * SO SANH HAI SO CO THE VANG MAT — va cai vang mat LUON xep sau.
 *
 * Khong phai mot quy uoc tuy tien: mot ung vien khong biet gio den la mot ung vien khong so sanh
 * duoc ve gio, va dat no len truoc mot ung vien CO gio se lam mot cho trong thang mot cho biet.
 * Xep sau la cach noi *"toi khong tra loi duoc cau hoi nay"* trong ngon ngu cua mot phep sap xep.
 */
const ascendingWithUnknownLast = (left: number | null, right: number | null): number => {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
};

const COMPARATORS: Readonly<
  Record<DispatchOrderingKey, (left: RankableCandidate, right: RankableCandidate) => number>
> = {
  DEADLINE_FEASIBILITY: (left, right) =>
    preferTrue(left.meetsRequiredPickupAt, right.meetsRequiredPickupAt),
  NO_WORK_INTERRUPTION: (left, right) =>
    preferTrue(!left.interruptsCommittedWork, !right.interruptsCommittedWork),
  /*
   * KM CHAY RONG — muc tieu chinh cua ca Phase 3 (#274 §4), va la ly do khoa nay dung TRUOC ETA.
   *
   * Hai khoa nay thuong dong huong nhung khong phai luon: mot chiec xe o xa hon theo duong bo co
   * the den som hon neu no ranh som hon. Khi chung mau thuan, KM RONG thang — vi km rong la mot
   * chi phi THAT do doanh nghiep tra, con vai chuc phut ETA la mot uoc luong.
   */
  EMPTY_ROAD_DISTANCE: (left, right) =>
    left.emptyRoadMetresToPickup - right.emptyRoadMetresToPickup,
  PICKUP_ETA: (left, right) =>
    ascendingWithUnknownLast(left.pickupEtaEpochMs, right.pickupEtaEpochMs),
  STABLE_IDENTITY: (left, right) =>
    left.registrationPlate.localeCompare(right.registrationPlate) ||
    left.vehicleId.localeCompare(right.vehicleId),
};

/**
 * Sap ung vien theo dung thu tu khoa duoc dua vao.
 *
 * `STABLE_IDENTITY` duoc ap o CUOI CUNG du no co nam trong `keys` hay khong. Do la luoi an toan
 * cua tinh lap lai: neu bo khoa cau hinh khong phan dinh duoc hai ung vien, thu tu se roi ve thu
 * tu tra ve cua co so du lieu — va hai lan mo cung mot man hinh se cho hai bang khac nhau.
 */
export function rankCandidates<T extends RankableCandidate>(
  candidates: readonly T[],
  keys: readonly DispatchOrderingKey[],
): readonly T[] {
  const applied: readonly DispatchOrderingKey[] = keys.includes('STABLE_IDENTITY')
    ? keys
    : [...keys, 'STABLE_IDENTITY'];

  return [...candidates].sort((left, right) => {
    for (const key of applied) {
      const verdict = COMPARATORS[key](left, right);
      if (verdict !== 0) return verdict;
    }
    return 0;
  });
}
