'use client';

import React, { createContext, useContext, useMemo, type ReactNode } from 'react';
import { DemoAlertClient, type AlertClient } from './alert-client';
import { DemoAssistantClient, type AssistantClient } from './assistant-client';
import { DemoDocumentAnalysisClient, type DocumentAnalysisClient } from './document-client';
import { DemoOperationsClient, type OperationsClient } from './operations-client';
import { DemoWorkforceClient, type WorkforceClient } from './workforce-client';

export interface WorkforceClients {
  readonly workforce: WorkforceClient;
  readonly alerts: AlertClient;
  readonly assistant: AssistantClient;
  readonly documents: DocumentAnalysisClient;
  readonly operations: OperationsClient;
}

const ClientContext = createContext<WorkforceClients | null>(null);

export interface WorkforceClientsProviderProps {
  readonly clients?: Partial<WorkforceClients>;
  readonly children: ReactNode;
}

export function WorkforceClientsProvider({ clients, children }: WorkforceClientsProviderProps) {
  const value = useMemo<WorkforceClients>(() => {
    return {
      workforce: clients?.workforce ?? new DemoWorkforceClient(),
      alerts: clients?.alerts ?? new DemoAlertClient(),
      assistant: clients?.assistant ?? new DemoAssistantClient(),
      documents: clients?.documents ?? new DemoDocumentAnalysisClient(),
      operations: clients?.operations ?? new DemoOperationsClient(),
    };
  }, [clients]);

  return <ClientContext.Provider value={value}>{children}</ClientContext.Provider>;
}

export function useWorkforceClient(): WorkforceClient {
  const context = useContext(ClientContext);
  if (!context) throw new Error('useWorkforceClient phai nam trong <WorkforceClientsProvider>');
  return context.workforce;
}

export function useAlertClient(): AlertClient {
  const context = useContext(ClientContext);
  if (!context) throw new Error('useAlertClient phai nam trong <WorkforceClientsProvider>');
  return context.alerts;
}

export function useAssistantClient(): AssistantClient {
  const context = useContext(ClientContext);
  if (!context) throw new Error('useAssistantClient phai nam trong <WorkforceClientsProvider>');
  return context.assistant;
}

export function useDocumentClient(): DocumentAnalysisClient {
  const context = useContext(ClientContext);
  if (!context) throw new Error('useDocumentClient phai nam trong <WorkforceClientsProvider>');
  return context.documents;
}

export function useOperationsClient(): OperationsClient {
  const context = useContext(ClientContext);
  if (!context) throw new Error('useOperationsClient phai nam trong <WorkforceClientsProvider>');
  return context.operations;
}
