/**
 * INDEX CUA MIEN VAN TAI + XUAT LAI co che nhan dien va cham ghi.
 *
 * Co che nam o `config/storage-conflict.ts` tu `#287` — xem khoi chu thich o do. Tep nay giu DANH
 * SACH INDEX cua van tai, dung nhu no da tu mo ta: *"CO CHE la thu dung chung; DANH SACH INDEX thi
 * thuoc ve capability so huu bang do"*.
 *
 * XUAT LAI nguyen ven de hai muoi cho dang `import` tu day khong phai doi mot dong nao.
 */
export {
  isUniqueViolationOn,
  isActiveAssignmentConflict,
  describeStorageError,
  type UniqueIndexRef,
  type ActiveAssignmentIndex,
} from '../config/storage-conflict.js';
import type { ActiveAssignmentIndex } from '../config/storage-conflict.js';

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
