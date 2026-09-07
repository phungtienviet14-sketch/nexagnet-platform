import type { Trip, TripAssignment } from '../transport.types.js';
import type { TripProjectionReason } from './movement-decisions.js';
import type { CreateLegInput, CreateOrderInput, CreateRunInput } from './movement.repository.js';

/**
 * PHEP CHIEU mot chuyen v1 sang mo hinh v2 -- TAT DINH va LAP LAI DUOC.
 *
 * Day la tang TUONG THICH ma #234 doi ("legacy `TransportTrip` remains supported via additive
 * compatibility adapter/projection"). No KHONG dong hai truc lai lam mot: chuyen cu van la nguon
 * su that cua chinh no, va phep chieu chi tao them mot cach doc no bang tu vung v2.
 *
 * "TAT DINH" o day co nghia rat cu the: voi cung mot chuyen, ham nay luon cho ra cung mot ma
 * vong chay va cung mot ma don. Nho vay lan chay thu hai va cham vao rang buoc UNIQUE thay vi
 * de ra mot ban sao im lang -- va tang tren doc duoc dieu do thanh `PROJECTION_UNCHANGED`.
 *
 * HAM THUAN: khong I/O, khong dong ho, khong sinh id ngau nhien.
 */

export const RUN_CODE_PREFIX = 'RUN-';
export const ORDER_CODE_PREFIX = 'ORD-';

export const runCodeForTrip = (tripCode: string): string => `${RUN_CODE_PREFIX}${tripCode}`;
export const orderCodeForTrip = (tripCode: string): string => `${ORDER_CODE_PREFIX}${tripCode}`;

export interface ProjectionPlan {
  readonly order: CreateOrderInput | null;
  readonly run: CreateRunInput;
  readonly leg: Omit<CreateLegInput, 'runId' | 'orderId'>;
}

export type ProjectionRefusal = Extract<
  TripProjectionReason,
  'PROJECTION_TRIP_OUTSOURCED' | 'PROJECTION_TRIP_HAS_NO_VEHICLE'
>;

export type ProjectionOutcome =
  | { readonly ok: true; readonly plan: ProjectionPlan }
  | { readonly ok: false; readonly reason: ProjectionRefusal };

/**
 * Xe cua vong chay lay tu LICH SU phan cong, khong tu mot cot tren chuyen.
 *
 * Uu tien ban DANG hieu luc; neu chuyen da ket thuc va moi ban deu dong, lay ban gan nhat. Mot
 * chuyen da giao xong van phai chieu duoc -- do la phan lon du lieu lich su.
 */
export function vehicleOfTrip(assignments: readonly TripAssignment[]): string | null {
  const active = assignments.find((entry) => entry.effectiveTo === null && entry.vehicleId !== null);
  if (active?.vehicleId) return active.vehicleId;

  const withVehicle = assignments.filter((entry) => entry.vehicleId !== null);
  if (withVehicle.length === 0) return null;

  const latest = withVehicle.reduce((newest, entry) =>
    entry.effectiveFrom.localeCompare(newest.effectiveFrom) > 0 ? entry : newest,
  );
  return latest.vehicleId;
}

/**
 * Chuyen mot chuyen v1 thanh ke hoach ghi v2.
 *
 * Hai duong tu choi, ca hai CO TEN:
 *
 *  · `PROJECTION_TRIP_OUTSOURCED`      -- chuyen thue xe ngoai. Xe khong phai cua minh, nen khong
 *    co "vong chay cua xe" nao de chieu. Bia ra mot cai se lam km doi xe phong len, va do dung la
 *    con so ma tranche nay ton tai de tinh cho dung.
 *  · `PROJECTION_TRIP_HAS_NO_VEHICLE`  -- chua phan cong xe. Chua biet vong chay do la cua chiec
 *    nao, va `TransportVehicleRun.vehicleId` la cot BAT BUOC.
 *
 * Don chi duoc chieu ra khi chuyen CO khach: mot chuyen khong khach la mot chuyen dieu xe noi bo,
 * va tao mot "nghia vu thuong mai" khong co ben thue la bia ra mot nghia vu khong ai no.
 */
export function planTripProjection(
  trip: Trip,
  assignments: readonly TripAssignment[],
): ProjectionOutcome {
  if (trip.kind === 'EXTERNAL_CARRIER') {
    return { ok: false, reason: 'PROJECTION_TRIP_OUTSOURCED' };
  }

  const vehicleId = vehicleOfTrip(assignments);
  if (!vehicleId) return { ok: false, reason: 'PROJECTION_TRIP_HAS_NO_VEHICLE' };

  const order: CreateOrderInput | null =
    trip.customerId === null
      ? null
      : {
          code: orderCodeForTrip(trip.code),
          businessDate: trip.businessDate,
          originLabel: trip.originLabel,
          destinationLabel: trip.destinationLabel,
          customerId: trip.customerId,
          cargoDescription: trip.cargoDescription,
          freightAmount: trip.freightAmount,
          note: `Chieu tu chuyen ${trip.code}`,
        };

  return {
    ok: true,
    plan: {
      order,
      run: {
        code: runCodeForTrip(trip.code),
        vehicleId,
        businessDate: trip.businessDate,
        note: `Chieu tu chuyen ${trip.code}`,
      },
      leg: {
        sequence: 1,
        // Mot chuyen v1 LUON la mot chang co hang: no ton tai vi co gi do phai di. Chieu rong la
        // thu v1 khong bao gio ghi -- do chinh la khoang trong ma v2 mo ra.
        kind: 'LOADED',
        originLabel: trip.originLabel,
        destinationLabel: trip.destinationLabel,
        businessDate: trip.businessDate,
        distanceKm: trip.distanceKm,
        note: `Chieu tu chuyen ${trip.code}`,
      },
    },
  };
}
