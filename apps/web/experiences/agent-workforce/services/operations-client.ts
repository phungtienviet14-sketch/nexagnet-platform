import {
  DATA_CONNECTORS,
  MCP_TOOLS,
  MODEL_PROVIDERS,
  PLATFORM_TELEMETRY,
  RBAC_ROLES,
} from '../fixtures/operations';
import type {
  DataConnector,
  McpToolInfo,
  ModelProviderInfo,
  PlatformTelemetry,
  RbacRole,
} from './types';

export interface OperationsClient {
  getDataConnectors(): Promise<readonly DataConnector[]>;
  getModelProviders(): Promise<readonly ModelProviderInfo[]>;
  getMcpTools(): Promise<readonly McpToolInfo[]>;
  getRbacRoles(): Promise<readonly RbacRole[]>;
  getTelemetry(): Promise<PlatformTelemetry>;
}

export class DemoOperationsClient implements OperationsClient {
  async getDataConnectors(): Promise<readonly DataConnector[]> {
    return DATA_CONNECTORS;
  }

  async getModelProviders(): Promise<readonly ModelProviderInfo[]> {
    return MODEL_PROVIDERS;
  }

  async getMcpTools(): Promise<readonly McpToolInfo[]> {
    return MCP_TOOLS;
  }

  async getRbacRoles(): Promise<readonly RbacRole[]> {
    return RBAC_ROLES;
  }

  async getTelemetry(): Promise<PlatformTelemetry> {
    return PLATFORM_TELEMETRY;
  }
}
