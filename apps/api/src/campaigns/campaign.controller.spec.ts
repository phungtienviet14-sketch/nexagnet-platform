import { BadRequestException, ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { CampaignController } from './campaign.controller.js';
import { CampaignLifecycleError, type CampaignService } from './campaign.service.js';

describe('CampaignController', () => {
  it('validates create input at the HTTP boundary', async () => {
    const service = { create: vi.fn() } as unknown as CampaignService;
    const controller = new CampaignController(service);
    expect(() => controller.create({ name: '', targets: [] }, 'sale')).toThrow(BadRequestException);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('requires explicit approval confirmation', () => {
    const service = { approve: vi.fn() } as unknown as CampaignService;
    const controller = new CampaignController(service);
    expect(() => controller.approve('c1', {}, 'manager')).toThrow(BadRequestException);
  });

  it('maps invalid lifecycle transitions to HTTP conflict', async () => {
    const service = {
      schedule: vi.fn(async () => {
        throw new CampaignLifecycleError('INVALID_TRANSITION', 'Campaign phai duoc duyet');
      }),
    } as unknown as CampaignService;
    const controller = new CampaignController(service);
    await expect(
      controller.schedule(
        'c1',
        {
          windowStart: '2026-08-12T01:00:00.000Z',
          windowEnd: '2026-08-12T02:00:00.000Z',
        },
        'sale',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

