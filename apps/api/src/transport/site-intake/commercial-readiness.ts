import { createHash } from 'node:crypto';
import type { GeoPoint } from '../geo/geo-point.js';
import { greatCircleMetres } from '../geo/geodesy.js';
import type {
  OrderStatus,
  RunLegKind,
  RunLegStatus,
  VehicleRunStatus,
} from '../movement/movement.types.js';
import type {
  SiteIntakeCommercialStatus,
  SiteIntakeExceptionOutcome,
  SiteMatch,
} from './site-intake-commercial.types.js';

/**
 * DU DIEU KIEN TAO DON CHUA — `#398` §4. MOT ham, THUAN, TAT DINH.
 *
 * ============================================================================================
 * KHONG MOT MO HINH NGON NGU NAO O DAY
 * ============================================================================================
 *
 * `#398` §0 muc 12: *"AI/LLM ... must not decide whether the Order is valid enough to
 * auto-create"*. Ham nay nhan SU THAT da doc tu kho va tra ve mot ket luan co KIEU. Khong co
 * nguong mo, khong co diem so, khong co "co le". Moi duong khong du dieu kien mang mot MA rieng —
 * mot cong co N duong tu choi phai phan biet duoc N ly do (quy uoc `evaluateAutoConfirm`).
 *
 * ============================================================================================
 * KHONG LAM MANH HON, KHONG LAM YEU HON BAT BIEN CUA DON
 * ============================================================================================
 *
 * Don hom nay BAT BUOC: nhan + toa do diem lay, nhan + toa do diem giao (#379). KHONG bat buoc:
 * khach hang, gia cuoc, hang hoa. Ham nay doi DUNG nhung gi don doi, cong nhung gi `#398` §8 noi
 * phai qua mat nguoi (nhieu kho, khong co vi tri doi chieu). Khach hang KHONG bi doi — va KHONG bi
 * doan: dia diem lay hang thuoc mot phap nhan, nhung ai tra cuoc la mot cau hoi thuong mai ma lai
 * xe khong tra loi duoc. Tien chua biet thi giu `null`, khong bao gio `0`.
 *
 * ============================================================================================
 * UI KHONG TINH LAI HAM NAY
 * ============================================================================================
 *
 * Ung dung doc ket luan va ma ly do tu may chu; no khong co ban sao cua bang quyet dinh nay. Mot ban
 * sao o may khach se lech voi ban nay o lan sua thu hai, va luc do man hinh noi "du" trong khi may
 * chu noi "chua".
 */

/* ------------------------------------------------------------------ *
 * MA LY DO
 * ------------------------------------------------------------------ */

/**
 * VI SAO CHUA TU TAO DON. Thu tu o day la thu tu HIEN THI (cai nguoi xem sua duoc truoc).
 *
 * Ba nhom, va man hinh can phan biet:
 *   · van phong/lai xe BO SUNG duoc ngay tren viec nay: diem giao, xac nhan noi lay;
 *   · phai sua O CHO KHAC (hang rao, doi xe, ho so lai xe) roi viec nay tu du;
 *   · khong tu dong duoc nua — chi con gan tay don co san hoac bao bat thuong.
 */
export const SITE_INTAKE_READINESS_REASONS = [
  /** Chua co diem giao. */
  'DESTINATION_MISSING',
  /** Diem giao trung diem lay — gan nhu chac chan la chon nham. */
  'DESTINATION_SAME_AS_ORIGIN',
  /** Lan xac nhan khong kem vi tri nao (hoac la ban ghi truoc #398) — chua co doi chieu hang rao. */
  'ORIGIN_LOCATION_UNVERIFIED',
  /** Vi tri gan NHIEU dia diem (hoac chi GAN, khong TRONG) — lai xe tu chon mot. */
  'SITE_MATCH_AMBIGUOUS',
  /** Dia diem lay hang khong con hang rao dang hoat dong nao — khong co toa do cho don. */
  'ORIGIN_POINT_UNKNOWN',
  /** Dia diem lay hang co NHIEU hang rao — khong biet dung toa do nao cho don. */
  'ORIGIN_POINT_AMBIGUOUS',
  /** Dia diem lay hang da ngung hoat dong sau luc xac nhan. */
  'SITE_INACTIVE',
  /** Ho so lai xe khong con hoat dong. */
  'DRIVER_INACTIVE',
  /** Vong chay da duoc giao cho nguoi khac voi nguoi da xac nhan. */
  'DRIVER_BINDING_CHANGED',
  /** Lai xe khong con duoc giao chiec xe cua vong chay nay. */
  'VEHICLE_BINDING_CHANGED',
  /** Chang da hoan tat truoc khi co don — `orderId` bi khoa, khong gan duoc nua. */
  'LEG_COMPLETED',
  /** Chang da mang mot don ma khong qua lenh nhan lai — khong biet don nao dung. */
  'LEG_ORDER_CONFLICT',
  /** Vong chay da mang ke hoach cua don khac o che do mot-don-mot-vong. */
  'RUN_PLAN_CONFLICT',
] as const;
export type SiteIntakeReadinessReason = (typeof SITE_INTAKE_READINESS_REASONS)[number];

/** Ly do KHONG BAO GIO tu tao don nua cho lan nhan viec nay. */
export const SITE_INTAKE_REJECTED_REASONS = [
  /** Sep/van phong da bao bat thuong truoc khi co don. */
  'INTAKE_REJECTED',
  /** Vong chay da bi huy. */
  'RUN_CANCELLED',
  /** Chang co hang cua lan nhan viec da bi huy. */
  'LEG_CANCELLED',
] as const;
export type SiteIntakeRejectedReason = (typeof SITE_INTAKE_REJECTED_REASONS)[number];

/** Ly do BO SUNG duoc tren chinh viec nay (diem giao / xac nhan noi lay). */
export const OFFICE_COMPLETABLE_REASONS: ReadonlySet<SiteIntakeReadinessReason> = new Set([
  'DESTINATION_MISSING',
  'DESTINATION_SAME_AS_ORIGIN',
  'ORIGIN_LOCATION_UNVERIFIED',
  'SITE_MATCH_AMBIGUOUS',
]);

/** Ly do chi xac nhan noi lay hang moi go duoc. */
export const ORIGIN_ATTESTABLE_REASONS: ReadonlySet<SiteIntakeReadinessReason> = new Set([
  'ORIGIN_LOCATION_UNVERIFIED',
  'SITE_MATCH_AMBIGUOUS',
]);

/* ------------------------------------------------------------------ *
 * SU THAT DAU VAO
 * ------------------------------------------------------------------ */

export interface ReadinessPlace {
  readonly label: string;
  readonly point: GeoPoint;
}

export interface CommercialReadinessFacts {
  readonly status: SiteIntakeCommercialStatus;
  readonly boundOrderId: string | null;
  /** `null` = ban ghi truoc #398, khong biet lan xac nhan khop dia diem ra sao. */
  readonly siteMatch: SiteMatch | null;
  readonly originAttested: boolean;
  readonly destination: ReadinessPlace | null;
  readonly intakeDriverId: string;
  readonly run: { readonly status: VehicleRunStatus; readonly vehicleId: string };
  readonly leg: {
    readonly kind: RunLegKind;
    readonly status: RunLegStatus;
    readonly orderId: string | null;
  };
  /** Nguoi DANG cam vong chay (phan cong hieu luc). `null` = khong ai. */
  readonly runDriverId: string | null;
  /** `null` = khong tim thay ho so lai xe. */
  readonly driver: { readonly active: boolean; readonly currentVehicleId: string | null } | null;
  readonly site: {
    readonly active: boolean;
    readonly label: string;
    /** Tam cac hang rao DANG hoat dong cua dia diem. */
    readonly originPoints: readonly GeoPoint[];
  };
  /** Vong chay dang mang mot ke hoach `ONE_ORDER_PER_RUN` cua don khac. */
  readonly runCarriesOtherOneOrderPlan: boolean;
}

export type CommercialReadiness =
  | {
      readonly kind: 'READY_TO_AUTO_CREATE';
      readonly origin: ReadinessPlace;
      readonly destination: ReadinessPlace;
    }
  | { readonly kind: 'NEEDS_REVIEW'; readonly reasons: readonly SiteIntakeReadinessReason[] }
  | { readonly kind: 'ALREADY_BOUND'; readonly orderId: string }
  | { readonly kind: 'REJECTED'; readonly reason: SiteIntakeRejectedReason };

/**
 * Hai diem "trung nhau" khi cach nhau duoi nguong nay. Mot met — nho hon moi hang rao co that, va
 * lon hon sai so lam tron cua hai lan chep cung mot toa do hang rao.
 */
const SAME_PLACE_METRES = 1;

/* ------------------------------------------------------------------ *
 * BANG QUYET DINH
 * ------------------------------------------------------------------ */

/**
 * THU TU KIEM LA MOT PHAN CUA HOP DONG.
 *
 *   1. da gan don        -> `ALREADY_BOUND` (lan goi lai CUNG hieu qua, khong tao don thu hai);
 *   2. da tu choi / vong chay huy / chang huy -> `REJECTED` (khong bao gio tu tao nua);
 *   3. moi ly do con lai GOM DU — khong dung o ly do dau tien. Nguoi xem can biet MOI thu con
 *      thieu, khong phai sua mot cai roi moi thay cai tiep theo;
 *   4. khong con ly do nao -> `READY_TO_AUTO_CREATE`, kem DUNG diem lay va diem giao se vao don.
 */
export function evaluateCommercialReadiness(facts: CommercialReadinessFacts): CommercialReadiness {
  if (facts.status === 'ORDER_BOUND' && facts.boundOrderId !== null) {
    return { kind: 'ALREADY_BOUND', orderId: facts.boundOrderId };
  }
  if (facts.status === 'REJECTED') return { kind: 'REJECTED', reason: 'INTAKE_REJECTED' };
  if (facts.run.status === 'CANCELLED') return { kind: 'REJECTED', reason: 'RUN_CANCELLED' };
  if (facts.leg.status === 'CANCELLED') return { kind: 'REJECTED', reason: 'LEG_CANCELLED' };

  const reasons = new Set<SiteIntakeReadinessReason>();

  const origin = originOf(facts.site);
  if (origin.kind === 'UNKNOWN') reasons.add('ORIGIN_POINT_UNKNOWN');
  if (origin.kind === 'AMBIGUOUS') reasons.add('ORIGIN_POINT_AMBIGUOUS');

  if (facts.destination === null) {
    reasons.add('DESTINATION_MISSING');
  } else if (
    origin.kind === 'KNOWN' &&
    greatCircleMetres(origin.point, facts.destination.point) < SAME_PLACE_METRES
  ) {
    reasons.add('DESTINATION_SAME_AS_ORIGIN');
  }

  if (!facts.originAttested) {
    if (facts.siteMatch === null || facts.siteMatch === 'NO_LOCATION') {
      reasons.add('ORIGIN_LOCATION_UNVERIFIED');
    } else if (facts.siteMatch === 'CHOSEN_AMONG_SEVERAL') {
      reasons.add('SITE_MATCH_AMBIGUOUS');
    }
  }

  if (!facts.site.active) reasons.add('SITE_INACTIVE');
  if (facts.driver === null || !facts.driver.active) reasons.add('DRIVER_INACTIVE');
  if (facts.runDriverId !== facts.intakeDriverId) reasons.add('DRIVER_BINDING_CHANGED');
  if (facts.driver !== null && facts.driver.currentVehicleId !== facts.run.vehicleId) {
    reasons.add('VEHICLE_BINDING_CHANGED');
  }
  if (facts.leg.status === 'COMPLETED') reasons.add('LEG_COMPLETED');
  if (facts.leg.orderId !== null || facts.leg.kind !== 'LOADED') reasons.add('LEG_ORDER_CONFLICT');
  if (facts.runCarriesOtherOneOrderPlan) reasons.add('RUN_PLAN_CONFLICT');

  if (reasons.size > 0 || origin.kind !== 'KNOWN' || facts.destination === null) {
    return {
      kind: 'NEEDS_REVIEW',
      reasons: SITE_INTAKE_READINESS_REASONS.filter((reason) => reasons.has(reason)),
    };
  }

  return {
    kind: 'READY_TO_AUTO_CREATE',
    origin: { label: facts.site.label, point: origin.point },
    destination: facts.destination,
  };
}

type OriginResolution =
  | { readonly kind: 'KNOWN'; readonly point: GeoPoint }
  | { readonly kind: 'UNKNOWN' }
  | { readonly kind: 'AMBIGUOUS' };

/**
 * TOA DO DIEM LAY = tam hang rao cua dia diem — nguon su that vi tri da biet cua #379.
 *
 * Nhieu hang rao cho MOT dia diem nhung trung toa do (khai lap) van la mot diem. Nhieu hang rao
 * KHAC toa do thi khong doan cai nao: don se mang mot toa do ma dieu xe tin, va mot toa do doan
 * sai con te hon khong co.
 */
function originOf(site: CommercialReadinessFacts['site']): OriginResolution {
  const [first, ...rest] = site.originPoints;
  if (first === undefined) return { kind: 'UNKNOWN' };
  if (rest.some((point) => greatCircleMetres(first, point) >= SAME_PLACE_METRES)) {
    return { kind: 'AMBIGUOUS' };
  }
  return { kind: 'KNOWN', point: first };
}

/* ------------------------------------------------------------------ *
 * GAN TAY MOT DON CO SAN — `#398` §6
 * ------------------------------------------------------------------ */

export const SITE_INTAKE_BINDING_DENY_REASONS = [
  'INTAKE_BOUND_TO_OTHER_ORDER',
  'INTAKE_REJECTED',
  'RUN_CANCELLED',
  'LEG_CANCELLED',
  'LEG_COMPLETED',
  'LEG_ORDER_CONFLICT',
  'RUN_PLAN_CONFLICT',
  'ORDER_NOT_OPEN',
  'ORDER_ALREADY_PLANNED',
  'ORDER_ALREADY_ON_RUN',
  'ORDER_BOUND_TO_OTHER_INTAKE',
  /**
   * Don co san LAY HANG O NOI KHAC: diem lay cua don nam ngoai dung sai quanh dia diem ma tai xe
   * da bam "Nhan chuyen tai day". Xem `matchOrderOrigin()`.
   */
  'ORDER_ORIGIN_MISMATCH',
] as const;
export type SiteIntakeBindingDenyReason = (typeof SITE_INTAKE_BINDING_DENY_REASONS)[number];

/**
 * DUNG SAI doi chieu diem lay cua mot DON CO SAN voi dia diem cua lan nhan viec — met.
 *
 * Vi sao mot hang so chu khong phai ban kinh hang rao: "diem cua dia diem" o ca hai duong dung
 * no (cong gan don duoi khoa, va danh sach don gan duoc cua van phong) den tu CUNG mot nguon —
 * `SiteIntakeReadinessReader.external().originPoints`, tam cac hang rao DANG hoat dong, KHONG kem
 * ban kinh. Hai duong phai doc cung mot nguon, neu khong danh sach se de nghi mot don ma cong lai
 * tu choi.
 *
 * Vi sao 500 m:
 *   · don tao tu "dia diem da biet" (#379) mang DUNG tam hang rao -> 0 m, luon qua;
 *   · don tao tu tim dia diem theo ten co the roi o cong/mat duong cua mot kho lon — lech vai tram
 *     met so voi tam hang rao (hang rao mau cua repo co ban kinh 200–300 m). Chat hon thi cong nay
 *     tu choi chinh don dung, va van phong khong con duong nao ngoai bao bat thuong;
 *   · long hon thi hai kho KHAC nhau cua cung mot khu cong nghiep bat dau lot qua. Cong nay chan
 *     cai sai HIEN NHIEN (don lay hang o tinh/quan khac), khong thay nguoi chon don.
 */
export const ORDER_ORIGIN_TOLERANCE_METRES = 500;

/**
 * KET QUA doi chieu diem lay cua don voi dia diem cua lan nhan viec. Bon ket cuc, khong mot
 * `boolean`: nguoi doc trace phai tach duoc "khop" voi "khong doi chieu duoc".
 */
export type OrderOriginMatch =
  /** Don KHONG co toa do diem lay (don truoc #379, don chieu tu chuyen v1). */
  | { readonly kind: 'ORDER_ORIGIN_UNKNOWN' }
  /** Dia diem cua lan nhan viec khong con hang rao dang hoat dong nao — khong co diem de so. */
  | { readonly kind: 'SITE_POINT_UNKNOWN' }
  | { readonly kind: 'MATCH'; readonly distanceMetres: number }
  | { readonly kind: 'MISMATCH'; readonly distanceMetres: number };

/**
 * DON CO SAN CO LAY HANG O CHINH NOI TAI XE NHAN VIEC KHONG — `#398` §6 *"bind an existing
 * compatible Order by explicit human choice only"*. Ham THUAN, tat dinh.
 *
 * Khop khi diem lay cua don cach tam GAN NHAT trong cac hang rao dang hoat dong cua dia diem khong
 * qua `ORDER_ORIGIN_TOLERANCE_METRES`. Nhieu hang rao (khai lap, hoac khac toa do) thi CHI CAN mot
 * cai khop: tat ca deu la hang rao cua CHINH dia diem do.
 *
 * Hai truong hop KHONG doi chieu duoc thi CHO QUA, co y:
 *   · don khong co toa do diem lay — khong co gi de chung minh la lech; NGUOI chon don da noi "day
 *     la cung mot viec", va cong nay khong duoc bia mot toa do de tu choi;
 *   · dia diem khong co hang rao dang hoat dong — cung ly do. (Viec tu tao don cho lan nhan viec
 *     do van bi chan rieng bang `ORIGIN_POINT_UNKNOWN`.)
 * Chi mot khoang cach DO DUOC va VUOT dung sai moi la ly do tu choi.
 */
export function matchOrderOrigin(
  orderOrigin: GeoPoint | null,
  sitePoints: readonly GeoPoint[],
): OrderOriginMatch {
  if (orderOrigin === null) return { kind: 'ORDER_ORIGIN_UNKNOWN' };
  if (sitePoints.length === 0) return { kind: 'SITE_POINT_UNKNOWN' };
  const distanceMetres = Math.min(
    ...sitePoints.map((point) => greatCircleMetres(point, orderOrigin)),
  );
  return distanceMetres <= ORDER_ORIGIN_TOLERANCE_METRES
    ? { kind: 'MATCH', distanceMetres }
    : { kind: 'MISMATCH', distanceMetres };
}

/** Loc danh sach don gan duoc — CUNG luat voi cong gan don, de man hinh khong de nghi don bi chan. */
export const isOrderOriginCompatible = (
  orderOrigin: GeoPoint | null,
  sitePoints: readonly GeoPoint[],
): boolean => matchOrderOrigin(orderOrigin, sitePoints).kind !== 'MISMATCH';

export interface OrderBindingFacts {
  readonly status: SiteIntakeCommercialStatus;
  readonly boundOrderId: string | null;
  readonly run: { readonly status: VehicleRunStatus };
  readonly leg: {
    readonly kind: RunLegKind;
    readonly status: RunLegStatus;
    readonly orderId: string | null;
  };
  readonly runCarriesOtherOneOrderPlan: boolean;
  /**
   * Tam cac hang rao DANG hoat dong cua dia diem lan nhan viec — CUNG nguon voi diem lay cua don tu
   * tao (`SiteIntakeReadinessReader.external().originPoints`).
   */
  readonly siteOriginPoints: readonly GeoPoint[];
  readonly target: {
    readonly id: string;
    readonly status: OrderStatus;
    readonly hasActivePlan: boolean;
    /** So chang CHUA huy dang mang don nay. */
    readonly liveLegCount: number;
    /** Don da nhan mot lan nhan viec KHAC. */
    readonly boundToOtherIntake: boolean;
    /** Diem lay THAT cua don (#379). `null` = don khong co toa do — khong doi chieu duoc. */
    readonly originPoint: GeoPoint | null;
  };
}

export type OrderBindingDecision =
  | { readonly kind: 'BIND' }
  | { readonly kind: 'ALREADY_BOUND'; readonly orderId: string }
  | { readonly kind: 'DENY'; readonly reason: SiteIntakeBindingDenyReason };

/**
 * `null -> X` duoc khi moi cong qua; `X -> X` la khong doi; `X -> Y` bi cam (`#398` §6).
 *
 * Cong nay KHONG doi diem giao hay xac nhan noi lay: don co san mang su that diem lay/giao CUA NO,
 * va chinh NGUOI chon don do da noi "day la cung mot viec". Cai no doi la don khong bi lap ke hoach
 * o noi khac — neu khong, gan vao day se sinh dung hai chang co hang cho mot viec — va, khi don CO
 * toa do diem lay, diem do phai nam quanh dia diem tai xe nhan viec (`matchOrderOrigin()`): mot don
 * lay hang o noi khac khong phai "cung mot viec" du nguoi bam co chon no.
 */
export function evaluateOrderBinding(facts: OrderBindingFacts): OrderBindingDecision {
  if (facts.status === 'ORDER_BOUND' && facts.boundOrderId !== null) {
    return facts.boundOrderId === facts.target.id
      ? { kind: 'ALREADY_BOUND', orderId: facts.boundOrderId }
      : { kind: 'DENY', reason: 'INTAKE_BOUND_TO_OTHER_ORDER' };
  }
  if (facts.status === 'REJECTED') return { kind: 'DENY', reason: 'INTAKE_REJECTED' };
  if (facts.run.status === 'CANCELLED') return { kind: 'DENY', reason: 'RUN_CANCELLED' };
  if (facts.leg.status === 'CANCELLED') return { kind: 'DENY', reason: 'LEG_CANCELLED' };
  if (facts.leg.status === 'COMPLETED') return { kind: 'DENY', reason: 'LEG_COMPLETED' };
  if (facts.leg.orderId !== null || facts.leg.kind !== 'LOADED') {
    return { kind: 'DENY', reason: 'LEG_ORDER_CONFLICT' };
  }
  if (facts.runCarriesOtherOneOrderPlan) return { kind: 'DENY', reason: 'RUN_PLAN_CONFLICT' };
  if (facts.target.status !== 'OPEN') return { kind: 'DENY', reason: 'ORDER_NOT_OPEN' };
  if (facts.target.boundToOtherIntake) {
    return { kind: 'DENY', reason: 'ORDER_BOUND_TO_OTHER_INTAKE' };
  }
  if (facts.target.hasActivePlan) return { kind: 'DENY', reason: 'ORDER_ALREADY_PLANNED' };
  if (facts.target.liveLegCount > 0) return { kind: 'DENY', reason: 'ORDER_ALREADY_ON_RUN' };
  if (matchOrderOrigin(facts.target.originPoint, facts.siteOriginPoints).kind === 'MISMATCH') {
    return { kind: 'DENY', reason: 'ORDER_ORIGIN_MISMATCH' };
  }
  return { kind: 'BIND' };
}

/* ------------------------------------------------------------------ *
 * BAO BAT THUONG / HUY — `#398` §9
 * ------------------------------------------------------------------ */

/**
 * Moc chung minh XE DA CHAY. Moc tai diem lay (den noi, vao cong, boc hang) KHONG thuoc tap nay:
 * chung la hoat dong tai cho, khong phai di chuyen — va chung van o nguyen trong so khi viec bi huy
 * (bang moc chi-ghi-them).
 */
export const MOVEMENT_CHECKPOINT_TYPES: ReadonlySet<string> = new Set([
  'DEPARTED',
  'PICKUP_DEPARTURE',
  'DELIVERY_ARRIVAL',
  'DELIVERY_ACCEPTED',
  'COMPLETED',
]);

export interface MovementFacts {
  readonly runStatus: VehicleRunStatus;
  readonly legStatus: RunLegStatus;
  readonly checkpointTypes: readonly string[];
}

/** XE DA LAN BANH chua — theo trang thai chang/vong chay VA moc hien truong da ghi. */
export function hasMovementStarted(facts: MovementFacts): boolean {
  return (
    facts.legStatus === 'IN_TRANSIT' ||
    facts.legStatus === 'COMPLETED' ||
    facts.runStatus === 'ACTIVE' ||
    facts.runStatus === 'COMPLETED' ||
    facts.checkpointTypes.some((type) => MOVEMENT_CHECKPOINT_TYPES.has(type))
  );
}

export interface ExceptionFacts {
  readonly status: SiteIntakeCommercialStatus;
  /** Trang thai don da gan, `null` khi chua gan. */
  readonly boundOrderStatus: OrderStatus | null;
  readonly movementStarted: boolean;
  /** Lan bao bat thuong DA ghi (neu co) — mot lan nhan viec co toi da mot. */
  readonly recorded: { readonly key: string } | null;
  readonly key: string;
}

export type ExceptionDecision =
  | { readonly kind: 'REPLAY' }
  | { readonly kind: 'DENY'; readonly reason: 'EXCEPTION_ALREADY_RECORDED' }
  | {
      readonly kind: 'APPLY';
      readonly outcome: SiteIntakeExceptionOutcome;
      /** Huy DON (OPEN -> CANCELLED) qua dung vong doi da chap nhan. */
      readonly cancelOrder: boolean;
      /** Dong phan thuong mai cua lan nhan viec: `PENDING -> REJECTED`. */
      readonly rejectIntake: boolean;
      /** Huy viec VAN HANH chua chay (chang PLANNED, vong chay PLANNED neu chi con viec nay). */
      readonly cancelWork: boolean;
    };

/**
 * MAY CHU QUYET theo su that van hanh, khong theo y nguoi bam (`#398` §9).
 *
 *   · xe CHUA chay  -> huy don (neu co) + huy viec van hanh chua chay. KHONG xoa gi.
 *   · xe DA chay    -> chi huy phan THUONG MAI. Vong chay, chang, moc, GPS, chung tu giu nguyen.
 *   · don da o trang thai cuoi (da giao xong / da huy) -> chi GHI NHAN bat thuong, khong di vong
 *     qua vong doi don.
 */
export function decideException(facts: ExceptionFacts): ExceptionDecision {
  if (facts.recorded !== null) {
    return facts.recorded.key === facts.key
      ? { kind: 'REPLAY' }
      : { kind: 'DENY', reason: 'EXCEPTION_ALREADY_RECORDED' };
  }

  if (facts.status === 'ORDER_BOUND') {
    if (facts.boundOrderStatus !== 'OPEN') {
      return {
        kind: 'APPLY',
        outcome: 'ANOMALY_RECORDED_ORDER_TERMINAL',
        cancelOrder: false,
        rejectIntake: false,
        cancelWork: false,
      };
    }
    return facts.movementStarted
      ? {
          kind: 'APPLY',
          outcome: 'ORDER_CANCELLED_OPERATION_PRESERVED',
          cancelOrder: true,
          rejectIntake: false,
          cancelWork: false,
        }
      : {
          kind: 'APPLY',
          outcome: 'ORDER_CANCELLED_WORK_CANCELLED',
          cancelOrder: true,
          rejectIntake: false,
          cancelWork: true,
        };
  }

  return facts.movementStarted
    ? {
        kind: 'APPLY',
        outcome: 'INTAKE_REJECTED_OPERATION_PRESERVED',
        cancelOrder: false,
        rejectIntake: true,
        cancelWork: false,
      }
    : {
        kind: 'APPLY',
        outcome: 'INTAKE_REJECTED_WORK_CANCELLED',
        cancelOrder: false,
        rejectIntake: true,
        cancelWork: true,
      };
}

/* ------------------------------------------------------------------ *
 * MA DON do may chu sinh
 * ------------------------------------------------------------------ */

/**
 * `DH-A<yyMMdd>-<8 hex>` — `A` noi don nay ra doi tu mot lan xac nhan TAI DIA DIEM A, cung nhan voi
 * ma vong chay `RUN-A…` cua `#267`.
 *
 * Phan duoi la BAM TAT DINH cua `intakeId`: hai lenh cung mot lan nhan viec sinh CUNG ma, nen unique
 * `TransportOrder_code_key` la lop chan thu hai sau khoa tu van — va mot lan gui lai khong bao gio
 * ra mot ma khac.
 */
export function siteIntakeOrderCode(businessDate: string, intakeId: string): string {
  const compact = businessDate.replaceAll('-', '').slice(2);
  const digest = createHash('sha256')
    .update(`${intakeId.length}:${intakeId}`)
    .digest('hex')
    .slice(0, 8)
    .toUpperCase();
  return `DH-A${compact}-${digest}`;
}

/** Khoa chong lap cua ke hoach `ADOPTED` — MOT ke hoach nhan lai cho MOT lan nhan viec. */
export const siteIntakePlanKey = (intakeId: string): string => `site-intake:${intakeId}`;
