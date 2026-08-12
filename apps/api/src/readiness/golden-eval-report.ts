import { z } from 'zod';

const metricSchema = z.number().min(0).max(1);
const reportSchema = z
  .object({
    goLiveReady: z.boolean(),
    reason: z.string().optional(),
    evaluatedAt: z.string().datetime(),
    totalCases: z.number().int().positive(),
    metrics: z
      .object({
        intentAccuracy: metricSchema,
        fieldAccuracy: metricSchema,
        skuAccuracy: metricSchema,
        quantityAccuracy: metricSchema,
        dealerAccuracy: metricSchema,
        policyResolutionAccuracy: metricSchema,
        totalRulesAccuracy: metricSchema,
        autoConfirmEligibilityAccuracy: metricSchema,
      })
      .strict(),
    mismatches: z.array(z.unknown()),
  })
  .strict();

export type GoldenReadiness =
  | { evaluated: false; passed: false; reason: string }
  | {
      evaluated: true;
      passed: boolean;
      reason?: string;
      evaluatedAt: string;
      totalCases: number;
      metrics: z.infer<typeof reportSchema>['metrics'];
    };

export function parseGoldenEvalReport(raw: string | null): GoldenReadiness {
  if (raw === null) {
    return { evaluated: false, passed: false, reason: 'missing_golden_dataset' };
  }
  try {
    const result = reportSchema.safeParse(JSON.parse(raw));
    if (!result.success) {
      return { evaluated: false, passed: false, reason: 'invalid_golden_eval_report' };
    }
    return {
      evaluated: true,
      passed: result.data.goLiveReady,
      ...(result.data.reason ? { reason: result.data.reason } : {}),
      evaluatedAt: result.data.evaluatedAt,
      totalCases: result.data.totalCases,
      metrics: result.data.metrics,
    };
  } catch {
    return { evaluated: false, passed: false, reason: 'invalid_golden_eval_report' };
  }
}
