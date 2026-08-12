import { Controller, Sse } from '@nestjs/common';
import type { AgentStreamEvent } from '@netviet/shared';
import { map, type Observable } from 'rxjs';
import { AgentEventsService } from '../agents/agent-events.service.js';
import { Roles } from '../auth/roles.decorator.js';

/** Tin nhan SSE — Nest serialize `data` (object) thanh JSON; client JSON.parse. */
interface StreamMessage {
  data: AgentStreamEvent;
}

/**
 * Kenh SSE toan cuc /events — day su kien 6 agent real-time (order.created ->
 * agent.progress -> order.finalized/updated). Mo san khi vao app (tranh race voi POST).
 */
@Roles('SALE', 'MANAGER', 'ACCOUNTING', 'ADMIN')
@Controller()
export class StreamController {
  constructor(private readonly events: AgentEventsService) {}

  @Sse('events')
  stream(): Observable<StreamMessage> {
    return this.events.stream().pipe(map((event) => ({ data: event })));
  }
}
