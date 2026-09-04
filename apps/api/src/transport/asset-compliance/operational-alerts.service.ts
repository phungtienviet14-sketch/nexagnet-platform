import { Injectable, Optional } from '@nestjs/common';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { TRANSPORT_ASSET_COMPLIANCE_DECISIONS } from './asset-compliance-decisions.js';
import { AssetComplianceReadService } from './asset-compliance-read.service.js';
import { AlertDriverFundSource, AlertFuelConsumptionSource } from './alert-sources.js';
import {
  sortAlerts,
  type OperationalAlert,
  type OperationalAlertFeed,
  type OperationalAlertSource,
} from './operational-alerts.js';

/**
 * BANG CANH BAO VAN HANH GOM CHUNG.
 *
 * DANG KY O TANG UNG DUNG (`app-composition.ts`), khong o `TransportAssetComplianceModule`. Ly do
 * la cau truc, khong phai so thich: no doc hai nguon nam trong hai capability KHAC — va neu module
 * cua T6 `imports` hai module do thi T6 khong con bat duoc mot minh, tuc pha dung cai
 * `dependencies: ['transport-core']` cua T1 §10.1 hua.
 *
 * O tang ung dung, hai cong den qua `@Optional()`: khach bat fuel thi co adapter, khong bat thi
 * khong — va bang canh bao noi thang dieu do ra bang `unavailableSources` thay vi im lang.
 */
@Injectable()
export class OperationalAlertsService {
  constructor(
    private readonly read: AssetComplianceReadService,
    @Optional() private readonly fuel?: AlertFuelConsumptionSource,
    @Optional() private readonly fund?: AlertDriverFundSource,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  async feed(now?: Date): Promise<OperationalAlertFeed> {
    const generatedFor = this.read.today(now);
    const alerts: OperationalAlert[] = [];
    const unavailableSources: OperationalAlertSource[] = [];

    const [complianceAlerts, gaps, due, fleet] = await Promise.all([
      this.read.complianceAlerts(now),
      this.read.coverageGaps(),
      this.read.maintenanceDue(undefined, now),
      this.read.effectiveFleetStatus(),
    ]);

    for (const alert of complianceAlerts) {
      if (alert.health === 'HEALTHY') continue;
      alerts.push({
        kind:
          alert.health === 'EXPIRED'
            ? 'COMPLIANCE_DOCUMENT_EXPIRED'
            : 'COMPLIANCE_DOCUMENT_EXPIRING',
        severity: alert.health === 'EXPIRED' ? 'CRITICAL' : 'WARNING',
        subjectKind: alert.subjectKind,
        subjectId: alert.subjectId,
        detail: {
          documentType: alert.documentType,
          validTo: alert.validTo,
          daysUntilExpiry: alert.daysUntilExpiry,
        },
      });
    }

    for (const gap of gaps) {
      alerts.push({
        kind: 'COMPLIANCE_DOCUMENT_MISSING',
        severity: 'WARNING',
        subjectKind: gap.subjectKind,
        subjectId: gap.subjectId,
        detail: { documentType: gap.documentType },
      });
    }

    for (const row of due) {
      if (row.state === 'OK') continue;
      alerts.push({
        kind: row.state === 'OVERDUE' ? 'MAINTENANCE_OVERDUE' : 'MAINTENANCE_DUE_SOON',
        severity: row.state === 'OVERDUE' ? 'CRITICAL' : 'WARNING',
        subjectKind: 'VEHICLE',
        subjectId: row.vehicleId,
        detail: {
          planId: row.planId,
          reachedBy: row.reachedBy,
          odoRemainingKm: row.odoRemainingKm,
          daysRemaining: row.daysRemaining,
        },
      });
    }

    for (const state of fleet) {
      if (!state.inconsistencies.includes('MAINTENANCE_WHILE_IN_TRANSIT')) continue;
      alerts.push({
        kind: 'VEHICLE_STATE_INCONSISTENT',
        severity: 'CRITICAL',
        subjectKind: 'VEHICLE',
        subjectId: state.vehicleId,
        detail: {
          openWorkOrders: state.openWorkOrderIds.length,
          inTransitTrips: state.inTransitTripIds.length,
          effectiveStatus: state.effectiveStatus,
        },
      });
    }

    if (this.fuel) {
      for (const fact of await this.fuel.listAbnormal()) {
        alerts.push({
          kind: 'FUEL_CONSUMPTION_ABNORMAL',
          severity: 'WARNING',
          subjectKind: 'VEHICLE',
          subjectId: fact.vehicleId,
          detail: {
            fuelEntryId: fact.fuelEntryId,
            consumptionUnits: fact.consumptionUnits,
            reviewReasonCount: fact.reviewReasonCount,
          },
        });
      }
    } else {
      unavailableSources.push('FUEL_CONSUMPTION');
    }

    if (this.fund) {
      for (const fact of await this.fund.listBalances()) {
        if (fact.balance >= 0) continue;
        alerts.push({
          kind: 'DRIVER_FUND_BALANCE_UNUSUAL',
          severity: 'INFO',
          subjectKind: 'DRIVER',
          subjectId: fact.driverId,
          detail: { balance: fact.balance, currencyCode: fact.currencyCode },
        });
      }
    } else {
      unavailableSources.push('DRIVER_FUND');
    }

    for (const source of unavailableSources) {
      this.telemetry?.decision({
        vocabulary: TRANSPORT_ASSET_COMPLIANCE_DECISIONS,
        point: 'alerts.operational_feed',
        outcome: 'degraded',
        reason: 'OPERATIONAL_ALERTS_SOURCE_UNAVAILABLE',
        detail: { source },
      });
    }

    this.telemetry?.decision({
      vocabulary: TRANSPORT_ASSET_COMPLIANCE_DECISIONS,
      point: 'alerts.operational_feed',
      outcome: 'allowed',
      reason: 'OPERATIONAL_ALERTS_COMPILED',
      detail: { alerts: alerts.length, unavailableSources: unavailableSources.length },
    });

    return { generatedFor, alerts: sortAlerts(alerts), unavailableSources };
  }
}
