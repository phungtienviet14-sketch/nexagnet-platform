import { Injectable } from '@nestjs/common';
import type { RunClosureBlocker } from '../planning/planning.types.js';
import { RunClosureBlockerSource } from '../planning/run-closure-blocker.source.js';
import { WaitingSessionRepository } from './waiting.repository.js';

/**
 * PHIEN CHO DANG MO — nguon su that that cho `OPEN_WAITING_SESSION` (`#293` R4).
 *
 * ============================================================================================
 * CHO NAY TRUOC DAY LA MOT LOI HUA
 * ============================================================================================
 *
 * `OPEN_WAITING_SESSION` da co trong `RunClosureBlocker` tu `#276` L4, nhung cho toi truoc lane
 * nay khong mot duong chay nao sinh ra no: bang phien cho thuoc `#279` Lane O va chua vao `main`.
 * Ma chan do ton tai duy nhat trong bo test. Tep nay la cho no duoc noi vao su that.
 *
 * ============================================================================================
 * DOC, VA CHI DOC — TREN BANG CUA LANE O, KHONG PHAI MOT BAN SAO
 * ============================================================================================
 *
 * Khong mot bang moi, khong mot cot trang thai moi, khong mot phep suy nao ve "the nao la dang
 * cho". `#279` O5 da dat dinh nghia do: mot phien `OPEN` la mot phien chua co `endedAt`, va chi
 * hai duong dong duoc no (`RECEIVER_ACCEPTED`, `OPERATOR_CLOSED`). Lane nay KHONG duoc co y kien
 * thu hai ve dieu do — no hoi, va no chuyen cau tra loi di.
 *
 * Mot ban sao o day se la cau tra loi THU HAI cho cung mot cau hoi, va lan lech dau tien se lam
 * bang dieu hanh va phan xu dong vong chay noi hai dieu khac nhau ve cung mot chang.
 *
 * ============================================================================================
 * KHONG CO PHIEN NAO THI KHONG CO MA NAO — va do KHONG phai fail-open
 * ============================================================================================
 *
 * Cung ly le da ghi o `checkpoint-run-closure-blocker.source.ts`: phan lon cac lan giao khong he
 * phai cho, nen `[]` o day la cau tra loi THUONG GAP va no la mot su that — *"da hoi, khong phien
 * nao dang mo"*. Cai KHONG duoc phep la nuot mot su co thanh `[]`: lan doc duoi day nem thang ra
 * ngoai, va `collectBlockers()` doi no thanh `EXTERNAL_BLOCKER_SOURCE_UNAVAILABLE` — vong chay
 * dung lai thay vi dong bua.
 *
 * ============================================================================================
 * VI SAO KHONG PHAI MOT `countOpenForRun()` MOI O KHO
 * ============================================================================================
 *
 * `listForRun()` da co san va da duoc `#290` duyet. Them mot phuong thuc dem chi de tiet mot vong
 * lap tren mot tap co kich thuoc bang so lan cho cua MOT vong chay — thuong la 0, nhieu lam la
 * vai — se la mot be mat kho moi phai nuoi, cho mot khoan loi khong do duoc.
 */
@Injectable()
export class WaitingRunClosureBlockerSource extends RunClosureBlockerSource {
  constructor(private readonly sessions: WaitingSessionRepository) {
    super();
  }

  async blockersForRun(runId: string): Promise<readonly RunClosureBlocker[]> {
    // Nem o day la CO Y — xem chu thich tren.
    const sessions = await this.sessions.listForRun(runId);
    return sessions.some((session) => session.status === 'OPEN') ? ['OPEN_WAITING_SESSION'] : [];
  }
}
