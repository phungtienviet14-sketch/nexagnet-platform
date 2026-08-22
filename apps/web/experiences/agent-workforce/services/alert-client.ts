import { INITIAL_SMART_ALERTS } from '../fixtures/alerts';
import type { SmartAlert } from './types';

export interface AlertClient {
  getAlerts(): Promise<readonly SmartAlert[]>;
  getAlertById(id: string): Promise<SmartAlert | undefined>;
  acknowledgeAlert(id: string): Promise<SmartAlert>;
  assignAlert(id: string, assignee: string): Promise<SmartAlert>;
  resolveAlert(id: string): Promise<SmartAlert>;
}

export class DemoAlertClient implements AlertClient {
  private alerts: SmartAlert[] = [...INITIAL_SMART_ALERTS];

  async getAlerts(): Promise<readonly SmartAlert[]> {
    return [...this.alerts];
  }

  async getAlertById(id: string): Promise<SmartAlert | undefined> {
    return this.alerts.find((alert) => alert.id === id);
  }

  async acknowledgeAlert(id: string): Promise<SmartAlert> {
    const index = this.alerts.findIndex((alert) => alert.id === id);
    if (index === -1) throw new Error(`Khong tim thay canh bao: ${id}`);
    const current = this.alerts[index]!;
    const updated: SmartAlert = {
      ...current,
      status: 'in_progress',
    };
    this.alerts[index] = updated;
    return updated;
  }

  async assignAlert(id: string, assignee: string): Promise<SmartAlert> {
    const index = this.alerts.findIndex((alert) => alert.id === id);
    if (index === -1) throw new Error(`Khong tim thay canh bao: ${id}`);
    const current = this.alerts[index]!;
    const updated: SmartAlert = {
      ...current,
      assignee,
      status: 'in_progress',
    };
    this.alerts[index] = updated;
    return updated;
  }

  async resolveAlert(id: string): Promise<SmartAlert> {
    const index = this.alerts.findIndex((alert) => alert.id === id);
    if (index === -1) throw new Error(`Khong tim thay canh bao: ${id}`);
    const current = this.alerts[index]!;
    const updated: SmartAlert = {
      ...current,
      status: 'resolved',
    };
    this.alerts[index] = updated;
    return updated;
  }
}
