import { Injectable } from '@nestjs/common';
import {
  WorkflowEnginePort,
  type TriggerWorkflowCommand,
  type WorkflowRunReference,
  type WorkflowRunSummary,
} from './workflow-engine.port.js';

/**
 * Hien thuc `WorkflowEnginePort` cho tenant CHUA noi workflow engine nao — MAC DINH cua nen tang.
 *
 * Dung khuon `erp/noop-erp.adapter.ts`, va vi dung mot ly do:
 *
 *   DOC thi tra rong  — console van ve duoc, khong vo giao dien vi khach chua bat engine.
 *   GHI thi NEM       — mot cong tra ve "da kich hoat" trong khi khong co engine nao chay se
 *                       lam nguoi van hanh tin la viec DA duoc giao, roi bo qua duong lam tay.
 *                       Do dung kieu hong am tham ma GD1 fail-closed o khap noi de tranh.
 *
 * Thong bao loi chi DUNG FILE PHAI SUA. Mot cau "workflow engine chua bat" khong giup ai; mot
 * cau chi ra `tenants/<slug>/tenant.json` thi sua duoc trong mot phut.
 */
@Injectable()
export class DisabledWorkflowEngineAdapter extends WorkflowEnginePort {
  private refuse(action: string): never {
    throw new Error(
      `Goi khach chua cau hinh workflow engine (integrations.workflowEngine.adapter=none) — ` +
        `khong the ${action}. Khai bao \`integrations.workflowEngine\` trong ` +
        `tenants/<slug>/tenant.json neu khach da san sang.`,
    );
  }

  async trigger(command: TriggerWorkflowCommand): Promise<WorkflowRunReference> {
    this.refuse(`kich hoat workflow '${command.workflowKey}.${command.workflowVersion}'`);
  }

  async sendEvent(eventKey: string, _payload: Readonly<Record<string, unknown>>): Promise<void> {
    this.refuse(`gui su kien '${eventKey}'`);
  }

  async cancel(engineRunId: string): Promise<void> {
    this.refuse(`huy run '${engineRunId}'`);
  }

  async describeRun(_engineRunId: string): Promise<WorkflowRunSummary | null> {
    return null;
  }

  async countInFlight(_workflowKey: string, _workflowVersion: string): Promise<number> {
    // Khong co engine thi khong co run nao dang chay. Cong DRAIN cua thu tuc deploy van tra loi
    // duoc mot cach dung dan thay vi nem — thu tuc deploy khong duoc phu thuoc vao viec khach
    // co bat engine hay khong.
    return 0;
  }
}
