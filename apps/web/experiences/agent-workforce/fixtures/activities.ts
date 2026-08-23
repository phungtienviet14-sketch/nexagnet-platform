export interface HourlyActivityPoint {
  readonly hour: string;
  readonly total: number;
  readonly executive: number;
  readonly commercial: number;
  readonly legalFinance: number;
  readonly manufacturing: number;
  readonly strategic: number;
}

export const HOURLY_ACTIVITIES: readonly HourlyActivityPoint[] = [
  { hour: '07:00', total: 6, executive: 2, commercial: 1, legalFinance: 1, manufacturing: 1, strategic: 1 },
  { hour: '08:00', total: 18, executive: 6, commercial: 4, legalFinance: 3, manufacturing: 3, strategic: 2 },
  { hour: '09:00', total: 29, executive: 9, commercial: 8, legalFinance: 5, manufacturing: 5, strategic: 2 },
  { hour: '10:00', total: 38, executive: 12, commercial: 10, legalFinance: 7, manufacturing: 6, strategic: 3 },
  { hour: '11:00', total: 31, executive: 8, commercial: 9, legalFinance: 7, manufacturing: 4, strategic: 3 },
  { hour: '12:00', total: 8, executive: 2, commercial: 2, legalFinance: 2, manufacturing: 1, strategic: 1 },
  { hour: '13:00', total: 12, executive: 3, commercial: 3, legalFinance: 3, manufacturing: 2, strategic: 1 },
  { hour: '14:00', total: 26, executive: 7, commercial: 7, legalFinance: 5, manufacturing: 4, strategic: 3 },
  { hour: '15:00', total: 34, executive: 10, commercial: 9, legalFinance: 6, manufacturing: 6, strategic: 3 },
  { hour: '16:00', total: 22, executive: 6, commercial: 6, legalFinance: 4, manufacturing: 4, strategic: 2 },
];

export interface WorkforceSummaryStats {
  readonly activeAgentsCount: number;
  readonly totalAgentsCount: number;
  readonly totalTasksToday: number;
  readonly attentionRequiredCount: number;
  readonly connectedDataSourcesCount: number;
  readonly totalDataSourcesCount: number;
  readonly avgLatencyMs: number;
}

export const WORKFORCE_SUMMARY_STATS: WorkforceSummaryStats = {
  activeAgentsCount: 6,
  totalAgentsCount: 6,
  totalTasksToday: 142,
  attentionRequiredCount: 4,
  connectedDataSourcesCount: 5,
  totalDataSourcesCount: 8,
  avgLatencyMs: 410,
};
