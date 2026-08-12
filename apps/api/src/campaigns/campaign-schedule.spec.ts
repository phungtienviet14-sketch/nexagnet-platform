import { describe, expect, it } from 'vitest';
import { distributeCampaignDeliveries } from './campaign-schedule.js';

describe('distributeCampaignDeliveries', () => {
  it('spreads targets across the complete window instead of sending a burst at start', () => {
    const result = distributeCampaignDeliveries({
      targetIds: ['a', 'b', 'c'],
      windowStart: new Date('2026-08-12T01:00:00.000Z'),
      windowEnd: new Date('2026-08-12T05:00:00.000Z'),
      minSpacingSeconds: 30,
      rateLimitPerMinute: 30,
    });

    expect(result.map((row) => row.scheduledFor.toISOString())).toEqual([
      '2026-08-12T01:00:00.000Z',
      '2026-08-12T03:00:00.000Z',
      '2026-08-12T05:00:00.000Z',
    ]);
  });

  it('fails closed when the requested window cannot satisfy the configured spacing', () => {
    expect(() =>
      distributeCampaignDeliveries({
        targetIds: ['a', 'b', 'c'],
        windowStart: new Date('2026-08-12T01:00:00.000Z'),
        windowEnd: new Date('2026-08-12T01:00:20.000Z'),
        minSpacingSeconds: 30,
        rateLimitPerMinute: 30,
      }),
    ).toThrow(/cua so/i);
  });

  it('uses the stricter of min spacing and rate limit', () => {
    const result = distributeCampaignDeliveries({
      targetIds: ['a', 'b'],
      windowStart: new Date('2026-08-12T01:00:00.000Z'),
      windowEnd: new Date('2026-08-12T01:01:00.000Z'),
      minSpacingSeconds: 1,
      rateLimitPerMinute: 1,
    });
    expect(result[1]?.scheduledFor.toISOString()).toBe('2026-08-12T01:01:00.000Z');
  });
});

