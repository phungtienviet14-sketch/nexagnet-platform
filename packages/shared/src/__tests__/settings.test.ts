import { describe, expect, it } from 'vitest';
import {
  auditLogFilterSchema,
  auditLogSchema,
  ruleConfigPayloadSchema,
  ruleConfigVersionSchema,
} from '../settings.js';

const validPayload = {
  schemaVersion: 1,
  rules: {
    freeShipMinQuantity: 2,
    shipFeeNoiThanh: 30_000,
    shipFeeTinh: 40_000,
    vatRate: 0.1,
    codFee: 20_000,
    totalMismatchTolerance: 0.05,
    noiThanhKeywords: ['ha noi', 'hn'],
  },
  agents: {
    largeOrderTotal: 20_000_000,
    largeOrderQuantity: 30,
    lowConfidence: 0.5,
  },
} as const;

describe('ruleConfigPayloadSchema', () => {
  it('accepts the fixed typed rules and agent thresholds', () => {
    expect(ruleConfigPayloadSchema.parse(validPayload)).toEqual(validPayload);
  });

  it.each([
    ['negative money', { ...validPayload, rules: { ...validPayload.rules, codFee: -1 } }],
    ['invalid ratio', { ...validPayload, rules: { ...validPayload.rules, vatRate: 1.1 } }],
    [
      'invalid quantity',
      { ...validPayload, agents: { ...validPayload.agents, largeOrderQuantity: 1.5 } },
    ],
  ])('rejects %s', (_name, input) => {
    expect(ruleConfigPayloadSchema.safeParse(input).success).toBe(false);
  });

  it('rejects arbitrary executable expressions and unknown fields', () => {
    const input = {
      ...validPayload,
      formula: 'subtotal * eval(process.env.SECRET)',
      agents: {
        ...validPayload.agents,
        harshComplaint: '/anything/operator supplied/',
      },
    };

    expect(ruleConfigPayloadSchema.safeParse(input).success).toBe(false);
  });
});

describe('ruleConfigVersionSchema', () => {
  it.each(['draft', 'preview', 'active', 'archived'] as const)('accepts %s status', (status) => {
    const wasActivated = status === 'active' || status === 'archived';
    const result = ruleConfigVersionSchema.safeParse({
      id: 'rules-1',
      version: 1,
      status,
      payload: validPayload,
      createdBy: 'operator@example.test',
      activatedBy: wasActivated ? 'operator@example.test' : null,
      createdAt: '2026-08-03T00:00:00.000Z',
      activatedAt: wasActivated ? '2026-08-03T00:01:00.000Z' : null,
    });

    expect(result.success).toBe(true);
  });

  it('rejects lifecycle metadata that disagrees with status', () => {
    const base = {
      id: 'rules-1',
      version: 1,
      payload: validPayload,
      createdBy: 'operator@example.test',
      createdAt: '2026-08-03T00:00:00.000Z',
    };

    expect(
      ruleConfigVersionSchema.safeParse({
        ...base,
        status: 'active',
        activatedBy: null,
        activatedAt: null,
      }).success,
    ).toBe(false);
    expect(
      ruleConfigVersionSchema.safeParse({
        ...base,
        status: 'draft',
        activatedBy: 'operator@example.test',
        activatedAt: '2026-08-03T00:01:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('auditLogSchema', () => {
  it('accepts a JSON-safe append-only audit view', () => {
    const result = auditLogSchema.safeParse({
      id: 'audit-1',
      actor: 'operator@example.test',
      action: 'rule_config.activate',
      entityType: 'RuleConfigVersion',
      entityId: 'rules-1',
      before: { status: 'preview' },
      after: { status: 'active' },
      requestId: 'request-1',
      createdAt: '2026-08-03T00:01:00.000Z',
    });

    expect(result.success).toBe(true);
  });

  it('validates audit time windows and applies a bounded default limit', () => {
    expect(auditLogFilterSchema.parse({}).limit).toBe(50);
    expect(
      auditLogFilterSchema.safeParse({
        from: '2026-08-03T00:02:00.000Z',
        to: '2026-08-03T00:01:00.000Z',
      }).success,
    ).toBe(false);
    expect(auditLogFilterSchema.safeParse({ limit: 201 }).success).toBe(false);
  });
});
