import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { formatClock } from '../../../format';
import { useTheme } from '../../../theme/ThemeProvider';
import { RADIUS, SPACE } from '../../../theme/tokens';
import { Icon } from '../../../ui/Icon';
import { Text } from '../../../ui/Text';
import { formatWaiting, tickingWaitSeconds } from '../field-work';
import { WAITING_REASON_LABEL, WAITING_START_TRUTH } from '../labels';
import type { DriverFieldWaiting, WaitingReason } from '../types';

const TICK_MS = 15_000;

/**
 * DONG HO CHO — dem tiep giua hai lan doc tu `elapsedSeconds` MAY CHU (chi hien thi), va noi that
 * rang gio bat dau la gio may chu NHAN lenh. Con so nguoi duyet phu cap doc la con so cua may chu.
 */
export function WaitingTimer({
  waiting,
  receivedAtMs,
  timeZone,
}: {
  readonly waiting: DriverFieldWaiting;
  readonly receivedAtMs: number;
  readonly timeZone: string;
}) {
  const { color } = useTheme();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const seconds = tickingWaitSeconds(waiting.elapsedSeconds, receivedAtMs, now);
  const reason = WAITING_REASON_LABEL[waiting.reason as WaitingReason] ?? waiting.reason;

  return (
    <View
      style={[styles.box, { backgroundColor: color.pendingSoft }]}
      accessibilityLabel={`Đang chờ người nhận ${formatWaiting(seconds)}. ${reason}.`}
      testID="driver-waiting-timer"
    >
      <View style={styles.row}>
        <Icon name="timer-sand" tone="pending" />
        <Text variant="label" tone="pending" style={styles.flex}>
          Đang chờ người nhận · {reason}
        </Text>
      </View>
      <Text variant="figureLarge">{formatWaiting(seconds)}</Text>
      <Text variant="caption" tone="muted">
        Bắt đầu lúc {formatClock(waiting.startedAt, timeZone)}. {WAITING_START_TRUTH}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: RADIUS.control, padding: SPACE.md, gap: SPACE.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  flex: { flex: 1 },
});
