import { businessDateDifferenceInDays, type BusinessDate } from '../business-date.js';
import { expiryWarningDaysFor, type TransportCompliancePolicy } from './asset-compliance-policy.js';
import type {
  ComplianceAlert,
  ComplianceDocument,
  ComplianceHealth,
} from './asset-compliance.types.js';

/**
 * HINH CHIEU CANH BAO HET HAN — VT-015, VT-065, `GD-18`.
 *
 * TAT DINH VA THUAN TUY. Ba dau vao (giay to, hom nay, nguong) vao, mot ket qua ra; khong doc DB,
 * khong doc dong ho. Do la dieu kien de acceptance 3 dung duoc: doi nguong roi tinh lai thi ket
 * qua doi, con hang trong `TransportComplianceDocument` khong mot byte nao bi cham vao.
 *
 * VI SAO KHONG LUU `health` THANH COT: no la mot ham cua thoi gian. Mot cot se dung ngay hom sau
 * — va sai LANG LE, vi khong co gi bao rang no da cu.
 */

export function healthOf(daysUntilExpiry: number, thresholdDays: number): ComplianceHealth {
  if (daysUntilExpiry < 0) return 'EXPIRED';
  return daysUntilExpiry <= thresholdDays ? 'DUE_SOON' : 'HEALTHY';
}

/**
 * Canh bao cho MOT ban giay to.
 *
 * `daysUntilExpiry = 0` la het han DUNG hom nay, va no duoc xep `DUE_SOON` chu khong `EXPIRED`:
 * mot dang kiem con hieu luc den het ngay ghi tren no. Xep nham sang `EXPIRED` se lam mot xe hop
 * le bi giu lai o bai.
 */
export function alertFor(
  document: ComplianceDocument,
  today: BusinessDate,
  policy: TransportCompliancePolicy,
): ComplianceAlert {
  const thresholdDays = expiryWarningDaysFor(policy, document.documentType);
  const daysUntilExpiry = businessDateDifferenceInDays(today, document.validTo);
  return {
    documentId: document.id,
    subjectKind: document.subjectKind,
    subjectId: document.subjectId,
    documentType: document.documentType,
    validTo: document.validTo,
    health: healthOf(daysUntilExpiry, thresholdDays),
    daysUntilExpiry,
    thresholdDays,
  };
}

const coverageKey = (document: ComplianceDocument): string =>
  `${document.subjectKind}\u0000${document.subjectId ?? ''}\u0000${document.documentType}`;

/**
 * BANG DIEU KHIEN GOM CHUNG — VT-065 "gop vao mot dashboard canh bao het han duy nhat".
 *
 * MOT DONG cho moi (chu the, loai giay to), khong phai mot dong cho moi ban ghi. Ly do la nghiep
 * vu, khong phai trinh bay: gia han bao hiem sinh ra ban MOI truoc khi ban cu het hieu luc, nen
 * mot danh sach phang se hien "bao hiem xe 29H-123 DA HET HAN" ngay ben canh ban con hieu luc.
 * Nguoi doc bang do se di lam mot viec da xong.
 *
 * Ban DAI DIEN cho moi nhom la ban co `validTo` XA NHAT trong so cac ban con hieu luc quan tri
 * (`ACTIVE`) — tuc pham vi bao phu that su cua chu the do. Ban `SUPERSEDED`/`REVOKED` khong bao
 * gio dai dien, va cung khong bi xoa: chung van la bang chung lich su.
 *
 * Chu the KHONG CO mot ban `ACTIVE` nao thi khong xuat hien o day. Do la mot lo hong doc duoc
 * bang mot cau hoi khac ("xe nao chua khai bao hiem"), va `AssetComplianceReadService` hoi rieng
 * cau do — gop hai cau vao mot danh sach se lam "thieu giay to" va "giay to sap het han" tron lam
 * mot, trong khi hai viec phai lam khac nhau.
 */
export function complianceDashboard(
  documents: readonly ComplianceDocument[],
  today: BusinessDate,
  policy: TransportCompliancePolicy,
): readonly ComplianceAlert[] {
  const best = new Map<string, ComplianceDocument>();
  for (const document of documents) {
    if (document.status !== 'ACTIVE') continue;
    const key = coverageKey(document);
    const current = best.get(key);
    if (!current || document.validTo > current.validTo) best.set(key, document);
  }

  return [...best.values()]
    .map((document) => alertFor(document, today, policy))
    .sort((left, right) => left.daysUntilExpiry - right.daysUntilExpiry);
}

/** Chi nhung dong CAN LAM GI DO — bang canh bao cua Giam doc (VT-015). */
export const attentionOnly = (alerts: readonly ComplianceAlert[]): readonly ComplianceAlert[] =>
  alerts.filter((alert) => alert.health !== 'HEALTHY');
