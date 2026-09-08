import { Injectable } from '@nestjs/common';
import { PlanningService } from '../planning/planning.service.js';
import { TransportDomainError } from '../transport.errors.js';
import type { DispatchCommitReason } from './dispatch-decisions.js';

/**
 * CONG GHI DUY NHAT CUA LANE M — va no chi mo sau khi mot con nguoi bam xac nhan (`#277 M9`).
 *
 * ===========================================================================
 * DE NGHI ⟂ PHAN CONG
 *
 * `#274` va `#277` deu viet cung mot cau bang hai cach: *"The system recommends; boss chooses"*,
 * *"recommendation != assignment"*. Ca tang de nghi (`DispatchService.suggest`) khong co MOT ham
 * ghi nao trong tam voi — cac cong `dispatch-facts.port.ts` deu chi doc. Cho ghi la day, va chi o
 * day.
 *
 * ===========================================================================
 * VI SAO LA MOT CONG CHU KHONG PHAI MOT LOI GOI THANG
 *
 * `#274` giao QUYEN LAP KE HOACH cho Lane L: *"Lane M chooses/recommends candidate vehicle; L owns
 * the write that changes run/leg plan after boss confirms."*
 *
 * Lane L (#276) DA len `main` (`41e9bbe`), nen cong nay noi thang vao `PlanningService` cua no.
 * Ban hien thuc tam thoi dung tren `MovementService` — von dung lai hanh vi `ONE_ORDER_PER_RUN`
 * co san — DA BI GO: giu lai se de trong he mot duong ghi vong chay THU HAI voi bo luat gom don
 * rieng, dung cai ma `#276 L3` va `#274` (*"unresolved semantic overlap"*) cam.
 *
 * Cai Lane M giu lai la HINH DANG cua lenh. Lop tren (`DispatchService`) khong biet Lane L ton
 * tai, va mot ban hien thuc khac chi la mot dong binding trong `app-composition.ts`.
 */

export interface DispatchCommitCommand {
  readonly orderId: string;
  readonly vehicleId: string;
  readonly actor: string;
}

export interface DispatchCommitResult {
  readonly runId: string;
  readonly legId: string;
  /** `false` khi lan bam nay KHONG ghi gi vi ke hoach da ton tai — xem `M15` muc 10. */
  readonly created: boolean;
  readonly reason: DispatchCommitReason;
}

export abstract class DispatchAssignmentPlanner {
  abstract commit(command: DispatchCommitCommand): Promise<DispatchCommitResult>;
}

/**
 * KHOA CHONG LAP suy TAT DINH tu (don, xe).
 *
 * `PlanningService.commit()` nhan mot `idempotencyKey` do NGUOI GOI dat, va tra lai nguyen ket qua
 * cu khi cung khoa. Suy khoa thay vi sinh ngau nhien la thu bien "bam hai lan" thanh mot phep
 * DOC: hai lan bam cua cung mot nguoi tren cung mot dong bang de nghi cho ra cung mot khoa, nen
 * lan thu hai doc lai ke hoach cu thay vi ghi ban thu hai.
 *
 * Co ca `vehicleId` trong khoa, va do la co y: doi xe la mot QUYET DINH KHAC, khong phai mot lan
 * gui lai. Neu don da co ke hoach tren mot chiec xe khac, Lane L tu choi bang
 * `PLAN_ORDER_ALREADY_PLANNED` — dung cau tra loi, va no den tu ben so huu luat gom don.
 */
export const dispatchIdempotencyKey = (orderId: string, vehicleId: string): string =>
  `dispatch:${orderId}:${vehicleId}`;

/**
 * BAN HIEN THUC DANG CHAY — chuyen thang cho bo lap ke hoach cua Lane L (#276).
 *
 * Lop nay CO Y mong: no khong quyet dinh gom don, khong sinh chang rong, khong dong vong chay va
 * khong biet bai xe o dau. Moi thu do thuoc `PlanningService`, va viet lai mot ban thu hai o day
 * se de lai hai bo luat cho cung mot cau hoi.
 *
 * Viec DUY NHAT no lam la doi tu vung: `RunPlanCommitResult` cua Lane L -> `DispatchCommitResult`
 * cua Lane M, va tim ra chang CO TAI dang mang don vua duoc lap ke hoach.
 */
@Injectable()
export class PlanningDispatchAssignmentPlanner extends DispatchAssignmentPlanner {
  constructor(private readonly planning: PlanningService) {
    super();
  }

  async commit(command: DispatchCommitCommand): Promise<DispatchCommitResult> {
    const result = await this.planning.commit(
      command.orderId,
      {
        vehicleId: command.vehicleId,
        idempotencyKey: dispatchIdempotencyKey(command.orderId, command.vehicleId),
      },
      command.actor,
    );

    const loaded = result.legs.find(
      (leg) => leg.kind === 'LOADED' && leg.orderId === command.orderId,
    );
    if (!loaded) {
      /*
       * KHONG THE xay ra: Lane L da tu chan truong hop nay bang `PLAN_LOADED_LEG_MISSING`. Ma o
       * day ton tai de mot thay doi tuong lai o ben do LAM DO mot cach on ao, thay vi de Lane M
       * tra ve mot `legId` rong ma man hinh se hien nhu mot ke hoach binh thuong.
       */
      throw TransportDomainError.conflict(
        'DISPATCH_ORDER_ALREADY_ASSIGNED',
        'Ke hoach vua ghi khong mang chang co hang cua don nay.',
      );
    }

    return {
      runId: result.run.id,
      legId: loaded.id,
      // `replayed` cua Lane L LA cau tra loi cho `M15` muc 10 — bam lai khong ghi them gi.
      created: !result.replayed,
      reason: result.replayed ? 'COMMIT_ALREADY_PLANNED_ON_SAME_VEHICLE' : 'COMMIT_PLANNED',
    };
  }
}
