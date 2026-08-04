import { describe, expect, it } from 'vitest';
import { DEFAULT_AGENTS_CONFIG } from '../agents/agents.config.js';
import { DEFAULT_RULES_CONFIG } from '../rules/config.js';
import {
  createDefaultRuleConfigPayload,
  toAgentsConfig,
  toRulesConfig,
} from './rule-config.defaults.js';

describe('rule config defaults', () => {
  it('derives the persisted defaults from the existing runtime constants', () => {
    const payload = createDefaultRuleConfigPayload();

    expect(payload.rules).toEqual(DEFAULT_RULES_CONFIG);
    expect(payload.agents).toEqual({
      largeOrderTotal: DEFAULT_AGENTS_CONFIG.largeOrderTotal,
      largeOrderQuantity: DEFAULT_AGENTS_CONFIG.largeOrderQuantity,
      lowConfidence: DEFAULT_AGENTS_CONFIG.lowConfidence,
    });
  });

  it('reconstructs runtime config without accepting persisted arbitrary regex', () => {
    const payload = createDefaultRuleConfigPayload();
    const agents = toAgentsConfig(payload);

    expect(toRulesConfig(payload)).toEqual(DEFAULT_RULES_CONFIG);
    expect(agents.harshComplaint).toBe(DEFAULT_AGENTS_CONFIG.harshComplaint);
    expect(agents.warrantyWrongMissing).toBe(DEFAULT_AGENTS_CONFIG.warrantyWrongMissing);
    expect(agents.warrantyIn7).toBe(DEFAULT_AGENTS_CONFIG.warrantyIn7);
  });

  it('returns fresh keyword arrays so callers cannot mutate the defaults', () => {
    const first = createDefaultRuleConfigPayload();
    const second = createDefaultRuleConfigPayload();

    first.rules.noiThanhKeywords.push('changed');

    expect(second.rules.noiThanhKeywords).toEqual(DEFAULT_RULES_CONFIG.noiThanhKeywords);
    expect(DEFAULT_RULES_CONFIG.noiThanhKeywords).not.toContain('changed');
  });
});
