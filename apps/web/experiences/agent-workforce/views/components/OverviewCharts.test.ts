import { describe, expect, it } from 'vitest';
import type { HourlyActivityPoint } from '../../fixtures/activities';
import type { SmartAlert } from '../../services/types';
import { createTrendPoints, summarizeAgentLoads, summarizeAttention } from './OverviewCharts';

const activity: readonly HourlyActivityPoint[] = [
  { hour: '08:00', total: 10, executive: 3, commercial: 2, legalFinance: 2, manufacturing: 2, strategic: 1 },
  { hour: '09:00', total: 20, executive: 6, commercial: 5, legalFinance: 4, manufacturing: 3, strategic: 2 },
];

const alerts: readonly SmartAlert[] = [
  { id: 'a1', type: 'legal', severity: 'critical', title: 'A', summary: 'A', sourceAgent: 'A', sourceAgentId: 'executive', createdAt: 'now', status: 'open', recommendedAction: 'Review' },
  { id: 'a2', type: 'finance', severity: 'warning', title: 'B', summary: 'B', sourceAgent: 'B', sourceAgentId: 'commercial', createdAt: 'now', status: 'in_progress', recommendedAction: 'Review' },
  { id: 'a3', type: 'strategy', severity: 'info', title: 'C', summary: 'C', sourceAgent: 'C', sourceAgentId: 'strategic', createdAt: 'now', status: 'resolved', recommendedAction: 'Review' },
];

describe('overview chart summaries', () => {
  it('aggregates workload by agent group from hourly activity', () => {
    expect(summarizeAgentLoads(activity)).toEqual([
      { label: 'Điều hành', value: 9, tone: 'executive' },
      { label: 'Kinh doanh', value: 7, tone: 'commercial' },
      { label: 'Pháp chế & KT', value: 6, tone: 'legal-finance' },
      { label: 'Sản xuất', value: 5, tone: 'manufacturing' },
      { label: 'Cố vấn', value: 3, tone: 'strategic' },
    ]);
  });

  it('keeps only unresolved alerts in the attention mix', () => {
    expect(summarizeAttention(alerts)).toEqual([
      { severity: 'critical', label: 'Khẩn cấp', value: 1 },
      { severity: 'warning', label: 'Cảnh báo', value: 1 },
      { severity: 'info', label: 'Theo dõi', value: 0 },
    ]);
  });

  it('maps the smallest and largest throughput to the chart bounds', () => {
    expect(createTrendPoints(activity, 100, 50)).toBe('0,25 100,0');
  });
});
