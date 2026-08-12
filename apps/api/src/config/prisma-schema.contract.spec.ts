import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const schemaPath = fileURLToPath(new URL('../../prisma/schema.prisma', import.meta.url));
const schema = readFileSync(schemaPath, 'utf8');

describe('Prisma capability contract for operator settings', () => {
  it.each([
    'enum CustomerRank',
    'enum OperationalRole',
    'enum ParticipantHandlingMode',
    'enum ParticipantSource',
    'enum RuleConfigStatus',
    'enum PricePeriodStatus',
    'model GroupParticipant',
    'model RuleConfigVersion',
    'model AuditLog',
    'enum ContentStatus',
    'model SourceProvenance',
    'model Asset',
    'model ProductAsset',
    'model FAQ',
    'model AdviceContent',
    'model ContentLink',
    'model ContentReadiness',
    'model PricePeriod',
  ])('declares %s', (declaration) => {
    expect(schema).toContain(declaration);
  });

  it('keeps participant identity unique inside one group', () => {
    expect(schema).toContain('@@unique([groupId, externalUserId])');
  });

  it('keeps rank separate from pricing truth', () => {
    expect(schema).not.toContain('model PricingRank');
    expect(schema).not.toContain('priceRankId');
  });

  it('persists the rules version used by an order', () => {
    expect(schema).toContain('ruleConfigVersion Int?');
  });

  it('versions prices by period instead of one mutable row per SKU', () => {
    expect(schema).toContain('@@unique([periodId, sku])');
    expect(schema).toContain('periodId');
    expect(schema).not.toContain('sku            String   @id');
  });
});
