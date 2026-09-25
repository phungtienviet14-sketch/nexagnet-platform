import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useOutbox } from '../outbox/OutboxProvider';
import { useSession } from '../session/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

/** Nut tai khoan o goc tieu de moi man — cham do khi co viec bi may chu tu choi. */
export function AccountButton() {
  const router = useRouter();
  const { session } = useSession();
  const { blocked, paused } = useOutbox();
  const { color } = useTheme();
  const initials = (session?.user.name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  const alert = blocked > 0 || paused;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={alert ? 'Tài khoản — có việc cần xem' : 'Tài khoản'}
      onPress={() => router.push('/account')}
      hitSlop={10}
      testID="account-button"
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: color.brandSoft, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text variant="label" tone="brand">
        {initials}
      </Text>
      {alert ? (
        <View style={[styles.dot, { backgroundColor: color.danger, borderColor: color.canvas }]} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
});
