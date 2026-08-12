import { describe, expect, it } from 'vitest';
import { createCampaignSchema, scheduleCampaignSchema } from './campaign.js';

describe('campaign contracts', () => {
  it('requires at least one explicit target and rejects unknown fields', () => {
    expect(createCampaignSchema.safeParse({ name: 'CSKH', content: 'Xin chao', targets: [] }).success)
      .toBe(false);
    expect(
      createCampaignSchema.safeParse({
        name: 'CSKH',
        content: 'Xin chao',
        targets: [{ chatId: 'zalo-1', metadata: {} }],
        metadata: {},
        surprise: true,
      }).success,
    ).toBe(false);
  });

  it('requires a valid ascending scheduling window', () => {
    expect(
      scheduleCampaignSchema.safeParse({
        windowStart: '2026-08-12T10:00:00+07:00',
        windowEnd: '2026-08-12T09:00:00+07:00',
      }).success,
    ).toBe(false);
  });

  it('does not invent recurrence metadata for birthday or lunar campaigns', () => {
    expect(
      createCampaignSchema.safeParse({
        name: 'Sinh nhat',
        content: 'Chuc mung',
        kind: 'birthday',
        targets: [{ chatId: 'group-1', metadata: {} }],
        metadata: {},
      }).success,
    ).toBe(false);
  });

  it('accepts typed birthday recurrence and rejects arbitrary recurrence JSON', () => {
    const base = {
      name: 'Sinh nhat',
      content: 'Chuc mung',
      kind: 'birthday',
      targets: [{ chatId: 'group-1', metadata: {} }],
      metadata: {},
    };
    expect(createCampaignSchema.safeParse({ ...base, recurrence: { timezone: 'Asia/Ho_Chi_Minh' } }).success).toBe(false);
    expect(createCampaignSchema.safeParse({
      ...base,
      recurrence: {
        type: 'birthday',
        timezone: 'Asia/Ho_Chi_Minh',
        windowStart: '08:00',
        windowEnd: '12:00',
      },
    }).success).toBe(true);
  });
});
