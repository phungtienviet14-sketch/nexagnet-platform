import { describe, expect, it } from 'vitest';
import { confirmSiteIntakeSchema, proposeSiteIntakeSchema } from './site-intake.schemas.js';

/**
 * BIEN CUA THAN YEU CAU — `#267` H7.
 *
 * Mot dong trong H7 khong duoc kiem o dau khac: *"Driver cannot set freight/revenue/payment fields
 * through quick-create DTO."*
 *
 * Hom nay dieu do dung vi `.strict()`, va `.strict()` la mot ky tu de mat: doi thanh `.passthrough()`
 * — hoac chi la quen no o mot schema moi — se mo mot duong cho mot truong tien di thang vao lenh ma
 * KHONG bai nao khac do. Tang dich vu khong cuu duoc: no chi doc nhung truong no biet ten, nen mot
 * truong la se di qua im lang cho toi khi co nguoi doc no.
 *
 * Nen bo bai nay khang dinh dung mot dieu: nhung gi KHONG duoc phep di vao.
 */

const validLocation = { latitude: 20.8449, longitude: 106.6881, accuracyMetres: 12 };
const validConfirm = { ...validLocation, siteId: 'site-1', clientEventId: 'cham-mot' };

describe('bien cua nhan viec tai A — `#267` H7', () => {
  it('lenh xac nhan hop le di qua', () => {
    expect(confirmSiteIntakeSchema.safeParse(validConfirm).success).toBe(true);
  });

  /**
   * Danh sach nay khong phai de day du — no la nhung ten ma mot lan "tien the them luon" se dat.
   * Diem cua bai la `.strict()`, va mot ten bat ky cung du de chung minh.
   */
  it.each([
    'freightAmount',
    'revenue',
    'amount',
    'currencyCode',
    'paymentTerm',
    'commission',
    'settlementAmount',
  ])('truong tien `%s` bi TU CHOI, khong bi lang le bo qua', (field) => {
    const parsed = confirmSiteIntakeSchema.safeParse({ ...validConfirm, [field]: 1_000_000 });
    expect(parsed.success).toBe(false);
  });

  /**
   * Danh tinh KHONG BAO GIO den tu than yeu cau. Ba ten nay la ba cach mot nguoi se thu, va ca ba
   * phai dung o bien — khong phai o tang dich vu, noi mot lan doc them truong se lam chung co that.
   */
  it.each(['driverId', 'vehicleId', 'runId', 'authUserId'])(
    'danh tinh `%s` khong dat duoc tu than yeu cau',
    (field) => {
      expect(
        confirmSiteIntakeSchema.safeParse({ ...validConfirm, [field]: 'lai-xe-khac' }).success,
      ).toBe(false);
    },
  );

  it('duong DOC cung dong bien y het', () => {
    expect(proposeSiteIntakeSchema.safeParse({ ...validLocation, freightAmount: 1 }).success).toBe(
      false,
    );
    expect(proposeSiteIntakeSchema.safeParse({ ...validLocation, siteId: 'x' }).success).toBe(
      false,
    );
  });

  /* ---------------------------------------------------------------- *
   * BA HINH DANG VI TRI HOP LE, VA KHONG HON
   * ---------------------------------------------------------------- */

  it('khong gui vi tri nao la hop le — lai xe chon kho bang tay', () => {
    expect(proposeSiteIntakeSchema.safeParse({}).success).toBe(true);
    expect(
      confirmSiteIntakeSchema.safeParse({ siteId: 'site-1', clientEventId: 'cham-mot' }).success,
    ).toBe(true);
  });

  it('chi mot ban dinh vi la hop le', () => {
    expect(proposeSiteIntakeSchema.safeParse({ observationId: 'obs-1' }).success).toBe(true);
  });

  /**
   * HAI NGUON VI TRI TRONG MOT YEU CAU la mot cau hoi ma chi nguoi goi tra loi duoc. Doan ho —
   * lang le uu tien mot ben — la cach chac chan nhat de mot ngay nao do doan sai.
   */
  it('gui CA ban dinh vi LAN toa do bi tu choi', () => {
    expect(
      proposeSiteIntakeSchema.safeParse({ ...validLocation, observationId: 'obs-1' }).success,
    ).toBe(false);
  });

  it('mot nua toa do khong phai mot vi tri', () => {
    expect(proposeSiteIntakeSchema.safeParse({ latitude: 20.8449 }).success).toBe(false);
    expect(proposeSiteIntakeSchema.safeParse({ longitude: 106.6881 }).success).toBe(false);
  });

  it('toa do ngoai khoang bi chan ngay o bien', () => {
    expect(proposeSiteIntakeSchema.safeParse({ latitude: 91, longitude: 106.6881 }).success).toBe(
      false,
    );
    expect(proposeSiteIntakeSchema.safeParse({ latitude: 20.8449, longitude: 181 }).success).toBe(
      false,
    );
  });

  /** Khoa chong lap rong la mot khoa khong chan gi — cung rang buoc voi `CHECK` o DB. */
  it('khoa chong lap rong bi tu choi', () => {
    expect(
      confirmSiteIntakeSchema.safeParse({ ...validConfirm, clientEventId: '   ' }).success,
    ).toBe(false);
  });

  it('diem den la TUY CHON, va rong thi bi tu choi', () => {
    expect(
      confirmSiteIntakeSchema.safeParse({ ...validConfirm, destinationLabel: 'Kho Bac Ninh' })
        .success,
    ).toBe(true);
    expect(
      confirmSiteIntakeSchema.safeParse({ ...validConfirm, destinationLabel: '  ' }).success,
    ).toBe(false);
  });
});
