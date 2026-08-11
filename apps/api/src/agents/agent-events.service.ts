import { Injectable } from '@nestjs/common';
import type { AgentStreamEvent } from '@netviet/shared';
import { ReplaySubject, type Observable } from 'rxjs';

/**
 * Event bus cho streaming 6 agent real-time.
 * Orchestrator phat su kien -> StreamController day ra SSE /events.
 * `hasSubscribers` de orchestrator chi gian nhip khi CO nguoi xem (khong tre khi rong).
 *
 * Dung ReplaySubject (buffer 300 su kien / 15s) thay Subject: client ket noi/tro lai
 * HOI MUON van nhan duoc cac su kien vua phat -> tranh mat trang thai khi race/reconnect.
 */
@Injectable()
export class AgentEventsService {
  private readonly subject = new ReplaySubject<AgentStreamEvent>(300, 15_000);

  emit(event: AgentStreamEvent): void {
    this.subject.next(event);
  }

  /** Co client SSE nao dang mo khong (rxjs Subject.observed). */
  hasSubscribers(): boolean {
    return this.subject.observed;
  }

  stream(): Observable<AgentStreamEvent> {
    return this.subject.asObservable();
  }
}
