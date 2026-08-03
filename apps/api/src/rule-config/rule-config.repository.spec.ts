import { describe, expect, it } from 'vitest';
import { createDefaultRuleConfigPayload } from './rule-config.defaults.js';
import { InMemoryRuleConfigRepository } from './rule-config.repository.js';

describe('InMemoryRuleConfigRepository', () => {
  it('stores immutable copies and assigns increasing versions', async () => {
    const repository = new InMemoryRuleConfigRepository();
    const payload = createDefaultRuleConfigPayload();

    const first = await repository.createDraft({
      payload,
      createdBy: 'sale-1',
      createdAt: '2026-08-03T00:00:00.000Z',
    });
    payload.rules.codFee = 999;
    const second = await repository.createDraft({
      payload: createDefaultRuleConfigPayload(),
      createdBy: 'sale-2',
      createdAt: '2026-08-03T00:01:00.000Z',
    });

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect((await repository.findById(first.id))?.payload.rules.codFee).not.toBe(999);
  });

  it('returns copies so repository state cannot be mutated by a caller', async () => {
    const repository = new InMemoryRuleConfigRepository();
    const created = await repository.createDraft({
      payload: createDefaultRuleConfigPayload(),
      createdBy: null,
      createdAt: '2026-08-03T00:00:00.000Z',
    });

    created.payload.rules.noiThanhKeywords.push('changed');
    const loaded = await repository.findById(created.id);

    expect(loaded?.payload.rules.noiThanhKeywords).not.toContain('changed');
  });
});
