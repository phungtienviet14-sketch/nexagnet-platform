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
      "line": 487
    },
    "audit.persist": {
      "functionName": "OrdersService.recordManualAction",
      "filePath": "apps/api/src/orders/orders.service.ts",
      "line": 545
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
      "line": 449
    },
    "costing.reversal": {
      "functionName": "CostingService.reverseCorrelation",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 394
    },
    "dealers.configured": {
      "functionName": "evaluateOperationalReadiness",
      "filePath": "apps/api/src/readiness/operational-readiness.ts",
      "line": 49
    },
    "driver_fund.post_entry": {
      "functionName": "CostingService.postEntryOnly",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 186
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
      "line": 189
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
      "line": 231
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
    "outbound.send_advice": {
      "functionName": "PipelineService.runPipelineTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 531
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
      "line": 296
    },
    "price_period.archive": {
      "functionName": "PricePeriodsService.archive",
      "filePath": "apps/api/src/settings/price-periods.service.ts",
      "line": 311
    },
    "price_period.copy": {
      "functionName": "PricePeriodsService.copyDraft",
      "filePath": "apps/api/src/settings/price-periods.service.ts",
      "line": 190
    },
    "price_period.create": {
      "functionName": "PricePeriodsService.createDraft",
      "filePath": "apps/api/src/settings/price-periods.service.ts",
      "line": 161
    },
    "price_period.import.apply": {
      "functionName": "PricePeriodsService.applyImport",
      "filePath": "apps/api/src/settings/price-periods.service.ts",
      "line": 229
    },
    "source_truth.dealer.upsert": {
      "filePath": "apps/api/src/mcp/server.ts",
      "line": 222
    },
    "source_truth.glossary.upsert": {
      "filePath": "apps/api/src/mcp/server.ts",
      "line": 275
    },
    "source_truth.group.map": {
      "filePath": "apps/api/src/mcp/server.ts",
      "line": 240
    },
    "source_truth.price.update": {
      "filePath": "apps/api/src/mcp/server.ts",
      "line": 258
    },
    "tenant.loaded": {
      "functionName": "evaluateOperationalReadiness",
      "filePath": "apps/api/src/readiness/operational-readiness.ts",
      "line": 42
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
      "functionName": "TripExpensesController.breakdown",
      "filePath": "apps/api/src/transport/costing/trip-expenses.controller.ts",
      "line": 42
    },
    "transport.costing.expense.record": {
      "functionName": "TripExpensesController.record",
      "filePath": "apps/api/src/transport/costing/trip-expenses.controller.ts",
      "line": 49
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
    "transport.driver.self.fuel.read": {
      "filePath": "apps/api/src/transport/fuel/driver-fuel.controller.ts"
    },
    "transport.driver.self.fuel.submit": {
      "filePath": "apps/api/src/transport/fuel/driver-fuel.controller.ts"
    },
    "transport.driver.self.fund.read": {
      "functionName": "DriverFundSelfController.statement",
      "filePath": "apps/api/src/transport/costing/driver-fund-self.controller.ts",
      "line": 34
    },
    "transport.driver.self.trip.read": {
      "filePath": "apps/api/src/transport/trips/driver-trips.controller.ts"
    },
    "transport.driver.self.trip.update": {
      "functionName": "DriverTripsController.updateStatus",
      "filePath": "apps/api/src/transport/trips/driver-trips.controller.ts",
      "line": 61
    },
    "transport.fuel.entry.read": {
      "filePath": "apps/api/src/transport/fuel/fuel-entries.controller.ts"
    },
    "transport.fuel.entry.submit_for_driver": {
      "filePath": "apps/api/src/transport/fuel/fuel-entries.controller.ts"
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
    "transport.partner.manage": {
      "filePath": "apps/api/src/transport/fleet/fleet.controller.ts"
    },
    "transport.partner.read": {
      "filePath": "apps/api/src/transport/fleet/fleet.controller.ts"
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
      "line": 278
    }
  },
  "decisions": {
    "advice.auto_reply|*": {
      "functionName": "PipelineService.runPipelineTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 522
    },
    "advice.auto_reply|ALLOWED": {
      "functionName": "PipelineService.runPipelineTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 538
    },
    "advisor.compose|COMPOSED": {
      "functionName": "AgentOrchestrator.composeReply",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 272
    },
    "advisor.compose|COMPOSER_DISABLED": {
      "functionName": "AgentOrchestrator.composeReply",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 173
    },
    "advisor.compose|DETERMINISTIC_PATH_SUFFICIENT": {
      "functionName": "AgentOrchestrator.composeReply",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 182
    },
    "advisor.compose|LLM_RETURNED_NOTHING": {
      "functionName": "AgentOrchestrator.composeReply",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 264
    },
    "agent.tool_authorization|*": {
      "functionName": "AgentOrchestrator.composeReply",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 195
    },
    "channel.send|*": {
      "functionName": "OutboundChannelRouter.record",
      "filePath": "apps/api/src/channels/outbound-channel.router.ts",
      "line": 122
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
      "line": 465
    },
    "costing.reversal|*": {
      "functionName": "CostingService.denyReversal",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 458
    },
    "costing.reversal|REVERSAL_POSTED": {
      "functionName": "CostingService.reverseCorrelation",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 432
    },
    "driver.self_fuel_scope|SELF_FUEL_SCOPE_GRANTED": {
      "filePath": "apps/api/src/transport/fuel/fuel-read.service.ts"
    },
    "driver.self_fuel_scope|SELF_FUEL_SCOPE_NOT_OWNED": {
      "functionName": "FuelReadService.getMyFuelSlip",
      "filePath": "apps/api/src/transport/fuel/fuel-read.service.ts",
      "line": 139
    },
    "driver.self_fuel_scope|SELF_FUEL_SCOPE_NO_DRIVER_BINDING": {
      "functionName": "FuelReadService.requireDriverBinding",
      "filePath": "apps/api/src/transport/fuel/fuel-read.service.ts",
      "line": 172
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
      "line": 176
    },
    "driver_fund.post_entry|FUND_ENTRY_POSTED": {
      "functionName": "CostingService.postEntryOnly",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 203
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
    "fuel.cost_posting|*": {
      "functionName": "FuelService.postFuelCost",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 501
    },
    "fuel.cost_posting|FUEL_COST_ALREADY_POSTED": {
      "functionName": "FuelService.postFuelCost",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 475
    },
    "fuel.match|*": {
      "functionName": "FuelReconciliationService.runMatching",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts"
    },
    "fuel.match|MATCH_SELF_SOURCED_BLOCKED": {
      "functionName": "FuelReconciliationService.buildConfirmedMatch",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 605
    },
    "fuel.settlement_handoff|*": {
      "functionName": "FuelReconciliationService.closeReconciliation",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 408
    },
    "fuel_discrepancy.resolve|DISCREPANCY_ALREADY_RESOLVED": {
      "functionName": "FuelReconciliationService.resolveDiscrepancy",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 282
    },
    "fuel_discrepancy.resolve|DISCREPANCY_MATCH_TARGET_REQUIRED": {
      "functionName": "FuelReconciliationService.buildConfirmedMatch",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 564
    },
    "fuel_discrepancy.resolve|DISCREPANCY_RESOLVED": {
      "functionName": "FuelReconciliationService.resolveDiscrepancy",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 328
    },
    "fuel_entry.amend|*": {
      "functionName": "FuelService.denyAmend",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 658
    },
    "fuel_entry.amend|FUEL_ENTRY_AMENDED": {
      "functionName": "FuelService.amendFuelEntry",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 332
    },
    "fuel_entry.review|*": {
      "functionName": "FuelService.denyReview",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 678
    },
    "fuel_entry.review|FUEL_ENTRY_REJECTED": {
      "functionName": "FuelService.rejectFuelEntry",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 425
    },
    "fuel_entry.review|FUEL_ENTRY_REVIEW_REOPENED": {
      "functionName": "FuelService.resubmitFuelEntry",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 454
    },
    "fuel_entry.review|FUEL_ENTRY_VERIFIED": {
      "functionName": "FuelService.verifyFuelEntry",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 395
    },
    "fuel_entry.submit|*": {
      "functionName": "FuelService.guardTripAcceptsFuel",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 570
    },
    "fuel_entry.submit|FUEL_ENTRY_DRIVER_NOT_ASSIGNED": {
      "functionName": "FuelService.requireAssignedToTrip",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 596
    },
    "fuel_entry.submit|FUEL_ENTRY_IDEMPOTENT_REPLAY": {
      "functionName": "FuelService.submitFuelEntry",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 145
    },
    "fuel_entry.submit|FUEL_ENTRY_RECORDED": {
      "functionName": "FuelService.submitFuelEntry",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 188
    },
    "fuel_entry.submit|FUEL_ENTRY_VEHICLE_NOT_ASSIGNED": {
      "functionName": "FuelService.requireAssignedToTrip",
      "filePath": "apps/api/src/transport/fuel/fuel.service.ts",
      "line": 610
    },
    "fuel_reconciliation.transition|RECONCILIATION_CLOSED": {
      "functionName": "FuelReconciliationService.closeReconciliation",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 401
    },
    "fuel_reconciliation.transition|RECONCILIATION_FROZEN": {
      "functionName": "FuelReconciliationService.denyFrozen",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 535
    },
    "fuel_reconciliation.transition|RECONCILIATION_HAS_PENDING_DISCREPANCY": {
      "functionName": "FuelReconciliationService.closeReconciliation",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 381
    },
    "fuel_reconciliation.transition|RECONCILIATION_MATCHING_RUN": {
      "functionName": "FuelReconciliationService.runMatching",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 239
    },
    "fuel_reconciliation.transition|RECONCILIATION_REOPENED": {
      "functionName": "FuelReconciliationService.reopenReconciliation",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 453
    },
    "fuel_reconciliation.transition|RECONCILIATION_RESOLVED": {
      "functionName": "FuelReconciliationService.reportSettled",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 485
    },
    "fuel_reconciliation.transition|RECONCILIATION_TRANSITION_NOT_PERMITTED": {
      "functionName": "FuelReconciliationService.denyTransition",
      "filePath": "apps/api/src/transport/fuel/fuel-reconciliation.service.ts",
      "line": 495
    },
    "fuel_statement.import_row|*": {
      "functionName": "FuelStatementService.commitImport",
      "filePath": "apps/api/src/transport/fuel/fuel-statement.service.ts",
      "line": 175
    },
    "fuel_statement.import|STATEMENT_EMPTY": {
      "functionName": "FuelStatementService.buildPreview",
      "filePath": "apps/api/src/transport/fuel/fuel-statement.service.ts",
      "line": 222
    },
    "fuel_statement.import|STATEMENT_IMPORTED": {
      "functionName": "FuelStatementService.commitImport",
      "filePath": "apps/api/src/transport/fuel/fuel-statement.service.ts",
      "line": 159
    },
    "fuel_statement.import|STATEMENT_MAPPING_INVALID": {
      "functionName": "FuelStatementService.buildPreview",
      "filePath": "apps/api/src/transport/fuel/fuel-statement.service.ts",
      "line": 206
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
    "message.intake|ACCEPTED": {
      "functionName": "PipelineService.intakeTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 222
    },
    "message.intake|DUPLICATE_MESSAGE": {
      "functionName": "PipelineService.intakeTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 194
    },
    "message.intake|GROUP_NOT_MAPPED": {
      "functionName": "PipelineService.intakeTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 213
    },
    "message.intake|PARTICIPANT_IGNORED": {
      "functionName": "PipelineService.intakeTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 180
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
      "line": 221
    },
    "rules.dealer_price|*": {
      "functionName": "AgentOrchestrator.dispatch",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 695
    },
    "rules.price|*": {
      "functionName": "AgentOrchestrator.dispatch",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 719
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
      "line": 579
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
      "line": 539
    },
    "trip_expense.record|EXPENSE_DRIVER_NOT_ASSIGNED": {
      "functionName": "CostingService.requireDriverAssignedToTrip",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 625
    },
    "trip_expense.record|EXPENSE_IDEMPOTENT_REPLAY": {
      "functionName": "CostingService.recordTripExpense",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 268
    },
    "trip_expense.record|EXPENSE_RECORDED": {
      "functionName": "CostingService.recordTripExpense",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 309
    }
  }
};
