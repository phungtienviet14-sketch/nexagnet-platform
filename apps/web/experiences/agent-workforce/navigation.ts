import type { AgentGroupId } from './services/types';

export type WorkforceViewId =
  | 'overview'
  | 'directory'
  | 'assistant'
  | 'alerts'
  | 'documents'
  | 'operations';

export interface WorkforceNavigationState {
  readonly view: WorkforceViewId;
  readonly selectedAgentId?: AgentGroupId;
  readonly selectedAlertId?: string;
  readonly selectedDocId?: string;
}

export function parseNavigationState(search: string): WorkforceNavigationState {
  const params = new URLSearchParams(search);
  const rawView = params.get('view');
  const view: WorkforceViewId =
    rawView === 'directory' ||
    rawView === 'assistant' ||
    rawView === 'alerts' ||
    rawView === 'documents' ||
    rawView === 'operations'
      ? rawView
      : 'overview';

  const selectedAgentId = (params.get('agent') as AgentGroupId) || undefined;
  const selectedAlertId = params.get('alertId') || undefined;
  const selectedDocId = params.get('docId') || undefined;

  return {
    view,
    selectedAgentId,
    selectedAlertId,
    selectedDocId,
  };
}

export function buildNavigationUrl(state: WorkforceNavigationState): string {
  const params = new URLSearchParams();
  if (state.view !== 'overview') {
    params.set('view', state.view);
  }
  if (state.view === 'directory' && state.selectedAgentId) {
    params.set('agent', state.selectedAgentId);
  }
  if (state.view === 'alerts' && state.selectedAlertId) {
    params.set('alertId', state.selectedAlertId);
  }
  if (state.view === 'documents' && state.selectedDocId) {
    params.set('docId', state.selectedDocId);
  }

  const query = params.toString();
  return query ? `/?${query}` : '/';
}
