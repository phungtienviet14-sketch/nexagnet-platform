import { describe, expect, it } from 'vitest';
import { recordProofSchema } from './proof.schemas.js';

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
