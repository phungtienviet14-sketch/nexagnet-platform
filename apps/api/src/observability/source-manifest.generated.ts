/**
 * TEP DUOC SINH RA — dung sua tay.
 *
 * Sinh boi `node tools/source-manifest/generate.mjs`; `pnpm test:source-manifest` sinh lai roi
 * so voi tep nay, nen mot ban sua tay se lam CI do.
 *
 * Moi muc o day den tu AST cua `apps/api/src`. Ten nao xuat hien o hai cho tro len bi BO —
 * xem chu thich dau `tools/source-manifest/generate.mjs`.
 */
import type { SourceManifest } from './source-manifest.js';

export const SOURCE_MANIFEST: SourceManifest = {
  "repositoryUrl": "https://github.com/phungtienviet14-sketch/nexagnet-platform",
  "names": {
    "agent.run": {
      "functionName": "PipelineService.runPipelineTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 492
    },
    "audit.persist": {
      "functionName": "OrdersService.recordManualAction",
      "filePath": "apps/api/src/orders/orders.service.ts",
      "line": 577
    },
    "auth.credentials.change": {
      "functionName": "AuthService.changePassword",
      "filePath": "apps/api/src/auth/auth.service.ts",
      "line": 145
    },
    "auth.credentials.reset": {
      "functionName": "AuthService.resetPassword",
      "filePath": "apps/api/src/auth/auth.service.ts",
      "line": 132
    },
    "auth.production": {
      "functionName": "evaluateOperationalReadiness",
      "filePath": "apps/api/src/readiness/operational-readiness.ts",
      "line": 78
    },
    "auth.user.create": {
      "functionName": "AuthService.createUser",
      "filePath": "apps/api/src/auth/auth.service.ts",
      "line": 93
    },
    "auth.user.disable": {
      "functionName": "AuthService.disableUser",
      "filePath": "apps/api/src/auth/auth.service.ts",
      "line": 106
    },
    "auth.user.role.assign": {
      "functionName": "AuthService.assignRole",
      "filePath": "apps/api/src/auth/auth.service.ts",
      "line": 119
    },
    "campaign.approve": {
      "functionName": "CampaignService.approve",
      "filePath": "apps/api/src/campaigns/campaign.service.ts",
      "line": 68
    },
    "campaign.cancel": {
      "functionName": "CampaignService.cancel",
      "filePath": "apps/api/src/campaigns/campaign.service.ts",
      "line": 113
    },
    "campaign.create": {
      "functionName": "CampaignService.create",
      "filePath": "apps/api/src/campaigns/campaign.service.ts",
      "line": 57
    },
    "campaign.retry_failed": {
      "functionName": "CampaignService.retryFailed",
      "filePath": "apps/api/src/campaigns/campaign.service.ts",
      "line": 123
    },
    "campaign.schedule": {
      "functionName": "CampaignService.schedule",
      "filePath": "apps/api/src/campaigns/campaign.service.ts",
      "line": 103
    },
    "channel.production": {
      "functionName": "evaluateOperationalReadiness",
      "filePath": "apps/api/src/readiness/operational-readiness.ts",
      "line": 70
    },
    "channel.send": {
      "filePath": "apps/api/src/channels/outbound-channel.router.ts"
    },
    "conversation.resolve": {
      "functionName": "PipelineService.runPipelineTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 454
    },
    "costing.reversal": {
      "functionName": "CostingService.reverseCorrelation",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 510
    },
    "dealers.configured": {
      "functionName": "evaluateOperationalReadiness",
      "filePath": "apps/api/src/readiness/operational-readiness.ts",
      "line": 49
    },
    "driver_fund.post_entry": {
      "functionName": "CostingService.postEntryOnly",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 183
    },
    "golden.evaluated": {
      "functionName": "evaluateOperationalReadiness",
      "filePath": "apps/api/src/readiness/operational-readiness.ts",
      "line": 84
    },
    "groups.mapped": {
      "functionName": "evaluateOperationalReadiness",
      "filePath": "apps/api/src/readiness/operational-readiness.ts",
      "line": 51
    },
    "media.production": {
      "functionName": "evaluateOperationalReadiness",
      "filePath": "apps/api/src/readiness/operational-readiness.ts",
      "line": 64
    },
    "message.persist": {
      "functionName": "PipelineService.intakeTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 194
    },
    "nexagnet.failure.reason": {
      "functionName": "OtelWorkerTraceBridge.finish",
      "filePath": "apps/api/src/observability/otel/otel-worker-trace-bridge.ts",
      "line": 153
    },
    "order.approve": {
      "filePath": "apps/api/src/orders/orders.service.ts"
    },
    "order.complete_handoff": {
      "functionName": "OrdersService.completeSalesHandoff",
      "filePath": "apps/api/src/orders/orders.service.ts",
      "line": 235
    },
    "order.manual_approve": {
      "functionName": "OrdersService.approveTurn",
      "filePath": "apps/api/src/orders/orders.service.ts"
    },
    "order.manual_reject": {
      "functionName": "OrdersService.rejectTurn",
      "filePath": "apps/api/src/orders/orders.service.ts"
    },
    "order.reject": {
      "filePath": "apps/api/src/orders/orders.service.ts"
    },
    "order.sales_handoff": {
      "functionName": "OrdersService.completeSalesHandoffTurn",
      "filePath": "apps/api/src/orders/orders.service.ts"
    },
    "order.sales_handoff.complete": {
      "functionName": "OrdersService.completeSalesHandoffTurn",
      "filePath": "apps/api/src/orders/orders.service.ts"
    },
    "order.state": {
      "functionName": "grantsFromPersistedOrder",
      "filePath": "apps/api/src/outbound/outbound-authority.ts"
    },
    "outbound.send_advice": {
      "functionName": "PipelineService.runPipelineTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 536
    },
    "outbound.send_confirmation": {
      "functionName": "SalesOrderOutcomeService.settle",
      "filePath": "apps/api/src/orders/sales-order-outcome.service.ts",
      "line": 55
    },
    "parser.production": {
      "functionName": "evaluateOperationalReadiness",
      "filePath": "apps/api/src/readiness/operational-readiness.ts",
      "line": 57
    },
    "price.current_period": {
      "functionName": "evaluateOperationalReadiness",
      "filePath": "apps/api/src/readiness/operational-readiness.ts",
      "line": 44
    },
    "price_period.activate": {
      "functionName": "PricePeriodsService.activate",
      "filePath": "apps/api/src/settings/price-periods.service.ts",
      "line": 524
    },
    "price_period.archive": {
      "functionName": "PricePeriodsService.archive",
      "filePath": "apps/api/src/settings/price-periods.service.ts",
      "line": 544
    },
    "price_period.copy": {
      "functionName": "PricePeriodsService.copyDraft",
      "filePath": "apps/api/src/settings/price-periods.service.ts",
      "line": 296
    },
    "price_period.create": {
      "functionName": "PricePeriodsService.createDraft",
      "filePath": "apps/api/src/settings/price-periods.service.ts",
      "line": 267
    },
    "price_period.import.apply": {
      "functionName": "PricePeriodsService.applyImport",
      "filePath": "apps/api/src/settings/price-periods.service.ts",
      "line": 358
    },
    "price_period.price.remove": {
      "functionName": "PricePeriodsService.removeDraftPrice",
      "filePath": "apps/api/src/settings/price-periods.service.ts",
      "line": 397
    },
    "rules.policy": {
      "functionName": "grantsFromDealerPolicy",
      "filePath": "apps/api/src/outbound/outbound-authority.ts",
      "line": 219
    },
    "rules.pricing": {
      "functionName": "grantsFromPricedOrder",
      "filePath": "apps/api/src/outbound/outbound-authority.ts"
    },
    "rules.quote": {
      "functionName": "grantsFromQuote",
      "filePath": "apps/api/src/outbound/outbound-authority.ts",
      "line": 214
    },
    "source_truth.dealer.upsert": {
      "filePath": "apps/api/src/mcp/server.ts",
      "line": 279
    },
    "source_truth.glossary.upsert": {
      "filePath": "apps/api/src/mcp/server.ts",
      "line": 332
    },
    "source_truth.group.map": {
      "filePath": "apps/api/src/mcp/server.ts",
      "line": 297
    },
    "source_truth.price.update": {
      "filePath": "apps/api/src/mcp/server.ts",
      "line": 315
    },
    "tenant.loaded": {
      "functionName": "evaluateOperationalReadiness",
      "filePath": "apps/api/src/readiness/operational-readiness.ts",
      "line": 42
    },
    "transport.alerts.read": {
      "functionName": "OperationalAlertsController.feed",
      "filePath": "apps/api/src/transport/asset-compliance/operational-alerts.controller.ts",
      "line": 24
    },
    "transport.compliance.document.manage": {
      "filePath": "apps/api/src/transport/asset-compliance/compliance.controller.ts"
    },
    "transport.compliance.document.read": {
      "filePath": "apps/api/src/transport/asset-compliance/compliance.controller.ts"
    },
    "transport.costing.driver_fund.adjust": {
      "functionName": "DriverFundController.adjust",
      "filePath": "apps/api/src/transport/costing/driver-fund.controller.ts",
      "line": 83
    },
    "transport.costing.driver_fund.advance": {
      "functionName": "DriverFundController.advance",
      "filePath": "apps/api/src/transport/costing/driver-fund.controller.ts",
      "line": 66
    },
    "transport.costing.driver_fund.read": {
      "functionName": "DriverFundController.statement",
      "filePath": "apps/api/src/transport/costing/driver-fund.controller.ts",
      "line": 53
    },
    "transport.costing.driver_fund.return": {
      "functionName": "DriverFundController.returnCash",
      "filePath": "apps/api/src/transport/costing/driver-fund.controller.ts",
      "line": 75
    },
    "transport.costing.expense.read": {
      "filePath": "apps/api/src/transport/costing/trip-expenses.controller.ts"
    },
    "transport.costing.expense.record": {
      "functionName": "TripExpensesController.record",
      "filePath": "apps/api/src/transport/costing/trip-expenses.controller.ts",
      "line": 66
    },
    "transport.costing.period.manage": {
      "filePath": "apps/api/src/transport/costing/driver-fund.controller.ts"
    },
    "transport.costing.period.read": {
      "filePath": "apps/api/src/transport/costing/driver-fund.controller.ts"
    },
    "transport.costing.period.reopen": {
      "functionName": "DriverFundController.reopenPeriod",
      "filePath": "apps/api/src/transport/costing/driver-fund.controller.ts",
      "line": 124
    },
    "transport.customer.manage": {
      "filePath": "apps/api/src/transport/fleet/fleet.controller.ts"
    },
    "transport.customer.read": {
      "filePath": "apps/api/src/transport/fleet/fleet.controller.ts"
    },
    "transport.driver.manage": {
      "filePath": "apps/api/src/transport/fleet/fleet.controller.ts"
    },
    "transport.driver.read": {
      "filePath": "apps/api/src/transport/fleet/fleet.controller.ts"
    },
    "transport.driver.self.fund.read": {
      "functionName": "DriverFundSelfController.statement",
      "filePath": "apps/api/src/transport/costing/driver-fund-self.controller.ts",
      "line": 34
    },
    "transport.driver.self.payslip.read": {
      "filePath": "apps/api/src/transport/workforce/driver-payslips.controller.ts"
    },
    "transport.driver.self.trip.read": {
      "filePath": "apps/api/src/transport/trips/driver-trips.controller.ts"
    },
    "transport.driver.self.trip.update": {
      "functionName": "DriverTripsController.updateStatus",
      "filePath": "apps/api/src/transport/trips/driver-trips.controller.ts",
      "line": 61
    },
    "transport.fleet_status.read": {
      "filePath": "apps/api/src/transport/asset-compliance/fleet-status.controller.ts"
    },
    "transport.fuel.entry.verify": {
      "filePath": "apps/api/src/transport/fuel/fuel-entries.controller.ts"
    },
    "transport.fuel.reconciliation.close": {
      "functionName": "FuelReconciliationController.close",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.controller.ts",
      "line": 106
    },
    "transport.fuel.reconciliation.match": {
      "functionName": "FuelReconciliationController.runMatching",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.controller.ts",
      "line": 89
    },
    "transport.fuel.reconciliation.read": {
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.controller.ts"
    },
    "transport.fuel.reconciliation.reopen": {
      "functionName": "FuelReconciliationController.reopen",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.controller.ts",
      "line": 114
    },
    "transport.fuel.reconciliation.resolve": {
      "functionName": "FuelReconciliationController.resolve",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.controller.ts",
      "line": 96
    },
    "transport.fuel.statement.import": {
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.controller.ts"
    },
    "transport.maintenance.plan.manage": {
      "filePath": "apps/api/src/transport/asset-compliance/maintenance.controller.ts"
    },
    "transport.maintenance.plan.read": {
      "filePath": "apps/api/src/transport/asset-compliance/maintenance.controller.ts"
    },
    "transport.maintenance.work_order.close": {
      "filePath": "apps/api/src/transport/asset-compliance/maintenance.controller.ts"
    },
    "transport.maintenance.work_order.open": {
      "functionName": "MaintenanceController.openWorkOrder",
      "filePath": "apps/api/src/transport/asset-compliance/maintenance.controller.ts",
      "line": 117
    },
    "transport.partner.manage": {
      "filePath": "apps/api/src/transport/fleet/fleet.controller.ts"
    },
    "transport.partner.read": {
      "filePath": "apps/api/src/transport/fleet/fleet.controller.ts"
    },
    "transport.payroll.period.manage": {
      "filePath": "apps/api/src/transport/workforce/payroll.controller.ts"
    },
    "transport.payroll.period.read": {
      "filePath": "apps/api/src/transport/workforce/payroll.controller.ts"
    },
    "transport.payroll.run": {
      "functionName": "PayrollController.runPayroll",
      "filePath": "apps/api/src/transport/workforce/payroll.controller.ts",
      "line": 97
    },
    "transport.payslip.approve": {
      "functionName": "PayrollController.approve",
      "filePath": "apps/api/src/transport/workforce/payroll.controller.ts",
      "line": 135
    },
    "transport.payslip.correct": {
      "functionName": "PayrollController.correct",
      "filePath": "apps/api/src/transport/workforce/payroll.controller.ts",
      "line": 153
    },
    "transport.payslip.pay": {
      "functionName": "PayrollController.pay",
      "filePath": "apps/api/src/transport/workforce/payroll.controller.ts",
      "line": 145
    },
    "transport.settlement.document.read": {
      "functionName": "SettlementReportsController.documentChain",
      "filePath": "apps/api/src/transport/settlement/settlement-reports.controller.ts",
      "line": 121
    },
    "transport.settlement.report.read": {
      "filePath": "apps/api/src/transport/settlement/settlement-reports.controller.ts"
    },
    "transport.trip.assign": {
      "functionName": "TripsController.assign",
      "filePath": "apps/api/src/transport/trips/trips.controller.ts",
      "line": 80
    },
    "transport.trip.cancel": {
      "functionName": "TripsController.cancel",
      "filePath": "apps/api/src/transport/trips/trips.controller.ts",
      "line": 101
    },
    "transport.trip.create": {
      "functionName": "TripsController.plan",
      "filePath": "apps/api/src/transport/trips/trips.controller.ts",
      "line": 63
    },
    "transport.trip.read": {
      "filePath": "apps/api/src/transport/trips/trips.controller.ts"
    },
    "transport.trip.transition": {
      "functionName": "TripsController.transition",
      "filePath": "apps/api/src/transport/trips/trips.controller.ts",
      "line": 88
    },
    "transport.trip.update": {
      "functionName": "TripsController.update",
      "filePath": "apps/api/src/transport/trips/trips.controller.ts",
      "line": 72
    },
    "transport.vehicle.manage": {
      "filePath": "apps/api/src/transport/fleet/fleet.controller.ts"
    },
    "transport.vehicle.read": {
      "filePath": "apps/api/src/transport/fleet/fleet.controller.ts"
    },
    "trip_expense.record": {
      "functionName": "CostingService.recordTripExpense",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 275
    }
  },
  "decisions": {
    "advice.auto_reply|*": {
      "functionName": "PipelineService.runPipelineTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 527
    },
    "advice.auto_reply|ALLOWED": {
      "functionName": "PipelineService.runPipelineTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 543
    },
    "advisor.compose|COMPOSED": {
      "functionName": "AgentOrchestrator.composeReply",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 302
    },
    "advisor.compose|COMPOSER_DISABLED": {
      "functionName": "AgentOrchestrator.composeReply",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 203
    },
    "advisor.compose|DETERMINISTIC_PATH_SUFFICIENT": {
      "functionName": "AgentOrchestrator.composeReply",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 212
    },
    "advisor.compose|LLM_RETURNED_NOTHING": {
      "functionName": "AgentOrchestrator.composeReply",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 294
    },
    "agent.tool_authorization|*": {
      "functionName": "AgentOrchestrator.composeReply",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 225
    },
    "alerts.operational_feed|OPERATIONAL_ALERTS_COMPILED": {
      "functionName": "OperationalAlertsService.feed",
      "filePath": "apps/api/src/transport/asset-compliance/operational-alerts.service.ts",
      "line": 147
    },
    "alerts.operational_feed|OPERATIONAL_ALERTS_SOURCE_UNAVAILABLE": {
      "functionName": "OperationalAlertsService.feed",
      "filePath": "apps/api/src/transport/asset-compliance/operational-alerts.service.ts",
      "line": 138
    },
    "channel.send|*": {
      "functionName": "OutboundChannelRouter.record",
      "filePath": "apps/api/src/channels/outbound-channel.router.ts",
      "line": 122
    },
    "commission.select|*": {
      "functionName": "SettlementService.recogniseCommission",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 427
    },
    "commission.select|COMMISSION_RULE_AMBIGUOUS": {
      "functionName": "SettlementService.recogniseCommission",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 380
    },
    "commission.select|COMMISSION_RULE_NONE_APPLICABLE": {
      "functionName": "SettlementService.recogniseCommission",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 366
    },
    "commission.select|COMMISSION_TRIP_NOT_PARTNER_REFERRED": {
      "functionName": "SettlementService.recogniseCommission",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 324
    },
    "compliance.document_register|COMPLIANCE_DOCUMENT_REGISTERED": {
      "functionName": "AssetComplianceService.registerDocument",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts",
      "line": 361
    },
    "compliance.document_register|COMPLIANCE_SUBJECT_SHAPE_INVALID": {
      "functionName": "AssetComplianceService.assertSubject",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts"
    },
    "compliance.document_register|COMPLIANCE_SUBJECT_UNKNOWN": {
      "functionName": "AssetComplianceService.assertSubject",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts",
      "line": 328
    },
    "compliance.document_register|COMPLIANCE_VALIDITY_RANGE_INVALID": {
      "functionName": "AssetComplianceService.registerDocument",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts",
      "line": 346
    },
    "conflict.resolution|*": {
      "functionName": "SourceRegistryService.resolveConflict",
      "filePath": "apps/api/src/source-registry/source-registry.service.ts",
      "line": 679
    },
    "conflict.resolution|CONFLICT_OPENED": {
      "functionName": "SourceRegistryService.openConflict",
      "filePath": "apps/api/src/source-registry/source-registry.service.ts",
      "line": 644
    },
    "conversation.resolve|*": {
      "functionName": "PipelineService.runPipelineTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 470
    },
    "costing.reversal|*": {
      "functionName": "CostingService.denyReversal",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 574
    },
    "costing.reversal|REVERSAL_POSTED": {
      "functionName": "CostingService.reverseCorrelation",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 548
    },
    "driver.self_expense_scope|*": {
      "functionName": "CostingReadService.selfTripExpenseEvidence",
      "filePath": "apps/api/src/transport/costing/costing-read.service.ts",
      "line": 155
    },
    "driver.self_expense_scope|SELF_EXPENSE_SCOPE_NO_EVIDENCE": {
      "functionName": "CostingReadService.selfTripExpenseEvidence",
      "filePath": "apps/api/src/transport/costing/costing-read.service.ts",
      "line": 172
    },
    "driver.self_fuel_scope|SELF_FUEL_SCOPE_GRANTED": {
      "filePath": "apps/api/src/transport/fuel/fuel-read.service.ts"
    },
    "driver.self_fuel_scope|SELF_FUEL_SCOPE_NOT_OWNED": {
      "functionName": "FuelReadService.getMyFuelSlip",
      "filePath": "apps/api/src/transport/fuel/fuel-read.service.ts",
      "line": 140
    },
    "driver.self_fuel_scope|SELF_FUEL_SCOPE_NO_DRIVER_BINDING": {
      "functionName": "FuelReadService.requireDriverBinding",
      "filePath": "apps/api/src/transport/fuel/fuel-read.service.ts",
      "line": 173
    },
    "driver.self_fund_scope|SELF_FUND_SCOPE_GRANTED": {
      "functionName": "CostingReadService.selfFundStatement",
      "filePath": "apps/api/src/transport/costing/costing-read.service.ts",
      "line": 95
    },
    "driver.self_fund_scope|SELF_FUND_SCOPE_NO_DRIVER_BINDING": {
      "functionName": "CostingReadService.selfFundStatement",
      "filePath": "apps/api/src/transport/costing/costing-read.service.ts",
      "line": 81
    },
    "driver.self_payslip_scope|*": {
      "functionName": "WorkforceReadService.notVisible",
      "filePath": "apps/api/src/transport/workforce/workforce-read.service.ts",
      "line": 179
    },
    "driver.self_payslip_scope|SELF_PAYSLIP_DRAFT_WITHHELD": {
      "functionName": "WorkforceReadService.listMyPayslips",
      "filePath": "apps/api/src/transport/workforce/workforce-read.service.ts",
      "line": 98
    },
    "driver.self_payslip_scope|SELF_PAYSLIP_SCOPE_GRANTED": {
      "filePath": "apps/api/src/transport/workforce/workforce-read.service.ts"
    },
    "driver.self_payslip_scope|SELF_PAYSLIP_SCOPE_NO_DRIVER_BINDING": {
      "functionName": "WorkforceReadService.requireDriverBinding",
      "filePath": "apps/api/src/transport/workforce/workforce-read.service.ts",
      "line": 201
    },
    "driver.self_scope|SELF_SCOPE_GRANTED": {
      "functionName": "TripService.listDriverTrips",
      "filePath": "apps/api/src/transport/trips/trip.service.ts",
      "line": 338
    },
    "driver.self_scope|SELF_SCOPE_NOT_ASSIGNED": {
      "filePath": "apps/api/src/transport/trips/trip.service.ts"
    },
    "driver.self_scope|SELF_SCOPE_NO_DRIVER_BINDING": {
      "functionName": "TripService.requireDriverBinding",
      "filePath": "apps/api/src/transport/trips/trip.service.ts",
      "line": 474
    },
    "driver_fund.post_entry|FUND_ENTRY_IDEMPOTENT_REPLAY": {
      "functionName": "CostingService.postEntryOnly",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 173
    },
    "driver_fund.post_entry|FUND_ENTRY_POSTED": {
      "functionName": "CostingService.postEntryOnly",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 200
    },
    "evidence.read|EVIDENCE_LOCATOR_OUT_OF_SCOPE": {
      "functionName": "TransportEvidenceService.read",
      "filePath": "apps/api/src/transport/evidence/transport-evidence.service.ts",
      "line": 119
    },
    "evidence.read|EVIDENCE_OBJECT_MISSING": {
      "functionName": "TransportEvidenceService.read",
      "filePath": "apps/api/src/transport/evidence/transport-evidence.service.ts",
      "line": 136
    },
    "evidence.read|EVIDENCE_SERVED": {
      "functionName": "TransportEvidenceService.read",
      "filePath": "apps/api/src/transport/evidence/transport-evidence.service.ts",
      "line": 146
    },
    "evidence.upload|*": {
      "functionName": "TransportEvidenceService.put",
      "filePath": "apps/api/src/transport/evidence/transport-evidence.service.ts",
      "line": 72
    },
    "evidence.upload|EVIDENCE_STORED": {
      "functionName": "TransportEvidenceService.put",
      "filePath": "apps/api/src/transport/evidence/transport-evidence.service.ts",
      "line": 100
    },
    "evidence.upload|EVIDENCE_STORE_DISABLED": {
      "functionName": "TransportEvidenceService.put",
      "filePath": "apps/api/src/transport/evidence/transport-evidence.service.ts",
      "line": 84
    },
    "fact.supersession|*": {
      "functionName": "SourceRegistryService.supersedeFact",
      "filePath": "apps/api/src/source-registry/source-registry.service.ts",
      "line": 514
    },
    "fact.transition|*": {
      "functionName": "SourceRegistryService.transitionFact",
      "filePath": "apps/api/src/source-registry/source-registry.service.ts",
      "line": 573
    },
    "fact.usability|*": {
      "functionName": "SourceReadinessService.canUseFact",
      "filePath": "apps/api/src/source-registry/source-readiness.service.ts"
    },
    "fact.usability|FACT_AMBIGUOUS_LIVE_VERSIONS": {
      "functionName": "SourceReadinessService.getEffectiveFact",
      "filePath": "apps/api/src/source-registry/source-readiness.service.ts",
      "line": 65
    },
    "fact.usability|FACT_NOT_APPROVED": {
      "functionName": "SourceReadinessService.canUseFact",
      "filePath": "apps/api/src/source-registry/source-readiness.service.ts",
      "line": 131
    },
    "fleet.effective_vehicle_state|*": {
      "functionName": "AssetComplianceReadService.emitStateDecision",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance-read.service.ts",
      "line": 210
    },
    "fleet.effective_vehicle_state|VEHICLE_MAINTENANCE_TRIP_CONFLICT": {
      "functionName": "AssetComplianceReadService.emitStateDecision",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance-read.service.ts",
      "line": 219
    },
    "fuel.cost_posting|*": {
      "functionName": "FuelService.postFuelCost",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 531
    },
    "fuel.cost_posting|FUEL_COST_ALREADY_POSTED": {
      "functionName": "FuelService.postFuelCost",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 505
    },
    "fuel.match|*": {
      "functionName": "FuelReconciliationService.runMatching",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts"
    },
    "fuel.match|MATCH_SELF_SOURCED_BLOCKED": {
      "functionName": "FuelReconciliationService.buildConfirmedMatch",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 623
    },
    "fuel.settlement_handoff|*": {
      "functionName": "FuelReconciliationService.closeReconciliation",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 425
    },
    "fuel_discrepancy.resolve|DISCREPANCY_ALREADY_RESOLVED": {
      "functionName": "FuelReconciliationService.resolveDiscrepancy",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 288
    },
    "fuel_discrepancy.resolve|DISCREPANCY_MATCH_TARGET_REQUIRED": {
      "functionName": "FuelReconciliationService.buildConfirmedMatch",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 582
    },
    "fuel_discrepancy.resolve|DISCREPANCY_RESOLVED": {
      "functionName": "FuelReconciliationService.resolveDiscrepancy",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 334
    },
    "fuel_entry.amend|*": {
      "functionName": "FuelService.denyAmend",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 688
    },
    "fuel_entry.amend|FUEL_ENTRY_AMENDED": {
      "functionName": "FuelService.amendFuelEntry",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 362
    },
    "fuel_entry.amend|FUEL_ENTRY_AMEND_STATE_RACE": {
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts"
    },
    "fuel_entry.review|*": {
      "functionName": "FuelService.denyReview",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 711
    },
    "fuel_entry.review|FUEL_ENTRY_REJECTED": {
      "functionName": "FuelService.rejectFuelEntry",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 455
    },
    "fuel_entry.review|FUEL_ENTRY_REVIEW_REOPENED": {
      "functionName": "FuelService.resubmitFuelEntry",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 484
    },
    "fuel_entry.review|FUEL_ENTRY_VERIFIED": {
      "functionName": "FuelService.verifyFuelEntry",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 425
    },
    "fuel_entry.submit|*": {
      "functionName": "FuelService.guardTripAcceptsFuel",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 600
    },
    "fuel_entry.submit|FUEL_CORRELATION_KEY_REUSED": {
      "functionName": "FuelService.assertSameEntry",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 735
    },
    "fuel_entry.submit|FUEL_ENTRY_DRIVER_NOT_ASSIGNED": {
      "functionName": "FuelService.requireAssignedToTrip",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 626
    },
    "fuel_entry.submit|FUEL_ENTRY_IDEMPOTENT_REPLAY": {
      "functionName": "FuelService.submitFuelEntry",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 163
    },
    "fuel_entry.submit|FUEL_ENTRY_RECORDED": {
      "functionName": "FuelService.submitFuelEntry",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 206
    },
    "fuel_entry.submit|FUEL_ENTRY_VEHICLE_NOT_ASSIGNED": {
      "functionName": "FuelService.requireAssignedToTrip",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 640
    },
    "fuel_reconciliation.transition|*": {
      "functionName": "FuelReconciliationService.denyFrozen",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 504
    },
    "fuel_reconciliation.transition|RECONCILIATION_CLOSED": {
      "functionName": "FuelReconciliationService.closeReconciliation",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 418
    },
    "fuel_reconciliation.transition|RECONCILIATION_FROZEN": {
      "functionName": "FuelReconciliationService.requireOpen",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 553
    },
    "fuel_reconciliation.transition|RECONCILIATION_HAS_PENDING_DISCREPANCY": {
      "functionName": "FuelReconciliationService.closeReconciliation",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 388
    },
    "fuel_reconciliation.transition|RECONCILIATION_MATCHING_RUN": {
      "functionName": "FuelReconciliationService.runMatching",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 231
    },
    "fuel_reconciliation.transition|RECONCILIATION_REOPENED": {
      "functionName": "FuelReconciliationService.reopenReconciliation",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 466
    },
    "fuel_reconciliation.transition|RECONCILIATION_RESOLVED": {
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts"
    },
    "fuel_reconciliation.transition|RECONCILIATION_TRANSITION_NOT_PERMITTED": {
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts"
    },
    "fuel_statement.import_row|*": {
      "functionName": "FuelStatementService.commitImport",
      "filePath": "apps/api/src/transport/fuel/fuel-statement.service.ts",
      "line": 174
    },
    "fuel_statement.import|STATEMENT_EMPTY": {
      "functionName": "FuelStatementService.buildPreview",
      "filePath": "apps/api/src/transport/fuel/fuel-statement.service.ts",
      "line": 221
    },
    "fuel_statement.import|STATEMENT_IMPORTED": {
      "functionName": "FuelStatementService.commitImport",
      "filePath": "apps/api/src/transport/fuel/fuel-statement.service.ts",
      "line": 158
    },
    "fuel_statement.import|STATEMENT_MAPPING_INVALID": {
      "functionName": "FuelStatementService.buildPreview",
      "filePath": "apps/api/src/transport/fuel/fuel-statement.service.ts",
      "line": 205
    },
    "fuel_statement.import|STATEMENT_PERIOD_TAKEN": {
      "functionName": "FuelStatementService.commitImport",
      "filePath": "apps/api/src/transport/fuel/fuel-statement.service.ts",
      "line": 106
    },
    "fund_period.transition|*": {
      "filePath": "apps/api/src/transport/costing/fund-period.service.ts"
    },
    "fund_period.transition|PERIOD_CLOSED": {
      "functionName": "FundPeriodService.closePeriod",
      "filePath": "apps/api/src/transport/costing/fund-period.service.ts",
      "line": 162
    },
    "fund_period.transition|PERIOD_OPENED": {
      "functionName": "FundPeriodService.openPeriod",
      "filePath": "apps/api/src/transport/costing/fund-period.service.ts",
      "line": 84
    },
    "ledger.record|*": {
      "filePath": "apps/api/src/decision-ledger/decision-ledger.service.ts"
    },
    "maintenance.work_order_close|MAINTENANCE_ODO_REGRESSION": {
      "functionName": "AssetComplianceService.completeWorkOrder",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts",
      "line": 202
    },
    "maintenance.work_order_close|MAINTENANCE_WORK_ORDER_CANCELLED": {
      "functionName": "AssetComplianceService.cancelWorkOrder",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts",
      "line": 271
    },
    "maintenance.work_order_close|MAINTENANCE_WORK_ORDER_COMPLETED": {
      "functionName": "AssetComplianceService.completeWorkOrder",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts",
      "line": 240
    },
    "maintenance.work_order_close|MAINTENANCE_WORK_ORDER_NOT_OPEN": {
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts"
    },
    "maintenance.work_order_open|MAINTENANCE_PLAN_UNKNOWN": {
      "functionName": "AssetComplianceService.openWorkOrder",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts",
      "line": 124
    },
    "maintenance.work_order_open|MAINTENANCE_PLAN_VEHICLE_MISMATCH": {
      "functionName": "AssetComplianceService.openWorkOrder",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts",
      "line": 150
    },
    "maintenance.work_order_open|MAINTENANCE_VEHICLE_UNKNOWN": {
      "functionName": "AssetComplianceService.openWorkOrder",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts",
      "line": 108
    },
    "maintenance.work_order_open|MAINTENANCE_WORK_ORDER_ALREADY_OPEN": {
      "functionName": "AssetComplianceService.openWorkOrder",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts",
      "line": 166
    },
    "maintenance.work_order_open|MAINTENANCE_WORK_ORDER_OPENED": {
      "functionName": "AssetComplianceService.openWorkOrder",
      "filePath": "apps/api/src/transport/asset-compliance/asset-compliance.service.ts",
      "line": 179
    },
    "message.intake|ACCEPTED": {
      "functionName": "PipelineService.intakeTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 227
    },
    "message.intake|DUPLICATE_MESSAGE": {
      "functionName": "PipelineService.intakeTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 199
    },
    "message.intake|GROUP_NOT_MAPPED": {
      "functionName": "PipelineService.intakeTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 218
    },
    "message.intake|PARTICIPANT_IGNORED": {
      "functionName": "PipelineService.intakeTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 185
    },
    "order.auto_confirm|*": {
      "functionName": "SalesOrderOutcomeService.settle",
      "filePath": "apps/api/src/orders/sales-order-outcome.service.ts",
      "line": 42
    },
    "order.auto_confirm|ALLOWED": {
      "functionName": "SalesOrderOutcomeService.settle",
      "filePath": "apps/api/src/orders/sales-order-outcome.service.ts",
      "line": 71
    },
    "order.handoff_followup_mark|*": {
      "functionName": "SalesHandoffFollowupService.decided",
      "filePath": "apps/api/src/orders/sales-handoff-followup.service.ts",
      "line": 131
    },
    "order.handoff_followup_schedule|*": {
      "functionName": "OrdersService.decideSchedule",
      "filePath": "apps/api/src/orders/orders.service.ts",
      "line": 225
    },
    "outbound.authority|*": {
      "functionName": "AgentOrchestrator.composeReply",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 371
    },
    "outbound.send_guard|*": {
      "functionName": "TurnReplyService.performSendAdviceReply",
      "filePath": "apps/api/src/turns/turn-reply.service.ts",
      "line": 81
    },
    "payroll.driver_fund_disclosure|DRIVER_FUND_NOT_AVAILABLE": {
      "functionName": "WorkforceService.emitFundDisclosure",
      "filePath": "apps/api/src/transport/workforce/workforce.service.ts",
      "line": 238
    },
    "payroll.driver_fund_disclosure|DRIVER_FUND_SHOWN_WITHOUT_DEDUCTION": {
      "functionName": "WorkforceService.emitFundDisclosure",
      "filePath": "apps/api/src/transport/workforce/workforce.service.ts",
      "line": 247
    },
    "payroll.run|PAYROLL_INPUT_UNAVAILABLE": {
      "functionName": "WorkforceService.runPayroll",
      "filePath": "apps/api/src/transport/workforce/workforce.service.ts",
      "line": 177
    },
    "payroll.run|PAYROLL_PERIOD_CLOSED": {
      "functionName": "WorkforceService.runPayroll",
      "filePath": "apps/api/src/transport/workforce/workforce.service.ts",
      "line": 202
    },
    "payroll.run|PAYROLL_PERIOD_UNKNOWN": {
      "functionName": "WorkforceService.runPayroll",
      "filePath": "apps/api/src/transport/workforce/workforce.service.ts",
      "line": 128
    },
    "payroll.run|PAYROLL_RUN_COMPLETED": {
      "functionName": "WorkforceService.runPayroll",
      "filePath": "apps/api/src/transport/workforce/workforce.service.ts",
      "line": 215
    },
    "payslip.correction|*": {
      "functionName": "WorkforceService.issueCorrection",
      "filePath": "apps/api/src/transport/workforce/workforce.service.ts",
      "line": 433
    },
    "payslip.correction|PAYSLIP_ALREADY_REVERSED": {
      "functionName": "WorkforceService.issueCorrection",
      "filePath": "apps/api/src/transport/workforce/workforce.service.ts",
      "line": 420
    },
    "payslip.correction|PAYSLIP_NOT_CORRECTABLE": {
      "functionName": "WorkforceService.issueCorrection",
      "filePath": "apps/api/src/transport/workforce/workforce.service.ts",
      "line": 344
    },
    "payslip.transition|*": {
      "functionName": "WorkforceService.movePayslip",
      "filePath": "apps/api/src/transport/workforce/workforce.service.ts"
    },
    "payslip.transition|PAYSLIP_TRANSITION_NOT_PERMITTED": {
      "functionName": "WorkforceService.movePayslip",
      "filePath": "apps/api/src/transport/workforce/workforce.service.ts",
      "line": 291
    },
    "rules.dealer_price|*": {
      "functionName": "AgentOrchestrator.dispatch",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 836
    },
    "rules.price|*": {
      "functionName": "AgentOrchestrator.dispatch",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 860
    },
    "settlement.allocate|*": {
      "functionName": "SettlementService.allocate",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 712
    },
    "settlement.correct|*": {
      "functionName": "SettlementService.ingestFuelHandoff",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 543
    },
    "settlement.correct|ADJUSTMENT_POSTED": {
      "functionName": "SettlementService.adjustDocument",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 617
    },
    "settlement.correct|CORRECTION_NO_CHANGE": {
      "functionName": "SettlementService.adjustDocument",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 578
    },
    "settlement.correct|REVERSAL_POSTED": {
      "functionName": "SettlementService.reverseDocument",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 670
    },
    "settlement.credit_check|*": {
      "functionName": "SettlementService.creditExposure",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 753
    },
    "settlement.recognise|*": {
      "functionName": "SettlementService.reportRecognition",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 136
    },
    "settlement.recognise|SETTLEMENT_TRIP_NOT_RECONCILED": {
      "functionName": "SettlementService.recogniseCustomerReceivable",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 181
    },
    "settlement.recognise|SETTLEMENT_TRIP_REVENUE_MISSING": {
      "functionName": "SettlementService.recogniseCustomerReceivable",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 195
    },
    "settlement_period.transition|*": {
      "functionName": "SettlementService.transitionPeriod",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 835
    },
    "settlement_period.transition|PERIOD_OPENED": {
      "functionName": "SettlementService.openPeriod",
      "filePath": "apps/api/src/transport/settlement/settlement.service.ts",
      "line": 818
    },
    "source.approval|*": {
      "filePath": "apps/api/src/source-registry/source-registry.service.ts"
    },
    "source.supersession|*": {
      "functionName": "SourceRegistryService.supersedeSource",
      "filePath": "apps/api/src/source-registry/source-registry.service.ts",
      "line": 270
    },
    "source.transition|*": {
      "functionName": "SourceRegistryService.transitionSource",
      "filePath": "apps/api/src/source-registry/source-registry.service.ts",
      "line": 329
    },
    "supervisor.risk|*": {
      "functionName": "AgentOrchestrator.run",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 718
    },
    "trip.assignment_change|*": {
      "functionName": "TripService.assign",
      "filePath": "apps/api/src/transport/trips/trip.service.ts",
      "line": 198
    },
    "trip.assignment_change|ASSIGNMENT_TRIP_TERMINAL": {
      "functionName": "TripService.assign",
      "filePath": "apps/api/src/transport/trips/trip.service.ts",
      "line": 163
    },
    "trip.assignment_change|ASSIGNMENT_UNCHANGED": {
      "functionName": "TripService.assign",
      "filePath": "apps/api/src/transport/trips/trip.service.ts",
      "line": 186
    },
    "trip.cancel|*": {
      "functionName": "TripService.cancel",
      "filePath": "apps/api/src/transport/trips/trip.service.ts",
      "line": 286
    },
    "trip.cancel|CANCEL_RECORDED": {
      "functionName": "TripService.cancel",
      "filePath": "apps/api/src/transport/trips/trip.service.ts",
      "line": 302
    },
    "trip.lifecycle_transition|*": {
      "functionName": "TripService.transition",
      "filePath": "apps/api/src/transport/trips/trip.service.ts",
      "line": 233
    },
    "trip_expense.record|*": {
      "functionName": "CostingService.guardTripAcceptsExpense",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 655
    },
    "trip_expense.record|EXPENSE_DRIVER_NOT_ASSIGNED": {
      "functionName": "CostingService.requireDriverAssignedToTrip",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 741
    },
    "trip_expense.record|EXPENSE_IDEMPOTENT_REPLAY": {
      "functionName": "CostingService.recordTripExpense",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 265
    },
    "trip_expense.record|EXPENSE_RECORDED": {
      "functionName": "CostingService.recordTripExpense",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 306
    }
  }
};
