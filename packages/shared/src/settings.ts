import { z } from 'zod';

const MAX_MONEY_VALUE = Number.MAX_SAFE_INTEGER;
const MAX_QUANTITY_VALUE = 1_000_000;
const MAX_KEYWORDS = 100;

const moneySchema = z.number().int().nonnegative().max(MAX_MONEY_VALUE);
const quantitySchema = z.number().int().positive().max(MAX_QUANTITY_VALUE);
const ratioSchema = z.number().min(0).max(1);

export const RULE_CONFIG_STATUSES = ['draft', 'preview', 'active', 'archived'] as const;

export const ruleSettingsSchema = z
  .object({
    freeShipMinQuantity: quantitySchema,
    shipFeeNoiThanh: moneySchema,
    shipFeeTinh: moneySchema,
    vatRate: ratioSchema,
    codFee: moneySchema,
    totalMismatchTolerance: ratioSchema,
    noiThanhKeywords: z
      .array(z.string().trim().min(1).max(100))
      .min(1)
      .max(MAX_KEYWORDS)
      .refine((keywords) => new Set(keywords).size === keywords.length, {
        message: 'noiThanhKeywords must not contain duplicates',
      }),
  })
  .strict();

/**
 * Only numeric agent thresholds are persisted. Detection regular expressions remain trusted,
 * code-owned defaults and cannot be supplied through Settings.
 */
export const agentSettingsSchema = z
  .object({
    largeOrderTotal: moneySchema,
    largeOrderQuantity: quantitySchema,
    lowConfidence: ratioSchema,
  })
  .strict();

export const ruleConfigPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    rules: ruleSettingsSchema,
    agents: agentSettingsSchema,
  })
  .strict();

export const ruleConfigVersionSchema = z
  .object({
    id: z.string().trim().min(1),
    version: z.number().int().positive(),
    status: z.enum(RULE_CONFIG_STATUSES),
    payload: ruleConfigPayloadSchema,
    createdBy: z.string().trim().min(1).nullable(),
    activatedBy: z.string().trim().min(1).nullable(),
    createdAt: z.string().datetime({ offset: true }),
    activatedAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict()
  .superRefine((version, context) => {
    const wasActivated = version.status === 'active' || version.status === 'archived';
    const hasAllActivationMetadata = version.activatedBy !== null && version.activatedAt !== null;
    const hasAnyActivationMetadata = version.activatedBy !== null || version.activatedAt !== null;
    if (
      (wasActivated && hasAllActivationMetadata) ||
      (!wasActivated && !hasAnyActivationMetadata)
    ) {
      return;
    }

    context.addIssue({
      code: 'custom',
      message: wasActivated
        ? 'active and archived versions require activation metadata'
        : 'draft and preview versions cannot have activation metadata',
      path: ['activatedAt'],
    });
  });

export type AuditJsonValue =
  string | number | boolean | null | AuditJsonValue[] | { [key: string]: AuditJsonValue };

export const auditJsonValueSchema: z.ZodType<AuditJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(auditJsonValueSchema),
    z.record(z.string(), auditJsonValueSchema),
  ]),
);

export const auditLogSchema = z
  .object({
    id: z.string().trim().min(1),
    actor: z.string().trim().min(1),
    action: z.string().trim().min(1),
    entityType: z.string().trim().min(1),
    entityId: z.string().trim().min(1).nullable(),
    before: auditJsonValueSchema.nullable(),
    after: auditJsonValueSchema.nullable(),
    requestId: z.string().trim().min(1).nullable(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const auditLogFilterSchema = z
  .object({
    actor: z.string().trim().min(1).optional(),
    action: z.string().trim().min(1).optional(),
    entityType: z.string().trim().min(1).optional(),
    entityId: z.string().trim().min(1).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    limit: z.number().int().positive().max(200).default(50),
  })
  .strict()
  .refine((filter) => !filter.from || !filter.to || filter.from <= filter.to, {
    message: 'from must be before or equal to to',
    path: ['from'],
  });

export type RuleConfigStatus = (typeof RULE_CONFIG_STATUSES)[number];
export type RuleSettings = z.infer<typeof ruleSettingsSchema>;
export type AgentSettings = z.infer<typeof agentSettingsSchema>;
export type RuleConfigPayload = z.infer<typeof ruleConfigPayloadSchema>;
export type RuleConfigVersion = z.infer<typeof ruleConfigVersionSchema>;
export type AuditLog = z.infer<typeof auditLogSchema>;
export type AuditLogFilter = z.input<typeof auditLogFilterSchema>;
