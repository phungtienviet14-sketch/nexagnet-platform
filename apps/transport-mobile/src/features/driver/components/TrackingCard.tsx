import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import { userMessage } from '../../../api/errors';
import { BUILD_INFO } from '../../../config/build-info';
import {
  runTrackingStatus,
  startRunTracking,
  stopRunTracking,
  type TrackingStatus,
} from '../../../location/background-task';
import { describeLocation, type LocationFacts } from '../../../location/location-state';
import { useSession } from '../../../session/SessionProvider';
import { outboxScope } from '../../../session/session-types';
import { Button } from '../../../ui/Button';
import { Notice } from '../../../ui/Notice';
import { Card } from '../../../ui/Surface';
import { Text } from '../../../ui/Text';
import { readLocationFacts } from '../location-facts';

const IDLE: TrackingStatus = { running: false, runId: null, runCode: null };

/** Trang thai bam nen + su that vi tri — doc lai khi ung dung quay lai tien canh. */
export function useTrackingState() {
  const [tracking, setTracking] = useState<TrackingStatus>(IDLE);
  const [facts, setFacts] = useState<LocationFacts | null>(null);
  const refresh = useCallback(async () => {
    const status = await runTrackingStatus().catch(() => IDLE);
    setTracking(status);
    setFacts(await readLocationFacts(status).catch(() => null));
  }, []);
  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);
  return { tracking, facts, refresh };
}

/**
 * DUNG BAM khi vong chay KHONG CON MO (theo lan doc MOI tu may chu): bam vi tri cho mot viec da xong
 * la thu thap vi tri khong co ly do.
 */
export function useStopTrackingWhenRunClosed(
  openRunIds: readonly string[] | null,
  tracking: TrackingStatus,
  refresh: () => Promise<void>,
): void {
  const key = openRunIds?.join(',') ?? null;
  useEffect(() => {
    if (key === null || !tracking.running || tracking.runId === null) return;
    if (key.split(',').includes(tracking.runId)) return;
    void stopRunTracking().then(refresh);
  }, [key, tracking.running, tracking.runId, refresh]);
}

/**
 * BAM VI TRI CA CHAY — chi hien o ban dung CO tinh nang nay. Noi DUNG su that: "da bat" chu khong
 * "dang bam lien tuc"; he dieu hanh van co the dung no, va khi do van phong thay "mất tín hiệu" —
 * khong phai loi cua lai xe (#297).
 */
export function TrackingCard({
  runId,
  runCode,
  tracking,
  facts,
  refresh,
}: {
  readonly runId: string;
  readonly runCode: string;
  readonly tracking: TrackingStatus;
  readonly facts: LocationFacts | null;
  readonly refresh: () => Promise<void>;
}) {
  const { session } = useSession();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; settings: boolean } | null>(null);
  const statement = facts ? describeLocation(facts) : null;
  const thisRun = tracking.running && tracking.runId === runId;

  async function start() {
    if (!session) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await startRunTracking({ runId, runCode }, outboxScope(session));
      if (result === 'NOT_IN_THIS_BUILD') {
        setMessage({
          text: 'Bản ứng dụng này không có tính năng bám vị trí nền.',
          settings: false,
        });
      } else if (result === 'NEEDS_ALWAYS_PERMISSION') {
        setMessage({
          text: 'Cần cho phép vị trí “Luôn luôn” trong Cài đặt của máy. Không bật thì chỉ có vị trí lúc bấm mốc.',
          settings: true,
        });
      }
    } catch (error) {
      setMessage({ text: userMessage(error), settings: true });
    } finally {
      setBusy(false);
      await refresh();
    }
  }

  async function stop() {
    setBusy(true);
    await stopRunTracking().catch(() => undefined);
    setBusy(false);
    await refresh();
  }

  return (
    <Card rail={thisRun ? 'live' : 'neutral'} testID="driver-tracking">
      <Text variant="bodyStrong">{statement?.background.title ?? 'Bám vị trí ca chạy'}</Text>
      <Text variant="caption" tone="muted">
        {statement?.background.detail ??
          'Không bắt buộc. Bật khi công ty yêu cầu theo dõi hành trình.'}
      </Text>
      {tracking.running && !thisRun ? (
        <Text variant="caption" tone="muted">
          Đang bám cho vòng chạy {tracking.runCode ?? 'khác'}.
        </Text>
      ) : null}
      {message ? (
        <Notice tone="caution" icon="map-marker-alert-outline" title={message.text} />
      ) : null}
      {message?.settings && Platform.OS !== 'web' ? (
        <Button
          kind="secondary"
          size="compact"
          label="Mở Cài đặt"
          icon="cog"
          onPress={() => void Linking.openSettings()}
        />
      ) : null}
      {BUILD_INFO.backgroundLocationBuild ? (
        <Button
          kind={thisRun ? 'secondary' : 'primary'}
          size="compact"
          label={thisRun ? `Tắt bám vị trí (${runCode})` : `Bật bám vị trí cho ${runCode}`}
          icon={thisRun ? 'map-marker-off' : 'map-marker-radius'}
          loading={busy}
          onPress={() => void (thisRun ? stop() : start())}
          testID="driver-tracking-toggle"
        />
      ) : null}
      <Text variant="caption" tone="faint">
        Tình trạng thử nghiệm: đã nghiên cứu, CHƯA được chứng minh trên thiết bị thật.
      </Text>
    </Card>
  );
}
