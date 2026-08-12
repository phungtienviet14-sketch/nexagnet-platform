import { z } from 'zod';

const expectedItemSchema = z
  .object({
    sku: z.string().trim().min(1).optional(),
    skuRaw: z.string().trim().min(1).optional(),
    quantity: z.number().int().positive().optional(),
  })
  .strict()
  .refine((item) => item.sku !== undefined || item.skuRaw !== undefined || item.quantity !== undefined, {
    message: 'expected.order.items[] can co it nhat sku/skuRaw/quantity',
  });

const expectedOrderSchema = z
  .object({
    orderType: z.string().trim().min(1).optional(),
    items: z.array(expectedItemSchema).optional(),
    grandTotal: z.number().int().nonnegative().optional(),
    itemsSubtotal: z.number().int().nonnegative().optional(),
  })
  .strict();

const goldenCaseSchema = z
  .object({
    text: z.string().min(1),
    chatId: z.string().trim().min(1).optional(),
    expected: z
      .object({
        intent: z.string().trim().min(1),
        dealerName: z.string().trim().min(1).optional(),
        policy: z.string().trim().min(1).optional(),
        autoConfirmEligible: z.boolean().optional(),
        order: expectedOrderSchema.optional(),
      })
      .strict(),
    notes: z.string().optional(),
  })
  .strict();

const goldenDatasetSchema = z.array(goldenCaseSchema).min(1);

export type GoldenCase = z.infer<typeof goldenCaseSchema>;

export interface OrderViewLike {
  intent?: string;
  status?: string;
  dealerName?: string;
  parsed?: unknown;
  priced?: unknown;
}

export interface GoldenMetrics {
  intentAccuracy: number;
  fieldAccuracy: number;
  skuAccuracy: number;
  quantityAccuracy: number;
  dealerAccuracy: number;
  policyResolutionAccuracy: number;
  totalRulesAccuracy: number;
  autoConfirmEligibilityAccuracy: number;
}

export interface GoldenEvalResult {
  goLiveReady: boolean;
  reason?: string;
  metrics: GoldenMetrics;
  totalCases: number;
  mismatches: Array<{ index: number; text: string; metric: string; expected: unknown; got: unknown }>;
}

export function parseGoldenDataset(value: unknown): GoldenCase[] {
  return goldenDatasetSchema.parse(value);
}

export function missingGoldenDatasetResult(): { goLiveReady: false; reason: 'missing_golden_dataset' } {
  return { goLiveReady: false, reason: 'missing_golden_dataset' };
}

export function computeGoldenMetrics(cases: readonly GoldenCase[], views: readonly OrderViewLike[]): GoldenEvalResult {
  if (cases.length !== views.length) {
    throw new Error(`So case (${cases.length}) khac so response (${views.length})`);
  }
  const checks = new MetricCounter();
  const mismatches: GoldenEvalResult['mismatches'] = [];

  for (let index = 0; index < cases.length; index++) {
    const testCase = cases[index]!;
    const view = views[index]!;
    record(index, testCase, 'intent', testCase.expected.intent, view.intent);

    if (testCase.expected.dealerName !== undefined) {
      record(index, testCase, 'dealer', normalizeText(testCase.expected.dealerName), normalizeText(view.dealerName));
    }
    if (testCase.expected.policy !== undefined) {
      record(index, testCase, 'policy', testCase.expected.policy, extractPolicy(view.priced));
    }
    if (testCase.expected.autoConfirmEligible !== undefined) {
      record(index, testCase, 'autoConfirm', testCase.expected.autoConfirmEligible, isAutoConfirmEligible(view));
    }

    const expectedOrder = testCase.expected.order;
    if (expectedOrder?.orderType !== undefined) {
      record(index, testCase, 'field', expectedOrder.orderType, extractString(view.parsed, 'orderType'));
    }
    if (expectedOrder?.grandTotal !== undefined) {
      record(index, testCase, 'total', expectedOrder.grandTotal, extractNumber(view.priced, 'grandTotal'));
    }
    if (expectedOrder?.itemsSubtotal !== undefined) {
      record(index, testCase, 'total', expectedOrder.itemsSubtotal, extractNumber(view.priced, 'itemsSubtotal'));
    }
    const actualItems = extractItems(view);
    for (let itemIndex = 0; itemIndex < (expectedOrder?.items?.length ?? 0); itemIndex++) {
      const expectedItem = expectedOrder!.items![itemIndex]!;
      const actualItem = actualItems[itemIndex] ?? {};
      if (expectedItem.sku !== undefined) record(index, testCase, 'sku', expectedItem.sku, actualItem.sku);
      if (expectedItem.skuRaw !== undefined) record(index, testCase, 'sku', expectedItem.skuRaw, actualItem.skuRaw);
      if (expectedItem.quantity !== undefined) {
        record(index, testCase, 'quantity', expectedItem.quantity, actualItem.quantity);
      }
    }
  }

  const metrics = checks.toMetrics();
  return {
    goLiveReady: mismatches.length === 0,
    ...(mismatches.length > 0 ? { reason: 'golden_mismatch' } : {}),
    metrics,
    totalCases: cases.length,
    mismatches,
  };

  function record(
    index: number,
    testCase: GoldenCase,
    metric: MetricName,
    expected: unknown,
    got: unknown,
  ): void {
    const ok = equivalent(expected, got);
    checks.add(metric, ok);
    if (!ok) mismatches.push({ index, text: testCase.text, metric, expected, got });
  }
}

type MetricName = 'intent' | 'field' | 'sku' | 'quantity' | 'dealer' | 'policy' | 'total' | 'autoConfirm';

class MetricCounter {
  private readonly counts = new Map<MetricName, { ok: number; total: number }>();

  add(metric: MetricName, ok: boolean): void {
    const current = this.counts.get(metric) ?? { ok: 0, total: 0 };
    this.counts.set(metric, { ok: current.ok + (ok ? 1 : 0), total: current.total + 1 });
  }

  toMetrics(): GoldenMetrics {
    return {
      intentAccuracy: this.ratio('intent'),
      fieldAccuracy: this.ratio('field'),
      skuAccuracy: this.ratio('sku'),
      quantityAccuracy: this.ratio('quantity'),
      dealerAccuracy: this.ratio('dealer'),
      policyResolutionAccuracy: this.ratio('policy'),
      totalRulesAccuracy: this.ratio('total'),
      autoConfirmEligibilityAccuracy: this.ratio('autoConfirm'),
    };
  }

  private ratio(metric: MetricName): number {
    const value = this.counts.get(metric);
    if (!value || value.total === 0) return 1;
    return value.ok / value.total;
  }
}

function extractItems(view: OrderViewLike): Array<{ sku?: string; skuRaw?: string; quantity?: number }> {
  const pricedLines = extractArray(view.priced, 'lines');
  if (pricedLines.length > 0) {
    return pricedLines.map((line) => ({
      sku: extractString(line, 'sku'),
      skuRaw: extractString(line, 'skuRaw'),
      quantity: extractNumber(line, 'quantity'),
    }));
  }
  return extractArray(view.parsed, 'items').map((item) => ({
    sku: extractString(item, 'sku'),
    skuRaw: extractString(item, 'skuRaw'),
    quantity: extractNumber(item, 'quantity'),
  }));
}

function extractPolicy(value: unknown): string | undefined {
  return extractString(value, 'policy') ?? extractString(value, 'defaultPolicy') ?? extractString(value, 'policyType');
}

function isAutoConfirmEligible(view: OrderViewLike): boolean {
  return view.status === 'sent';
}

function extractString(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const raw = value[key];
  return typeof raw === 'string' ? raw : undefined;
}

function extractNumber(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) return undefined;
  const raw = value[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
}

function extractArray(value: unknown, key: string): unknown[] {
  if (!isRecord(value)) return [];
  const raw = value[key];
  return Array.isArray(raw) ? raw : [];
}

function equivalent(expected: unknown, got: unknown): boolean {
  if (typeof expected === 'string' && typeof got === 'string') {
    return normalizeText(expected) === normalizeText(got);
  }
  return expected === got;
}

function normalizeText(value: string | undefined): string | undefined {
  return value
    ?.normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
