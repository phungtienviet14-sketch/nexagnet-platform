import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../config/prisma.service.js';
import { PrismaCampaignRepository } from './prisma-campaign.repository.js';

describe.runIf(process.env.RUN_PRISMA_IT === '1')('PrismaCampaignRepository (Postgres THAT)', () => {
  const prisma = new PrismaService();
  const firstWorkerRepo = new PrismaCampaignRepository(prisma);
  const secondWorkerRepo = new PrismaCampaignRepository(prisma);
  let campaignId: string;

  beforeAll(async () => {
    await prisma.campaign.deleteMany({ where: { name: 'IT durable campaign' } });
  });

  afterAll(async () => {
    await prisma.campaign.deleteMany({ where: { name: 'IT durable campaign' } });
    await prisma.$disconnect();
  });

  it('persists lifecycle and uses leases to survive process restart without concurrent claim', async () => {
    const draft = await firstWorkerRepo.create({
      name: 'IT durable campaign',
      content: 'Noi dung IT',
      kind: 'one_off',
      targets: [{ chatId: 'it-group', metadata: {} }],
      metadata: {},
    });
    campaignId = draft.id;
    await firstWorkerRepo.approve(draft.id, 'manager', new Date('2026-08-12T00:00:00.000Z'));
    const approved = await firstWorkerRepo.find(draft.id);
    await firstWorkerRepo.schedule(
      draft.id,
      new Date('2026-08-12T01:00:00.000Z'),
      new Date('2026-08-12T02:00:00.000Z'),
      [{ targetId: approved!.targets[0]!.id, scheduledFor: new Date('2026-08-12T01:00:00.000Z') }],
      new Date('2026-08-12T00:01:00.000Z'),
    );

    const firstClaim = await firstWorkerRepo.claimDue(
      'worker-a',
      new Date('2026-08-12T01:00:01.000Z'),
      60,
      10,
      30,
    );
    expect(firstClaim).toHaveLength(1);
    await expect(
      secondWorkerRepo.claimDue('worker-b', new Date('2026-08-12T01:00:30.000Z'), 60, 10, 30),
    ).resolves.toHaveLength(0);

    const reclaimed = await secondWorkerRepo.claimDue(
      'worker-b',
      new Date('2026-08-12T01:01:02.000Z'),
      60,
      10,
      30,
    );
    expect(reclaimed[0]?.attempts).toBe(2);
    await secondWorkerRepo.markSent(reclaimed[0]!.deliveryId, new Date('2026-08-12T01:01:03.000Z'));

    const afterRestart = new PrismaCampaignRepository(prisma);
    expect((await afterRestart.find(campaignId))?.status).toBe('completed');
    await expect(
      afterRestart.claimDue('worker-c', new Date('2026-08-12T02:00:00.000Z'), 60, 10, 30),
    ).resolves.toHaveLength(0);
  });
});
