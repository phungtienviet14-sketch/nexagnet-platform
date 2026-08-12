export interface CampaignDistributionInput {
  targetIds: readonly string[];
  windowStart: Date;
  windowEnd: Date;
  minSpacingSeconds: number;
  rateLimitPerMinute: number;
}

export interface ScheduledTarget {
  targetId: string;
  scheduledFor: Date;
}

/** Pure, deterministic distribution. The last target lands at the end of the chosen window. */
export function distributeCampaignDeliveries(input: CampaignDistributionInput): ScheduledTarget[] {
  if (input.targetIds.length === 0) return [];
  const durationMs = input.windowEnd.getTime() - input.windowStart.getTime();
  if (durationMs <= 0) throw new Error('Cua so gui khong hop le');
  const rateSpacingSeconds = Math.ceil(60 / input.rateLimitPerMinute);
  const minimumSpacingMs = Math.max(input.minSpacingSeconds, rateSpacingSeconds) * 1_000;
  const requiredDurationMs = Math.max(0, input.targetIds.length - 1) * minimumSpacingMs;
  if (requiredDurationMs > durationMs) {
    throw new Error('Cua so gui qua ngan so voi spacing/rate limit da cau hinh');
  }
  const evenSpacingMs = input.targetIds.length === 1 ? 0 : durationMs / (input.targetIds.length - 1);
  return input.targetIds.map((targetId, index) => ({
    targetId,
    scheduledFor: new Date(input.windowStart.getTime() + Math.round(index * evenSpacingMs)),
  }));
}

