import { Injectable } from '@nestjs/common';
import { AcceptanceActorFacts, acceptanceActorView } from './acceptance-actor.js';
import type {
  AcceptanceActorView,
  CommercialAcceptanceDetail,
  CommercialAcceptanceDetailView,
  CommercialAcceptanceQueueRow,
  CommercialAcceptanceQueueRowView,
} from './acceptance.types.js';

/**
 * HINH CHIEU DOC cua ket thuc don — thu be mat nguoi quyet nhan duoc (`#334`).
 *
 * ============================================================================================
 * TACH KHOI `CommercialAcceptanceService`, VA DO LA CO Y
 * ============================================================================================
 *
 * Dich vu giu luat: thu tu kiem, phat lai theo `idempotencyKey`, ai duoc ghi gi. Lop nay chi THEM
 * nhan cho con nguoi doc vao ket qua dich vu da tra — no khong doc lai ho so, khong goi mot luat
 * nao, va khong co mot duong ghi nao. Mot lan sua o day vi vay khong the doi quyen hay doi hanh vi
 * chong ghi trung, du vo tinh.
 *
 * Moi truong cua dich vu di NGUYEN VEN (`decidedBy`, `latestDecidedBy` van la ma tho); nhan nam o
 * mot truong RIENG. Ben kiem toan doc ma, man hinh doc nhan.
 */
@Injectable()
export class CommercialAcceptanceReadModel {
  constructor(private readonly actors: AcceptanceActorFacts) {}

  async detail(detail: CommercialAcceptanceDetail): Promise<CommercialAcceptanceDetailView> {
    const actorOf = await this.resolver(detail.decisions.map((entry) => entry.decidedBy));
    return {
      acceptance: detail.acceptance,
      decisions: detail.decisions.map((entry) => ({
        ...entry,
        decidedByActor: actorOf(entry.decidedBy),
      })),
    };
  }

  async queue(
    rows: readonly CommercialAcceptanceQueueRow[],
  ): Promise<readonly CommercialAcceptanceQueueRowView[]> {
    const actorOf = await this.resolver(
      rows.flatMap((row) => (row.latestDecidedBy === null ? [] : [row.latestDecidedBy])),
    );
    return rows.map((row) => ({
      ...row,
      latestDecidedByActor: row.latestDecidedBy === null ? null : actorOf(row.latestDecidedBy),
    }));
  }

  /** MOT lan doc nguon tai khoan cho ca lo, roi tra loi tung ma tu bo nho. */
  private async resolver(ids: readonly string[]): Promise<(id: string) => AcceptanceActorView> {
    const accounts = new Map(
      (await this.actors.accountsFor(ids)).map((account) => [account.id, account]),
    );
    return (id) => acceptanceActorView(id, accounts.get(id));
  }
}
