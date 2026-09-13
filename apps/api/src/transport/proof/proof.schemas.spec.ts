import { describe, expect, it } from 'vitest';
import { recordProofSchema, reportObservationSchema } from './proof.schemas.js';

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
