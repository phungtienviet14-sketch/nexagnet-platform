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
      "line": 345
    },
    "dealers.configured": {
      "functionName": "evaluateOperationalReadiness",
      "filePath": "apps/api/src/readiness/operational-readiness.ts",
      "line": 49
    },
    "driver_fund.post_entry": {
      "functionName": "CostingService.postEntryOnly",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 144
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
      "line": 129
    },
    "source_truth.glossary.upsert": {
      "filePath": "apps/api/src/mcp/server.ts",
      "line": 182
    },
    "source_truth.group.map": {
      "filePath": "apps/api/src/mcp/server.ts",
      "line": 147
    },
    "source_truth.price.update": {
      "filePath": "apps/api/src/mcp/server.ts",
      "line": 165
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
      "line": 105
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
      "line": 227
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
      "line": 266
    },
    "advisor.compose|COMPOSER_DISABLED": {
      "functionName": "AgentOrchestrator.composeReply",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 167
    },
    "advisor.compose|DETERMINISTIC_PATH_SUFFICIENT": {
      "functionName": "AgentOrchestrator.composeReply",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 176
    },
    "advisor.compose|LLM_RETURNED_NOTHING": {
      "functionName": "AgentOrchestrator.composeReply",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 258
    },
    "agent.tool_authorization|*": {
      "functionName": "AgentOrchestrator.composeReply",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 189
    },
    "channel.send|*": {
      "functionName": "OutboundChannelRouter.record",
      "filePath": "apps/api/src/channels/outbound-channel.router.ts",
      "line": 122
    },
    "conversation.resolve|*": {
      "functionName": "PipelineService.runPipelineTurn",
      "filePath": "apps/api/src/pipeline/pipeline.service.ts",
      "line": 465
    },
    "costing.reversal|*": {
      "functionName": "CostingService.denyReversal",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 411
    },
    "costing.reversal|REVERSAL_POSTED": {
      "functionName": "CostingService.reverseCorrelation",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 385
    },
    "driver.self_fund_scope|SELF_FUND_SCOPE_GRANTED": {
      "functionName": "CostingReadService.selfFundStatement",
      "filePath": "apps/api/src/transport/costing/costing-read.service.ts",
      "line": 86
    },
    "driver.self_fund_scope|SELF_FUND_SCOPE_NO_DRIVER_BINDING": {
      "functionName": "CostingReadService.selfFundStatement",
      "filePath": "apps/api/src/transport/costing/costing-read.service.ts",
      "line": 72
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
      "line": 134
    },
    "driver_fund.post_entry|FUND_ENTRY_POSTED": {
      "functionName": "CostingService.postEntryOnly",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 162
    },
    "fund_period.transition|*": {
      "functionName": "FundPeriodService.transition",
      "filePath": "apps/api/src/transport/costing/fund-period.service.ts"
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
    "rules.price|*": {
      "functionName": "AgentOrchestrator.dispatch",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 669
    },
    "supervisor.risk|*": {
      "functionName": "AgentOrchestrator.run",
      "filePath": "apps/api/src/agents/agent-orchestrator.service.ts",
      "line": 573
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
      "line": 492
    },
    "trip_expense.record|EXPENSE_IDEMPOTENT_REPLAY": {
      "functionName": "CostingService.recordTripExpense",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 216
    },
    "trip_expense.record|EXPENSE_RECORDED": {
      "functionName": "CostingService.recordTripExpense",
      "filePath": "apps/api/src/transport/costing/costing.service.ts",
      "line": 260
    }
  }
};
