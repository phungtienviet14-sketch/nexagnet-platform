import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatClock } from '../format';
import { useOutbox } from '../outbox/OutboxProvider';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SPACE } from '../theme/tokens';
import { Icon } from './Icon';
import { toneColors, type Tone } from './Surface';
import { Text } from './Text';

/**
 * DAI TRANG THAI DONG BO — xuat hien CHI khi co dieu dang noi: mat mang, con viec cho gui, co viec
 * khong gui duoc, hoac phien het han. Khong co gi thi khong chiem cho (khong co "den xanh" trang tri).
 */
export function SyncBanner() {
  const outbox = useOutbox();
  const router = useRouter();
  const { color } = useTheme();
  if (!outbox.ready) return null;

  let tone: Tone | null = null;
  let title = '';
  let detail = '';
  if (outbox.paused) {
    tone = 'caution';
    title = 'Phiên đăng nhập hết hạn — việc đang chờ gửi';
    detail = `${outbox.pending} việc vẫn nằm trên máy. Đăng nhập lại để gửi tiếp.`;
  } else if (outbox.blocked > 0) {
    tone = 'danger';
    title = `${outbox.blocked} việc máy chủ không nhận`;
    detail = 'Mở để xem lý do và quyết định gửi lại hay bỏ.';
  } else if (!outbox.online) {
    tone = 'neutral';
    title = 'Đang ngoại tuyến';
    detail =
      outbox.pending > 0
        ? `${outbox.pending} việc đã lưu trên máy, sẽ tự gửi khi có sóng.`
        : 'Việc bạn bấm sẽ được lưu trên máy và tự gửi khi có sóng.';
  } else if (outbox.pending > 0) {
    tone = 'pending';
    title = outbox.running ? `Đang gửi ${outbox.pending} việc…` : `${outbox.pending} việc chờ gửi`;
    detail = outbox.lastAttemptAt
      ? `Lần thử gần nhất ${formatClock(outbox.lastAttemptAt)}`
      : 'Sẽ gửi ngay khi kết nối được.';
  }
  if (!tone) return null;
  const { soft } = toneColors(tone, color);
  const icon =
    tone === 'danger'
      ? 'alert-octagon'
      : tone === 'neutral'
        ? 'wifi-off'
        : tone === 'caution'
          ? 'lock-clock'
          : 'cloud-upload';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      onPress={() => router.push('/sync')}
      style={({ pressed }) => [
        styles.banner,
        { backgroundColor: soft, opacity: pressed ? 0.8 : 1 },
      ]}
      testID="sync-banner"
    >
      <Icon name={icon} tone={tone === 'pending' ? 'pending' : tone} />
      <View style={styles.text}>
        <Text variant="bodyStrong">{title}</Text>
        <Text variant="caption" tone="muted">
          {detail}
        </Text>
      </View>
      <Icon name="chevron-right" tone="muted" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: SPACE.xl,
    marginBottom: SPACE.md,
    borderRadius: RADIUS.control,
    padding: SPACE.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  text: { flex: 1, gap: 2 },
});
