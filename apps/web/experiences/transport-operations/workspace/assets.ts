import {
  COMPLIANCE_DOCUMENT_STATUS_LABEL,
  COMPLIANCE_DOCUMENT_TYPE_LABEL,
  COMPLIANCE_HEALTH_LABEL,
  COMPLIANCE_SUBJECT_LABEL,
  EFFECTIVE_VEHICLE_STATE_REASON_LABEL,
  EMPTY_VALUE,
  MAINTENANCE_DUE_STATE_LABEL,
  MAINTENANCE_TRIGGER_LABEL,
  MAINTENANCE_WORK_ORDER_STATUS_LABEL,
  OPERATIONAL_ALERT_KIND_LABEL,
  OPERATIONAL_ALERT_SEVERITY_LABEL,
  OPERATIONAL_ALERT_SOURCE_LABEL,
  VEHICLE_STATE_INCONSISTENCY_LABEL,
  VEHICLE_STATUS_LABEL,
  alertSeverityTone,
  complianceHealthTone,
  entityLabel,
  formatBusinessDate,
  formatCount,
  formatMoney,
  formatOdometer,
  maintenanceDueTone,
  unresolvedReference,
  vehicleStatusTone,
  workOrderStatusTone,
  type StatusTone,
} from '../customer-view';
import type {
  ComplianceAlert,
  ComplianceDocument,
  ComplianceSubjectKind,
  Driver,
  EffectiveVehicleState,
  MaintenanceDue,
  MaintenanceWorkOrder,
  OperationalAlertFeed,
  Vehicle,
} from '../transport-types';

/**
 * KHUNG NHIN cua `TX-06`. Cung mot luat voi `settlement.ts`: KHONG mot phep suy luan nghiep vu nao.
 *
 * Rieng o day co mot cam cu the ma #170 §4.B viet ra: **trinh duyet khong bao gio tinh lai han bao
 * duong hay trang thai hieu luc cua xe**. `MaintenanceDue.state` va `EffectiveVehicleState` deu do
 * may chu quyet; man hinh chi doi ma thanh chu. Neu mot ham o day so `dueOnDate` voi hom nay de tu
 * quyet "qua han", do la mot loi — hai nguoi mo cung man hinh o hai mui gio se doc ra hai ket qua.
 */

/* ------------------------------------------------------------------ *
 * Danh ba xe/lai xe
 * ------------------------------------------------------------------ */

export interface AssetDirectory {
  readonly vehicles: ReadonlyMap<string, string>;
  readonly drivers: ReadonlyMap<string, string>;
}

export const toAssetDirectory = (input: {
  readonly vehicles: readonly Vehicle[];
  readonly drivers: readonly Driver[];
}): AssetDirectory => ({
  vehicles: new Map(input.vehicles.map((row) => [row.id, row.registrationPlate])),
  drivers: new Map(input.drivers.map((row) => [row.id, row.fullName])),
});

/** BIEN SO la danh tinh nghiep vu cua mot xe — khong bao gio dung `vehicleId` lam nhan. */
export const vehicleLabelOf = (directory: AssetDirectory, vehicleId: string): string =>
  entityLabel(directory.vehicles.get(vehicleId), unresolvedReference('Xe'));

export const driverLabelOf = (directory: AssetDirectory, driverId: string): string =>
  entityLabel(directory.drivers.get(driverId), unresolvedReference('Lái xe'));

const subjectLabelOf = (
  directory: AssetDirectory,
  subjectKind: ComplianceSubjectKind,
  subjectId: string | null,
): string => {
  if (subjectKind === 'COMPANY') return COMPLIANCE_SUBJECT_LABEL.COMPANY;
  if (subjectId === null) return unresolvedReference(COMPLIANCE_SUBJECT_LABEL[subjectKind]);
  return subjectKind === 'VEHICLE'
    ? vehicleLabelOf(directory, subjectId)
    : driverLabelOf(directory, subjectId);
};

/* ------------------------------------------------------------------ *
 * Bao duong den han
 * ------------------------------------------------------------------ */

export interface MaintenanceDueRow {
  readonly planId: string;
  readonly vehicleLabel: string;
  readonly planName: string;
  readonly triggerLabel: string;
  readonly stateLabel: string;
  readonly tone: StatusTone;
  /** Cau NGUOI DOC hieu ngay con bao xa — do may chu tinh, o day chi ghep chu. */
  readonly remainingLabel: string;
  readonly dueAtLabel: string;
  readonly currentOdoLabel: string;
  readonly lastServicedLabel: string;
}

const remainingLabelOf = (due: MaintenanceDue): string => {
  const parts: string[] = [];
  if (due.odoRemainingKm !== null) {
    parts.push(
      due.odoRemainingKm >= 0
        ? `còn ${formatOdometer(due.odoRemainingKm)}`
        : `vượt ${formatOdometer(Math.abs(due.odoRemainingKm))}`,
    );
  }
  if (due.daysRemaining !== null) {
    parts.push(
      due.daysRemaining >= 0
        ? `còn ${formatCount(due.daysRemaining)} ngày`
        : `quá ${formatCount(Math.abs(due.daysRemaining))} ngày`,
    );
  }
  return parts.length === 0 ? EMPTY_VALUE : parts.join(' · ');
};

const dueAtLabelOf = (due: MaintenanceDue): string => {
  const parts: string[] = [];
  if (due.dueAtOdoKm !== null) parts.push(formatOdometer(due.dueAtOdoKm));
  if (due.dueOnDate !== null) parts.push(formatBusinessDate(due.dueOnDate));
  return parts.length === 0 ? EMPTY_VALUE : parts.join(' · ');
};

/**
 * XEP THEO MUC DO, khong theo ten. Mot bang bao duong xep theo alphabet lam nguoi truc phai doc het
 * moi thay cai qua han; xep theo muc do thi viec can lam nam ngay dong dau.
 */
const DUE_ORDER: Readonly<Record<MaintenanceDue['state'], number>> = {
  OVERDUE: 0,
  DUE_SOON: 1,
  OK: 2,
};

export const toMaintenanceDueRows = (
  rows: readonly MaintenanceDue[],
  directory: AssetDirectory,
): readonly MaintenanceDueRow[] =>
  [...rows]
    .sort((left, right) => DUE_ORDER[left.state] - DUE_ORDER[right.state])
    .map((due) => ({
      planId: due.planId,
      vehicleLabel: vehicleLabelOf(directory, due.vehicleId),
      planName: due.planName,
      triggerLabel: MAINTENANCE_TRIGGER_LABEL[due.triggerKind],
      stateLabel: MAINTENANCE_DUE_STATE_LABEL[due.state],
      tone: maintenanceDueTone(due.state),
      remainingLabel: remainingLabelOf(due),
      dueAtLabel: dueAtLabelOf(due),
      currentOdoLabel: formatOdometer(due.currentOdoKm),
      lastServicedLabel: `${formatBusinessDate(due.lastServicedDate)} · ${formatOdometer(due.lastServicedOdoKm)}`,
    }));

/* ------------------------------------------------------------------ *
 * Lenh sua chua
 * ------------------------------------------------------------------ */

export interface WorkOrderRow {
  readonly id: string;
  readonly vehicleLabel: string;
  readonly description: string;
  readonly statusLabel: string;
  readonly tone: StatusTone;
  readonly openedLabel: string;
  readonly completedLabel: string;
  readonly costLabel: string;
  readonly cancellationReason: string | null;
  readonly isOpen: boolean;
}

export const toWorkOrderRows = (
  rows: readonly MaintenanceWorkOrder[],
  directory: AssetDirectory,
): readonly WorkOrderRow[] =>
  rows.map((order) => ({
    id: order.id,
    vehicleLabel: vehicleLabelOf(directory, order.vehicleId),
    description: order.description,
    statusLabel: MAINTENANCE_WORK_ORDER_STATUS_LABEL[order.status],
    tone: workOrderStatusTone(order.status),
    openedLabel: `${formatBusinessDate(order.openedDate)} · ${formatOdometer(order.openedOdoKm)}`,
    completedLabel:
      order.completedDate === null
        ? EMPTY_VALUE
        : `${formatBusinessDate(order.completedDate)} · ${formatOdometer(order.completedOdoKm)}`,
    costLabel: formatMoney(order.costAmount),
    cancellationReason: order.cancellationReason,
    isOpen: order.status === 'OPEN',
  }));

/* ------------------------------------------------------------------ *
 * Giay to
 * ------------------------------------------------------------------ */

export interface ComplianceDocumentRow {
  readonly id: string;
  readonly subjectLabel: string;
  readonly subjectKindLabel: string;
  readonly typeLabel: string;
  readonly documentNo: string | null;
  readonly validFromLabel: string;
  readonly validToLabel: string;
  readonly statusLabel: string;
  readonly isActive: boolean;
}

export const toComplianceDocumentRows = (
  rows: readonly ComplianceDocument[],
  directory: AssetDirectory,
): readonly ComplianceDocumentRow[] =>
  rows.map((document) => ({
    id: document.id,
    subjectLabel: subjectLabelOf(directory, document.subjectKind, document.subjectId),
    subjectKindLabel: COMPLIANCE_SUBJECT_LABEL[document.subjectKind],
    typeLabel: COMPLIANCE_DOCUMENT_TYPE_LABEL[document.documentType],
    documentNo: document.documentNo,
    validFromLabel: formatBusinessDate(document.validFrom),
    validToLabel: formatBusinessDate(document.validTo),
    statusLabel: COMPLIANCE_DOCUMENT_STATUS_LABEL[document.status],
    isActive: document.status === 'ACTIVE',
  }));

export interface ComplianceAlertRow {
  readonly documentId: string;
  readonly subjectLabel: string;
  readonly typeLabel: string;
  readonly healthLabel: string;
  readonly tone: StatusTone;
  readonly validToLabel: string;
  readonly countdownLabel: string;
  /** Nguong canh bao la CAU HINH cua khach, nen phai hien ra — khong phai mot hang so bi giau. */
  readonly thresholdLabel: string;
}

const HEALTH_ORDER: Readonly<Record<ComplianceAlert['health'], number>> = {
  EXPIRED: 0,
  DUE_SOON: 1,
  HEALTHY: 2,
};

export const toComplianceAlertRows = (
  rows: readonly ComplianceAlert[],
  directory: AssetDirectory,
): readonly ComplianceAlertRow[] =>
  [...rows]
    .sort((left, right) => HEALTH_ORDER[left.health] - HEALTH_ORDER[right.health])
    .map((alert) => ({
      documentId: alert.documentId,
      subjectLabel: subjectLabelOf(directory, alert.subjectKind, alert.subjectId),
      typeLabel: COMPLIANCE_DOCUMENT_TYPE_LABEL[alert.documentType],
      healthLabel: COMPLIANCE_HEALTH_LABEL[alert.health],
      tone: complianceHealthTone(alert.health),
      validToLabel: formatBusinessDate(alert.validTo),
      countdownLabel:
        alert.daysUntilExpiry >= 0
          ? `còn ${formatCount(alert.daysUntilExpiry)} ngày`
          : `đã quá ${formatCount(Math.abs(alert.daysUntilExpiry))} ngày`,
      thresholdLabel: `Cảnh báo trước ${formatCount(alert.thresholdDays)} ngày`,
    }));

/* ------------------------------------------------------------------ *
 * Trang thai hieu luc cua doi xe
 * ------------------------------------------------------------------ */

export interface FleetStatusRow {
  readonly vehicleId: string;
  readonly registrationPlate: string;
  readonly effectiveLabel: string;
  readonly tone: StatusTone;
  readonly reasonLabel: string;
  readonly recordedLabel: string;
  /** Mau thuan doc duoc, KHONG phai mot trang thai de chon cai nao dep hon. */
  readonly inconsistencies: readonly string[];
  readonly hasInconsistency: boolean;
}

export const toFleetStatusRows = (
  rows: readonly EffectiveVehicleState[],
): readonly FleetStatusRow[] =>
  rows.map((state) => ({
    vehicleId: state.vehicleId,
    registrationPlate: state.registrationPlate,
    effectiveLabel: VEHICLE_STATUS_LABEL[state.effectiveStatus],
    tone: state.inconsistencies.length > 0 ? 'stop' : vehicleStatusTone(state.effectiveStatus),
    reasonLabel: EFFECTIVE_VEHICLE_STATE_REASON_LABEL[state.reason],
    recordedLabel: VEHICLE_STATUS_LABEL[state.recordedStatus],
    inconsistencies: state.inconsistencies.map((code) => VEHICLE_STATE_INCONSISTENCY_LABEL[code]),
    hasInconsistency: state.inconsistencies.length > 0,
  }));

/* ------------------------------------------------------------------ *
 * Bang canh bao gom chung
 * ------------------------------------------------------------------ */

export interface OperationalAlertRow {
  readonly key: string;
  readonly kindLabel: string;
  readonly severityLabel: string;
  readonly tone: StatusTone;
  readonly subjectLabel: string;
  /**
   * So lieu kem theo, DA DOI THANH CAU TIENG VIET.
   *
   * `OperationalAlert.detail` la mot `Record` mo do tung nguon canh bao tu dat khoa. In thang no ra
   * cho mot dong nhu `odoRemainingKm: -450` tren man hinh khach — dung cai ma #195 va #92 goi la
   * "id/ten truong ky thuat lam nhan nghiep vu". Khoa khong co trong tu dien bi BO HAN, chu khong
   * duoc in ra o dang tho: mot khoa la nghia la mot nguon canh bao moi chua ai dich, va cho dung de
   * phat hien dieu do la CI, khong phai man hinh cua khach.
   */
  readonly details: readonly string[];
}

/**
 * Tu dien khoa `detail` → cau tieng Viet. Nguon: `alert-sources.ts` va `asset-compliance.types.ts`.
 *
 * Ham dich nhan ca GIA TRI vi mot so khoa doi don vi (km, ngay, tien) — mot cap khoa/gia tri roi
 * rac khong du de viet mot cau doc len nghe ra viec.
 */
const ALERT_DETAIL_LABEL: Readonly<Record<string, (value: number | string) => string>> = {
  odoRemainingKm: (value) =>
    Number(value) < 0
      ? `Đã vượt mốc ${formatOdometer(Math.abs(Number(value)))}`
      : `Còn ${formatOdometer(Number(value))} tới hạn`,
  daysRemaining: (value) =>
    Number(value) < 0
      ? `Đã quá hạn ${formatCount(Math.abs(Number(value)))} ngày`
      : `Còn ${formatCount(Number(value))} ngày`,
  daysUntilExpiry: (value) =>
    Number(value) < 0
      ? `Đã hết hạn ${formatCount(Math.abs(Number(value)))} ngày`
      : `Còn ${formatCount(Number(value))} ngày`,
  thresholdDays: (value) => `Ngưỡng cảnh báo ${formatCount(Number(value))} ngày`,
  observedConsumptionUnits: (value) => `Mức tiêu hao đo được ${Number(value) / 1000} L/100km`,
  expectedConsumptionUnits: (value) => `Mức tiêu hao thường thấy ${Number(value) / 1000} L/100km`,
  balance: (value) => `Số dư quỹ ${formatMoney(Number(value))}`,
  documentType: (value) => {
    // `noUncheckedIndexedAccess`: mot ma la khong duoc ep kieu roi im lang tra ve `undefined`.
    const labels: Readonly<Record<string, string>> = COMPLIANCE_DOCUMENT_TYPE_LABEL;
    return labels[String(value)] ?? String(value);
  },
};

const alertDetailLines = (
  detail: Readonly<Record<string, number | string | null>>,
): readonly string[] =>
  Object.entries(detail).flatMap(([key, value]) => {
    if (value === null) return [];
    const translate = ALERT_DETAIL_LABEL[key];
    return translate === undefined ? [] : [translate(value)];
  });

export interface OperationalAlertModel {
  readonly generatedForLabel: string;
  readonly rows: readonly OperationalAlertRow[];
  readonly criticalCount: number;
  /**
   * Cau ve nguon KHONG doc duoc. Bat buoc hien khi co: mot bang canh bao rong trong khi thieu nguon
   * doc y het mot doi xe khong co van de gi — va do la loi doc nguy hiem nhat cua man hinh nay.
   */
  readonly unavailableNote: string | null;
  readonly headline: string;
}

export const toOperationalAlerts = (
  feed: OperationalAlertFeed | null,
  directory: AssetDirectory,
): OperationalAlertModel => {
  if (feed === null) {
    return {
      generatedForLabel: EMPTY_VALUE,
      rows: [],
      criticalCount: 0,
      unavailableNote: null,
      headline: 'Chưa đọc được bảng cảnh báo.',
    };
  }

  const rows = feed.alerts.map((alert, index) => ({
    key: `${alert.kind}:${alert.subjectId ?? 'company'}:${index}`,
    kindLabel: OPERATIONAL_ALERT_KIND_LABEL[alert.kind],
    severityLabel: OPERATIONAL_ALERT_SEVERITY_LABEL[alert.severity],
    tone: alertSeverityTone(alert.severity),
    subjectLabel: subjectLabelOf(directory, alert.subjectKind, alert.subjectId),
    details: alertDetailLines(alert.detail),
  }));

  const criticalCount = feed.alerts.filter((alert) => alert.severity === 'CRITICAL').length;
  return {
    generatedForLabel: formatBusinessDate(feed.generatedFor),
    rows,
    criticalCount,
    unavailableNote:
      feed.unavailableSources.length === 0
        ? null
        : `Chưa đọc được ${feed.unavailableSources
            .map((source) => OPERATIONAL_ALERT_SOURCE_LABEL[source])
            .join(' và ')} — bảng dưới đây chưa bao gồm các cảnh báo từ nguồn đó.`,
    headline:
      feed.alerts.length === 0
        ? 'Không có cảnh báo nào đang mở.'
        : `${formatCount(feed.alerts.length)} cảnh báo, trong đó ${formatCount(criticalCount)} cần xử lý ngay.`,
  };
};
