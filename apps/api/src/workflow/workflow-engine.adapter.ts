import { DisabledWorkflowEngineAdapter } from './disabled-workflow-engine.adapter.js';
import type { WorkflowEngineName, WorkflowEnginePort } from './workflow-engine.port.js';

/**
 * Bang tra hien thuc `WorkflowEnginePort` theo goi khach.
 *
 * Tach khoi Nest provider co chu dich — dung khuon `erp/erp-adapter.ts` (thuan) /
 * `erp/erp.provider.ts` (day day): ham nay khong doc bien moi truong, khong doc file, khong dung
 * DI, nen kiem duoc tung nhanh ma khong phai dung goi khach gia.
 *
 * VI SAO `async` (khac `createErpAdapter`): nhanh Hatchet nap SDK bang `await import()` chu
 * khong import tinh. Ly do do duoc: nap SDK mat ~800 ms va in ba dong canh bao khai tu moi lan.
 * Khach KHONG dung engine — mac dinh cua nen tang — khong co ly do gi phai tra cai gia do,
 * ke ca trong CI. Day cung la khuon `app.module.ts` da dung cho AdminJS
 * (`await import('./admin/admin.module.js')` chi khi `ADMIN_UI=on`).
 */
export interface WorkflowEngineCredentials {
  /** BI MAT — tu bien moi truong / Secret Manager, khong bao gio tu `tenant.json`. */
  readonly token?: string;
  readonly hostPort?: string;
  readonly tlsStrategy?: 'none' | 'tls' | 'mtls';
  readonly dashboardBaseUrl?: string;
  readonly namespace?: string;
}

export async function createWorkflowEngineAdapter(
  engine: WorkflowEngineName | undefined,
  credentials: WorkflowEngineCredentials = {},
): Promise<WorkflowEnginePort> {
  if (engine === 'hatchet') {
    if (!credentials.token) {
      // Fail-fast, khong roi ve ban vo hieu hoa. Khach DA khai bao la dung engine; roi am tham
      // ve `none` se lam moi viec bien mat ma khong ai biet — dung kieu hong ma `NoopErpAdapter`
      // ton tai de tranh.
      throw new Error(
        'WORKFLOW_ENGINE_TOKEN_MISSING: goi khach khai bao workflowEngine.adapter=hatchet nhung ' +
          'khong co token. Dat bien moi truong duoc tro toi boi `credentialRef` cua goi khach.',
      );
    }
    const { HatchetWorkflowEngineAdapter } = await import(
      './hatchet/hatchet-workflow-engine.adapter.js'
    );
    return new HatchetWorkflowEngineAdapter({
      token: credentials.token,
      ...(credentials.hostPort ? { hostPort: credentials.hostPort } : {}),
      ...(credentials.tlsStrategy ? { tlsStrategy: credentials.tlsStrategy } : {}),
      ...(credentials.dashboardBaseUrl ? { dashboardBaseUrl: credentials.dashboardBaseUrl } : {}),
      ...(credentials.namespace ? { namespace: credentials.namespace } : {}),
    });
  }

  // `none` va goi khach khong khai bao deu ve day: khong doan nha cung cap cho khach.
  return new DisabledWorkflowEngineAdapter();
}
