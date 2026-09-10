import type { RunLegKind, VehicleRunStatus } from '../movement/movement.types.js';

/**
 * LAP KE HOACH VONG CHAY DO HE THONG QUAN — #276 (Lane L). Tang kieu THUAN.
 *
 * Khong `@nestjs`, khong Prisma, khong I/O. Cung quy uoc voi `movement.types.ts`: ngay thang la
 * `string` ISO o bien mien.
 *
 * ============================================================================================
 * LANE NAY KHONG THEM MOT MO HINH VONG CHAY THU HAI
 * ============================================================================================
 *
 * `VehicleRun` va `RunLeg` cua Lane A van la su that van hanh duy nhat. Cai duoc them o day la
 * mot lop tra loi ba cau hoi ma mo hinh do khong tra loi duoc:
 *
 *   · voi mot don moi va mot chiec xe, KE HOACH se ra nhung chang nao (`RunPlanProposal`);
 *   · lan lap ke hoach nao da gan don do vao vong chay do, o che do nao (`OrderRunPlan`);
 *   · vong chay nay da dong duoc chua, va neu chua thi VI SAO (`RunClosureVerdict`).
 */

/* ------------------------------------------------------------------ *
 * CHINH SACH
 * ------------------------------------------------------------------ */

export const RUN_GROUPINGS = ['ONE_ORDER_PER_RUN', 'MULTI_ORDER_RUN'] as const;
export type RunGrouping = (typeof RUN_GROUPINGS)[number];

/**
 * BAI XE — co so van hanh cua B.
 *
 * `#276` L5 goi ten cho de nham lan: day KHONG phai mot `TransportCounterparty`. Khach hang A co
 * dia diem cua ho (`TransportCounterpartySite`); bai xe la noi doi xe cua B ve.
 */
export interface Depot {
  readonly code: string;
  readonly label: string;
}

export interface DepotConfig extends Depot {
  /** Khong khai = dang hoat dong. */
  readonly active?: boolean;
}

export interface RunClosurePolicy {
  /**
   * Xe khong co viec trong bao nhieu GIO thi dong vong chay. `null` = khong bao gio dong vi het
   * gio — mac dinh bao thu, vi khong nguon nao noi con so nay la bao nhieu (`#276` L4).
   */
  readonly idleHours: number | null;
}

/**
 * LUOT QUET DINH KY — `#293` R3.
 *
 * Day KHONG phai mot nguong nghiep vu va khong duoc lan vao `RunClosurePolicy`: `idleHours` la cau
 * hoi *"khach noi xe nghi bao lau thi coi la het vong chay"*, con hai so duoi day la cau hoi *"nen
 * hoi lai bao lau mot lan, va moi lan hoi bao nhieu vong chay"*. Tron hai loai so lai se lam mot
 * tham so van hanh tro thanh mot quyet dinh nghiep vu.
 */
export interface RunClosureSweepPolicy {
  /** Khoang cach giua hai luot quet. Nhip van hanh, khong phai nguong nghiep vu. */
  readonly intervalSeconds: number;
  /**
   * So vong chay toi da moi luot quet. Co tran la co y: mot luot quet khong duoc bien thanh mot
   * phep quet toan bo bang khi doi xe lon dan.
   */
  readonly batchSize: number;
}

export interface TransportPlanningPolicy {
  readonly grouping: RunGrouping;
  readonly depots: readonly DepotConfig[];
  readonly closure: RunClosurePolicy;
  readonly sweep: RunClosureSweepPolicy;
}

/* ------------------------------------------------------------------ *
 * LICH SU LAP KE HOACH
 * ------------------------------------------------------------------ */

export const RUN_PLAN_OUTCOMES = ['NEW_RUN', 'APPENDED'] as const;
export type RunPlanOutcome = (typeof RUN_PLAN_OUTCOMES)[number];

export interface OrderRunPlan {
  readonly id: string;
  readonly orderId: string;
  readonly runId: string;
  readonly vehicleId: string;
  readonly loadedLegId: string;
  /** `null` nghia la KHONG CO di chuyen rong nao truoc do, khong phai "chua biet". */
  readonly emptyLegId: string | null;
  /** Che do AP DUNG luc chot, khong phai che do dang cau hinh hom nay. */
  readonly grouping: RunGrouping;
  readonly outcome: RunPlanOutcome;
  readonly idempotencyKey: string;
  readonly plannedBy: string;
  readonly businessDate: string;
  readonly createdAt: string;
  readonly cancelledAt: string | null;
  readonly cancellationReason: string | null;
}

/* ------------------------------------------------------------------ *
 * XEM TRUOC — KHONG GHI MOT HANG NAO
 * ------------------------------------------------------------------ */

/**
 * Diem xuat phat cua chang dau tien ma ke hoach nay them vao.
 *
 * BA nguon, va viec phan biet chung la ly do `RunPlanProposal` ton tai: mot chang rong sinh ra tu
 * `DEPOT` va mot chang rong sinh ra tu `PREVIOUS_LEG_DESTINATION` la hai su that khac nhau, va
 * nguoi doc bao cao km rong phai biet no den tu dau.
 */
export const PLAN_START_SOURCES = [
  /** Vong chay moi, va khach co khai bai xe: xe xuat phat tu bai. */
  'DEPOT',
  /** Noi vao vong chay dang chay: xe dang o diem cuoi cua chang sau cung. */
  'PREVIOUS_LEG_DESTINATION',
  /**
   * Vong chay moi va khach KHONG khai bai xe. Khong biet xe dang o dau, nen ke hoach bat dau
   * ngay tai diem lay hang — va KHONG sinh chang rong nao. `#276` L4: khong bia di chuyen.
   */
  'ORDER_ORIGIN',
] as const;
export type PlanStartSource = (typeof PLAN_START_SOURCES)[number];

/** Mot chang ma ke hoach DE NGHI them. Chua ton tai trong kho. */
export interface PlannedLeg {
  readonly sequence: number;
  readonly kind: RunLegKind;
  /** `null` bat buoc khi `kind === 'EMPTY'` — cung bat bien voi `RunLeg`. */
  readonly orderId: string | null;
  readonly originLabel: string;
  readonly destinationLabel: string;
  /** Km DU KIEN. `null` = chua biet, khong phai 0. */
  readonly plannedDistanceKm: number | null;
}

export interface RunPlanProposal {
  readonly orderId: string;
  readonly vehicleId: string;
  readonly grouping: RunGrouping;
  readonly outcome: RunPlanOutcome;
  /** `null` khi `outcome === 'NEW_RUN'`: vong chay chua ton tai. */
  readonly runId: string | null;
  readonly runCode: string | null;
  readonly startsFrom: string;
  readonly startSource: PlanStartSource;
  /** Chang rong truoc + chang co hang. Do dai 1 hoac 2, khong bao gio hon. */
  readonly legs: readonly PlannedLeg[];
  /** Co phai di chuyen rong that khong. `false` = diem ket thuc truoc do TRUNG diem lay hang. */
  readonly emptyLegRequired: boolean;
}

/* ------------------------------------------------------------------ *
 * DIEM KET THUC DU KIEN CUA MOT CHIEC XE — nguon cho Lane M
 * ------------------------------------------------------------------ */

export const VEHICLE_ENDPOINT_SOURCES = [
  /** Xe khong co vong chay nao chua ket thuc, va khach co khai bai. */
  'DEPOT',
  /** Diem cuoi cua chang CHUA chay xong sau cung — tuc noi xe se toi. */
  'PLANNED_LEG_DESTINATION',
  /** Xe khong con chang nao dang mo: diem cuoi cua chang da hoan thanh sau cung. */
  'COMPLETED_LEG_DESTINATION',
  /** Khong co vong chay, khong co bai khai bao. Noi that thay vi doan. */
  'UNKNOWN',
] as const;
export type VehicleEndpointSource = (typeof VEHICLE_ENDPOINT_SOURCES)[number];

/**
 * XE NAY SE KET THUC O DAU — `#276` L7.
 *
 * Lane M xep hang ung vien va tinh ETA; lane nay chi noi mot su that: theo ke hoach hien tai, xe
 * se dung o dau va tu bao gio no het viec.
 *
 * `freeFrom` CO Y de `null` khi con chang chua chay xong. Doan gio ranh cua mot chiec xe dang tren
 * duong doi mot phep tinh duong di ma lane nay khong co nguon — va mot con so doan trong y het mot
 * con so do duoc.
 */
export interface VehicleRunProjection {
  readonly vehicleId: string;
  readonly runId: string | null;
  readonly runCode: string | null;
  readonly runStatus: VehicleRunStatus | null;
  readonly endpointLabel: string | null;
  readonly endpointSource: VehicleEndpointSource;
  /** ISO. Chi co gia tri khi xe DA het viec; `null` khi con chang dang mo. */
  readonly freeFrom: string | null;
  /** So chang con `PLANNED`/`IN_TRANSIT` tren vong chay dang mo. */
  readonly openLegCount: number;
}

/* ------------------------------------------------------------------ *
 * DONG VONG CHAY
 * ------------------------------------------------------------------ */

/**
 * VI SAO MOT VONG CHAY CHUA DONG DUOC.
 *
 * Danh sach LY DO, khong phai mot `boolean`: `#276` L4 liet ke nam dieu kien chan khac nhau, va
 * mot cong gop chung thanh `false` se buoc nguoi truc mo source doc lai nam dieu kien roi doan.
 */
export const RUN_CLOSURE_BLOCKERS = [
  /** Vong chay chua chay (`PLANNED`) hoac da o diem cuoi. Khong co gi de dong. */
  'RUN_NOT_ACTIVE',
  /** Con chang `PLANNED` hoac `IN_TRANSIT` — "active loaded/empty leg" + "future assigned leg". */
  'LEG_STILL_OPEN',
  /** Con ke hoach chua huy ma chang co hang cua no chua ket thuc. */
  'PLAN_STILL_OPEN',
  /** Khong chang nao da hoan thanh. Dong mot vong chay chua lam gi la xoa no bang mot ten khac. */
  'NO_COMPLETED_WORK',
  /**
   * Xe con hang tren thung. KHONG suy ra duoc tu trang thai chang — no can moc van hanh cua
   * `transport-checkpoint`, va lane nay khong duoc phu thuoc vao capability do (xem chu thich
   * `additionalBlockers` cua `RunClosureFacts`).
   */
  'CARGO_STILL_CARRIED',
  /** Con mot phien cho nguoi nhan chua dong (F3, Lane O). Cung duong nap voi `CARGO_STILL_CARRIED`. */
  'OPEN_WAITING_SESSION',
  /**
   * KHONG HOI DUOC nguon su that ben ngoai, nen khong biet con gi chan hay khong. Fail-closed —
   * xem `collectBlockers()` cua `run-closure-blocker.source.ts`.
   *
   * Day la mot ma chan THAT chu khong phai mot ngoai le: mot lan dong bi bo qua vi mot su co tam
   * thoi se tu khoi phuc o luot quet sau, va bang dieu hanh nhin thay ly do.
   */
  'EXTERNAL_BLOCKER_SOURCE_UNAVAILABLE',
  /**
   * Nguon su that ben ngoai tra ve mot thu khong doc duoc (khong phai mang, hoac chua ma la).
   * Khac han `..._UNAVAILABLE`: mot cai la loi ha tang, mot cai la hop dong cong bi vi pham.
   */
  'EXTERNAL_BLOCKER_SOURCE_AMBIGUOUS',
] as const;
export type RunClosureBlocker = (typeof RUN_CLOSURE_BLOCKERS)[number];

export const RUN_CLOSURE_TRIGGERS = [
  /** Chang hoan thanh sau cung ket thuc TAI BAI XE da khai. Truong hop dong "manh" cua L4. */
  'DEPOT_RETURN',
  /** Xe dung viec xa bai qua nguong `closure.idleHours`. Chi chay khi khach co khai nguong. */
  'IDLE_TIMEOUT',
] as const;
export type RunClosureTrigger = (typeof RUN_CLOSURE_TRIGGERS)[number];

/**
 * VI SAO LAN PHAN XU NAY CHAY — `#293` R2.
 *
 * Nam duong lam thay doi su that cua mot vong chay, va bon trong so do lam no CO THE dong duoc. Ly
 * do la mot MA chu khong mot chuoi tu do: hai nguoi se viet hai cau khac nhau cho cung mot su kien,
 * va mot so quyet dinh khong loc duoc theo mot cau van.
 */
export const RUN_CLOSURE_CAUSES = [
  /** Mot chang hoan thanh (chang cuoi ve bai) hoac bi huy. */
  'LEG_CHANGED',
  /** Ke hoach cuoi cung bi go: khong con viec tuong lai nao chan nua. */
  'PLAN_CANCELLED',
  /**
   * Khong co su kien nao danh thuc: mot luot quet dinh ky hoi lai.
   *
   * MOT ma cho MOI lan quet, khong tach "quet vi het gio nghi" voi "quet vi su kien that lac".
   * Su khac biet do da duoc ghi lai o cho khac va ghi CHINH XAC hon: `planning.run_closure` cua
   * lan dong do mang `trigger` (`DEPOT_RETURN` hay `IDLE_TIMEOUT`). Mot ma thu hai o day se la mot
   * suy doan ve ly do, trong khi ly do that da nam trong cung so quyet dinh.
   */
  'IDLE_SWEEP',
] as const;
export type RunClosureCause = (typeof RUN_CLOSURE_CAUSES)[number];

export interface RunClosureVerdict {
  readonly closable: boolean;
  /** Dieu kien nao da dong no. `null` khi `closable === false`. */
  readonly trigger: RunClosureTrigger | null;
  /** Rong khi khong con gi chan — nhung van co the chua den dieu kien dong. */
  readonly blockers: readonly RunClosureBlocker[];
  /**
   * `true` khi KHONG con gi chan nhung cung chua dieu kien nao dong: xe xong viec ma chua ve bai,
   * va khach chua khai nguong nghi. Day KHONG phai loi — no la trang thai cho, va `#276` L4 doi
   * phai phan biet duoc no voi "bi chan".
   */
  readonly holding: boolean;
}
