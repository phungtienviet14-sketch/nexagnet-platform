import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMPLIANCE_EXPIRY_WARNING_DAYS,
  type TransportCompliancePolicy,
} from './asset-compliance-policy.js';
import type { ComplianceDocument } from './asset-compliance.types.js';
import { alertFor, attentionOnly, complianceDashboard } from './compliance-alerts.js';

const policy = (overrides: Partial<TransportCompliancePolicy> = {}): TransportCompliancePolicy => ({
  expiryWarningDays: DEFAULT_COMPLIANCE_EXPIRY_WARNING_DAYS,
  expiryWarningDaysByType: {},
  maintenanceDueSoonKm: 500,
  maintenanceDueSoonDays: 7,
  ...overrides,
});

const doc = (overrides: Partial<ComplianceDocument> = {}): ComplianceDocument => ({
  id: 'doc-1',
  subjectKind: 'VEHICLE',
  subjectId: 'veh-1',
  documentType: 'VEHICLE_INSPECTION',
  documentNo: null,
  validFrom: '2026-01-01',
  validTo: '2026-12-31',
  status: 'ACTIVE',
  evidenceRef: null,
  note: null,
  recordedBy: 'ke-toan',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('hinh chieu canh bao het han — TX-06', () => {
  /** ACCEPTANCE 1 — giay to con han trong 30 ngay thi ra canh bao. */
  it('ACCEPTANCE 1: giay to het han trong vong 30 ngay -> DUE_SOON', () => {
    const alert = alertFor(doc({ validTo: '2026-09-20' }), '2026-09-03', policy());

    expect(alert.health).toBe('DUE_SOON');
    expect(alert.daysUntilExpiry).toBe(17);
    expect(alert.thresholdDays).toBe(30);
  });

  it('con han xa hon nguong thi HEALTHY, khong lam nhieu bang canh bao', () => {
    const alert = alertFor(doc({ validTo: '2026-12-31' }), '2026-09-03', policy());
    expect(alert.health).toBe('HEALTHY');
  });

  /** ACCEPTANCE 2 — giay to da qua han thi ra canh bao EXPIRED. */
  it('ACCEPTANCE 2: giay to da qua han -> EXPIRED, so ngay con lai AM', () => {
    const alert = alertFor(doc({ validTo: '2026-08-30' }), '2026-09-03', policy());

    expect(alert.health).toBe('EXPIRED');
    expect(alert.daysUntilExpiry).toBe(-4);
  });

  /**
   * Het han DUNG hom nay van con hieu luc.
   *
   * Mot dang kiem ghi han `2026-09-03` con dung duoc het ngay 03/09. Xep no sang `EXPIRED` se lam
   * mot chiec xe hop le bi giu lai o bai — mot loi ton tien that.
   */
  it('het han DUNG hom nay van la DUE_SOON, chua phai EXPIRED', () => {
    const alert = alertFor(doc({ validTo: '2026-09-03' }), '2026-09-03', policy());
    expect(alert.health).toBe('DUE_SOON');
    expect(alert.daysUntilExpiry).toBe(0);
  });

  /**
   * ACCEPTANCE 3 — doi nguong thi HINH CHIEU doi, BANG CHUNG khong doi.
   *
   * Bai nay giu dung mot vat: cung MOT doi tuong `document` (dong bang bang `Object.freeze`) di qua
   * hai chinh sach khac nhau va cho ra hai ket qua khac nhau, trong khi ban than no khong doi mot
   * truong nao. Neu ai do chuyen `health` thanh mot cot va tinh luc GHI, bai nay do.
   */
  it('ACCEPTANCE 3: doi nguong doi hinh chieu, KHONG ghi lai bang chung', () => {
    const document = Object.freeze(doc({ validTo: '2026-10-10' }));
    const snapshot = JSON.stringify(document);

    const at30 = alertFor(document, '2026-09-03', policy({ expiryWarningDays: 30 }));
    const at60 = alertFor(document, '2026-09-03', policy({ expiryWarningDays: 60 }));

    expect(at30.health).toBe('HEALTHY');
    expect(at60.health).toBe('DUE_SOON');
    expect(JSON.stringify(document)).toBe(snapshot);
  });

  it('ACCEPTANCE 3 (bis): nguong RIENG theo loai giay to duoc uu tien (GD-18)', () => {
    const insurance = doc({ documentType: 'VEHICLE_INSURANCE', validTo: '2026-10-10' });
    const alert = alertFor(
      insurance,
      '2026-09-03',
      policy({ expiryWarningDaysByType: { VEHICLE_INSURANCE: 45 } }),
    );

    expect(alert.thresholdDays).toBe(45);
    expect(alert.health).toBe('DUE_SOON');
  });
});

describe('bang gom chung — mot dong cho moi (chu the, loai giay to)', () => {
  /**
   * GIA HAN LA CHUYEN BINH THUONG, va no khong duoc lam bang canh bao noi doi.
   *
   * Bao hiem thuong duoc mua moi TRUOC khi ban cu het han, nen hai ban cung `ACTIVE` cua cung mot
   * xe la trang thai dung. Mot danh sach phang se hien "bao hiem xe 29H-123 DA HET HAN" ngay ben
   * canh ban con hieu luc, va nguoi doc se di lam mot viec da xong.
   */
  it('gia han: ban co validTo XA NHAT dai dien, ban cu khong keu nua', () => {
    const alerts = complianceDashboard(
      [
        doc({ id: 'cu', documentType: 'VEHICLE_INSURANCE', validTo: '2026-09-01' }),
        doc({ id: 'moi', documentType: 'VEHICLE_INSURANCE', validTo: '2027-09-01' }),
      ],
      '2026-09-03',
      policy(),
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.documentId).toBe('moi');
    expect(alerts[0]?.health).toBe('HEALTHY');
  });

  it('ban SUPERSEDED/REVOKED khong bao gio dai dien, nhung van con trong kho', () => {
    const alerts = complianceDashboard(
      [
        doc({ id: 'thu-hoi', validTo: '2027-12-31', status: 'REVOKED' }),
        doc({ id: 'dang-dung', validTo: '2026-09-10', status: 'ACTIVE' }),
      ],
      '2026-09-03',
      policy(),
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.documentId).toBe('dang-dung');
  });

  it('hai chu the khac nhau cho hai dong, khong gop nham', () => {
    const alerts = complianceDashboard(
      [
        doc({ id: 'xe-1', subjectId: 'veh-1', validTo: '2026-09-10' }),
        doc({ id: 'xe-2', subjectId: 'veh-2', validTo: '2026-09-05' }),
      ],
      '2026-09-03',
      policy(),
    );

    expect(alerts.map((alert) => alert.documentId)).toEqual(['xe-2', 'xe-1']);
  });

  it('giay to CONG TY khong co subjectId van tao duoc mot dong rieng', () => {
    const alerts = complianceDashboard(
      [
        doc({
          id: 'gp-cong-ty',
          subjectKind: 'COMPANY',
          subjectId: null,
          documentType: 'COMPANY_TRANSPORT_LICENSE',
          validTo: '2026-09-04',
        }),
      ],
      '2026-09-03',
      policy(),
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.subjectKind).toBe('COMPANY');
    expect(alerts[0]?.health).toBe('DUE_SOON');
  });

  it('`attentionOnly` bo cac dong khong ai phai lam gi', () => {
    const alerts = complianceDashboard(
      [
        doc({ id: 'on', subjectId: 'veh-1', validTo: '2027-12-31' }),
        doc({ id: 'gap', subjectId: 'veh-2', validTo: '2026-08-01' }),
      ],
      '2026-09-03',
      policy(),
    );

    expect(alerts).toHaveLength(2);
    expect(attentionOnly(alerts).map((alert) => alert.documentId)).toEqual(['gap']);
  });
});
