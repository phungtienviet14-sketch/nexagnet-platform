import { describe, expect, it } from 'vitest';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { BroadcastService } from './broadcast.service.js';

describe('BroadcastService legacy compatibility', () => {
  it('keeps preview compatible but rejects all direct sends', async () => {
    const service = new BroadcastService(new KnowledgeService());
    await expect(service.broadcast({ text: 'CSKH', dryRun: true })).resolves.toMatchObject({
      dryRun: true,
      sent: 0,
    });
    await expect(service.broadcast({ text: 'CSKH', dryRun: false })).rejects.toThrow(/campaign/i);
  });
});

