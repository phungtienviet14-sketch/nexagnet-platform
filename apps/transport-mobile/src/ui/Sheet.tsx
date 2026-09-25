import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SPACE } from '../theme/tokens';
import { Text } from './Text';

/**
 * TO TRUOT TU DUOI LEN — cho mot quyet dinh tren MOT ban ghi (duyet de nghi chi, chon ly do cho,
 * xac nhan gui). Nguoi dung giu ngu canh man phia sau thay vi bi day sang man khac.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly subtitle?: string;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}) {
  const { color } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <Pressable
          accessibilityLabel="Đóng"
          style={[styles.fill, { backgroundColor: color.scrim }]}
          onPress={onClose}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: color.surface,
              paddingBottom: insets.bottom + SPACE.lg,
              borderColor: color.line,
            },
          ]}
        >
          <View style={[styles.grabber, { backgroundColor: color.lineStrong }]} />
          <Text variant="title" accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" tone="muted">
              {subtitle}
            </Text>
          ) : null}
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '88%',
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: SPACE.xl,
    paddingTop: SPACE.md,
    gap: SPACE.xs,
  },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, marginBottom: SPACE.md },
  body: { marginTop: SPACE.md },
  bodyContent: { gap: SPACE.md, paddingBottom: SPACE.md },
  footer: { gap: SPACE.sm, paddingTop: SPACE.sm },
});
