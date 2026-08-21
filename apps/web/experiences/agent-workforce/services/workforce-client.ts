import { AGENT_GROUPS } from '../fixtures/agents';
import { HOURLY_ACTIVITIES, WORKFORCE_SUMMARY_STATS, type HourlyActivityPoint, type WorkforceSummaryStats } from '../fixtures/activities';
import type { AgentGroup, AgentGroupId } from './types';

export interface WorkforceClient {
  getAgentGroups(): Promise<readonly AgentGroup[]>;
  getAgentGroupById(id: AgentGroupId): Promise<AgentGroup | undefined>;
  getWorkforceSummary(): Promise<WorkforceSummaryStats>;
  getHourlyActivities(): Promise<readonly HourlyActivityPoint[]>;
}

export class DemoWorkforceClient implements WorkforceClient {
  async getAgentGroups(): Promise<readonly AgentGroup[]> {
    return AGENT_GROUPS;
  }

  async getAgentGroupById(id: AgentGroupId): Promise<AgentGroup | undefined> {
    return AGENT_GROUPS.find((group) => group.id === id);
  }

  async getWorkforceSummary(): Promise<WorkforceSummaryStats> {
    return WORKFORCE_SUMMARY_STATS;
  }

  async getHourlyActivities(): Promise<readonly HourlyActivityPoint[]> {
    return HOURLY_ACTIVITIES;
  }
}
