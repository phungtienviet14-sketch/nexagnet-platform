import { loadTenantConfig } from '@netviet/tenant';
import {
  COMPLIANCE_DOCUMENT_TYPES,
  type ComplianceDocumentType,
} from './asset-compliance.types.js';

/**
 * Chinh sach cua `transport-asset-compliance` — T1 §10.1 khai capability nay can
 * `transportCompliance` (nguong canh bao het han).
 *
 * Khoi cau hinh HOAN TOAN TUY CHON, cung ly le voi ba capability van tai truoc no: bat mot khach
 * van tai phai go mot khoi rong chi de he thong khoi chet la mot yeu cau khong phuc vu ai.
 *
 * Mac dinh KHONG RONG, cung ly le voi `transport-fuel`: `GD-18` da ghi ten mot con so cu the (30
 * ngay) va ghi ro do la gia dinh cua chung ta voi chi phi dao nguoc "thap". Mot mac dinh rong o
 * day khong co nghia gi — "khong nguong" la `0`, va `0` se lam moi giay to chi keu dung hom no het
 * han, tuc dung hom da qua muon.
 */

/**
 * `GD-18` — nguong mac dinh 30 ngay.
 *
 * Nguon khach (VT-015) cho mot KHOANG "15–30 ngay", khong mot gia tri. Lay dau RONG hon co chu
 * dich: bo sot mot han dang kiem dat hon la keu som mot tuan.
 */
export const DEFAULT_COMPLIANCE_EXPIRY_WARNING_DAYS = 30;

/**
 * Con bao xa moi coi mot lich bao duong la SAP DEN HAN.
 *
 * CA HAI con so duoi day la GIA DINH CUA CHUNG TA, khong phai loi khach: VT-063 noi "canh bao dua
 * tren odo" nhung khong cho mot nguong nao. Ghi ten o day thay vi de rai trong service, va khach
 * doi duoc bang mot dong cau hinh.
 *
 * `500` km cho mot xe tai chay duong dai la khoang vai ngay — du de xep lich vao xuong ma khong
 * phai keu suot ca thang. `7` ngay la cung y do o truc thoi gian.
 */
export const DEFAULT_MAINTENANCE_DUE_SOON_KM = 500;
export const DEFAULT_MAINTENANCE_DUE_SOON_DAYS = 7;

export interface TransportCompliancePolicy {
  /** Nguong chung, tinh bang ngay. */
  readonly expiryWarningDays: number;
  /**
   * Nguong RIENG theo tung loai giay to (`GD-18`: "dat rieng duoc theo loai giay to").
   *
   * Khong khai = dung `expiryWarningDays`. Bao hiem thuong can bao som hon dang kiem vi phai lam
   * viec voi mot ben thu ba, nen mot con so chung cho ca sau loai la mot thoa hiep, khong phai
   * mot luat.
   */
  readonly expiryWarningDaysByType: Readonly<Partial<Record<ComplianceDocumentType, number>>>;
  readonly maintenanceDueSoonKm: number;
  readonly maintenanceDueSoonDays: number;
}

export const TRANSPORT_COMPLIANCE_POLICY = Symbol('TRANSPORT_COMPLIANCE_POLICY');

export function tenantTransportCompliancePolicy(): TransportCompliancePolicy {
  const configured = loadTenantConfig().policies.transportCompliance;
  const byType: Partial<Record<ComplianceDocumentType, number>> = {};
  for (const type of COMPLIANCE_DOCUMENT_TYPES) {
    const value = configured?.expiryWarningDaysByType?.[type];
    if (typeof value === 'number') byType[type] = value;
  }

  return {
    expiryWarningDays: configured?.expiryWarningDays ?? DEFAULT_COMPLIANCE_EXPIRY_WARNING_DAYS,
    expiryWarningDaysByType: byType,
    maintenanceDueSoonKm: configured?.maintenance?.dueSoonKm ?? DEFAULT_MAINTENANCE_DUE_SOON_KM,
    maintenanceDueSoonDays:
      configured?.maintenance?.dueSoonDays ?? DEFAULT_MAINTENANCE_DUE_SOON_DAYS,
  };
}

/**
 * Nguong ap cho MOT loai giay to — rieng neu khach da khai, chung neu chua.
 *
 * Ham rieng chu khong tra cuu rai rac: acceptance 3 cua Issue #88 doi hoi doi nguong thi hinh
 * chieu doi ma BANG CHUNG lich su khong bi ghi lai. Dieu do chi dung neu chi co DUNG MOT cho doc
 * ra nguong, va no doc luc TINH chu khong luc GHI.
 */
export const expiryWarningDaysFor = (
  policy: TransportCompliancePolicy,
  documentType: ComplianceDocumentType,
): number => policy.expiryWarningDaysByType[documentType] ?? policy.expiryWarningDays;
