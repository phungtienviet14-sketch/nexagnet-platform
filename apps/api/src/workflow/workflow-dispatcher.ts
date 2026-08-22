import { Logger } from '@nestjs/common';
import type { WorkflowEnginePort } from './workflow-engine.port.js';
import type {
  WorkflowOutboxEntry,
  WorkflowOutboxRepository,
} from './workflow-outbox.repository.js';

/**
 * NGUOI DUA THU giua DB nghiep vu va workflow engine.
 *
 * Doc hang outbox da toi han, goi engine, ghi lai ket qua. Het. No KHONG biet nghiep vu la gi,
 * khong quyet dinh gi, va khong giu trang thai nao trong bo nho — moi thu song trong DB.
 *
 * BAT BIEN: `tick()` KHONG BAO GIO NEM. Mot hang hong khong duoc chan cac hang con lai, va mot
 * engine dang chet khong duoc lam sap tien trinh API. Loi cua tung hang duoc ghi vao chinh hang
 * do (`lastError`) roi hang quay lai hang doi voi backoff.
 *
 * Tach `tick(now)` khoi bo dem thoi gian co chu dich — dung khuon `CampaignScheduler`:
 * trang thai khong nam trong timer, nen test goi thang `tick()` voi mot moc thoi gian cho truoc
 * va kiem duoc backoff ma khong phai cho that.
 */
export interface WorkflowDispatcherOptions {
  /** Dinh danh tien trinh — de biet AI dang giu lease khi phai go roi. */
  readonly workerId: string;
  readonly leaseSeconds: number;
  /** So hang toi da moi luot. Giu nho de mot luot khong giu lease qua lau. */
  readonly batchSize?: number;
}

export class WorkflowDispatcher {
  private readonly logger = new Logger(WorkflowDispatcher.name);

  constructor(
    private readonly outbox: WorkflowOutboxRepository,
    private readonly engine: WorkflowEnginePort,
    private readonly options: WorkflowDispatcherOptions,
  ) {}

  async tick(now: Date = new Date()): Promise<void> {
    let due: WorkflowOutboxEntry[];
    try {
      due = await this.outbox.claimDue(
        this.options.workerId,
        now,
        this.options.leaseSeconds,
        this.options.batchSize ?? 20,
      );
    } catch (error) {
      // DB nghiep vu khong doc duoc: khong con gi lam duoc o luot nay. Hang van nam nguyen.
      this.logger.error(`Khong nhan duoc viec tu outbox: ${message(error)}`);
      return;
    }

    for (const item of due) {
      await this.dispatch(item, now);
    }
  }

  private async dispatch(item: WorkflowOutboxEntry, now: Date): Promise<void> {
    try {
      const reference = await this.engine.trigger({
        workflowKey: item.workflowKey,
        workflowVersion: item.workflowVersion,
        input: item.payload,
        metadata: item.metadata,
        operationKey: item.operationKey,
      });
      await this.outbox.markDispatched(item.id, reference.engineRunId, now);
      this.logger.log(
        `Ban giao ${item.workflowKey}.${item.workflowVersion} cho ${item.entityType}:${item.entityId} ` +
          `-> run ${reference.engineRunId}`,
      );
    } catch (error) {
      // Engine chet, mang hong, token sai, khach chua bat engine — moi truong hop deu ket thuc o
      // day, va o moi truong hop SU KIEN VAN CON. Do la ca diem cua lop nay.
      try {
        await this.outbox.markAttemptFailed(item.id, message(error), now);
      } catch (writeError) {
        // Ke ca khi khong ghi duoc that bai: lease se het han va hang quay lai hang doi.
        this.logger.error(`Khong ghi duoc that bai cho ${item.id}: ${message(writeError)}`);
      }
      this.logger.warn(
        `Ban giao that bai (lan ${item.attempts}/${item.maxAttempts}) ` +
          `${item.workflowKey}.${item.workflowVersion} ${item.entityType}:${item.entityId}: ` +
          message(error),
      );
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
