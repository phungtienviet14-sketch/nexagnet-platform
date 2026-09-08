import { Injectable } from '@nestjs/common';
import { MovementService } from '../movement/movement.service.js';
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
 * the write that changes run/leg plan after boss confirms."* Lane L chua nam tren `main`, va `#274`
 * cam mot lane nhap khau code tu worktree cua lane khac.
 *
 * Nen Lane M dinh nghia HINH DANG cua lenh, va gan mot ban hien thuc dung tren `main` da duoc chap
 * nhan. Khi ke hoach cua Lane L len `main`, viec can lam la doi MOT dong binding trong
 * `app-composition.ts` — khong mot dong nghiep vu nao cua Lane M phai sua, va khong mot man hinh
 * nao doi.
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
 * MA VONG CHAY suy TAT DINH tu ma don.
 *
 * ===========================================================================
 * DAY LA CO CHE CHONG LAP, KHONG PHAI MOT QUY UOC DAT TEN.
 *
 * `TransportVehicleRun.code` la `@unique` o tang co so du lieu. Suy ma tu ma don nghia la: hai lan
 * bam den CUNG LUC thi lan thu hai cham vao chinh rang buoc do va nhan `RUN_CODE_TAKEN` — chu
 * khong sinh ra mot vong chay thu hai mot cach im lang.
 *
 * Do la cung mot ky thuat ma `trip-run-projection.ts` dung cho phep chieu chuyen v1
 * (*"chay lai `projectTrip()` khong the sinh ban thu hai"*) va `#267` H3 dung cho lan nhan viec
 * tai dia diem A. Mot phep "doc roi ghi" trong TypeScript co mot khe hep giua hai buoc; mot chi
 * muc unique thi khong.
 */
export const DISPATCH_RUN_CODE_PREFIX = 'RUN-DSP-';
export const dispatchRunCodeForOrder = (orderCode: string): string =>
  `${DISPATCH_RUN_CODE_PREFIX}${orderCode}`;

/**
 * BAN HIEN THUC TREN `main` DA DUOC CHAP NHAN — mot vong chay, mot chang CO TAI.
 *
 * Do dung la hanh vi `ONE_ORDER_PER_RUN` ma `#276 L2` mo ta, va cung la hanh vi ma
 * `MovementService.projectTrip()` da sinh ra tren `main` hom nay. Adapter nay khong PHAT MINH mot
 * ngu nghia nao: no ghep hai lenh da co, da co kiem quyen, da co so kiem toan.
 *
 * CAI NO CO Y KHONG LAM:
 *
 *   · KHONG sinh chang chay rong tu bai xe den diem lay hang. Mot chang rong chi duoc ghi khi
 *     chuyen di do CO THAT (`#274` §4: *"Never fabricate an empty leg only to make a report or
 *     close a run"*). So km rong ma bang de nghi hien la mot UOC LUONG de so sanh cac ung vien —
 *     no khong duoc bien thanh mot hang du lieu van hanh.
 *   · KHONG gom nhieu don vao mot vong chay. Che do `MULTI_ORDER_RUN` thuoc `#276 L3`, va viet mot
 *     ban thu hai o day se de lai hai bo luat gom don trong cung mot he.
 *   · KHONG dong/mo lai vong chay. Vong doi vong chay thuoc Lane L.
 */
@Injectable()
export class MovementDispatchAssignmentPlanner extends DispatchAssignmentPlanner {
  constructor(private readonly movement: MovementService) {
    super();
  }

  async commit(command: DispatchCommitCommand): Promise<DispatchCommitResult> {
    const order = await this.movement.getOrder(command.orderId);
    if (order.status === 'CANCELLED') {
      throw TransportDomainError.conflict(
        'DISPATCH_ORDER_CANCELLED',
        'Nghia vu thuong mai da huy, khong lap ke hoach dieu xe duoc.',
      );
    }

    const existing = await this.findPlannedLeg(command.orderId);
    if (existing) return this.replay(existing, command.vehicleId);

    const code = dispatchRunCodeForOrder(order.code);
    try {
      const run = await this.movement.createRun(
        {
          code,
          vehicleId: command.vehicleId,
          businessDate: order.businessDate,
          note: null,
        },
        command.actor,
      );
      const leg = await this.movement.addLeg(
        run.id,
        {
          sequence: 1,
          kind: 'LOADED',
          orderId: command.orderId,
          originLabel: order.originLabel,
          destinationLabel: order.destinationLabel,
          businessDate: order.businessDate,
          /*
           * `null`, KHONG phai con so uoc luong tu nha cung cap dinh tuyen.
           *
           * `#276 L6`: quang duong THUC TE den tu GPS/dong ho km. `GD-14` giu cot nay la km NHAP
           * TAY, va `NULL` nghia la CHUA BIET chu khong phai 0. Do mot uoc luong ban do vao day se
           * lam moi bao cao km rong sau nay cong mot con so du bao vao mot cot su that.
           */
          distanceKm: null,
          note: null,
        },
        command.actor,
      );
      return { runId: run.id, legId: leg.id, created: true, reason: 'COMMIT_PLANNED' };
    } catch (error) {
      /*
       * HAI LAN BAM DEN CUNG LUC. Lan nay thua o chi muc unique cua ma vong chay; ke hoach ma lan
       * kia vua ghi la ket qua dung, nen doc lai va tra ve chinh no.
       */
      if (error instanceof TransportDomainError && error.reason === 'RUN_CODE_TAKEN') {
        const raced = await this.findPlannedLeg(command.orderId);
        if (raced) return this.replay(raced, command.vehicleId);
      }
      throw error;
    }
  }

  /** Chang CO TAI, chua huy, dang tro toi don nay — neu co thi don da nam tren mot chiec xe. */
  private async findPlannedLeg(
    orderId: string,
  ): Promise<{ runId: string; legId: string; vehicleId: string } | null> {
    const legs = await this.movement.legsOfOrder(orderId);
    const live = legs.find((leg) => leg.kind === 'LOADED' && leg.status !== 'CANCELLED');
    if (!live) return null;
    const detail = await this.movement.getRun(live.runId);
    return { runId: live.runId, legId: live.id, vehicleId: detail.run.vehicleId };
  }

  private replay(
    existing: { runId: string; legId: string; vehicleId: string },
    requestedVehicleId: string,
  ): DispatchCommitResult {
    if (existing.vehicleId !== requestedVehicleId) {
      /*
       * DON DA NAM TREN MOT CHIEC XE KHAC. `#276 L3` cam mot don nam tren hai chang co tai cung
       * luc, va viec chuyen don sang xe khac la mot lan LAP KE HOACH LAI — mot quyet dinh cua
       * Lane L, khong phai mot he qua thau cua mot cu bam trong bang de nghi.
       */
      throw TransportDomainError.conflict(
        'DISPATCH_ORDER_ALREADY_ASSIGNED',
        'Don nay da duoc gan cho mot chiec xe khac.',
      );
    }
    return {
      runId: existing.runId,
      legId: existing.legId,
      created: false,
      reason: 'COMMIT_ALREADY_PLANNED_ON_SAME_VEHICLE',
    };
  }
}
