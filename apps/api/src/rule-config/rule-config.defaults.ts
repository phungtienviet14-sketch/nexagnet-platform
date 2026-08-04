import { ruleConfigPayloadSchema } from '@ultty/shared';
import type { RuleConfigPayload } from '@ultty/shared';
import { DEFAULT_AGENTS_CONFIG } from '../agents/agents.config.js';
import type { AgentsConfig } from '../agents/agents.config.js';
import { DEFAULT_RULES_CONFIG } from '../rules/config.js';
import type { RulesConfig } from '../rules/config.js';

/** Builds a JSON-safe payload from the current trusted runtime defaults. */
export function createDefaultRuleConfigPayload(): RuleConfigPayload {
  return ruleConfigPayloadSchema.parse({
    schemaVersion: 1,
    rules: {
      ...DEFAULT_RULES_CONFIG,
      noiThanhKeywords: [...DEFAULT_RULES_CONFIG.noiThanhKeywords],
    },
    agents: {
      largeOrderTotal: DEFAULT_AGENTS_CONFIG.largeOrderTotal,
      largeOrderQuantity: DEFAULT_AGENTS_CONFIG.largeOrderQuantity,
      lowConfidence: DEFAULT_AGENTS_CONFIG.lowConfidence,
    },
  });
}

export function toRulesConfig(payload: RuleConfigPayload): RulesConfig {
  const parsed = ruleConfigPayloadSchema.parse(payload);
  return {
    ...parsed.rules,
    noiThanhKeywords: [...parsed.rules.noiThanhKeywords],
  };
}

/** Restores code-owned detection expressions; persisted Settings cannot replace them. */
export function toAgentsConfig(payload: RuleConfigPayload): AgentsConfig {
  const parsed = ruleConfigPayloadSchema.parse(payload);
  return {
    ...parsed.agents,
    harshComplaint: DEFAULT_AGENTS_CONFIG.harshComplaint,
    warrantyWrongMissing: DEFAULT_AGENTS_CONFIG.warrantyWrongMissing,
    warrantyIn7: DEFAULT_AGENTS_CONFIG.warrantyIn7,
  };
}
