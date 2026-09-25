import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../../../theme/ThemeProvider';
import { RADIUS, SPACE } from '../../../theme/tokens';
import { Icon, type IconName } from '../../../ui/Icon';
import { toneColors, type Tone } from '../../../ui/Surface';
import { Text } from '../../../ui/Text';

/**
 * KHOI NHO dung chung cua van phong: dai thong bao (ket qua quyet dinh), khoi gap/mo ("Vì sao thiếu
 * mục"). Mau theo NGHIA: xanh = da xong, xam = da co tu truoc, do = may chu tu choi, xanh duong =
 * dang cho gui lai.
 */
export function Notice({
  tone,
  title,
  detail,
  icon,
  testID,
}: {
  readonly tone: Tone;
  readonly title: string;
  readonly detail?: string | null;
  readonly icon?: IconName;
  readonly testID?: string;
}) {
  const { color } = useTheme();
  const { soft } = toneColors(tone, color);
  const glyph: IconName =
    icon ??
    (tone === 'live'
      ? 'check-circle'
      : tone === 'danger'
        ? 'alert-octagon'
        : tone === 'pending'
          ? 'cloud-sync'
          : 'information');
  return (
    <View
      testID={testID}
      accessibilityRole={tone === 'danger' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
      style={[styles.notice, { backgroundColor: soft }]}
    >
      <Icon name={glyph} tone={tone === 'signal' ? 'caution' : tone} />
      <View style={styles.flex}>
        <Text variant="bodyStrong">{title}</Text>
        {detail ? (
          <Text variant="caption" tone="muted">
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function Collapsible({
  title,
  summary,
  children,
  testID,
}: {
  readonly title: string;
  readonly summary?: string;
  readonly children: ReactNode;
  readonly testID?: string;
}) {
  const { color } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.collapse, { borderColor: color.line, backgroundColor: color.surface }]}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={({ pressed }) => [styles.collapseHead, { opacity: pressed ? 0.8 : 1 }]}
      >
        <View style={styles.flex}>
          <Text variant="bodyStrong">{title}</Text>
          {summary ? (
            <Text variant="caption" tone="muted">
              {summary}
            </Text>
          ) : null}
        </View>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} tone="muted" />
      </Pressable>
      {open ? <View style={styles.collapseBody}>{children}</View> : null}
    </View>
  );
}

/** Mot dong cham dau dong cho danh sach cau giai thich. */
export function Bullet({
  children,
  tone = 'muted',
}: {
  readonly children: string;
  readonly tone?: 'muted' | 'ink';
}) {
  return (
    <View style={styles.bullet}>
      <Text variant="caption" tone="faint">
        •
      </Text>
      <Text variant="caption" tone={tone} style={styles.flex}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    gap: SPACE.md,
    padding: SPACE.md,
    borderRadius: RADIUS.control,
    alignItems: 'flex-start',
  },
  flex: { flex: 1, gap: 2 },
  collapse: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.card,
    overflow: 'hidden',
  },
  collapseHead: {
    minHeight: 56,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  collapseBody: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.lg, gap: SPACE.sm },
  bullet: { flexDirection: 'row', gap: SPACE.sm },
});
