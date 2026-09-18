import { describe, expect, it } from 'vitest';
import {
  ingestTelematicsObservationBatchSchema,
  ingestTelematicsObservationSchema,
  recordProofSchema,
  reportObservationSchema,
} from './proof.schemas.js';

/**
 * PROOF-080 — bien vao cua chung cu, va mot bay cua multipart.
 *
 * Bai dau tien o day ghi lai mot loi da xay ra THAT tren ban dang chay: `captureModes` duoc khai
 * la `z.array(...)`, nhung mot truong multipart don le den duoi dang CHUOI. Ket qua la mot lan
 * giao hang hoan toan dung — co anh, co vi tri — bi tra `400`, va thong bao loi khong he nhac
 * den anh. Chi mot lan chay that moi lo ra dieu do.
 */
describe('Lieu do chung cu van hanh — PROOF-080', () => {
  const base = {
    kind: 'DELIVERY' as const,
    tripId: 'trip-1',
    observationId: 'obs-1',
    clientEventId: 'evt-1',
  };

  it('MOT tam anh: `captureModes` den duoi dang CHUOI, va van phai qua', () => {
    const parsed = recordProofSchema.safeParse({ ...base, captureModes: 'LIVE_CAMERA' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.captureModes).toEqual(['LIVE_CAMERA']);
  });

  it('NHIEU tam anh: den duoi dang mang, giu nguyen thu tu', () => {
    const parsed = recordProofSchema.safeParse({
      ...base,
      captureModes: ['LIVE_CAMERA', 'GALLERY'],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.captureModes).toEqual(['LIVE_CAMERA', 'GALLERY']);
  });

  it('khong khai `captureModes` van hop le — tang tren se coi la UNKNOWN', () => {
    expect(recordProofSchema.safeParse(base).success).toBe(true);
  });

  it('mot gia tri khong thuoc bang thi VAN bi tu choi — chuan hoa khong phai noi long', () => {
    expect(recordProofSchema.safeParse({ ...base, captureModes: 'CHUP_BANG_Y_NGHI' }).success).toBe(
      false,
    );
  });

  it('KHONG nhan `driverId` — danh tinh chi den tu phien', () => {
    expect(recordProofSchema.safeParse({ ...base, driverId: 'driver-b' }).success).toBe(false);
  });

  it('KHONG nhan toa do — chung cu TRO TOI mot ban dinh vi da ghi', () => {
    expect(
      recordProofSchema.safeParse({ ...base, latitude: 21.0285, longitude: 105.8542 }).success,
    ).toBe(false);
  });
});

/**
 * `#297 T3` — duong TU KHAI CUA DIEN THOAI khong duoc khai minh la nguon khac.
 *
 * Cai duoc bao ve o day khong phai mot o nhap lieu; do la tinh chat *"nguon doc lap thu hai"*.
 * `SOURCE_FALLBACK` noi voi nguoi truc rang *"dien thoai im, nhung phan cung tren xe van bao"*.
 * Neu dien thoai tu ghi duoc ban `TELEMATICS`, cau do thanh mot loi noi suong — hai ban ghi cung
 * den tu mot thiet bi, va nguoi truc tin la con nhin thay chiec xe.
 */
describe('nguon tu khai cua ung dung lai xe — #297 T3', () => {
  const base = {
    clientEventId: 'event-1',
    latitude: 21.0285,
    longitude: 105.8542,
    capturedAt: '2026-09-07T03:00:00Z',
  };

  it('ba nguon cua THIET BI deu hop le', () => {
    for (const source of ['DEVICE_GNSS', 'DEVICE_FUSED', 'DEVICE_NETWORK'] as const) {
      expect(reportObservationSchema.safeParse({ ...base, source }).success, source).toBe(true);
    }
  });

  it('TELEMATICS bi TU CHOI — dien thoai khong duoc lam nguon doi chieu cua chinh no', () => {
    expect(reportObservationSchema.safeParse({ ...base, source: 'TELEMATICS' }).success).toBe(
      false,
    );
  });

  it('MANUAL bi TU CHOI — nhap tay la thao tac cua nguoi van hanh, tren mot be mat khac', () => {
    expect(reportObservationSchema.safeParse({ ...base, source: 'MANUAL' }).success).toBe(false);
  });

  it('mot nguon khong thuoc bang cung bi tu choi', () => {
    expect(reportObservationSchema.safeParse({ ...base, source: 'HOP_GSHT' }).success).toBe(false);
  });
});

/**
 * PROOF-082 — bien vao cua CUA NHAP TELEMATICS (`#297` T4).
 *
 * Cai dang duoc khoa o day la nhung truong KHONG co mat. Mot lieu do nhan `source` se mo lai dung
 * cai lo ma duong dien thoai da dong: bat ky ai ghi duoc vao cua nay se chon duoc nguon cho ban
 * ghi cua minh, va "nguon doc lap thu hai" tro thanh mot cau noi suong.
 *
 * `providerId` DA ROI khoi danh sach vi dung ly le do. No tung la mot truong BAT BUOC o day, va
 * chinh no la nua dau cua khoa chan phat lai — tuc nguoi goi tu dat duoc danh tinh nguon cho minh.
 * Gio danh tinh den tu cau hinh may chu, va thu duy nhat con lai tren day la mot LOI KHANG DINH
 * khong bat buoc (`connectorId`) phai khop thi lan nhap moi di tiep.
 */
describe('Lieu do cua nhap telematics — PROOF-082', () => {
  const base = {
    externalEventId: 'evt-1',
    vehicleId: 'vehicle-1',
    latitude: 20.8449,
    longitude: 106.6881,
    recordedAt: '2026-09-18T02:00:00.000Z',
  };

  it('than yeu cau toi thieu la hop le', () => {
    expect(ingestTelematicsObservationSchema.safeParse(base).success).toBe(true);
  });

  it('`source` KHONG duoc nhan — moi ban vao bang duong nay deu la `TELEMATICS`', () => {
    // `.strict()` bien mot truong thua thanh `400` on ao thay vi mot truong bi bo qua im lang. O
    // day dieu do quan trong hon binh thuong: mot may khach gui `source` phai duoc bao la sai, chu
    // khong duoc de tuong rang no da co tac dung.
    expect(
      ingestTelematicsObservationSchema.safeParse({ ...base, source: 'DEVICE_GNSS' }).success,
    ).toBe(false);
  });

  it('`sessionId` KHONG duoc nhan — ban tu phan cung khong thuoc ca cua ai', () => {
    expect(
      ingestTelematicsObservationSchema.safeParse({ ...base, sessionId: 'se-1' }).success,
    ).toBe(false);
  });

  it('`mockLocationReported` KHONG duoc nhan — mot hop GSHT khong tra loi cau do', () => {
    expect(
      ingestTelematicsObservationSchema.safeParse({ ...base, mockLocationReported: false }).success,
    ).toBe(false);
  });

  it('`receivedAt` KHONG duoc nhan — gio nhan la su that cua MAY CHU', () => {
    // Neu nguoi goi dat duoc `receivedAt` thi ho viet lai duoc chinh cai moc ma phep cham suc khoe
    // dung de do su im lang — tuc tat duoc mot canh bao "mat GPS" bang mot truong trong than yeu cau.
    expect(
      ingestTelematicsObservationSchema.safeParse({
        ...base,
        receivedAt: '2026-09-18T02:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('HAI truong danh tinh con lai deu BAT BUOC', () => {
    for (const field of ['externalEventId', 'vehicleId'] as const) {
      const { [field]: _removed, ...without } = base;
      expect(ingestTelematicsObservationSchema.safeParse(without).success, field).toBe(false);
    }
  });

  it('`providerId` KHONG duoc nhan nua — danh tinh nguon khong den tu than yeu cau', () => {
    // Bai nay la cai duy nhat ngan truong cu quay lai im lang. Neu ai do them `providerId` vao
    // lieu do cho "tuong thich nguoc", ho phai xoa bai nay truoc — va luc do viec dang lam se hien
    // ra dung ten cua no: tra lai cho nguoi goi quyen chon danh tinh cua chinh nguon.
    expect(
      ingestTelematicsObservationSchema.safeParse({ ...base, providerId: 'dau-noi-cua-toi' })
        .success,
    ).toBe(false);
  });

  it('`connectorId` la TUY CHON — bo trong la hinh dang binh thuong', () => {
    // May chu tu biet minh dang cam vao dau noi nao. Bat buoc khai lai se bien mot phep doi chieu
    // thanh mot nghi thuc, va mot nghi thuc thi nguoi ta chep gia tri chu khong kiem tra no.
    expect(ingestTelematicsObservationSchema.safeParse(base).success).toBe(true);
    expect(
      ingestTelematicsObservationSchema.safeParse({ ...base, connectorId: 'dau-noi-kiem-thu' })
        .success,
    ).toBe(true);
  });

  it('chuoi rong khong phai mot danh tinh', () => {
    expect(
      ingestTelematicsObservationSchema.safeParse({ ...base, connectorId: '  ' }).success,
    ).toBe(false);
  });

  it('lo rong bi tu choi — mot lan gui khong noi gi la mot loi cua nguoi goi', () => {
    expect(ingestTelematicsObservationBatchSchema.safeParse({ observations: [] }).success).toBe(
      false,
    );
  });

  it('lo qua 200 ban bi tu choi', () => {
    const observations = Array.from({ length: 201 }, (_unused, index) => ({
      ...base,
      externalEventId: `evt-${index}`,
    }));

    expect(ingestTelematicsObservationBatchSchema.safeParse({ observations }).success).toBe(false);
  });
});
