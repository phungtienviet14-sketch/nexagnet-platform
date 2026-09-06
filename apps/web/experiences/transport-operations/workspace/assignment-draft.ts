/**
 * BAN NHAP PHAN CONG — #222 P1-A.
 *
 * ==============================================================================================
 * LOI DUOC SUA O DAY, noi bang dung cai chu so huu nhin thay
 *
 * Tren ban DANG CHAY, chuyen `UAT-VIET-01` hien dung phan cong dang hieu luc o dong thoi gian —
 * `15C-556.33 · Nguyễn Văn Bình` — trong khi HAI O CHON ngay canh do lai bay `Chưa gán xe` /
 * `Chưa gán lái xe`.
 *
 * Nguyen nhan la mot dong duy nhat: `useState(currentVehicleId ?? '')`. `useState` chi doc tham so
 * o LAN VE DAU TIEN. Phan cong den tu mot query khac va ve SAU, nen o chon chup lay `null` roi giu
 * `null` mai mai.
 *
 * Va no KHONG PHAI mot loi tham my. `AssignTripInput` doi CA HAI khoa va cho phep `null`, nen bam
 * `Phân công` o trang thai do gui `{vehicleId: null, driverId: null}` — tuc GO PHAN CONG cua mot
 * chuyen dang chay, bang mot cu bam ma nguoi dung tuong la "khong doi gi".
 *
 * ==============================================================================================
 * BA LUAT, VA CHUNG PHAI SONG CUNG NHAU
 *
 *   1. DU LIEU DEN SAU thi o chon phai theo — neu khong, van la loi cu.
 *   2. NGUOI DUNG DA SUA thi mot lan tai lai ngam KHONG duoc ghi de len tay ho — neu khong, mot
 *      lan `refetch` ngau nhien se nuot mat lua chon ho vua bam.
 *   3. CHUA SUA GI thi lenh gui di phai la PHAN CONG DANG CO, khong phai ban nhap cuc bo — day la
 *      luoi cuoi cung: ke ca khi hai luat tren hong, mot lan bam "khong doi gi" van khong the bien
 *      mot chuyen dang chay thanh chua phan cong.
 *
 * Luat 3 la ly do tep nay ton tai duoi dang HAM THUAN thay vi mot `useEffect` trong component:
 * mot bai kiem doc duoc phai chung minh duoc "ban nhap `null` cu KHONG bao gio thanh mot lenh gui
 * `null`", va dieu do khong kiem duoc neu no nam rai trong vong doi cua React.
 */

/** Ai da cham vao truong nao. `false` = gia tri dang theo may chu. */
export interface AssignmentDraft {
  readonly vehicleId: string;
  readonly driverId: string;
  readonly vehicleTouched: boolean;
  readonly driverTouched: boolean;
}

/** Phan cong DANG HIEU LUC doc tu may chu. `null` = chua gan. */
export interface ActiveAssignmentInput {
  readonly vehicleId: string | null;
  readonly driverId: string | null;
}

export const emptyAssignmentDraft = (): AssignmentDraft => ({
  vehicleId: '',
  driverId: '',
  vehicleTouched: false,
  driverTouched: false,
});

/**
 * DONG BO ban nhap voi phan cong may chu vua tra ve — CHI o nhung truong nguoi dung CHUA cham.
 *
 * Goi duoc bao nhieu lan cung duoc: voi cung mot dau vao no tra ve cung mot ket qua, va khi khong
 * co gi doi no tra ve CHINH doi tuong cu (`===`). Diem do khong phai toi uu — no la thu cho phep
 * goi ham nay tu than mot `setState` ma khong sinh ra mot vong ve lai vo tan.
 */
export const hydrateAssignmentDraft = (
  draft: AssignmentDraft,
  active: ActiveAssignmentInput | null,
): AssignmentDraft => {
  const vehicleId = draft.vehicleTouched ? draft.vehicleId : (active?.vehicleId ?? '');
  const driverId = draft.driverTouched ? draft.driverId : (active?.driverId ?? '');
  if (vehicleId === draft.vehicleId && driverId === draft.driverId) return draft;
  return { ...draft, vehicleId, driverId };
};

export const touchAssignmentVehicle = (
  draft: AssignmentDraft,
  vehicleId: string,
): AssignmentDraft => ({ ...draft, vehicleId, vehicleTouched: true });

export const touchAssignmentDriver = (
  draft: AssignmentDraft,
  driverId: string,
): AssignmentDraft => ({ ...draft, driverId, driverTouched: true });

/** Sau khi may chu nhan lenh: ban nhap tro lai BAM THEO may chu, de no phan anh ket qua that. */
export const releaseAssignmentDraft = (draft: AssignmentDraft): AssignmentDraft => ({
  ...draft,
  vehicleTouched: false,
  driverTouched: false,
});

export interface AssignSubmission {
  readonly vehicleId: string | null;
  readonly driverId: string | null;
}

/**
 * LENH SE GUI DI — LUOI AN TOAN CUOI CUNG cua #222 P1-A.
 *
 * Moi truong lay tu ban nhap CHI KHI nguoi dung da cham vao no. Chua cham thi lay TU PHAN CONG
 * DANG CO, khong lay tu ban nhap — nen mot ban nhap con dinh `''` (vi bat ky ly do gi: du lieu ve
 * muon, mot lan ve lai lac, hay mot loi tuong lai chua ai nghi ra) KHONG THE bien thanh mot lenh
 * go phan cong.
 *
 * De go phan cong that su, nguoi dung phai CHON `Chưa gán xe` — mot hanh dong co chu dich, va no
 * dat `vehicleTouched = true`.
 */
export const toAssignSubmission = (
  draft: AssignmentDraft,
  active: ActiveAssignmentInput | null,
): AssignSubmission => ({
  vehicleId: draft.vehicleTouched
    ? draft.vehicleId === ''
      ? null
      : draft.vehicleId
    : (active?.vehicleId ?? null),
  driverId: draft.driverTouched
    ? draft.driverId === ''
      ? null
      : draft.driverId
    : (active?.driverId ?? null),
});

/**
 * Lenh nay co doi gi khong.
 *
 * Dung de TAT nut, chu khong de am tham bo qua lan bam: mot nut bam duoc ma khong lam gi la mot nut
 * lam nguoi ta bam lai lan hai.
 */
export const assignmentDraftIsNoOp = (
  draft: AssignmentDraft,
  active: ActiveAssignmentInput | null,
): boolean => {
  const next = toAssignSubmission(draft, active);
  return (
    next.vehicleId === (active?.vehicleId ?? null) && next.driverId === (active?.driverId ?? null)
  );
};
