import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';

export interface HealthStatus {
  status: 'ok';
  uptimeSeconds: number;
}

/** CONG KHAI co chu y: uptime check / load balancer phai do duoc ma khong can giu secret. */
@Public()
@Controller('health')
export class HealthController {
  @Get()
  check(): HealthStatus {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }
}
