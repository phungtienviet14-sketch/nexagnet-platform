import type { ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { SPACE } from '../theme/tokens';
import { Text } from './Text';

/**
 * KHUNG MAN HINH — tieu de lon canh trai (kieu "bao cao buoi sang"), khong phai thanh dieu huong
 * mac dinh o giua. `eyebrow` la dong nho phia tren (vd ngay nghiep vu, ten doanh nghiep) de nguoi
 * doc biet so lieu thuoc ve dau.
 */
export function Screen({
  title,
  eyebrow,
  trailing,
  children,
  refreshing,
  onRefresh,
  scroll = true,
  banner,
  contentStyle,
  testID,
}: {
  readonly title?: string;
  readonly eyebrow?: string;
  readonly trailing?: ReactNode;
  readonly children: ReactNode;
  readonly refreshing?: boolean;
  readonly onRefresh?: () => void;
  readonly scroll?: boolean;
  /** Dai trang thai dong bo/ngoai tuyen, dinh ngay duoi tieu de. */
  readonly banner?: ReactNode;
  readonly contentStyle?: ViewStyle;
  readonly testID?: string;
}) {
  const { color } = useTheme();
  const insets = useSafeAreaInsets();
  const header =
    title || eyebrow ? (
      <View style={styles.header}>
        <View style={styles.headerText}>
          {eyebrow ? (
            <Text variant="overline" tone="muted">
              {eyebrow}
            </Text>
          ) : null}
          {title ? (
            <Text variant="title" accessibilityRole="header">
              {title}
            </Text>
          ) : null}
        </View>
        {trailing}
      </View>
    ) : null;

  const content = (
    <>
      {header}
      {banner}
      <View style={[styles.content, contentStyle]}>{children}</View>
    </>
  );

  return (
    <View
      testID={testID}
      style={[styles.root, { backgroundColor: color.canvas, paddingTop: insets.top }]}
    >
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + SPACE.section }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing ?? false}
                onRefresh={onRefresh}
                tintColor={color.brand}
                colors={[color.brand]}
              />
            ) : undefined
          }
        >
          {content}
        </ScrollView>
      ) : (
        <View style={[styles.root, { paddingBottom: insets.bottom }]}>{content}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.xl,
    paddingTop: SPACE.lg,
    paddingBottom: SPACE.md,
    gap: SPACE.md,
  },
  headerText: { flex: 1, gap: SPACE.hair },
  content: { paddingHorizontal: SPACE.xl, gap: SPACE.md },
});
