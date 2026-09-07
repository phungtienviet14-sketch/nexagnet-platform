import { Injectable, Optional } from '@nestjs/common';
import { AuditLogService } from '../../audit/audit-log.service.js';
import { TelemetryService } from '../../observability/telemetry.service.js';
import { TransportDomainError } from '../transport.errors.js';
import { TRANSPORT_COUNTERPARTY_DECISIONS } from './counterparty-decisions.js';
import { CounterpartySubjectPort } from './counterparty-subject.port.js';
import {
  CounterpartyRepository,
  type CreateCounterpartyInput,
  type UpdateCounterpartyInput,
} from './counterparty.repository.js';
import type {
  Counterparty,
  CounterpartyIdentity,
  CounterpartyLink,
  CounterpartySubjectKind,
} from './counterparty.types.js';

/**
 * XUONG SONG DANH TINH DOI TAC — R1-A cua lo trinh v2 (#230).
 *
 * Service nay lam DUNG MOT viec: noi nhieu hang chuyen mon ve mot phap nhan. No khong tinh tien,
 * khong doi trang thai chuyen, khong ghi mot but toan nao — nen no khong the lam sai mot con so
 * nao cua T3/T4/T5, va do la ly do no duoc chon lam tranche dau tien.
 */
@Injectable()
export class CounterpartyService {
  constructor(
    private readonly repository: CounterpartyRepository,
    private readonly subjects: CounterpartySubjectPort,
    private readonly audit: AuditLogService,
    @Optional() private readonly telemetry?: TelemetryService,
  ) {}

  async create(input: CreateCounterpartyInput, actor: string): Promise<Counterparty> {
    await this.requireTaxCodeFree(input.taxCode ?? null, null);
    const row = await this.repository.create(input);
    await this.audit.append({
      actor,
      action: 'transport.counterparty.create',
      entityType: 'TransportCounterparty',
      entityId: row.id,
      before: null,
      after: row,
    });
    return row;
  }

  async update(id: string, patch: UpdateCounterpartyInput, actor: string): Promise<Counterparty> {
    const before = await this.require(id);
    if (patch.taxCode !== undefined) await this.requireTaxCodeFree(patch.taxCode, id);
    const after = await this.repository.update(id, patch);
    if (!after) throw this.notFound(id);
    await this.audit.append({
      actor,
      action: 'transport.counterparty.update',
      entityType: 'TransportCounterparty',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  async get(id: string): Promise<CounterpartyIdentity> {
    const counterparty = await this.require(id);
    return { counterparty, links: await this.repository.listLinks(id) };
  }

  list(): Promise<Counterparty[]> {
    return this.repository.list();
  }

  /**
   * NOI mot hang chuyen mon vao mot phap nhan.
   *
   * Ba duong tu choi, ba ma rieng — xem `counterparty-decisions.ts` ve vi sao khong gop. Thu tu
   * kiem cung quan trong: hoi cong TRUOC khi hoi kho, vi mot loai chua co adapter thi cau hoi
   * "hang do co that khong" khong tra loi duoc, va tra ve `SUBJECT_NOT_FOUND` o do se bao nguoi
   * dung di tim mot id hoan toan dung.
   */
  async link(
    counterpartyId: string,
    kind: CounterpartySubjectKind,
    subjectId: string,
    actor: string,
  ): Promise<CounterpartyLink> {
    const counterparty = await this.require(counterpartyId);

    if (!this.subjects.supports(kind)) {
      throw this.denyLink(
        'SUBJECT_KIND_UNAVAILABLE',
        { counterpartyId, kind, subjectId },
        `Loai chu the ${kind} chua co adapter — khach chua bat capability tuong ung`,
      );
    }

    const existing = await this.repository.findLinkBySubject(kind, subjectId);
    if (existing) {
      if (existing.counterpartyId === counterpartyId) {
        this.telemetry?.decision({
          vocabulary: TRANSPORT_COUNTERPARTY_DECISIONS,
          point: 'counterparty.link',
          outcome: 'allowed',
          reason: 'LINK_UNCHANGED',
          detail: { counterpartyId, kind },
        });
        return existing;
      }
      throw this.denyLink(
        'SUBJECT_ALREADY_LINKED',
        { counterpartyId, kind, subjectId, heldBy: existing.counterpartyId },
        `Ban ghi ${kind} nay da thuoc mot phap nhan khac — go lien ket cu truoc`,
      );
    }

    if (!(await this.subjects.exists(kind, subjectId))) {
      throw this.denyLink(
        'SUBJECT_NOT_FOUND',
        { counterpartyId, kind, subjectId },
        `Khong tim thay ban ghi ${kind} nao co ma ${subjectId}`,
      );
    }

    const link = await this.repository.link({ counterpartyId, kind, subjectId, linkedBy: actor });
    this.telemetry?.decision({
      vocabulary: TRANSPORT_COUNTERPARTY_DECISIONS,
      point: 'counterparty.link',
      outcome: 'allowed',
      reason: 'LINK_CREATED',
      detail: { counterpartyId, kind },
    });
    await this.audit.append({
      actor,
      action: 'transport.counterparty.link',
      entityType: 'TransportCounterpartyLink',
      entityId: `${kind}:${subjectId}`,
      before: null,
      after: { ...link, counterpartyName: counterparty.name },
    });
    return link;
  }

  /** GO lien ket. Idempotent: go mot thu khong co khong phai loi. */
  async unlink(kind: CounterpartySubjectKind, subjectId: string, actor: string): Promise<void> {
    const before = await this.repository.findLinkBySubject(kind, subjectId);
    const removed = await this.repository.unlink(kind, subjectId);
    this.telemetry?.decision({
      vocabulary: TRANSPORT_COUNTERPARTY_DECISIONS,
      point: 'counterparty.unlink',
      outcome: 'allowed',
      reason: removed ? 'UNLINK_RECORDED' : 'UNLINK_NOT_LINKED',
      detail: { kind },
    });
    if (!removed) return;
    await this.audit.append({
      actor,
      action: 'transport.counterparty.unlink',
      entityType: 'TransportCounterpartyLink',
      entityId: `${kind}:${subjectId}`,
      before,
      after: null,
    });
  }

  private async require(id: string): Promise<Counterparty> {
    const row = await this.repository.find(id);
    if (!row) throw this.notFound(id);
    return row;
  }

  private async requireTaxCodeFree(taxCode: string | null, selfId: string | null): Promise<void> {
    if (!taxCode) return;
    const holder = await this.repository.findByTaxCode(taxCode);
    if (holder && holder.id !== selfId) {
      throw TransportDomainError.conflict(
        'COUNTERPARTY_TAX_CODE_TAKEN',
        `Ma so thue ${taxCode} da thuoc phap nhan "${holder.name}"`,
      );
    }
  }

  private notFound(id: string): TransportDomainError {
    return TransportDomainError.notFound(
      'COUNTERPARTY_NOT_FOUND',
      `Khong tim thay phap nhan ${id}`,
    );
  }

  private denyLink(
    reason: 'SUBJECT_KIND_UNAVAILABLE' | 'SUBJECT_ALREADY_LINKED' | 'SUBJECT_NOT_FOUND',
    detail: Record<string, unknown>,
    message: string,
  ): TransportDomainError {
    this.telemetry?.decision({
      vocabulary: TRANSPORT_COUNTERPARTY_DECISIONS,
      point: 'counterparty.link',
      outcome: 'denied',
      reason,
      detail,
    });
    return reason === 'SUBJECT_NOT_FOUND'
      ? TransportDomainError.notFound(reason, message)
      : TransportDomainError.conflict(reason, message);
  }
}
