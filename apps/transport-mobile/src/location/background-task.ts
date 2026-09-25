import { randomUUID } from 'expo-crypto';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { BUILD_INFO, CLIENT_TAG } from '../config/build-info';
import { HttpClient } from '../api/http';
import { createOutboxRuntime, readKv, writeKv } from '../outbox/outbox-runtime';
import { loadSession } from '../session/secure-session-storage';
import { outboxScope } from '../session/session-types';
import { fixFromLocation, ensureForegroundPermission } from './point-in-time';

/**
 * BAM VI TRI CA CHAY — CHI khi mot vong chay dang mo VA lai xe tu bat. Khong bam 24/7: ban khai bao
 * Google Play khong nhan ly do do (M-01, `docs/kien-truc/transport-driver-app.md` §3), va may chu
 * cung chi mo phien bam theo vong chay.
 *
 * Tac vu nay co the chay khi giao dien KHONG mo (Android: dich vu tien canh; iOS: che do nen
 * `location`). No chi lam hai viec: DONG BANG tung diem vao hang doi SQLite (ben qua moi lan tien
 * trinh bi giet), roi thu gui mot luot. Moi thu khac — hien thi, thu lai dinh ky — la viec cua giao
 * dien khi no mo.
 *
 * TRUNG THUC: day la RESEARCHED / NOT DEVICE-PROVEN. He dieu hanh van dung duoc tac vu nay
 * (force-stop, trinh tiet kiem pin, terminate tren iOS). May chu doc im lang do la `LOST`, khong phai
 * loi cua lai xe (#297).
 */
export const RUN_TRACKING_TASK = 'nexagent.run-tracking';
const KV_RUN = 'tracking.runId';
const KV_RUN_CODE = 'tracking.runCode';
const KV_SCOPE = 'tracking.scope';

interface TaskPayload {
  readonly locations?: Location.LocationObject[];
}

TaskManager.defineTask<TaskPayload>(RUN_TRACKING_TASK, async ({ data, error }) => {
  if (error || !data?.locations?.length) return;
  const [runId, scope, session] = await Promise.all([
    readKv(KV_RUN),
    readKv(KV_SCOPE),
    loadSession(),
  ]);
  // Da dang xuat hoac doi nguoi: khong ghi vi tri duoi danh tinh nguoi khac — dung bam.
  if (!runId || !session || outboxScope(session) !== scope) {
    await stopRunTracking();
    return;
  }
  const http = new HttpClient({
    baseUrl: session.serverUrl,
    clientTag: CLIENT_TAG,
    getToken: () => session.token,
  });
  const { engine } = await createOutboxRuntime(session, http);
  for (const location of data.locations) {
    const fix = fixFromLocation(location);
    await engine.enqueue({
      clientEventId: randomUUID(),
      kind: 'OBSERVATION',
      capturedAt: fix.capturedAt,
      payload: { runId, fix },
    });
  }
  await engine.drain('OBSERVATION').catch(() => 0);
});

export type StartTrackingResult = 'STARTED' | 'NOT_IN_THIS_BUILD' | 'NEEDS_ALWAYS_PERMISSION';

export async function startRunTracking(
  run: { readonly runId: string; readonly runCode: string },
  scope: string,
): Promise<StartTrackingResult> {
  if (!BUILD_INFO.backgroundLocationBuild) return 'NOT_IN_THIS_BUILD';
  await ensureForegroundPermission();
  const background = await Location.requestBackgroundPermissionsAsync();
  if (!background.granted) return 'NEEDS_ALWAYS_PERMISSION';
  await writeKv(KV_RUN, run.runId);
  await writeKv(KV_RUN_CODE, run.runCode);
  await writeKv(KV_SCOPE, scope);
  await Location.startLocationUpdatesAsync(RUN_TRACKING_TASK, {
    accuracy: Location.Accuracy.High,
    // Nhip de xuat cua may chu (`tracking-policy.ts`): >= 30 giay giua hai diem.
    timeInterval: 30_000,
    distanceInterval: 100,
    deferredUpdatesInterval: 60_000,
    pausesUpdatesAutomatically: false,
    activityType: Location.LocationActivityType.AutomotiveNavigation,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Đang bám vị trí ca chạy',
      notificationBody: `Vòng chạy ${run.runCode}. Tắt trong ứng dụng khi hết ca.`,
      notificationColor: '#0E5C63',
      killServiceOnDestroy: false,
    },
  });
  return 'STARTED';
}

export async function stopRunTracking(): Promise<void> {
  if (await Location.hasStartedLocationUpdatesAsync(RUN_TRACKING_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(RUN_TRACKING_TASK);
  }
  await writeKv(KV_RUN, null);
  await writeKv(KV_RUN_CODE, null);
  await writeKv(KV_SCOPE, null);
}

export interface TrackingStatus {
  readonly running: boolean;
  readonly runId: string | null;
  readonly runCode: string | null;
}

export async function runTrackingStatus(): Promise<TrackingStatus> {
  const running = await Location.hasStartedLocationUpdatesAsync(RUN_TRACKING_TASK).catch(
    () => false,
  );
  return { running, runId: await readKv(KV_RUN), runCode: await readKv(KV_RUN_CODE) };
}
