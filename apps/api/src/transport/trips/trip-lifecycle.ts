/**
 * MAY TRANG THAI CHUYEN — nguon: T1 §7.1, `GD-01`, `GD-02`.
 *
 * ```text
 * PLANNED ──▶ IN_TRANSIT ──▶ DELIVERED ──▶ RECONCILED
 *    │             │              │
 *    └─────────────┴──────────────┴──▶ CANCELLED
 * ```
 *
 * Day la mot HAM THUAN, khong phai mot cot ai cung ghi duoc. Neu controller hay repository tu gan
 * `status` thi may trang thai chi con la mot loi khuyen trong tai lieu, va mot chuyen nhay tu
 * "cho thuc hien" thang sang "da doi soat" se khong bi chan o dau ca — no chi lo ra luc doi soat
 * cuoi thang, khi khong con ai nho chuyen gi da xay ra.
 *
 * Moi duong TU CHOI mang mot ma RIENG. Mot cong nghiep vu co N duong tu choi ma tra ve `false`
 * thi nguoi doc trace phai mo source doc lai N dieu kien roi doan xem cai nao da dong.
 */

export const TRIP_STATUSES = [
  /** Cho thuc hien — VT-022. Trang thai khoi tao cua moi chuyen. */
  'PLANNED',
  /** Dang chay. */
  'IN_TRANSIT',
  /** Da giao. */
  'DELIVERED',
  /** Da doi soat — `GD-01`: chuyen TAY boi nguoi co quyen, khoa chuyen khoi ghi chi phi moi. */
  'RECONCILED',
  /** `GD-02`: huy THAY CHO xoa. Khong co duong xoa cung nao cho mot chuyen. */
  'CANCELLED',
] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const TRIP_KINDS = [
  /** VT-023a — tu chay, khach truc tiep: xe cong ty, chi phi van hanh day du. */
  'OWN_DIRECT',
  /** VT-023b — thue xe ngoai chay ho: xe doi tac, cong ty KHONG quan ly chi phi van hanh. */
  'EXTERNAL_CARRIER',
  /** VT-023c — nhan chay ho cho doi tac: xe cong ty, chi phi day du + hoa hong phai tra. */
  'PARTNER_REFERRED_INTERNAL_RUN',
] as const;
export type TripKind = (typeof TRIP_KINDS)[number];

export const INITIAL_TRIP_STATUS: TripStatus = 'PLANNED';

const TERMINAL: readonly TripStatus[] = ['RECONCILED', 'CANCELLED'];

export const isTerminalTripStatus = (status: TripStatus): boolean => TERMINAL.includes(status);

/**
 * Loai chuyen chay bang XE CONG TY. Dung o dung mot cho — dieu kien lan banh — nhung tach ra
 * thanh mot ham co ten vi cau hoi "chuyen nay co phai xe minh chay khong?" se con quay lai o T3
 * (`INV-04`: chuyen thue ngoai khong duoc co chi phi dau/quy nao).
 */
export const isInternallyOperated = (kind: TripKind): boolean => kind !== 'EXTERNAL_CARRIER';

const ALLOWED_EDGES: Readonly<Record<TripStatus, readonly TripStatus[]>> = {
  PLANNED: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['RECONCILED', 'CANCELLED'],
  RECONCILED: [],
  CANCELLED: [],
};

export interface TripTransitionContext {
  readonly kind: TripKind;
  readonly hasVehicle: boolean;
  readonly hasDriver: boolean;
  readonly hasCarrierPartner: boolean;
}

export const TRIP_TRANSITION_DENIED_REASONS = [
  /** Chuyen da o diem cuoi (`RECONCILED`/`CANCELLED`) — khong con duong ra nao. */
  'TRIP_ALREADY_TERMINAL',
  /** Da o dung trang thai do roi. Tach rieng vi day thuong la bam hai lan, khong phai loi. */
  'TRIP_ALREADY_IN_STATE',
  /** Canh nay khong ton tai trong do thi (vd `PLANNED → DELIVERED`, hoac di lui). */
  'TRANSITION_NOT_PERMITTED',
  /** Chuyen chay bang xe cong ty ma chua co du xe + lai xe. */
  'TRIP_RESOURCES_MISSING',
  /** Chuyen thue xe ngoai ma chua chi dinh nha xe. */
  'TRIP_CARRIER_MISSING',
  /**
   * HUY phai di qua duong RIENG — `#168 B6`, `GD-02`.
   *
   * `CANCELLED` van la mot dinh CO THAT trong do thi (`ALLOWED_EDGES` giu nguyen): mot chuyen dang
   * `PLANNED` THUC SU co the ket thuc o trang thai huy. Cai bi dong o day la MOT DUONG DI toi no.
   *
   * Duong chung `POST /trips/:id/transition` chi doi `transport.trip.transition` — quyen ma Ke toan
   * CO — trong khi `transport.trip.cancel` co y KHONG duoc cap cho ho (VT-082/`GD-02`). Va
   * `TripRepository.setStatus()` khong ghi `cancelledAt` lan `cancellationReason`. Hai dieu do cong
   * lai cho ra mot chuyen DA HUY MA KHONG CO LY DO, do mot nguoi khong duoc phep huy tao ra.
   *
   * Chan o ham THUAN nay chu khong o controller la co chu y: mot cong dat o controller chi bao ve
   * dung mot route, va route thu hai se ra doi ma khong ai nho.
   */
  'TRIP_CANCEL_REQUIRES_DEDICATED_PATH',
] as const;
export type TripTransitionDeniedReason = (typeof TRIP_TRANSITION_DENIED_REASONS)[number];

export type TripTransitionDecision =
  | { readonly allowed: true; readonly reason: 'TRANSITION_ALLOWED' }
  | { readonly allowed: false; readonly reason: TripTransitionDeniedReason };

const ALLOW: TripTransitionDecision = { allowed: true, reason: 'TRANSITION_ALLOWED' };
const deny = (reason: TripTransitionDeniedReason): TripTransitionDecision => ({
  allowed: false,
  reason,
});

/**
 * Quyet dinh MOT lan chuyen trang thai.
 *
 * Thu tu kiem tra co y: diem cuoi truoc, roi trung trang thai, roi hinh dang do thi, cuoi cung
 * moi den dieu kien nguon luc. Doi thu tu se lam mot chuyen da huy tra ve `TRIP_RESOURCES_MISSING`
 * — mot cau tra loi dung ve ky thuat va vo dung voi nguoi doc.
 */
export function evaluateTripTransition(
  from: TripStatus,
  to: TripStatus,
  context: TripTransitionContext,
): TripTransitionDecision {
  if (isTerminalTripStatus(from)) return deny('TRIP_ALREADY_TERMINAL');
  if (from === to) return deny('TRIP_ALREADY_IN_STATE');
  // TRUOC phep kiem canh, khong sau: `PLANNED -> CANCELLED` LA mot canh hop le cua do thi, nen dat
  // sau se cho no di lot. Cau tra loi dung o day khong phai "canh nay khong ton tai" ma la "canh
  // nay ton tai, nhung khong di qua duong nay".
  if (to === 'CANCELLED') return deny('TRIP_CANCEL_REQUIRES_DEDICATED_PATH');
  if (!ALLOWED_EDGES[from].includes(to)) return deny('TRANSITION_NOT_PERMITTED');

  if (to === 'IN_TRANSIT') {
    if (isInternallyOperated(context.kind)) {
      if (!context.hasVehicle || !context.hasDriver) return deny('TRIP_RESOURCES_MISSING');
    } else if (!context.hasCarrierPartner) {
      return deny('TRIP_CARRIER_MISSING');
    }
  }

  return ALLOW;
}
