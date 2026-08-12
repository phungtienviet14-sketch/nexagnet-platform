import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  approveCampaignSchema,
  cancelCampaignSchema,
  createCampaignSchema,
  retryCampaignSchema,
  scheduleCampaignSchema,
} from '@netviet/shared';
import { Roles } from '../auth/roles.decorator.js';
import { CampaignLifecycleError, CampaignService } from './campaign.service.js';

@Controller('campaigns')
export class CampaignController {
  constructor(private readonly campaigns: CampaignService) {}

  @Get()
  list() {
    return this.campaigns.list();
  }

  @Get('policy')
  policy() {
    return this.campaigns.policySummary();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.rethrow(() => this.campaigns.get(id));
  }

  @Post()
  @Roles('SALE', 'MANAGER', 'ADMIN')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(@Body() body: unknown, @Headers('x-actor') actor = 'operator') {
    const parsed = createCampaignSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(issueMessage(parsed.error.issues));
    return this.rethrow(() => this.campaigns.create(parsed.data, actorName(actor)));
  }

  @Post(':id/approve')
  @Roles('MANAGER', 'ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  approve(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('x-actor') actor = 'operator',
  ) {
    if (!approveCampaignSchema.safeParse(body).success) {
      throw new BadRequestException('Phai xac nhan duyet campaign');
    }
    return this.rethrow(() => this.campaigns.approve(id, actorName(actor)));
  }

  @Post(':id/schedule')
  @Roles('MANAGER', 'ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  schedule(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('x-actor') actor = 'operator',
  ) {
    const parsed = scheduleCampaignSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(issueMessage(parsed.error.issues));
    return this.rethrow(() => this.campaigns.schedule(id, parsed.data, actorName(actor)));
  }

  @Post(':id/retry-failed')
  @Roles('MANAGER', 'ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  retryFailed(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('x-actor') actor = 'operator',
  ) {
    if (!retryCampaignSchema.safeParse(body).success) {
      throw new BadRequestException('Phai xac nhan chi retry delivery that bai');
    }
    return this.rethrow(() => this.campaigns.retryFailed(id, actorName(actor)));
  }

  @Post(':id/cancel')
  @Roles('MANAGER', 'ADMIN')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  cancel(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('x-actor') actor = 'operator',
  ) {
    if (!cancelCampaignSchema.safeParse(body).success) {
      throw new BadRequestException('Phai xac nhan huy campaign');
    }
    return this.rethrow(() => this.campaigns.cancel(id, actorName(actor)));
  }

  private async rethrow<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof CampaignLifecycleError)) throw error;
      if (error.code === 'NOT_FOUND') throw new NotFoundException(error.message);
      if (error.code === 'INVALID_TRANSITION') throw new ConflictException(error.message);
      throw new BadRequestException(error.message);
    }
  }
}

function actorName(value: string): string {
  const actor = value.trim().slice(0, 200);
  return actor || 'operator';
}

function issueMessage(issues: readonly { message: string }[]): string {
  return issues.map((issue) => issue.message).join(', ');
}
