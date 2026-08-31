import { Injectable, Logger } from '@nestjs/common';
import {
  DecisionReconciliationSink,
  type DecisionReconciliationRequest,
} from './decision-criticality.js';

/**
 * Hien thuc MAC DINH cua yeu cau doi soat: mot dong log muc `error` qua `Logger` cua Nest.
 *
 * DUNG DUONG LOG DA CO, khong phat minh duong thu hai: `StructuredNestLogger` da bat moi
 * `new Logger(...)` cua 42 tep va bien no thanh NDJSON kem `traceId` + tenant + release. Viet mot
 * ham ghi rieng o day se tao ra mot dong log KHONG mang nhung truong do.
 *
 * VI SAO KHONG GHI VAO POSTGRES. Cong nay chi duoc goi khi mot phep ghi Postgres VUA TU CHOI. Ghi
 * them mot hang Postgres nua o ngay duong do la lua chon gan nhu chac chan cung that bai — va luc
 * do ta mat CA ban ghi lan yeu cau doi soat, tuc lam dung dieu muc 11 cam.
 *
 * Log co cau truc thi roi khoi tien trinh qua stdout va di sang ClickStack/journald bang mot duong
 * KHONG di qua DB nghiep vu. Do la thu con dung khi DB nghiep vu la thu dang hong.
 *
 * GIOI HAN DA BIET, ghi ra day chu khong che di: mot dong log KHONG phai mot muc viec ben vung.
 * Neu ca duong log cung mat trong cung cua so do thi yeu cau doi soat nay mat theo. Duong di ve
 * sau la mot hien thuc thu hai ghi vao mot kho DOC LAP voi DB nghiep vu (tep tren dia, hang doi
 * ngoai) — va vi cong nay la mot lop truu tuong duoc tiem vao, viec do khong doi sua mot dong nao
 * cua `DecisionLedgerService`.
 */
@Injectable()
export class LoggingDecisionReconciliationSink extends DecisionReconciliationSink {
  private readonly logger = new Logger('DecisionLedgerReconciliation');

  require(request: DecisionReconciliationRequest): void {
    // MOT dong, cac truong deu o dang `khoa=gia tri` de loc duoc bang mot bo loc chuoi tren
    // dashboard. `idempotencyKey` la thu quan trong nhat trong day: no la cach ghi BU dung hang
    // con thieu ma khong ghi trung, vi chinh no la khoa chong trung.
    this.logger.error(
      'decision_ledger.reconciliation_required ' +
        [
          `tenant=${request.tenantId}`,
          `point=${request.decisionPoint}`,
          `reason=${request.reasonCode}`,
          `subject=${request.subjectType}/${request.subjectId}`,
          `criticality=${request.criticality}`,
          `occurredAt=${request.occurredAt.toISOString()}`,
          `idempotencyKey=${request.idempotencyKey}`,
          ...(request.traceId ? [`traceId=${request.traceId}`] : []),
          `cause=${request.cause}`,
        ].join(' '),
    );
  }
}
