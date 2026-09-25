import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS, SPACE, TOUCH } from '../theme/tokens';
import { Icon } from './Icon';
import { Text } from './Text';

/**
 * LUA CHON LON — thay cho `<select>`: mot hang cao 56+, chu to, co vong chon ro rang. Lai xe chon
 * cay xang hay ly do cho bang ngon cai, khong phai bang mot danh sach cuon ti hon.
 *
 * `ChoiceRow` la mot radio (`accessibilityRole="radio"`); KHONG hang nao duoc chon san tru khi lop
 * goi truyen `selected` — mot lua chon mac dinh an la mot quyet dinh lai xe chua dua ra.
 */
export function ChoiceRow({
  label,
  detail,
  selected,
  onPress,
  testID,
  trailing,
}: {
  readonly label: string;
  readonly detail?: string | null;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly testID?: string;
  readonly trailing?: ReactNode;
}) {
  const { color } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        {
          borderColor: selected ? color.brand : color.line,
          backgroundColor: selected ? color.brandSoft : color.surfaceRaised,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.dot,
          { borderColor: selected ? color.brand : color.lineStrong },
          selected ? { backgroundColor: color.brand } : null,
        ]}
      >
        {selected ? <Icon name="check" size={14} tone="onBrand" /> : null}
      </View>
      <View style={styles.text}>
        <Text variant="bodyStrong">{label}</Text>
        {detail ? (
          <Text variant="caption" tone="muted">
            {detail}
          </Text>
        ) : null}
      </View>
      {trailing}
    </Pressable>
  );
}

/** Hai-ba lua chon loai tru nhau tren MOT hang (vd cach tra tien). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  testID,
}: {
  readonly options: ReadonlyArray<{ readonly value: T; readonly label: string }>;
  readonly value: T;
  readonly onChange: (next: T) => void;
  readonly testID?: string;
}) {
  const { color } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      testID={testID}
      style={[styles.segmented, { backgroundColor: color.surfaceSunken }]}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            testID={testID ? `${testID}-${option.value}` : undefined}
            style={[
              styles.segment,
              active ? { backgroundColor: color.surfaceRaised, borderColor: color.brand } : null,
            ]}
          >
            <Text variant="label" tone={active ? 'brand' : 'muted'} align="center">
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: TOUCH.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    borderWidth: 1.5,
    borderRadius: RADIUS.control,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
  },
  dot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  segmented: {
    flexDirection: 'row',
    borderRadius: RADIUS.control,
    padding: SPACE.xs,
    gap: SPACE.xs,
  },
  segment: {
    flex: 1,
    minHeight: TOUCH.min - SPACE.sm,
    borderRadius: RADIUS.control - 4,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.sm,
  },
});
