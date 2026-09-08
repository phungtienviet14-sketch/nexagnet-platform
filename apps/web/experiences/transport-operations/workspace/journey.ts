import {
  EMPTY_VALUE,
  formatBusinessDate,
  formatCount,
  formatDistance,
  formatInstant,
} from '../customer-view';
import type {
  JourneyEvent,
  JourneyGeometryGap,
  JourneyPathKind,
  JourneySource,
  RunCheckpointType,
  RunJourneyMapView,
  RunJourneyView,
  RunLegPhase,
} from '../transport-types';

/**
 * BAO CAO BAN DO VONG CHAY — tang doc cua man hinh, HAM THUAN (#278 N5).
 *
 * Cung khuon `control-tower.ts`: vao la payload API, ra la chuoi da san sang hien thi. Khong hook,
 * khong fetch, khong React — nen moi luat o day kiem duoc bang mot bai `.ts`.
 *
 * ===========================================================================
 * BA LUAT KHONG DUOC PHA
 *
 * 1. `null` KHONG bao gio thanh `0`. Mot chang chua nhap km khong phai mot chang dai 0 km, va tren
 *    mot bieu do thi mot cot cao 0 doc y het mot cot cao 0 THAT.
 * 2. CHANG RONG phai doc ra duoc, khong chi nhin ra duoc. Tang nay phat co `isEmpty` VA chu "RỖNG";
 *    mau do o CSS/ban do chi to them.
 * 3. KHONG mot con so km nao duoc tinh tu hinh hoc. `@turf` do do dai mot duong VE; quang duong xe
 *    da chay la `distanceKm` do nguoi nhap. Tron hai thu do lai la cach chac chan nhat de bao cao
 *    dep hon su that.
 */

const PHASE_LABEL: Readonly<Record<RunLegPhase, string>> = {
  PLANNED: 'Chưa bấm mốc nào',
  AT_PICKUP: 'Đã vào lấy hàng',
  LOADING: 'Đang xếp hàng',
  IN_TRANSIT: 'Đang chạy',
  ARRIVED: 'Đã đến nơi giao',
  DELIVERED: 'Đã giao xong',
};

const CHECKPOINT_LABEL: Readonly<Record<RunCheckpointType, string>> = {
  ASSIGNED: 'Nhận việc',
  DEPARTED: 'Xuất phát',
  PICKUP_ARRIVAL: 'Đến điểm lấy hàng',
  GATE_ENTRY: 'Vào cổng',
  LOADING: 'Xếp hàng',
  PICKUP_DEPARTURE: 'Rời điểm lấy hàng',
  DELIVERY_ARRIVAL: 'Đến nơi giao',
  DELIVERY_ACCEPTED: 'Người nhận đã nhận',
  COMPLETED: 'Kết thúc vòng chạy',
};

/**
 * MOT CAU CHU CHO MOI CHO KHONG VE DUOC — va moi cau chi ra mot VIEC khac nhau.
 *
 * Gop chung thanh "chưa có dữ liệu" se lam nguoi van hanh khong biet phai lam gi: nhac lái xe bật
 * định vị, hay chờ nhà cung cấp dẫn đường, hay không phải làm gì cả vì chặng chưa chạy tới đó.
 */
const GAP_LABEL: Readonly<Record<JourneyGeometryGap, string>> = {
  NO_CHECKPOINT_RECORDED: 'Chặng chưa có mốc hiện trường nào — chưa chạy tới đây.',
  NO_CHECKPOINT_OBSERVATION:
    'Có mốc nhưng không mốc nào kèm bằng chứng vị trí — cần nhắc lái xe bật định vị.',
  NO_ROUTE_PROVIDER:
    'Tuyến dự kiến cần một nhà cung cấp dẫn đường; hệ thống chưa có. Bản đồ chỉ vẽ đường đã đi thật.',
  NO_TRACKING_SESSION: 'Chặng không nối với chuyến nào nên không có phiên bấm vị trí để đọc.',
};

const PATH_LABEL: Readonly<Record<JourneyPathKind, string>> = {
  PLANNED: 'Tuyến dự kiến',
  CHECKPOINT_ANCHORED: 'Đường nối các mốc',
  RAW_OBSERVED: 'Vệt GPS thô',
};

const SOURCE_LABEL: Readonly<Record<JourneySource, string>> = {
  CHECKPOINT: 'Mốc hiện trường',
  LOCATION_PROOF: 'Bằng chứng vị trí',
  FUEL: 'Nhiên liệu',
};

export interface JourneyMetric {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly hint: string | null;
}

export interface JourneyLegRow {
  readonly key: string;
  readonly sequence: string;
  /** `'RỖNG'` hoac `'CÓ HÀNG'` — chu doc duoc, khong chi mot mau. */
  readonly kindLabel: string;
  readonly isEmpty: boolean;
  readonly route: string;
  /** MA don, hoac mot cau noi ro vi sao khong co. KHONG BAO GIO mot `id`. */
  readonly orderCode: string;
  readonly distanceKm: string;
  /** Km DU KIEN. `'—'` khi chang khong do ke hoach sinh ra. */
  readonly plannedDistanceKm: string;
  /**
   * DO LECH thuc te so voi ke hoach.
   *
   * `'—'` khi THIEU mot trong hai so — mot chang co ke hoach 100km ma thuc te chua nhap thi do
   * lech la KHONG BIET, khong phai `-100`. Day dung la cho ma mot `?? 0` se de ra mot con so am
   * to tuong trong mot bao cao ma khong ai kiem lai.
   */
  readonly distanceVariance: string;
  readonly phase: string;
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface JourneyTimelineRow {
  readonly key: string;
  readonly at: string;
  readonly label: string;
  readonly legSequence: string;
  readonly hasLocationProof: boolean;
  readonly proofLabel: string;
}

/**
 * DU LIEU BIEU DO — cho nay CO SO, khong phai chuoi, va do la ngoai le duy nhat cua tep.
 *
 * Mot bieu do can so de ve. Nhung `null` VAN khong duoc thanh `0`: chang thieu km bi BO khoi bieu
 * do va duoc dem rieng vao `omittedLegs`, roi man hinh noi ra con so do. Mot cot cao 0 tren bieu do
 * doc y het mot chang that su dai 0 km.
 */
export interface JourneyDistanceChart {
  readonly sequences: readonly string[];
  readonly loadedKm: readonly number[];
  readonly emptyKm: readonly number[];
  readonly omittedLegs: number;
}

export interface JourneyGapNote {
  readonly key: string;
  readonly text: string;
}

export interface JourneyModel {
  readonly runCode: string;
  readonly title: string;
  readonly context: string;
  readonly metrics: readonly JourneyMetric[];
  readonly legs: readonly JourneyLegRow[];
  readonly chart: JourneyDistanceChart;
  readonly timeline: readonly JourneyTimelineRow[];
  readonly orderCodes: readonly string[];
  readonly unavailableNotes: readonly string[];
  /** `true` khi con it nhat mot chang thieu km — moi tong deu la `'—'`. */
  readonly distanceIncomplete: boolean;
}

const labelOf = (event: JourneyEvent): string =>
  event.code === 'FUEL_ENTRY' ? 'Đổ dầu' : CHECKPOINT_LABEL[event.code];

/**
 * DO LECH thuc te - ke hoach, hoac dau gach khi THIEU mot trong hai so.
 *
 * `#278` N5 doi tuyen ke hoach phan biet duoc voi tuyen thuc te. Con so o day la nua tren cua yeu
 * cau do (nua duoi la duong ve tren ban do). Dau `+`/`-` duoc giu ro rang: `+12 km` la chay DAI hon
 * ke hoach, va do la thu nguoi dieu hanh di hoi lai lai xe.
 */
const varianceOf = (planned: number | null, actual: number | null): string => {
  if (planned === null || actual === null) return EMPTY_VALUE;
  const delta = actual - planned;
  if (delta === 0) return 'Đúng kế hoạch';
  return `${delta > 0 ? '+' : '−'}${formatDistance(Math.abs(delta))}`;
};

export function toJourney(view: RunJourneyView): JourneyModel {
  const { distance } = view;

  const legs = view.legs.map((leg): JourneyLegRow => {
    const isEmpty = leg.kind === 'EMPTY';
    return {
      key: leg.legId,
      sequence: formatCount(leg.sequence),
      kindLabel: isEmpty ? 'RỖNG' : 'CÓ HÀNG',
      isEmpty,
      route: `${leg.originLabel} → ${leg.destinationLabel}`,
      /*
       * Chang rong KHONG mang don — do la bat bien cua mien, khong phai mot thieu sot du lieu. Hai
       * truong hop do phai doc ra khac nhau, neu khong nguoi doc se di tim mot don khong ton tai.
       */
      orderCode: isEmpty ? 'Không có đơn (chặng rỗng)' : (leg.orderCode ?? 'Chưa gắn đơn'),
      distanceKm: leg.distanceKm === null ? EMPTY_VALUE : formatDistance(leg.distanceKm),
      plannedDistanceKm:
        leg.plannedDistanceKm === null ? EMPTY_VALUE : formatDistance(leg.plannedDistanceKm),
      distanceVariance: varianceOf(leg.plannedDistanceKm, leg.distanceKm),
      phase: leg.phase === null ? EMPTY_VALUE : PHASE_LABEL[leg.phase],
      startedAt: formatInstant(leg.startedAt),
      completedAt: formatInstant(leg.completedAt),
    };
  });

  const counted = view.legs.filter((leg) => leg.distanceKm !== null);

  return {
    runCode: view.run.runCode,
    title: `Vòng chạy ${view.run.runCode}`,
    context: `${view.run.vehiclePlate ?? 'Chưa rõ xe'} · ngày ${formatBusinessDate(
      view.run.businessDate,
    )}`,
    metrics: [
      {
        key: 'total-km',
        label: 'Tổng km',
        value: distance.complete ? formatDistance(distance.totalKm) : EMPTY_VALUE,
        hint: distance.complete ? null : 'Còn chặng chưa nhập km nên chưa cộng được tổng.',
      },
      {
        key: 'loaded-km',
        label: 'Km có hàng',
        value: distance.complete ? formatDistance(distance.loadedKm) : EMPTY_VALUE,
        hint: null,
      },
      {
        key: 'empty-km',
        label: 'Km rỗng',
        value: distance.complete ? formatDistance(distance.emptyKm) : EMPTY_VALUE,
        hint: null,
      },
      {
        key: 'empty-ratio',
        label: 'Tỷ lệ rỗng',
        /*
         * `emptyRatio` la `null` khi thieu km HOAC khi tong bang 0. Ca hai deu tra ve dau gach —
         * mot ty le tinh tren du lieu khuyet la mot con so trong ma khong ai phan biet duoc voi con
         * so that.
         */
        value:
          distance.emptyRatio === null
            ? EMPTY_VALUE
            : `${(distance.emptyRatio * 100).toLocaleString('vi-VN', {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}%`,
        hint: distance.emptyRatio === null ? 'Chưa đủ dữ liệu để tính tỷ lệ.' : null,
      },
      {
        key: 'legs',
        label: 'Số chặng',
        value: `${formatCount(
          view.legs.filter((leg) => leg.kind === 'LOADED').length,
        )} có hàng · ${formatCount(view.legs.filter((leg) => leg.kind === 'EMPTY').length)} rỗng`,
        hint: null,
      },
      {
        key: 'orders',
        label: 'Đơn đã chở',
        value: view.orderCodes.length === 0 ? EMPTY_VALUE : formatCount(view.orderCodes.length),
        hint: null,
      },
    ],
    legs,
    chart: {
      sequences: counted.map((leg) => `Chặng ${leg.sequence}`),
      loadedKm: counted.map((leg) => (leg.kind === 'LOADED' ? (leg.distanceKm ?? 0) : 0)),
      emptyKm: counted.map((leg) => (leg.kind === 'EMPTY' ? (leg.distanceKm ?? 0) : 0)),
      omittedLegs: view.legs.length - counted.length,
    },
    timeline: view.timeline.map((event, index): JourneyTimelineRow => {
      const leg = view.legs.find((entry) => entry.legId === event.legId);
      return {
        key: `${event.subjectId}:${index}`,
        at: formatInstant(event.at),
        label: labelOf(event),
        legSequence: leg === undefined ? EMPTY_VALUE : `Chặng ${formatCount(leg.sequence)}`,
        hasLocationProof: event.hasLocationProof,
        proofLabel: event.hasLocationProof ? 'Có vị trí' : 'Không có vị trí',
      };
    }),
    orderCodes: view.orderCodes,
    unavailableNotes: view.unavailableSources.map(
      (source) =>
        `${SOURCE_LABEL[source]}: khách chưa bật nghiệp vụ này, nên báo cáo thiếu mục đó.`,
    ),
    distanceIncomplete: !distance.complete,
  };
}

/* ------------------------------------------------------------------ *
 * BAN DO
 * ------------------------------------------------------------------ */

/**
 * MOT DOAN DUONG DE VE.
 *
 * `role` la thu ban do to mau, va no den THANG tu `RunLegKind` cua may chu — khong phai mot phep
 * suy cua man hinh. `#274` §4: chang rong mau DO.
 */
export interface JourneySegment {
  readonly key: string;
  readonly legSequence: number;
  readonly role: 'LOADED' | 'EMPTY';
  readonly pathKind: JourneyPathKind;
  /** `[kinh do, vi do]` — thu tu cua GeoJSON/deck.gl, KHONG phai thu tu doc cua con nguoi. */
  readonly coordinates: readonly (readonly [number, number])[];
}

export interface JourneyMarker {
  readonly key: string;
  readonly legSequence: number;
  readonly role: 'ORIGIN' | 'DESTINATION';
  readonly coordinate: readonly [number, number];
  readonly label: string;
}

export interface JourneyMapModel {
  readonly segments: readonly JourneySegment[];
  readonly markers: readonly JourneyMarker[];
  /** Mot dong cho moi cho khong ve duoc — man hinh phai hien, khong duoc nuot. */
  readonly gaps: readonly JourneyGapNote[];
  readonly hasGeometry: boolean;
  /** Tong so ban dinh vi THAT truoc khi may chu thua bot. */
  readonly rawSampledFrom: number;
}

export function toJourneyMap(view: RunJourneyMapView): JourneyMapModel {
  const segments: JourneySegment[] = [];
  const markers: JourneyMarker[] = [];
  const gaps: JourneyGapNote[] = [];
  let rawSampledFrom = 0;

  for (const leg of view.legs) {
    const role = leg.kind === 'EMPTY' ? 'EMPTY' : 'LOADED';

    for (const path of leg.paths) {
      if (path.kind === 'RAW_OBSERVED') rawSampledFrom += path.sampledFrom;

      if (path.gap !== null) {
        gaps.push({
          key: `${leg.legId}:${path.kind}`,
          text: `Chặng ${leg.sequence} · ${PATH_LABEL[path.kind]}: ${GAP_LABEL[path.gap]}`,
        });
        continue;
      }

      segments.push({
        key: `${leg.legId}:${path.kind}`,
        legSequence: leg.sequence,
        role,
        pathKind: path.kind,
        coordinates: path.points.map(
          (point) => [point.longitude, point.latitude] as readonly [number, number],
        ),
      });
    }

    if (leg.origin !== null) {
      markers.push({
        key: `${leg.legId}:origin`,
        legSequence: leg.sequence,
        role: 'ORIGIN',
        coordinate: [leg.origin.point.longitude, leg.origin.point.latitude],
        label: `Chặng ${leg.sequence} · điểm lấy hàng`,
      });
    } else if (leg.originGap !== null) {
      gaps.push({
        key: `${leg.legId}:origin`,
        text: `Chặng ${leg.sequence} · điểm lấy hàng: ${GAP_LABEL[leg.originGap]}`,
      });
    }

    if (leg.destination !== null) {
      markers.push({
        key: `${leg.legId}:destination`,
        legSequence: leg.sequence,
        role: 'DESTINATION',
        coordinate: [leg.destination.point.longitude, leg.destination.point.latitude],
        label: `Chặng ${leg.sequence} · nơi giao`,
      });
    } else if (leg.destinationGap !== null) {
      gaps.push({
        key: `${leg.legId}:destination`,
        text: `Chặng ${leg.sequence} · nơi giao: ${GAP_LABEL[leg.destinationGap]}`,
      });
    }
  }

  return {
    segments,
    markers,
    gaps,
    hasGeometry: segments.length > 0 || markers.length > 0,
    rawSampledFrom,
  };
}

/**
 * KHUNG BAO cua moi thu ve duoc — `[tay, nam, dong, bac]`.
 *
 * `null` khi khong co gi de ve. Man hinh KHONG duoc tu chon mot khung mac dinh o giua Viet Nam khi
 * khong co du lieu: mot ban do do doc y het mot ban do co du lieu ma xe dang o cho khac.
 */
export const boundsOf = (
  model: JourneyMapModel,
): readonly [number, number, number, number] | null => {
  const points = [
    ...model.segments.flatMap((segment) => segment.coordinates),
    ...model.markers.map((marker) => marker.coordinate),
  ];
  const first = points[0];
  if (first === undefined) return null;

  let west = first[0];
  let east = first[0];
  let south = first[1];
  let north = first[1];

  for (const [longitude, latitude] of points) {
    west = Math.min(west, longitude);
    east = Math.max(east, longitude);
    south = Math.min(south, latitude);
    north = Math.max(north, latitude);
  }

  return [west, south, east, north];
};
