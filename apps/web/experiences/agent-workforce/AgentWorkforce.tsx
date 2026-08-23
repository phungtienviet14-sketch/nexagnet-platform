'use client';

import React, { useEffect, useState } from 'react';
import {
  buildNavigationUrl,
  parseNavigationState,
  type WorkforceNavigationState,
  type WorkforceViewId,
} from './navigation';
import { WorkforceClientsProvider } from './services/client-context';
import type { AgentGroupId } from './services/types';
import { TopNav } from './views/components/TopNav';
import { AlertsView } from './views/AlertsView';
import { AssistantView } from './views/AssistantView';
import { ControlPlaneView } from './views/ControlPlaneView';
import { DirectoryView } from './views/DirectoryView';
import { DocumentsView } from './views/DocumentsView';
import { OperationsView } from './views/OperationsView';

export function AgentWorkforce() {
  const [navState, setNavState] = useState<WorkforceNavigationState>(() => {
    if (typeof window !== 'undefined') {
      return parseNavigationState(window.location.search);
    }
    return { view: 'overview' };
  });

  const [assistantPrompt, setAssistantPrompt] = useState<string | undefined>(undefined);

  useEffect(() => {
    const handlePopState = () => {
      setNavState(parseNavigationState(window.location.search));
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const updateNavState = (newState: Partial<WorkforceNavigationState>) => {
    setNavState((current) => {
      const merged: WorkforceNavigationState = { ...current, ...newState };
      const url = buildNavigationUrl(merged);
      if (typeof window !== 'undefined' && window.location.search !== (url.split('?')[1] ? `?${url.split('?')[1]}` : '')) {
        window.history.pushState(null, '', url);
      }
      return merged;
    });
  };

  const handleChangeView = (view: WorkforceViewId) => {
    updateNavState({
      view,
      selectedAgentId: view === 'directory' ? navState.selectedAgentId : undefined,
      selectedAlertId: view === 'alerts' ? navState.selectedAlertId : undefined,
      selectedDocId: view === 'documents' ? navState.selectedDocId : undefined,
    });
  };

  const handleNavigateToDirectory = (agentId?: AgentGroupId) => {
    updateNavState({
      view: 'directory',
      selectedAgentId: agentId ?? 'executive',
    });
  };

  const handleNavigateToAlerts = (alertId?: string) => {
    updateNavState({
      view: 'alerts',
      selectedAlertId: alertId,
    });
  };

  const handleNavigateToAssistant = (prompt?: string) => {
    if (prompt) setAssistantPrompt(prompt);
    updateNavState({ view: 'assistant' });
  };

  const handleNavigateToDoc = (docId: string) => {
    updateNavState({
      view: 'documents',
      selectedDocId: docId,
    });
  };

  const handleNavigateToOperations = () => {
    updateNavState({ view: 'operations' });
  };

  return (
    <WorkforceClientsProvider>
      <div className="wf-shell" data-experience="agent-workforce">
        <TopNav
          activeView={navState.view}
          onChangeView={handleChangeView}
          alertsCount={4}
        />

        <main className="wf-main-content">
          {navState.view === 'overview' && (
            <ControlPlaneView
              onNavigateToDirectory={handleNavigateToDirectory}
              onNavigateToAlerts={handleNavigateToAlerts}
              onNavigateToAssistant={() => handleNavigateToAssistant()}
              onNavigateToOperations={handleNavigateToOperations}
            />
          )}

          {navState.view === 'directory' && (
            <DirectoryView
              initialAgentId={navState.selectedAgentId}
              onSelectAgent={(agentId) => updateNavState({ selectedAgentId: agentId })}
              onOpenAssistantWithPrompt={(p) => handleNavigateToAssistant(p)}
              onOpenAlertsForAgent={() => handleNavigateToAlerts()}
            />
          )}

          {navState.view === 'assistant' && (
            <AssistantView
              initialPrompt={assistantPrompt}
              onNavigateToAlert={handleNavigateToAlerts}
              onNavigateToDoc={handleNavigateToDoc}
              onNavigateToAgent={handleNavigateToDirectory}
            />
          )}

          {navState.view === 'alerts' && (
            <AlertsView
              initialAlertId={navState.selectedAlertId}
              onSelectAlert={(id) => updateNavState({ selectedAlertId: id })}
              onNavigateToDoc={handleNavigateToDoc}
              onNavigateToAgent={handleNavigateToDirectory}
            />
          )}

          {navState.view === 'documents' && (
            <DocumentsView
              initialDocId={navState.selectedDocId}
              onSelectDoc={(id) => updateNavState({ selectedDocId: id })}
              onNavigateToAlert={handleNavigateToAlerts}
            />
          )}

          {navState.view === 'operations' && <OperationsView />}
        </main>
      </div>
    </WorkforceClientsProvider>
  );
}
