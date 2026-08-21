/**
 * Domain types and data contracts for the Agent Workforce Experience.
 *
 * These contracts define the replaceable boundary between the UI layer
 * and the client services (Demo clients today, HTTP API clients tomorrow).
 */

export type CapabilityStatus = 'AVAILABLE' | 'DEMO' | 'PLANNED';

export interface CapabilityItem {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: CapabilityStatus;
  readonly category: string;
  readonly readinessNote?: string;
}

export type AgentGroupId =
  | 'executive'
  | 'commercial'
  | 'legal_finance'
  | 'manufacturing'
  | 'strategic'
  | 'infrastructure';

export interface AgentGroup {
  readonly id: AgentGroupId;
  readonly code: string;
  readonly name: string;
  readonly title: string;
  readonly roleDescription: string;
  readonly status: CapabilityStatus;
  readonly capabilities: readonly CapabilityItem[];
  readonly activeTasksToday: number;
  readonly latencyMs: number;
  readonly tools: readonly string[];
  readonly dataSources: readonly string[];
  readonly recentLogs: readonly {
    readonly time: string;
    readonly event: string;
    readonly status: 'ok' | 'warn' | 'info';
  }[];
}

export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertStatus = 'open' | 'in_progress' | 'resolved';

export interface SmartAlert {
  readonly id: string;
  readonly type: 'legal' | 'finance' | 'inventory' | 'production' | 'strategy';
  readonly severity: AlertSeverity;
  readonly title: string;
  readonly summary: string;
  readonly sourceAgent: string;
  readonly sourceAgentId: AgentGroupId;
  readonly createdAt: string;
  readonly status: AlertStatus;
  readonly assignee?: string;
  readonly relatedEntity?: {
    readonly type: 'contract' | 'invoice' | 'inventory_item' | 'production_order' | 'agent';
    readonly id: string;
    readonly name: string;
  };
  readonly recommendedAction: string;
  readonly policyRuleApplied?: string;
  readonly rootCause?: string;
}

export interface AssistantSource {
  readonly title: string;
  readonly category: string;
  readonly snippet: string;
  readonly docId?: string;
}

export interface AssistantActionSuggestion {
  readonly label: string;
  readonly actionType: 'view_alert' | 'view_doc' | 'view_agent' | 'custom';
  readonly targetId?: string;
  readonly prompt?: string;
}

export interface AssistantStructuredData {
  readonly type: 'kpi_table' | 'risk_summary' | 'order_summary';
  readonly title: string;
  readonly rows: readonly {
    readonly label: string;
    readonly value: string;
    readonly highlight?: boolean;
  }[];
}

export interface AssistantMessage {
  readonly id: string;
  readonly sender: 'user' | 'assistant';
  readonly text: string;
  readonly timestamp: string;
  readonly sources?: readonly AssistantSource[];
  readonly actionSuggestions?: readonly AssistantActionSuggestion[];
  readonly structuredData?: AssistantStructuredData;
  readonly status?: 'success' | 'warning' | 'info';
}

export interface DocumentItem {
  readonly id: string;
  readonly title: string;
  readonly type: 'contract' | 'invoice' | 'sop' | 'report';
  readonly uploadedAt: string;
  readonly fileSize: string;
  readonly status: 'analyzed' | 'processing' | 'ready';
  readonly mode: 'contract_review' | 'invoice_extraction' | 'general';
  readonly analysis: {
    readonly metadata: Record<string, string>;
    readonly keyClausesOrItems: readonly {
      readonly name: string;
      readonly value: string;
      readonly riskLevel?: 'safe' | 'caution' | 'high_risk';
      readonly note?: string;
    }[];
    readonly complianceFindings: readonly {
      readonly rule: string;
      readonly result: 'pass' | 'flagged' | 'deviated';
      readonly detail: string;
    }[];
    readonly provenance: string;
    readonly confidence: number;
  };
}

export type IntegrationStatus = 'connected' | 'configured' | 'demo' | 'planned';

export interface DataConnector {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly status: IntegrationStatus;
  readonly latency?: string;
  readonly recordsCount?: string;
  readonly lastSync?: string;
  readonly note: string;
}

export interface ModelProviderInfo {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly provider: string;
  readonly status: 'active' | 'configured' | 'planned';
  readonly contextWindow: string;
}

export interface McpToolInfo {
  readonly id: string;
  readonly name: string;
  readonly group: string;
  readonly status: 'active' | 'demo' | 'planned';
  readonly permissions: string;
  readonly description: string;
}

export interface RbacRole {
  readonly role: string;
  readonly description: string;
  readonly userCount: number;
  readonly permissions: readonly string[];
}

export interface PlatformTelemetry {
  readonly p95Latency: string;
  readonly errorRate: string;
  readonly bufferHealth: string;
  readonly activeRuns: number;
  readonly uptime: string;
  readonly totalTasksToday: number;
}
