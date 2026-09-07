import { describe, expect, it } from 'vitest';
import { GeofenceError, assessGeofences, type CircleGeofence } from './geofence.js';

/**
 * GEO-010 — hang rao dia ly PHAI biet ve do chinh xac cua ban dinh vi.
 *
 * Day la bai hoc dat nhat cua ca tang nay. Mot ban dinh vi khong phai mot diem — no la mot diem
 * KEM MOT BAN KINH SAI SO. Neu ta so sanh diem voi ban kinh hang rao ma bo qua sai so, thi mot xe
 * dung DUNG trong kho voi tin hieu kem (sai so 80 m) se bi ghi la "ngoai hang rao", va mot xe dung
 * ngoai duong voi tin hieu kem se bi ghi la "trong hang rao". Ca hai deu la KET LUAN SAI ma he
 * thong dua ra voi ve chac chan tuyet doi.
 *
 * Nen o day co BA phan quyet chu khong phai hai. `INDETERMINATE` la cau tra loi trung thuc cho
 * "hinh hoc khong du de noi", va no la thu duy nhat mo duong cho nguoi xem lai.
 */
describe('Phan quyet hang rao dia ly — GEO-010', () => {
  const depot: CircleGeofence = {
    id: 'kho-hai-phong',
    centre: { latitude: 20.8449, longitude: 106.6881 },
    radiusMetres: 200,
  };

  it('dung tam hang rao thi o TRONG', () => {
    const result = assessGeofences({ ...depot.centre }, null, [depot]);
    expect(result.verdict).toBe('INSIDE');
    expect(result.nearest?.fenceId).toBe('kho-hai-phong');
    expect(result.nearest?.distanceMetres).toBeCloseTo(0, 6);
  });

  it('cach 500 m voi tin hieu tot thi o NGOAI', () => {
    const away = { latitude: 20.8494, longitude: 106.6881 };
    const result = assessGeofences(away, 10, [depot]);
    expect(result.verdict).toBe('OUTSIDE');
    expect(result.nearest?.distanceMetres).toBeGreaterThan(450);
  });

  it('KHONG co hang rao nao thi noi ro la khong co, khong gia vo la NGOAI', () => {
    const result = assessGeofences({ latitude: 21, longitude: 106 }, 10, []);
    expect(result.verdict).toBe('NO_FENCE');
    expect(result.nearest).toBeNull();
  });

  it('gan bien nhung sai so lon thi KHONG KET LUAN duoc', () => {
    // ~210 m ve phia bac tam: ngoai ban kinh 200 m, nhung sai so 60 m trum qua bien.
    const nearEdge = {
      latitude: depot.centre.latitude + 0.00189,
      longitude: depot.centre.longitude,
    };
    const result = assessGeofences(nearEdge, 60, [depot]);
    expect(result.nearest?.distanceMetres).toBeGreaterThan(195);
    expect(result.nearest?.distanceMetres).toBeLessThan(230);
    expect(result.verdict).toBe('INDETERMINATE');
  });

  it('trong han voi sai so cong vao van chua cham bien thi VAN la TRONG', () => {
    const inside = { latitude: depot.centre.latitude + 0.0009, longitude: depot.centre.longitude };
    const result = assessGeofences(inside, 50, [depot]);
    expect(result.verdict).toBe('INSIDE');
  });

  it('ngoai han ke ca khi tru het sai so thi VAN la NGOAI', () => {
    const outside = { latitude: depot.centre.latitude + 0.0027, longitude: depot.centre.longitude };
    const result = assessGeofences(outside, 50, [depot]);
    expect(result.verdict).toBe('OUTSIDE');
  });

  it('sai so KHONG BIET thi so sanh nhu mot diem — khong tu bia ra mot bien do', () => {
    const nearEdge = {
      latitude: depot.centre.latitude + 0.00189,
      longitude: depot.centre.longitude,
    };
    expect(assessGeofences(nearEdge, null, [depot]).verdict).toBe('OUTSIDE');
  });

  it('cung tam thi lay hang rao HEP HON — va khong phu thuoc thu tu truyen vao', () => {
    const yard: CircleGeofence = {
      id: 'bai-xe',
      centre: { ...depot.centre },
      radiusMetres: 5_000,
    };
    expect(assessGeofences(depot.centre, 5, [yard, depot]).nearest?.fenceId).toBe('kho-hai-phong');
    expect(assessGeofences(depot.centre, 5, [depot, yard]).nearest?.fenceId).toBe('kho-hai-phong');
  });

  it('nhieu hang rao: lay cai GAN NHAT lam phan quyet, va liet ke moi cai dang o trong', () => {
    const yard: CircleGeofence = {
      id: 'bai-xe',
      centre: { latitude: 20.8449, longitude: 106.6881 },
      radiusMetres: 5_000,
    };
    const far: CircleGeofence = {
      id: 'kho-ha-noi',
      centre: { latitude: 21.0285, longitude: 105.8542 },
      radiusMetres: 200,
    };
    const result = assessGeofences({ ...depot.centre }, 5, [far, yard, depot]);
    expect(result.nearest?.fenceId).toBe('kho-hai-phong');
    expect(result.verdict).toBe('INSIDE');
    expect([...result.inside].map((f) => f.fenceId).sort()).toEqual(['bai-xe', 'kho-hai-phong']);
  });

  it('ban kinh khong duong la LOI CAU HINH — nem ngay, khong am tham bo qua', () => {
    const broken: CircleGeofence = { id: 'hong', centre: depot.centre, radiusMetres: 0 };
    expect(() => assessGeofences(depot.centre, 5, [broken])).toThrow(GeofenceError);
  });

  it('sai so am la LOI DU LIEU — nem, vi no se lam nong ban kinh phan quyet', () => {
    expect(() => assessGeofences(depot.centre, -10, [depot])).toThrow(GeofenceError);
  });
});
