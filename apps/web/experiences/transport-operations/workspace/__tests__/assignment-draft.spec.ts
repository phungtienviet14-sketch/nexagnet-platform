import { describe, expect, it } from 'vitest';
import {
  assignmentDraftIsNoOp,
  emptyAssignmentDraft,
  hydrateAssignmentDraft,
  releaseAssignmentDraft,
  toAssignSubmission,
  touchAssignmentDriver,
  touchAssignmentVehicle,
} from '../assignment-draft';

/**
 * #222 P1-A — O CHON PHAN CONG.
 *
 * ==============================================================================================
 * BO TEST NAY DO MOT LOI DA XAY RA THAT, KHONG MOT KHA NANG LY THUYET
 *
 * Tren ban dang chay, chuyen `UAT-VIET-01` hien `15C-556.33 · Nguyễn Văn Bình` o dong thoi gian
 * trong khi hai o chon ngay canh bay `Chưa gán xe` / `Chưa gán lái xe`. Bam `Phân công` o trang
 * thai do gui `{vehicleId: null, driverId: null}` — tuc GO PHAN CONG cua mot chuyen dang chay.
 *
 * Nen bo nay do ba dieu, va dieu thu ba la thu quan trong nhat:
 *
 *   1. du lieu ve SAU thi o chon phai theo;
 *   2. nguoi dung da sua thi mot lan tai lai ngam khong duoc ghi de;
 *   3. mot ban nhap `null` cu KHONG THE tro thanh mot lenh gui `null`.
 */

const ACTIVE = { vehicleId: 'xe-1', driverId: 'lai-xe-1' } as const;

describe('#222 P1-A — du lieu den SAU lan ve dau tien', () => {
  /** Day la dung trinh tu that: form ve truoc, `useTripAssignments` tra ve sau. */
  it('lan ve dau tien khong co phan cong -> o chon rong; khi phan cong ve thi o chon THEO', () => {
    const first = hydrateAssignmentDraft(emptyAssignmentDraft(), null);
    expect(first.vehicleId).toBe('');
    expect(first.driverId).toBe('');

    const hydrated = hydrateAssignmentDraft(first, ACTIVE);
    expect(hydrated.vehicleId).toBe('xe-1');
    expect(hydrated.driverId).toBe('lai-xe-1');
  });

  it('phan cong doi o may chu -> o chon doi theo, chung nao nguoi dung chua cham', () => {
    const hydrated = hydrateAssignmentDraft(emptyAssignmentDraft(), ACTIVE);
    const moved = hydrateAssignmentDraft(hydrated, { vehicleId: 'xe-2', driverId: 'lai-xe-2' });

    expect(moved.vehicleId).toBe('xe-2');
    expect(moved.driverId).toBe('lai-xe-2');
  });

  /**
   * Tinh chat nay khong phai toi uu — component goi `hydrate` trong mot `useEffect` chay theo phan
   * cong, va mot ket qua MOI moi lan se lam React ve lai vo tan.
   */
  it('khong co gi doi thi tra ve CHINH doi tuong cu', () => {
    const hydrated = hydrateAssignmentDraft(emptyAssignmentDraft(), ACTIVE);
    expect(hydrateAssignmentDraft(hydrated, ACTIVE)).toBe(hydrated);
  });
});

describe('#222 P1-A — mot lan tai lai ngam khong duoc nuot tay nguoi dung', () => {
  it('da chon xe khac roi thi lan dong bo sau KHONG ghi de', () => {
    const hydrated = hydrateAssignmentDraft(emptyAssignmentDraft(), ACTIVE);
    const touched = touchAssignmentVehicle(hydrated, 'xe-2');

    const afterRefetch = hydrateAssignmentDraft(touched, ACTIVE);

    expect(afterRefetch.vehicleId).toBe('xe-2');
    // ...nhung truong CHUA cham van bam theo may chu.
    expect(afterRefetch.driverId).toBe('lai-xe-1');
  });

  it('sau khi gui thanh cong, ban nhap tha ra va bam theo ket qua that cua may chu', () => {
    const touched = touchAssignmentVehicle(
      hydrateAssignmentDraft(emptyAssignmentDraft(), ACTIVE),
      'xe-2',
    );
    const released = releaseAssignmentDraft(touched);

    const next = hydrateAssignmentDraft(released, { vehicleId: 'xe-2', driverId: 'lai-xe-1' });
    expect(next.vehicleId).toBe('xe-2');
  });
});

describe('#222 P1-A — LUOI AN TOAN: ban nhap `null` cu khong the go phan cong', () => {
  /**
   * BAI DOI KHANG cua #222 §6: *"stale initial `null` must not make a currently assigned trip
   * submit null IDs"*.
   *
   * Mo ta dung trang thai cu: mot ban nhap CHUA TUNG duoc dong bo (nhu `useState(null)` truoc day),
   * dat canh mot chuyen DANG CO phan cong.
   */
  it('ban nhap rong + chua ai cham -> lenh gui la PHAN CONG DANG CO, khong phai `null`', () => {
    const stale = emptyAssignmentDraft();

    expect(toAssignSubmission(stale, ACTIVE)).toEqual({
      vehicleId: 'xe-1',
      driverId: 'lai-xe-1',
    });
  });

  it('va lan bam do duoc nhan ra la KHONG DOI GI, nen nut bi tat', () => {
    expect(assignmentDraftIsNoOp(emptyAssignmentDraft(), ACTIVE)).toBe(true);
  });

  it('go phan cong VAN LAM DUOC — nhung phai la mot lua chon co chu dich', () => {
    const hydrated = hydrateAssignmentDraft(emptyAssignmentDraft(), ACTIVE);
    // Nguoi dung CHON `Chưa gán xe` — do la mot hanh dong, khong phai mot trang thai con sot lai.
    const cleared = touchAssignmentVehicle(hydrated, '');

    expect(toAssignSubmission(cleared, ACTIVE)).toEqual({
      vehicleId: null,
      driverId: 'lai-xe-1',
    });
    expect(assignmentDraftIsNoOp(cleared, ACTIVE)).toBe(false);
  });

  it('chuyen CHUA co phan cong: gan moi van gui du CA HAI khoa', () => {
    const draft = touchAssignmentDriver(
      touchAssignmentVehicle(emptyAssignmentDraft(), 'xe-1'),
      'lai-xe-1',
    );

    // `AssignTripInput` la `.strict()` va doi du hai khoa — thieu mot khoa la 400.
    expect(toAssignSubmission(draft, null)).toEqual({
      vehicleId: 'xe-1',
      driverId: 'lai-xe-1',
    });
  });

  it('chuyen chua phan cong + khong ai cham -> khong doi gi, va gui van la `null` ca hai', () => {
    expect(assignmentDraftIsNoOp(emptyAssignmentDraft(), null)).toBe(true);
    expect(toAssignSubmission(emptyAssignmentDraft(), null)).toEqual({
      vehicleId: null,
      driverId: null,
    });
  });

  it('doi mot ben thoi thi ben kia VAN duoc gui nguyen — khong bao gio rot mat mot khoa', () => {
    const hydrated = hydrateAssignmentDraft(emptyAssignmentDraft(), ACTIVE);
    const draft = touchAssignmentDriver(hydrated, 'lai-xe-2');

    expect(toAssignSubmission(draft, ACTIVE)).toEqual({
      vehicleId: 'xe-1',
      driverId: 'lai-xe-2',
    });
  });
});
