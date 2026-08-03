import { describe, expect, it } from 'vitest';
import { createDefaultRuleConfigPayload } from './rule-config.defaults.js';
import { InMemoryRuleConfigRepository } from './rule-config.repository.js';
import { RuleConfigLifecycleError, RuleConfigService } from './rule-config.service.js';

function createService(): RuleConfigService {
  return new RuleConfigService(new InMemoryRuleConfigRepository());
}

describe('RuleConfigService lifecycle', () => {
  it('creates a validated draft, then requires preview before activation', async () => {
    const service = createService();
    const draft = await service.createDraft(createDefaultRuleConfigPayload(), 'sale-1');

    await expect(service.activate(draft.id, 'sale-1')).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });

    const preview = await service.preview(draft.id);
    const active = await service.activate(preview.id, 'sale-1');

    expect(draft.status).toBe('draft');
    expect(preview.status).toBe('preview');
    expect(active.status).toBe('active');
    expect(active.activatedBy).toBe('sale-1');
    expect(active.activatedAt).toBeTruthy();
  });

  it('rejects invalid payload at the service boundary', async () => {
    const service = createService();
    const invalid = {
      ...createDefaultRuleConfigPayload(),
      rules: { ...createDefaultRuleConfigPayload().rules, codFee: -1 },
    };

    await expect(service.createDraft(invalid, 'sale-1')).rejects.toMatchObject({
      code: 'INVALID_PAYLOAD',
    });
  });

  it('atomically archives the previous active version', async () => {
    const service = createService();
    const firstDraft = await service.createDraft(createDefaultRuleConfigPayload(), 'sale-1');
    const firstActive = await service.activate((await service.preview(firstDraft.id)).id, 'sale-1');
    const secondDraft = await service.createDraft(createDefaultRuleConfigPayload(), 'sale-2');
    const secondActive = await service.activate(
      (await service.preview(secondDraft.id)).id,
      'sale-2',
    );

    expect((await service.findById(firstActive.id))?.status).toBe('archived');
    expect(secondActive.status).toBe('active');
    expect((await service.getActive())?.id).toBe(secondActive.id);
    expect((await service.list()).filter((item) => item.status === 'active')).toHaveLength(1);
  });

  it('does not change repository state when activation fails', async () => {
    const repository = new InMemoryRuleConfigRepository();
    const service = new RuleConfigService(repository);
    const activeDraft = await service.createDraft(createDefaultRuleConfigPayload(), 'sale-1');
    const active = await service.activate((await service.preview(activeDraft.id)).id, 'sale-1');
    const unpreviewed = await service.createDraft(createDefaultRuleConfigPayload(), 'sale-2');

    await expect(service.activate(unpreviewed.id, 'sale-2')).rejects.toBeInstanceOf(
      RuleConfigLifecycleError,
    );

    expect((await service.getActive())?.id).toBe(active.id);
    expect((await service.findById(unpreviewed.id))?.status).toBe('draft');
  });

  it('rejects repeated lifecycle operations and missing versions', async () => {
    const service = createService();
    const draft = await service.createDraft(createDefaultRuleConfigPayload(), 'sale-1');
    const preview = await service.preview(draft.id);

    await expect(service.preview(preview.id)).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
    await expect(service.preview('missing')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('archives an active version and leaves no active config', async () => {
    const service = createService();
    const draft = await service.createDraft(createDefaultRuleConfigPayload(), 'sale-1');
    const active = await service.activate((await service.preview(draft.id)).id, 'sale-1');

    const archived = await service.archive(active.id);

    expect(archived.status).toBe('archived');
    expect(await service.getActive()).toBeNull();
    await expect(service.archive(active.id)).rejects.toMatchObject({
      code: 'INVALID_TRANSITION',
    });
  });
});
