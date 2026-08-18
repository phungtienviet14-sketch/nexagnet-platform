import type { CampaignConfig } from '@netviet/tenant';
import { describe, expect, it, vi } from 'vitest';
import type { AuditLogService } from '../audit/audit-log.service.js';
import { ChannelAdapter } from '../channels/channel-adapter.js';
import { CampaignLifecycleError, CampaignService } from './campaign.service.js';
import { InMemoryCampaignRepository } from './campaign.repository.js';

class TestChannel extends ChannelAdapter {
  readonly name = 'test';
  readonly sent: Array<{ chatId: string; text: string }> = [];
  fail = false;
  async sendMessage(chatId: string, text: string) {
    if (this.fail) throw new Error('429');
    this.sent.push({ chatId, text });
    return {};
  }
}

const POLICY: CampaignConfig = {
  defaultWindow: { start: '08:00', end: '12:00' },
  minSpacingSeconds: 30,
  maxTargets: 500,
  rateLimitPerMinute: 30,
  claimLeaseSeconds: 60,
  tickIntervalSeconds: 10,
  retry: { maxAttempts: 2, baseBackoffSeconds: 60 },
  features: { lunarCalendarEnabled: false },
};

function fixture() {
  const repository = new InMemoryCampaignRepository();
  const channel = new TestChannel();
  const audit = { append: vi.fn(async () => undefined) } as unknown as AuditLogService;
  const service = new CampaignService(repository, channel, audit, POLICY, 'worker-test');
  return { repository, channel, audit, service };
}

const DRAFT = {
  name: 'Cham soc thang 8',
  content: 'Chuc quy dai ly mot ngay tot lanh',
  kind: 'one_off' as const,
  targets: [
    { chatId: 'group-a', displayName: 'A', metadata: {} },
    { chatId: 'group-b', displayName: 'B', metadata: {} },
  ],
  metadata: {},
};

describe('CampaignService', () => {
  it('requires approval before scheduling and persists an evenly distributed delivery ledger', async () => {
    const { service } = fixture();
    const draft = await service.create(DRAFT, 'sale');

    await expect(
      service.schedule(
        draft.id,
        { windowStart: '2026-08-12T01:00:00.000Z', windowEnd: '2026-08-12T02:00:00.000Z' },
        'sale',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });

    await service.approve(draft.id, 'manager');
    const scheduled = await service.schedule(
      draft.id,
      { windowStart: '2026-08-12T01:00:00.000Z', windowEnd: '2026-08-12T02:00:00.000Z' },
      'sale',
    );
    expect(scheduled.status).toBe('scheduled');
    expect(scheduled.deliveries.map((row) => row.scheduledFor)).toEqual([
      '2026-08-12T01:00:00.000Z',
      '2026-08-12T02:00:00.000Z',
    ]);
  });

  it('claims due work once and completes without replaying the whole campaign after restart', async () => {
    const { repository, channel, audit, service } = fixture();
    const draft = await service.create({ ...DRAFT, targets: [DRAFT.targets[0]!] }, 'sale');
    await service.approve(draft.id, 'manager');
    await service.schedule(
      draft.id,
      { windowStart: '2026-08-12T01:00:00.000Z', windowEnd: '2026-08-12T02:00:00.000Z' },
      'sale',
    );

    await service.tick(new Date('2026-08-12T01:00:01.000Z'));
    expect(channel.sent).toHaveLength(1);
    expect((await service.get(draft.id)).status).toBe('completed');

    const restarted = new CampaignService(repository, channel, audit, POLICY, 'worker-restarted');
    await restarted.tick(new Date('2026-08-12T01:10:00.000Z'));
    expect(channel.sent).toHaveLength(1);
  });

  it('does not let a second worker claim an active lease, but reclaims it after expiry', async () => {
    const repository = new InMemoryCampaignRepository();
    const draft = await repository.create({ ...DRAFT, targets: [DRAFT.targets[0]!] });
    await repository.approve(draft.id, 'manager', new Date('2026-08-12T00:00:00.000Z'));
    const approved = await repository.find(draft.id);
    await repository.schedule(
      draft.id,
      new Date('2026-08-12T01:00:00.000Z'),
      new Date('2026-08-12T02:00:00.000Z'),
      [{ targetId: approved!.targets[0]!.id, scheduledFor: new Date('2026-08-12T01:00:00.000Z') }],
      new Date('2026-08-12T00:01:00.000Z'),
    );
    expect(await repository.claimDue('worker-a', new Date('2026-08-12T01:00:01.000Z'), 60, 10, 30))
      .toHaveLength(1);
    expect(await repository.claimDue('worker-b', new Date('2026-08-12T01:00:30.000Z'), 60, 10, 30))
      .toHaveLength(0);
    const reclaimed = await repository.claimDue(
      'worker-b',
      new Date('2026-08-12T01:01:02.000Z'),
      60,
      10,
      30,
    );
    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0]?.attempts).toBe(2);
  });

  it('retries with persisted backoff, then becomes partially_failed at max attempts', async () => {
    const { channel, service } = fixture();
    channel.fail = true;
    const draft = await service.create({ ...DRAFT, targets: [DRAFT.targets[0]!] }, 'sale');
    await service.approve(draft.id, 'manager');
    await service.schedule(
      draft.id,
      { windowStart: '2026-08-12T01:00:00.000Z', windowEnd: '2026-08-12T02:00:00.000Z' },
      'sale',
    );

    await service.tick(new Date('2026-08-12T01:00:01.000Z'));
    let campaign = await service.get(draft.id);
    expect(campaign.deliveries[0]).toMatchObject({ status: 'pending', attempts: 1, lastError: '429' });

    await service.tick(new Date('2026-08-12T01:01:02.000Z'));
    campaign = await service.get(draft.id);
    expect(campaign.status).toBe('partially_failed');
    expect(campaign.deliveries[0]).toMatchObject({ status: 'failed', attempts: 2 });
  });

  it('cancels pending delivery and rejects duplicate target ids', async () => {
    const { channel, service } = fixture();
    await expect(
      service.create({ ...DRAFT, targets: [DRAFT.targets[0]!, DRAFT.targets[0]!] }, 'sale'),
    ).rejects.toBeInstanceOf(CampaignLifecycleError);

    const draft = await service.create({ ...DRAFT, targets: [DRAFT.targets[0]!] }, 'sale');
    await service.approve(draft.id, 'manager');
    await service.schedule(
      draft.id,
      { windowStart: '2026-08-12T01:00:00.000Z', windowEnd: '2026-08-12T02:00:00.000Z' },
      'sale',
    );
    expect((await service.cancel(draft.id, 'manager')).status).toBe('cancelled');
    await service.tick(new Date('2026-08-12T01:30:00.000Z'));
    expect(channel.sent).toHaveLength(0);
  });
});
