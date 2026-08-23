import { describe, expect, it } from 'vitest';
import { buildNavigationUrl, parseNavigationState } from '../navigation';
import { DemoAlertClient } from '../services/alert-client';
import { DemoAssistantClient } from '../services/assistant-client';
import { DemoDocumentAnalysisClient } from '../services/document-client';
import { DemoOperationsClient } from '../services/operations-client';
import { DemoWorkforceClient } from '../services/workforce-client';

describe('DemoWorkforceClient', () => {
  const client = new DemoWorkforceClient();

  it('provides all 6 specialized agent groups with 34 capabilities in total', async () => {
    const groups = await client.getAgentGroups();
    expect(groups).toHaveLength(6);

    const ids = groups.map((g) => g.id);
    expect(ids).toEqual([
      'executive',
      'commercial',
      'legal_finance',
      'manufacturing',
      'strategic',
      'infrastructure',
    ]);

    const totalCaps = groups.reduce((sum, g) => sum + g.capabilities.length, 0);
    expect(totalCaps).toBe(34);

    const execGroup = await client.getAgentGroupById('executive');
    expect(execGroup?.name).toBe('AI Trợ lý điều hành');
    expect(execGroup?.capabilities).toHaveLength(4);

    const mfgGroup = await client.getAgentGroupById('manufacturing');
    expect(mfgGroup?.name).toBe('AI Sản xuất');
    expect(mfgGroup?.capabilities).toHaveLength(11);
  });

  it('provides workforce summary statistics and hourly activities', async () => {
    const summary = await client.getWorkforceSummary();
    expect(summary.activeAgentsCount).toBe(6);
    expect(summary.totalTasksToday).toBeGreaterThan(100);

    const activities = await client.getHourlyActivities();
    expect(activities.length).toBeGreaterThan(5);
    expect(activities[0]).toHaveProperty('hour');
    expect(activities[0]).toHaveProperty('total');
  });
});

describe('DemoAlertClient', () => {
  it('supports retrieval and mutation workflow (acknowledge, assign, resolve)', async () => {
    const client = new DemoAlertClient();
    const alerts = await client.getAlerts();
    expect(alerts.length).toBeGreaterThanOrEqual(4);

    const target = alerts[0]!;
    expect(target.status).toBe('open');

    // Acknowledge
    const acked = await client.acknowledgeAlert(target.id);
    expect(acked.status).toBe('in_progress');

    // Assign
    const assigned = await client.assignAlert(target.id, 'Luật sư Nguyễn Văn A');
    expect(assigned.assignee).toBe('Luật sư Nguyễn Văn A');
    expect(assigned.status).toBe('in_progress');

    // Resolve
    const resolved = await client.resolveAlert(target.id);
    expect(resolved.status).toBe('resolved');

    // Verify in overall list
    const updatedList = await client.getAlerts();
    const found = updatedList.find((a) => a.id === target.id);
    expect(found?.status).toBe('resolved');
    expect(found?.assignee).toBe('Luật sư Nguyễn Văn A');
  });
});

describe('DemoAssistantClient', () => {
  it('returns initial welcome message with prompt suggestions', async () => {
    const client = new DemoAssistantClient();
    const initial = await client.getInitialConversation();
    expect(initial).toHaveLength(1);
    expect(initial[0]?.sender).toBe('assistant');
    expect(initial[0]?.actionSuggestions?.length).toBeGreaterThan(0);
  });

  it('returns deterministic structured responses for known queries', async () => {
    const client = new DemoAssistantClient();

    const resp1 = await client.sendMessage('Hôm nay có việc gì cần tôi xử lý?');
    expect(resp1.structuredData?.type).toBe('risk_summary');
    expect(resp1.sources?.length).toBeGreaterThan(0);
    expect(resp1.actionSuggestions?.length).toBeGreaterThan(0);

    const resp2 = await client.sendMessage('Tìm quy trình phê duyệt hợp đồng.');
    expect(resp2.structuredData?.type).toBe('kpi_table');
    expect(resp2.text).toContain('Quy chế Quản lý Hợp đồng');

    const resp3 = await client.sendMessage('Tóm tắt các cảnh báo quan trọng.');
    expect(resp3.text).toContain('VinFast');

    const resp4 = await client.sendMessage('Tóm tắt hoạt động kinh doanh hôm nay.');
    expect(resp4.structuredData?.type).toBe('kpi_table');
  });

  it('returns context-aware response for open-ended queries', async () => {
    const client = new DemoAssistantClient();
    const resp = await client.sendMessage('Xin chào bạn có thể giúp gì?');
    expect(resp.sender).toBe('assistant');
    expect(resp.text).toContain('AI Trợ lý điều hành');
  });
});

describe('DemoDocumentAnalysisClient', () => {
  it('provides sample documents with structured extraction and compliance results', async () => {
    const client = new DemoDocumentAnalysisClient();
    const docs = await client.getDocuments();
    expect(docs.length).toBeGreaterThanOrEqual(3);

    const contractDoc = docs.find((d) => d.type === 'contract');
    expect(contractDoc).toBeDefined();
    expect(contractDoc?.analysis.keyClausesOrItems.length).toBeGreaterThan(0);
    expect(contractDoc?.analysis.complianceFindings.length).toBeGreaterThan(0);

    const invoiceDoc = docs.find((d) => d.type === 'invoice');
    expect(invoiceDoc).toBeDefined();
    expect(invoiceDoc?.analysis.confidence).toBeGreaterThan(95);
  });

  it('supports simulated upload and analysis of new documents', async () => {
    const client = new DemoDocumentAnalysisClient();
    const uploaded = await client.uploadDocument({
      name: 'Hợp đồng Mua bán Thử nghiệm HĐ-TEST.pdf',
      size: '1.2 MB',
      type: 'contract',
    });
    expect(uploaded.id).toBeDefined();
    expect(uploaded.status).toBe('analyzed');
    expect(uploaded.analysis.complianceFindings.length).toBeGreaterThan(0);

    const allDocs = await client.getDocuments();
    expect(allDocs[0]?.id).toBe(uploaded.id);
  });
});

describe('DemoOperationsClient', () => {
  it('provides platform connectors, models, tools, RBAC, and telemetry', async () => {
    const client = new DemoOperationsClient();

    const connectors = await client.getDataConnectors();
    expect(connectors.length).toBeGreaterThanOrEqual(6);
    expect(connectors.some((c) => c.status === 'connected')).toBe(true);
    expect(connectors.some((c) => c.status === 'planned')).toBe(true);

    const models = await client.getModelProviders();
    expect(models.length).toBeGreaterThanOrEqual(4);

    const tools = await client.getMcpTools();
    expect(tools.length).toBeGreaterThanOrEqual(4);

    const rbac = await client.getRbacRoles();
    expect(rbac.length).toBeGreaterThanOrEqual(4);

    const telemetry = await client.getTelemetry();
    expect(telemetry.errorRate).toBe('0.00%');
    expect(telemetry.uptime).toBe('99.98%');
  });
});

describe('agent-workforce navigation helpers', () => {
  it('parses and builds navigation state with deep-link query parameters', () => {
    expect(parseNavigationState('')).toEqual({
      view: 'overview',
      selectedAgentId: undefined,
      selectedAlertId: undefined,
      selectedDocId: undefined,
    });

    expect(
      parseNavigationState('?view=directory&agent=manufacturing'),
    ).toEqual({
      view: 'directory',
      selectedAgentId: 'manufacturing',
      selectedAlertId: undefined,
      selectedDocId: undefined,
    });

    expect(
      parseNavigationState('?view=alerts&alertId=alert-legal-01'),
    ).toEqual({
      view: 'alerts',
      selectedAgentId: undefined,
      selectedAlertId: 'alert-legal-01',
      selectedDocId: undefined,
    });

    expect(
      parseNavigationState('?view=documents&docId=doc-contract-01'),
    ).toEqual({
      view: 'documents',
      selectedAgentId: undefined,
      selectedAlertId: undefined,
      selectedDocId: 'doc-contract-01',
    });

    expect(buildNavigationUrl({ view: 'overview' })).toBe('/');
    expect(buildNavigationUrl({ view: 'directory', selectedAgentId: 'commercial' })).toBe(
      '/?view=directory&agent=commercial',
    );
    expect(buildNavigationUrl({ view: 'alerts', selectedAlertId: 'alert-fin-02' })).toBe(
      '/?view=alerts&alertId=alert-fin-02',
    );
    expect(buildNavigationUrl({ view: 'documents', selectedDocId: 'doc-invoice-01' })).toBe(
      '/?view=documents&docId=doc-invoice-01',
    );
  });
});
