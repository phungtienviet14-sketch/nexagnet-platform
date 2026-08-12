import { z } from 'zod';

export const CAMPAIGN_STATUSES = [
  'draft',
  'approved',
  'scheduled',
  'running',
  'completed',
  'partially_failed',
  'cancelled',
] as const;

export const CAMPAIGN_DELIVERY_STATUSES = [
  'pending',
  'claimed',
  'sent',
  'failed',
  'cancelled',
] as const;

export const CAMPAIGN_KINDS = [
  'one_off',
  'recurring',
  'birthday',
  'lunar_month_start',
  'lunar_full_moon',
] as const;

const nonEmpty = z.string().trim().min(1);
const isoDateTime = z.iso.datetime({ offset: true });
const rawCampaignMetadataSchema = z.record(z.string(), z.unknown());
const campaignMetadataSchema = rawCampaignMetadataSchema.default({});
const timeOfDay = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timezone = z.string().trim().min(1).max(100);

export const recurringCampaignSchema = z
  .object({
    type: z.literal('recurring'),
    timezone,
    startDate: localDate,
    /** RFC 5545 RRULE body only, e.g. FREQ=WEEKLY;BYDAY=MO;INTERVAL=1. */
    rrule: z.string().regex(/^FREQ=/).max(1_000),
    windowStart: timeOfDay,
    windowEnd: timeOfDay,
  })
  .strict()
  .refine((value) => value.windowEnd > value.windowStart, { path: ['windowEnd'], message: 'windowEnd phai sau windowStart' });

export const birthdayCampaignSchema = z
  .object({
    type: z.literal('birthday'),
    timezone,
    windowStart: timeOfDay,
    windowEnd: timeOfDay,
  })
  .strict()
  .refine((value) => value.windowEnd > value.windowStart, { path: ['windowEnd'], message: 'windowEnd phai sau windowStart' });

export const lunarCampaignSchema = z
  .object({
    type: z.enum(['lunar_month_start', 'lunar_full_moon']),
    timezone,
    windowStart: timeOfDay,
    windowEnd: timeOfDay,
  })
  .strict()
  .refine((value) => value.windowEnd > value.windowStart, { path: ['windowEnd'], message: 'windowEnd phai sau windowStart' });

export const campaignRecurrenceSchema = z.discriminatedUnion('type', [
  recurringCampaignSchema,
  birthdayCampaignSchema,
  lunarCampaignSchema,
]);

export const campaignTargetInputSchema = z
  .object({
    groupId: nonEmpty.max(128).optional(),
    chatId: nonEmpty.max(256),
    displayName: nonEmpty.max(300).optional(),
    metadata: campaignMetadataSchema,
  })
  .strict();

export const createCampaignSchema = z
  .object({
    name: nonEmpty.max(300),
    content: nonEmpty.max(4_000),
    kind: z.enum(CAMPAIGN_KINDS).default('one_off'),
    templateKey: nonEmpty.max(200).optional(),
    recurrence: campaignRecurrenceSchema.optional(),
    targets: z.array(campaignTargetInputSchema).min(1),
    metadata: campaignMetadataSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.kind !== 'one_off' && value.recurrence === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['recurrence'],
        message: 'Campaign dinh ky/sinh nhat/am lich can metadata recurrence tu nguoi van hanh',
      });
    }
    if (value.kind !== 'one_off' && value.recurrence?.type !== value.kind) {
      ctx.addIssue({ code: 'custom', path: ['recurrence', 'type'], message: 'kind va recurrence.type phai trung nhau' });
    }
  });

export const approveCampaignSchema = z.object({ approved: z.literal(true) }).strict();

export const scheduleCampaignSchema = z
  .object({
    windowStart: isoDateTime,
    windowEnd: isoDateTime,
  })
  .strict()
  .refine((value) => Date.parse(value.windowEnd) > Date.parse(value.windowStart), {
    message: 'windowEnd phai sau windowStart',
    path: ['windowEnd'],
  });

export const retryCampaignSchema = z.object({ failedOnly: z.literal(true) }).strict();
export const cancelCampaignSchema = z.object({ confirmed: z.literal(true) }).strict();

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];
export type CampaignDeliveryStatus = (typeof CAMPAIGN_DELIVERY_STATUSES)[number];
export type CampaignKind = (typeof CAMPAIGN_KINDS)[number];
export type CampaignTargetInput = z.infer<typeof campaignTargetInputSchema>;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type ScheduleCampaignInput = z.infer<typeof scheduleCampaignSchema>;
export type CampaignRecurrence = z.infer<typeof campaignRecurrenceSchema>;

export interface CampaignTargetView {
  id: string;
  groupId?: string;
  chatId: string;
  displayName?: string;
  enabled: boolean;
  metadata: Record<string, unknown>;
}

export interface CampaignDeliveryView {
  id: string;
  targetId: string;
  status: CampaignDeliveryStatus;
  scheduledFor: string;
  attempts: number;
  nextAttemptAt?: string;
  claimedAt?: string;
  claimExpiresAt?: string;
  sentAt?: string;
  lastError?: string;
}

export interface CampaignView {
  id: string;
  name: string;
  content: string;
  kind: CampaignKind;
  templateKey?: string;
  recurrence?: Record<string, unknown>;
  metadata: Record<string, unknown>;
  status: CampaignStatus;
  approvedBy?: string;
  approvedAt?: string;
  windowStart?: string;
  windowEnd?: string;
  scheduledAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
  targets: CampaignTargetView[];
  deliveries: CampaignDeliveryView[];
}
