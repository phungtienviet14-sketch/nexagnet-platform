import { describe, expect, it } from 'vitest';
import { materializeOccurrencePlans, planCampaignOccurrences } from './campaign-occurrence.js';

describe('campaign occurrence planner', () => {
  it('plans recurring windows deterministically from an RFC5545 rule', () => {
    const plans = planCampaignOccurrences(
      {
        type: 'recurring',
        timezone: 'Asia/Ho_Chi_Minh',
        startDate: '2026-08-10',
        rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=3',
        windowStart: '08:00',
        windowEnd: '12:00',
      },
      [{ id: 'target-a', metadata: {} }],
      '2026-08-01',
      '2026-09-01',
    );
    expect(plans.map((plan) => [plan.key, plan.windowStart.toISOString()])).toEqual([
      ['2026-08-10', '2026-08-10T01:00:00.000Z'],
      ['2026-08-17', '2026-08-17T01:00:00.000Z'],
      ['2026-08-24', '2026-08-24T01:00:00.000Z'],
    ]);
  });

  it('keeps a fixed local window across a DST boundary', () => {
    const plans = planCampaignOccurrences(
      {
        type: 'recurring',
        timezone: 'Europe/Paris',
        startDate: '2026-03-28',
        rrule: 'FREQ=DAILY;COUNT=3',
        windowStart: '08:00',
        windowEnd: '09:00',
      },
      [{ id: 'target-a', metadata: {} }],
      '2026-03-28',
      '2026-03-30',
    );
    expect(plans.map((plan) => plan.windowStart.toISOString())).toEqual([
      '2026-03-28T07:00:00.000Z',
      '2026-03-29T06:00:00.000Z',
      '2026-03-30T06:00:00.000Z',
    ]);
  });

  it('plans birthday deliveries only for targets with valid operator-provided birthdays', () => {
    const plans = planCampaignOccurrences(
      {
        type: 'birthday',
        timezone: 'Asia/Ho_Chi_Minh',
        windowStart: '09:00',
        windowEnd: '11:00',
      },
      [
        { id: 'a', metadata: { birthday: '1990-08-12' } },
        { id: 'b', metadata: { birthday: '08-12' } },
        { id: 'missing', metadata: {} },
      ],
      '2026-08-01',
      '2026-08-31',
    );
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ key: '2026-08-12', targetIds: ['a', 'b'] });
  });

  it('materializes idempotently and rejects lunar planning without an enabled provider', () => {
    const plans = [{
      key: '2026-08-12',
      targetIds: ['a'],
      windowStart: new Date('2026-08-12T01:00:00.000Z'),
      windowEnd: new Date('2026-08-12T05:00:00.000Z'),
    }];
    expect(materializeOccurrencePlans(plans, new Set(['2026-08-12']))).toEqual([]);
    expect(() => planCampaignOccurrences(
      {
        type: 'lunar_full_moon',
        timezone: 'Asia/Ho_Chi_Minh',
        windowStart: '08:00',
        windowEnd: '12:00',
      },
      [],
      '2026-08-01',
      '2026-08-31',
    )).toThrow(/lunar/i);
  });
});

