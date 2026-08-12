import { describe, expect, it } from 'vitest';
import type { ChannelMessage } from '@netviet/shared';
import { KnowledgeService } from '../../knowledge/knowledge.service.js';
import { InMemoryOrdersRepository } from '../../orders/orders.repository.js';
import { MockParser } from '../../pipeline/mock-parser.js';
import { createDefaultRuleConfigPayload } from '../../rule-config/rule-config.defaults.js';
import { InMemoryRuleConfigRepository } from '../../rule-config/rule-config.repository.js';
import { RuleConfigService } from '../../rule-config/rule-config.service.js';
import { AgentOrchestrator } from '../agent-orchestrator.service.js';

const knowledge = new KnowledgeService(undefined, new Date('2026-07-15T00:00:00.000Z'));
const GROUP = knowledge.groups().find((group) => group.dealerId === 'meta-hn')!.chatId;

function message(id: string): ChannelMessage {
  return {
    externalMessageId: id,
    platform: 'zalo',
    source: 'zca_listener',
    chatType: 'group',
    externalChatId: GROUP,
    text: '5 quat elni, xuat VAT',
    sentAt: new Date(),
  };
}

describe('AgentOrchestrator rules versioned', () => {
  it('draft khong anh huong; active ap dung cho don moi va luu version truy vet', async () => {
    const rules = new RuleConfigService(new InMemoryRuleConfigRepository());
    const payload = createDefaultRuleConfigPayload();
    const draft = await rules.createDraft(
      { ...payload, rules: { ...payload.rules, vatRate: 0.2 } },
      'operator',
    );
    const orchestrator = new AgentOrchestrator(
      new MockParser(),
      knowledge,
      new InMemoryOrdersRepository(),
      undefined,
      rules,
    );

    const before = await orchestrator.run(message('before'));
    const active = await rules.activate((await rules.preview(draft.id)).id, 'operator');
    const after = await orchestrator.run(message('after'));

    // VAT đang bị business block: cả default lẫn version mới đều không được biến số tạm thành
    // production truth. Version vẫn được lưu để truy vết những rule KHÔNG bị block.
    expect(before.priced?.vatAmount).toBe(0);
    expect(after.priced?.vatAmount).toBe(0);
    expect(after.priced?.warnings.join(' ')).toMatch(/thiếu cấu hình.*VAT/i);
    expect(after.ruleConfigVersion).toBe(active.version);
  });
});
