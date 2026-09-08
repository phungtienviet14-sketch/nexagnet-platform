import { describe, expect, it } from 'vitest';
import {
  buildHereMatrixBody,
  buildHereRouteQuery,
  hereVehicleParams,
  parseHereMatrix,
  parseHereRouteSummary,
} from './here-truck-routing.js';
import { EMPTY_TRUCK_PROFILE, type TruckProfile } from './routing.types.js';

/**
 * `#277 M4`/`M11` — tich hop HERE la SUPPORTED_BY_DOCS / RUNTIME_NOT_PROVEN.
 *
 * Khong khoa nao ton tai, nen lan `fetch` khong bao gio chay o day. Cai CHAY duoc — va cung la hai
 * cho de sai nhat cua bat ky tich hop dinh tuyen nao — la PHEP DOI DON VI va CACH DOC MOT MA TRAN
 * PHANG. Ca hai deu thuan, va ca hai deu duoc kiem o duoi.
 */

const META = { providerId: 'here-routing-v8', computedAt: '2026-09-08T10:00:00.000Z' };

describe('anh xa ho so xe sang tham so HERE', () => {
  /**
   * `#277 M5`: *"Do not fabricate missing dimensions."*
   *
   * `TransportVehicle` hom nay khong co mot cot kich thuoc nao, nen ho so luon rong — va yeu cau
   * gui di phai KHONG mang mot tham so xe nao. Mot `vehicle[height]=0` se lam HERE dinh tuyen cho
   * mot chiec xe khong ton tai.
   */
  it('ho so rong KHONG sinh mot tham so xe nao', () => {
    expect(hereVehicleParams(EMPTY_TRUCK_PROFILE)).toEqual({});
  });

  it('giu nguyen don vi cua HERE: chieu cao XENTIMET, khoi luong KILOGAM', () => {
    const truck: TruckProfile = {
      ...EMPTY_TRUCK_PROFILE,
      heightCm: 410,
      widthCm: 250,
      lengthCm: 1_600,
      grossWeightKg: 40_000,
      currentWeightKg: 28_000,
      weightPerAxleKg: 9_000,
      trailerCount: 1,
    };
    expect(hereVehicleParams(truck)).toEqual({
      'vehicle[height]': '410',
      'vehicle[width]': '250',
      'vehicle[length]': '1600',
      'vehicle[grossWeight]': '40000',
      'vehicle[currentWeight]': '28000',
      'vehicle[weightPerAxle]': '9000',
      'vehicle[trailerCount]': '1',
    });
  });

  it('yeu cau tuyen dat transportMode=truck va chi xin phan tom tat', () => {
    const query = buildHereRouteQuery(
      {
        origin: { latitude: 21.02, longitude: 105.84 },
        destination: { latitude: 20.86, longitude: 106.68 },
        truck: EMPTY_TRUCK_PROFILE,
        departAt: null,
      },
      'khoa-thu-nghiem',
    );
    expect(query.transportMode).toBe('truck');
    expect(query.origin).toBe('21.02,105.84');
    expect(query.destination).toBe('20.86,106.68');
    // Khong xin `polyline`: HERE tra hinh duoi dang *flexible polyline* va repo khong co bo giai ma.
    expect(query.return).toBe('summary');
    expect(query.apiKey).toBe('khoa-thu-nghiem');
  });

  it('than ma tran khai vung `world` va xin ca thoi gian lan quang duong', () => {
    const body = buildHereMatrixBody({
      origins: [{ latitude: 21.02, longitude: 105.84 }],
      destinations: [{ latitude: 20.86, longitude: 106.68 }],
      truck: EMPTY_TRUCK_PROFILE,
      departAt: null,
    });
    expect(body).toMatchObject({
      origins: [{ lat: 21.02, lng: 105.84 }],
      destinations: [{ lat: 20.86, lng: 106.68 }],
      regionDefinition: { type: 'world' },
      matrixAttributes: ['travelTimes', 'distances'],
      transportMode: 'truck',
    });
  });
});

describe('doc lai phan hoi tuyen cua HERE', () => {
  /**
   * CONG MOI SECTION lai chu khong lay section dau tien.
   *
   * Mot tuyen bi cat thanh nhieu section o moi diem dung; lay section dau se cho ra mot con so nho
   * hon that ma van trong hoan toan hop ly — kieu sai te nhat vi khong ai nghi ngo no.
   */
  it('cong tong moi section', () => {
    const summary = parseHereRouteSummary({
      routes: [
        {
          sections: [
            { summary: { length: 40_000, duration: 2_400 } },
            { summary: { length: 62_000, duration: 3_300 } },
          ],
        },
      ],
    });
    expect(summary).toEqual({ roadDistanceMetres: 102_000, durationSeconds: 5_700 });
  });

  it('than khong dung hinh dang -> `null`, KHONG suy ra 0', () => {
    expect(parseHereRouteSummary({})).toBeNull();
    expect(parseHereRouteSummary({ routes: [] })).toBeNull();
    expect(parseHereRouteSummary({ routes: [{ sections: [{}] }] })).toBeNull();
    expect(
      parseHereRouteSummary({ routes: [{ sections: [{ summary: { length: 1 } }] }] }),
    ).toBeNull();
  });
});

describe('doc lai ma tran cua HERE', () => {
  /**
   * BAI QUAN TRONG NHAT CUA TEP NAY.
   *
   * Ma tran ve duoi dang MOT mang phang theo HANG: o `(i, j)` nam o `i * numDestinations + j`.
   * Doc nham thanh `j * numOrigins + i` van cho ra mot mang du so phan tu, khong nem loi nao, va
   * van cho ra mot bang xep hang trong hoan hao — voi khoang cach cua nhung cap diem KHAC.
   *
   * Ma tran 2x3 duoi day KHONG doi xung, nen mot cach doc sai se lo ra ngay.
   */
  it('doc dung theo HANG (row-major)', () => {
    const cells = parseHereMatrix(
      {
        matrix: {
          numOrigins: 2,
          numDestinations: 3,
          distances: [11, 12, 13, 21, 22, 23],
          travelTimes: [110, 120, 130, 210, 220, 230],
        },
      },
      META,
    );
    expect(cells).not.toBeNull();
    const find = (origin: number, destination: number) =>
      cells?.find((cell) => cell.originIndex === origin && cell.destinationIndex === destination);
    expect(find(0, 2)?.estimate?.roadDistanceMetres).toBe(13);
    expect(find(1, 0)?.estimate?.roadDistanceMetres).toBe(21);
    expect(find(1, 2)?.estimate?.durationSeconds).toBe(230);
  });

  it('ket qua mang nhan DUONG BO va co dau thoi diem tinh', () => {
    const cells = parseHereMatrix(
      { matrix: { numOrigins: 1, numDestinations: 1, distances: [500], travelTimes: [60] } },
      META,
    );
    expect(cells?.[0]?.estimate).toMatchObject({
      quality: 'ROAD_NETWORK',
      estimated: true,
      fromCache: false,
      computedAt: META.computedAt,
    });
  });

  /** Mot o hong KHONG duoc thanh mot o co quang duong bang 0 — no se dung dau bang xep hang. */
  it('o co ma loi thanh mot o THAT BAI, khong phai mot o 0 met', () => {
    const cells = parseHereMatrix(
      {
        matrix: {
          numOrigins: 1,
          numDestinations: 2,
          distances: [0, 900],
          travelTimes: [0, 90],
          errorCodes: [3, 0],
        },
      },
      META,
    );
    expect(cells?.[0]?.estimate).toBeNull();
    expect(cells?.[0]?.failure?.reason).toBe('ROUTE_NOT_FOUND');
    expect(cells?.[1]?.estimate?.roadDistanceMetres).toBe(900);
  });

  it('so phan tu khong khop kich thuoc khai bao -> `null`', () => {
    expect(
      parseHereMatrix(
        { matrix: { numOrigins: 2, numDestinations: 2, distances: [1, 2], travelTimes: [1, 2] } },
        META,
      ),
    ).toBeNull();
  });

  /** `#277 M13`: than loi cua nha cung cap khong duoc di ra ngoai — chi mot ma so. */
  it('cau mo ta o hong khong chua than loi cua nha cung cap', () => {
    const cells = parseHereMatrix(
      {
        matrix: {
          numOrigins: 1,
          numDestinations: 1,
          distances: [0],
          travelTimes: [0],
          errorCodes: [7],
        },
      },
      META,
    );
    expect(cells?.[0]?.failure?.detail).toBe('Nha cung cap khong tinh duoc o nay (ma 7).');
  });
});
