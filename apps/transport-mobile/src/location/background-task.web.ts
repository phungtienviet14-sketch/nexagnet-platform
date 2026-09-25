/**
 * Ban xem truoc tren trinh duyet KHONG bam vi tri nen — va noi thang dieu do (xem location-state.ts).
 */
export const RUN_TRACKING_TASK = 'nexagent.run-tracking';

export type StartTrackingResult = 'STARTED' | 'NOT_IN_THIS_BUILD' | 'NEEDS_ALWAYS_PERMISSION';

export async function startRunTracking(): Promise<StartTrackingResult> {
  return 'NOT_IN_THIS_BUILD';
}

export async function stopRunTracking(): Promise<void> {}

export interface TrackingStatus {
  readonly running: boolean;
  readonly runId: string | null;
  readonly runCode: string | null;
}

export async function runTrackingStatus(): Promise<TrackingStatus> {
  return { running: false, runId: null, runCode: null };
}
