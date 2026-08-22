import { Inject, Injectable, Optional } from '@nestjs/common';
import type { WorkflowEngineIntegration } from '@netviet/tenant';
import { AuditLogService } from '../audit/audit-log.service.js';
import { TelemetryService } from '../observability/telemetry.service.js';
import {
  currentTrace,
  newSpanId,
  newTraceId,
  toTraceparent,
} from '../observability/trace-context.js';
import { buildOperationKey, type OperationIdentity } from './operation-key.js';
import {
  WorkflowInputRejected,
  buildWorkflowInput,
  buildWorkflowMetadata,
} from './workflow-input.js';
import { workflowInputContract } from './workflow-registry.js';
import {
  WorkflowOutboxRepository,
  type WorkflowOutboxTransaction,
} from './workflow-outbox.repository.js';

/** Token DI: rang buoc workflow cua goi khach — dung khuon `CAMPAIGN_POLICY`. */
export const WORKFLOW_BINDINGS = Symbol('WORKFLOW_BINDINGS');
/** Token DI: danh tinh trien khai (khach + moi truong) — hai chieu cua khoa thao tac. */
export const WORKFLOW_RUNTIME_IDENTITY = Symbol('WORKFLOW_RUNTIME_IDENTITY');

export interface WorkflowRuntimeIdentity {
  readonly tenant: string;
  readonly environment: string;
}

/** Ket qua ban giao — CO KIEU, de noi goi phan biet duoc ba chuyen rat khac nhau. */
export const HANDOFF_OUTCOMES = ['queued', 'skipped', 'rejected'] as const;
export type HandoffOutcome = (typeof HANDOFF_OUTCOMES)[number];

export const HANDOFF_REASONS = [
  'QUEUED',
  /** Khach khong khai bao (hoac da tat) rang buoc cho khuon nay. Cau hinh HOP LE. */
  'NO_TENANT_BINDING',
  /** Payload vi pham bien gioi rieng tu — xem `workflow-input.ts`. LOI CODE. */
  'INPUT_REJECTED',
] as const;
export type HandoffReason = (typeof HANDOFF_REASONS)[number];

export interface WorkflowHandoffRequest {
  readonly workflowKey: string;
  /** Dong tu nghiep vu: `create` | `cancel` | `sync`… */
  readonly operation: string;
  readonly entityType: string;
  readonly entityId: string;
}

export interface WorkflowHandoffResult {
  readonly outcome: HandoffOutcome;
  readonly reason: HandoffReason;
  readonly operationKey?: string;
}

/**
 * CAU NOI DUY NHAT tu su kien nghiep vu sang workflow engine.
 *
 * "Duy nhat" la yeu cau thiet ke, khong phai mo ta: neu `OrdersService`, `CampaignService` va
 * `ContentService` moi noi tu goi engine thi khong con ai tra loi duoc cau "viec nghiep vu nao
 * kich workflow nao", va bon lop bao ve o day (rang buoc khach, khoa thao tac, bien gioi rieng
 * tu, outbox) se bi bo qua o dung cho nguoi ta voi.
 *
 * Noi goi chi lam mot viec:
 *
 *   await handoff.handoff({ workflowKey, operation, entityType, entityId }, tx)
 *
 * `tx` la giao dich cua chinh no — day la diem mau chot: hang outbox nam CUNG giao dich voi thay
 * doi nghiep vu, nen khong co cua so nao de su kien bien mat.
 *
 * FAIL-OPEN cho QUAN SAT, FAIL-CLOSED cho NGHIEP VU: telemetry va audit deu `@Optional()` va moi
 * loi cua chung bi nuot; nhung mot payload vi pham bien gioi rieng tu thi NEM ra ngoai.
 */
@Injectable()
export class WorkflowHandoffService {
  constructor(
    private readonly outbox: WorkflowOutboxRepository,
    @Inject(WORKFLOW_BINDINGS) private readonly bindings: WorkflowEngineIntegration,
    @Inject(WORKFLOW_RUNTIME_IDENTITY) private readonly identity: WorkflowRuntimeIdentity,
    @Optional() private readonly telemetry?: TelemetryService,
    @Optional() private readonly audit?: AuditLogService,
  ) {}

  async handoff(
    request: WorkflowHandoffRequest,
    tx?: WorkflowOutboxTransaction,
  ): Promise<WorkflowHandoffResult> {
    const binding =
      this.bindings.adapter === 'none'
        ? undefined
        : this.bindings.bindings.find(
            (candidate) => candidate.key === request.workflowKey && candidate.enabled,
          );

    if (!binding) {
      // KHONG phai loi. Khach nay khong chay khuon nay — noi goi tu quyet dinh lam gi tiep
      // (thuong la: duong lam tay van nhu cu).
      this.record(request, 'skipped', 'NO_TENANT_BINDING');
      return { outcome: 'skipped', reason: 'NO_TENANT_BINDING' };
    }

    const operationIdentity: OperationIdentity = {
      tenant: this.identity.tenant,
      environment: this.identity.environment,
      workflowKey: binding.key,
      operationVersion: binding.operationVersion,
      entityType: request.entityType,
      entityId: request.entityId,
      operation: request.operation,
      destination: binding.destination,
    };
    const operationKey = buildOperationKey(operationIdentity);

    let payload: Record<string, unknown>;
    try {
      payload = buildWorkflowInput(workflowInputContract(binding.key, binding.version), {
        tenant: this.identity.tenant,
        entityType: request.entityType,
        entityId: request.entityId,
        operation: request.operation,
        operationVersion: binding.operationVersion,
        destination: binding.destination,
      }) as Record<string, unknown>;
    } catch (error) {
      // Mot payload mang PII/bi mat KHONG duoc lang le di tiep. Day la loi code, va no phai
      // hong to o ngay noi sinh ra no.
      if (error instanceof WorkflowInputRejected) {
        this.record(request, 'rejected', 'INPUT_REJECTED', { detail: error.reason });
      }
      throw error;
    }

    const scope = currentTrace();
    // Ngoai moi trace (script CLI, seed) van phai co mot soi day. KHONG dung chuoi toan so 0:
    // dac ta W3C coi trace id do la KHONG HOP LE, va mot id vo nghia con te hon mot id moi.
    const traceId = scope?.traceId ?? newTraceId();
    const metadata = buildWorkflowMetadata({
      traceId,
      traceparent: toTraceparent(traceId, scope?.currentSpanId ?? newSpanId()),
      tenant: this.identity.tenant,
      environment: this.identity.environment,
      entityType: request.entityType,
      entityId: request.entityId,
      workflowKey: binding.key,
      workflowVersion: binding.version,
    });

    await this.outbox.enqueue(
      {
        operationKey,
        workflowKey: binding.key,
        // GHIM phien ban tai thoi diem XEP HANG. Xem `evidence/version-gate-a.md`.
        workflowVersion: binding.version,
        entityType: request.entityType,
        entityId: request.entityId,
        payload,
        metadata,
        // DUNG `traceId` DA PHAN GIAI o tren, khong phai `scope?.traceId`.
        //
        // Khac biet chi lo ra khi KHONG co trace bao quanh (script CLI, seed, mot lan tick cua
        // dispatcher): luc do cau noi sinh mot traceId moi va gui no sang engine, nhung neu o
        // day chi ghi khi da co scope thi hang outbox mang `null`. Hau qua la ban ghi ben
        // Nexagnet va lan chay ben engine khong bao gio noi lai duoc — dung dieu §9 runbook
        // ton tai de bao dam. Bat duoc luc chay E2E that, khong phai luc review.
        traceId,
        maxAttempts: binding.retry.maxAttempts,
        baseBackoffSeconds: binding.retry.baseBackoffSeconds,
      },
      tx,
    );

    this.record(request, 'queued', 'QUEUED', { operationKey });
    return { outcome: 'queued', reason: 'QUEUED', operationKey };
  }

  /**
   * Ghi dau vet. TOAN BO than ham nam trong `try` va nuot loi: quan sat hong khong duoc lam
   * hong nghiep vu (bat bien so mot cua `TelemetryService`).
   */
  private record(
    request: WorkflowHandoffRequest,
    outcome: HandoffOutcome,
    reason: HandoffReason,
    detail: Readonly<Record<string, unknown>> = {},
  ): void {
    try {
      this.telemetry?.stateChange({
        entity: 'WorkflowHandoff',
        entityId: `${request.entityType}:${request.entityId}`,
        from: null,
        to: outcome,
        reason,
      });
      if (outcome === 'queued') {
        // Audit chi giu THAM CHIEU, khong copy lich su cua engine ve day. Lich su chi tiet nam
        // ben engine va bi xoa sau 30 ngay — nen dong nay la thu con lai ve sau.
        void this.audit?.append({
          actor: 'system',
          action: 'workflow.handoff.queued',
          entityType: request.entityType,
          entityId: request.entityId,
          after: { workflowKey: request.workflowKey, reason, ...detail },
          requestId: currentTrace()?.traceId ?? null,
        });
      }
    } catch {
      /* fail-open */
    }
  }
}
