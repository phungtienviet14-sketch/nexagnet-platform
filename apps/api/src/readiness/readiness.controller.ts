import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator.js';
import { ReadinessService } from './readiness.service.js';
import type { OperationalReadinessResult } from './operational-readiness.js';

/**
 * Man "San sang van hanh" (§12 gd1-ultty). Nam duoi `/settings` de dung chung mot khu quyen
 * voi cac tab van hanh khac.
 */
@Roles('SALE', 'MANAGER', 'ACCOUNTING', 'ADMIN')
@Controller('settings')
export class ReadinessController {
  constructor(private readonly readiness: ReadinessService) {}

  @Get('readiness')
  async get(): Promise<OperationalReadinessResult> {
    return this.readiness.evaluate();
  }
}
