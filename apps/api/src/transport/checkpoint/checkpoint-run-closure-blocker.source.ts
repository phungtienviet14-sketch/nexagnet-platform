import { Injectable } from '@nestjs/common';
import { RunClosureBlockerSource } from '../planning/run-closure-blocker.source.js';
import type { RunClosureBlocker } from '../planning/planning.types.js';
import { CheckpointService } from './checkpoint.service.js';
import type { RunLegPhase } from './run-timeline.js';

/**
 * HANG TREN THUNG — nguon su that that cho `CARGO_STILL_CARRIED` (`#293` R4).
 *
 * ============================================================================================
 * SU THAT NAY DEN TU DAU
 * ============================================================================================
 *
 * Khong phai tu mot cot trang thai moi, va khong phai tu mot bang moi. No den tu MOT PHEP CHIEU da
 * duoc chap nhan: `buildRunTimeline()` cua `#243` F6 suy giai doan cua tung chang tu chinh chuoi moc
 * van hanh. Hai giai doan trong do noi dung cau tra loi:
 *
 *   · `LOADING`    — da boc hang len thung, chua roi diem lay;
 *   · `IN_TRANSIT` — da roi diem lay, chua toi diem giao;
 *   · `ARRIVED`    — da toi diem giao, CHUA nguoi nhan ky.
 *
 * Ba giai doan do deu la *"hang dang nam tren thung"*. `DELIVERED` thi khong. `AT_PICKUP` va
 * `PLANNED` cung khong — chua boc hang len thi khong co gi trong thung ca.
 *
 * ============================================================================================
 * VI SAO KHONG SUY TU `TransportRunLeg.status`
 * ============================================================================================
 *
 * `leg.status === 'IN_TRANSIT'` da la `LEG_STILL_OPEN`, va ma do da co nguon. Cai ma cho nay tra loi
 * la mot cau KHAC: *"so ghi hien truong noi hang chua duoc giao"* — ke ca khi vong chay da dong
 * chang lai. Hai su that khac nhau, va gop chung lai se lam mat kha nang phat hien dung cai lech
 * giua so ghi hien truong va mo hinh vong chay.
 *
 * ============================================================================================
 * KHONG CO MOC NAO THI KHONG CO MA NAO — va do KHONG phai fail-open
 * ============================================================================================
 *
 * Mot vong chay chua co moc nao (khach khong bat `transport-checkpoint`, hoac doi xe khong ghi moc)
 * tra ve `[]`. Do khong phai mot phep doan rang thung rong: khong co `LOADING` thi khong co su that
 * nao noi hang da len xe, va bia ra mot su that chua bao gio duoc ghi la dung thu ma lane nay cam.
 * Noi cach khac — cong nay CHI THEM vao danh sach chan, khong bao gio lay bot; mot su co cua no
 * lam vong chay dung lai (xem `collectBlockers`), chu khong lam no chay tiep.
 */
@Injectable()
export class CheckpointRunClosureBlockerSource extends RunClosureBlockerSource {
  constructor(private readonly checkpoints: CheckpointService) {
    super();
  }

  async blockersForRun(runId: string): Promise<readonly RunClosureBlocker[]> {
    // Nem o day la CO Y: `collectBlockers()` bien mot nguon hong thanh
    // `EXTERNAL_BLOCKER_SOURCE_UNAVAILABLE` va vong chay dung lai. Nuot loi o trong nay se bien
    // "khong doc duoc so ghi hien truong" thanh "so ghi hien truong khong chan gi".
    const timeline = await this.checkpoints.timelineForRun(runId);

    for (const phase of Object.values(timeline.legPhases)) {
      if (isCarryingCargo(phase)) return ['CARGO_STILL_CARRIED'];
    }
    return [];
  }
}

/**
 * Ba giai doan nghia la hang DANG NAM TREN THUNG. Mot danh sach dong, va no duoc viet ra day thay
 * vi rai mot phep so sanh `===` o trong vong lap: mot giai doan moi them vao `RUN_LEG_PHASES` se
 * khong tu dong roi vao nhom "khong cho hang" hay "dang cho hang" — nguoi viet phai tra loi cau hoi
 * do, va trinh bien dich se khong cho bo qua.
 */
const CARGO_ON_BOARD: ReadonlySet<RunLegPhase> = new Set<RunLegPhase>([
  'LOADING',
  'IN_TRANSIT',
  'ARRIVED',
]);

const isCarryingCargo = (phase: RunLegPhase): boolean => CARGO_ON_BOARD.has(phase);
