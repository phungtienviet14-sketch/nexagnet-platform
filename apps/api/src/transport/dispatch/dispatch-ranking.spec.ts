import { describe, expect, it } from 'vitest';
import { DISPATCH_ORDERING_KEYS } from './dispatch-policy.js';
import { rankCandidates, type RankableCandidate } from './dispatch-ranking.js';

/**
 * `#277 M7` + `M14`. Moi bai o day khoa MOT tinh chat cua thu tu, va vai bai trong so do la
 * BAI DOT BIEN: bo mot khoa ra khoi `DISPATCH_ORDERING_KEYS` hoac dao mot phep so sanh se lam
 * chung do.
 */

const candidate = (
  over: Partial<RankableCandidate> & { vehicleId: string },
): RankableCandidate => ({
  registrationPlate: over.vehicleId,
  meetsRequiredPickupAt: null,
  interruptsCommittedWork: false,
  emptyRoadMetresToPickup: 0,
  pickupEtaEpochMs: null,
  ...over,
});

const plates = (ranked: readonly RankableCandidate[]): string[] =>
  ranked.map((entry) => entry.vehicleId);

describe('xep hang ung vien dieu xe', () => {
  it('KM CHAY RONG it hon thang — muc tieu chinh cua #274 §4', () => {
    const ranked = rankCandidates(
      [
        candidate({ vehicleId: 'xa', emptyRoadMetresToPickup: 40_000 }),
        candidate({ vehicleId: 'gan', emptyRoadMetresToPickup: 12_000 }),
      ],
      DISPATCH_ORDERING_KEYS,
    );
    expect(plates(ranked)).toEqual(['gan', 'xa']);
  });

  /**
   * `M14` muc 6 — VA LA BAI DOT BIEN QUAN TRONG NHAT CUA TEP NAY.
   *
   * Hai ung vien duoc dat sao cho ket luan theo DUONG CHIM BAY nguoc voi ket luan theo DUONG BO:
   * `bo-song` gan hon theo duong thang nhung phai vong 60 km duong bo (khong co cau), con `qua-cau`
   * xa hon theo duong thang nhung chi 18 km duong bo.
   *
   * Bai nay chi doc `emptyRoadMetresToPickup` — dai luong DUONG BO. Neu ai do doi tang tren de xep
   * hang bang khoang cach chim bay, bai nay do.
   */
  it('duong bo thang duong chim bay khi hai ben mau thuan', () => {
    const ranked = rankCandidates(
      [
        candidate({ vehicleId: 'bo-song', emptyRoadMetresToPickup: 60_000 }),
        candidate({ vehicleId: 'qua-cau', emptyRoadMetresToPickup: 18_000 }),
      ],
      DISPATCH_ORDERING_KEYS,
    );
    expect(plates(ranked)).toEqual(['qua-cau', 'bo-song']);
  });

  it('KIP GIO thang KHONG KIP, ke ca khi phai chay rong xa hon', () => {
    const ranked = rankCandidates(
      [
        candidate({
          vehicleId: 'gan-nhung-tre',
          emptyRoadMetresToPickup: 5_000,
          meetsRequiredPickupAt: false,
        }),
        candidate({
          vehicleId: 'xa-nhung-kip',
          emptyRoadMetresToPickup: 50_000,
          meetsRequiredPickupAt: true,
        }),
      ],
      DISPATCH_ORDERING_KEYS,
    );
    expect(plates(ranked)).toEqual(['xa-nhung-kip', 'gan-nhung-tre']);
  });

  /** `M14` muc 2 nhin tu phia thu tu: xe dang ban khong duoc dung tren mot xe ranh. */
  it('KHONG CAT NGANG viec dang lam thang, du xe kia dang dung ngay canh diem lay hang', () => {
    const ranked = rankCandidates(
      [
        candidate({
          vehicleId: 'dang-cho-hang',
          emptyRoadMetresToPickup: 800,
          interruptsCommittedWork: true,
        }),
        candidate({ vehicleId: 'dang-ranh', emptyRoadMetresToPickup: 26_000 }),
      ],
      DISPATCH_ORDERING_KEYS,
    );
    expect(plates(ranked)).toEqual(['dang-ranh', 'dang-cho-hang']);
  });

  it('KHONG BIET GIO DEN xep sau khi km rong bang nhau', () => {
    const ranked = rankCandidates(
      [
        candidate({ vehicleId: 'khong-biet-gio', pickupEtaEpochMs: null }),
        candidate({ vehicleId: 'biet-gio', pickupEtaEpochMs: 1_000 }),
      ],
      DISPATCH_ORDERING_KEYS,
    );
    expect(plates(ranked)).toEqual(['biet-gio', 'khong-biet-gio']);
  });

  it('han lay hang khong duoc khai thi khoa gio bi BO QUA, khong doan', () => {
    const ranked = rankCandidates(
      [
        candidate({ vehicleId: 'b', emptyRoadMetresToPickup: 1_000 }),
        candidate({ vehicleId: 'a', emptyRoadMetresToPickup: 1_000 }),
      ],
      DISPATCH_ORDERING_KEYS,
    );
    // Khong khoa nao phan dinh duoc -> roi ve bien so. Khong mot ung vien nao "kip gio" mot cach
    // tinh co chi vi truong do la `null`.
    expect(plates(ranked)).toEqual(['a', 'b']);
  });

  /**
   * PHAN DINH HOA la mot LUOI AN TOAN, khong phai mot khoa tuy chon.
   *
   * Chay voi mot bo khoa KHONG CHUA `STABLE_IDENTITY` va van phai ra ket qua on dinh: neu khong,
   * hai lan mo cung mot man hinh cho ra hai bang khac nhau.
   */
  it('van on dinh khi bo khoa cau hinh khong co STABLE_IDENTITY', () => {
    const input = [
      candidate({ vehicleId: 'z', emptyRoadMetresToPickup: 1_000 }),
      candidate({ vehicleId: 'a', emptyRoadMetresToPickup: 1_000 }),
    ];
    expect(plates(rankCandidates(input, ['EMPTY_ROAD_DISTANCE']))).toEqual(['a', 'z']);
  });

  it('khong doi mang dau vao', () => {
    const input = [
      candidate({ vehicleId: 'b', emptyRoadMetresToPickup: 2 }),
      candidate({ vehicleId: 'a', emptyRoadMetresToPickup: 1 }),
    ];
    const before = plates(input);
    rankCandidates(input, DISPATCH_ORDERING_KEYS);
    expect(plates(input)).toEqual(before);
  });
});
