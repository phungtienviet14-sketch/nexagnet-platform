import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { userMessage } from '../api/errors';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SPACE } from '../theme/tokens';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/**
 * BA TRANG THAI KHONG DUOC LAN VAO NHAU (quy tac ke thua tu web `driver.ts`):
 *   · DANG TAI    — chua biet. Khong bao gio hien "khong co viec" trong luc dang tai.
 *   · LOI         — khong doc duoc. Noi ro, cho thu lai. Khong bao gio hien la "trong".
 *   · TRONG       — may chu tra ve dung la khong co gi.
 * Mot lan doc hong ma hien "Hiện chưa có việc" la noi doi voi lai xe.
 */
export function LoadingBlock({
  lines = 3,
  label,
}: {
  readonly lines?: number;
  readonly label?: string;
}) {
  const { color } = useTheme();
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View
      accessibilityLabel={label ?? 'Đang tải'}
      accessibilityRole="progressbar"
      style={styles.stack}
    >
      {Array.from({ length: lines }, (_, index) => (
        <Animated.View
          key={index}
          style={[
            styles.bar,
            {
              backgroundColor: color.surfaceSunken,
              opacity: pulse,
              width: index === 0 ? '62%' : index % 2 ? '100%' : '84%',
            },
          ]}
        />
      ))}
      {label ? (
        <Text variant="caption" tone="faint">
          {label}
        </Text>
      ) : null}
    </View>
  );
}

export function ErrorBlock({
  error,
  onRetry,
  title = 'Chưa đọc được dữ liệu',
}: {
  readonly error: unknown;
  readonly onRetry?: () => void;
  readonly title?: string;
}) {
  const { color } = useTheme();
  return (
    <View style={[styles.box, { backgroundColor: color.dangerSoft }]} accessibilityRole="alert">
      <View style={styles.row}>
        <Icon name="cloud-alert" tone="danger" />
        <Text variant="bodyStrong" tone="danger" style={styles.flex}>
          {title}
        </Text>
      </View>
      <Text variant="caption" tone="ink">
        {userMessage(error)}
      </Text>
      {onRetry ? (
        <Button kind="secondary" size="compact" label="Thử lại" icon="refresh" onPress={onRetry} />
      ) : null}
    </View>
  );
}

export function EmptyBlock({
  icon = 'check-circle-outline',
  title,
  detail,
}: {
  readonly icon?: IconName;
  readonly title: string;
  readonly detail?: string;
}) {
  const { color } = useTheme();
  return (
    <View style={[styles.box, styles.center, { backgroundColor: color.surfaceSunken }]}>
      <Icon name={icon} size={30} tone="faint" />
      <Text variant="bodyStrong" tone="muted" align="center">
        {title}
      </Text>
      {detail ? (
        <Text variant="caption" tone="faint" align="center">
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.sm, paddingVertical: SPACE.sm },
  bar: { height: 14, borderRadius: 7 },
  box: { borderRadius: RADIUS.card, padding: SPACE.lg, gap: SPACE.sm },
  center: { alignItems: 'center', paddingVertical: SPACE.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  flex: { flex: 1 },
});
