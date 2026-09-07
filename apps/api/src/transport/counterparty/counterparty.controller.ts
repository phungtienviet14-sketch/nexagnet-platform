import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { z } from 'zod';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { transportActorOf } from '../transport-actor.js';
import { firstIssue } from '../transport.schemas.js';
import {
  counterpartySubjectKindSchema,
  createCounterpartySchema,
  linkSubjectSchema,
  updateCounterpartySchema,
} from './counterparty.schemas.js';
import { CounterpartyService } from './counterparty.service.js';

/**
 * Xuong song danh tinh doi tac qua HTTP.
 *
 * Cung khuon hai lop quyen nhu `FleetController`: `@Roles` la cong as-built cua nen tang (thu ma
 * `roles-coverage.spec.ts` duyet), `@RequiresTransportAction` la cong cua mien.
 */
@Controller('transport/counterparties')
@UseGuards(TransportActionGuard)
export class CounterpartyController {
  constructor(private readonly counterparties: CounterpartyService) {}

  @Get()
  @RequiresTransportAction('transport.counterparty.read')
  list() {
    return this.counterparties.list();
  }

  @Get(':id')
  @RequiresTransportAction('transport.counterparty.read')
  get(@Param('id') id: string) {
    return this.guard(() => this.counterparties.get(id));
  }

  @Post()
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.counterparty.manage')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(createCounterpartySchema, body);
    return this.guard(() => this.counterparties.create(input, transportActorOf(request)));
  }

  @Patch(':id')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.counterparty.manage')
  update(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const patch = this.parse(updateCounterpartySchema, body);
    return this.guard(() => this.counterparties.update(id, patch, transportActorOf(request)));
  }

  @Post(':id/links')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.counterparty.manage')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  link(@Param('id') id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(linkSubjectSchema, body);
    return this.guard(() =>
      this.counterparties.link(id, input.kind, input.subjectId, transportActorOf(request)),
    );
  }

  /**
   * GO lien ket. Khoa nam o `(kind, subjectId)` chu khong o phap nhan — nen duong nay khong nhan
   * `:id`, va khong the go nham lien ket cua mot phap nhan khac vi khong co cach nao chi sai.
   */
  @Delete('links/:kind/:subjectId')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.counterparty.manage')
  unlink(
    @Param('kind') kind: string,
    @Param('subjectId') subjectId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const parsedKind = this.parse(counterpartySubjectKindSchema, kind);
    return this.guard(async () => {
      await this.counterparties.unlink(parsedKind, subjectId, transportActorOf(request));
      return { removed: true };
    });
  }

  /* --------------------------- Noi bo --------------------------- */

  private parse<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));
    return parsed.data as z.infer<S>;
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
