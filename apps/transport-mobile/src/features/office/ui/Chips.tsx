import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '../../../theme/ThemeProvider';
import { RADIUS, SPACE } from '../../../theme/tokens';
import { Text } from '../../../ui/Text';

/**
 * CHIP LOC — mot hang ngang cuon duoc. Chip dang chon dung mau DIEU HUONG (khong phai ho phach: ho
 * phach danh cho quyet dinh). So dem la SO CUA MAY CHU khi co, kem nhan "hiện x/y" khi danh sach
 * bi cat.
 */
export interface ChipOption {
  readonly key: string;
  readonly label: string;
  readonly count?: string | null;
  readonly testID?: string;
}

export function FilterChips({
  options,
  selected,
  onSelect,
  label,
}: {
  readonly options: readonly ChipOption[];
  readonly selected: string;
  readonly onSelect: (key: string) => void;
  readonly label: string;
}) {
  const { color } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={label}
      contentContainerStyle={styles.row}
    >
      {options.map((option) => {
        const active = option.key === selected;
        return (
          <Pressable
            key={option.key}
            testID={option.testID}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.count ? `${option.label}, ${option.count}` : option.label}
            onPress={() => onSelect(option.key)}
            hitSlop={6}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: active ? color.brand : color.surface,
                borderColor: active ? color.brand : color.lineStrong,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <Text variant="label" tone={active ? 'onBrand' : 'ink'}>
              {option.label}
            </Text>
            {option.count ? (
              <View
                style={[
                  styles.count,
                  { backgroundColor: active ? color.brandInk : color.surfaceSunken },
                ]}
              >
                <Text variant="caption" tone={active ? 'brand' : 'muted'} style={styles.figure}>
                  {option.count}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: SPACE.sm, paddingVertical: SPACE.xs },
  chip: {
    minHeight: 44,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.chip,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  count: { borderRadius: RADIUS.chip, paddingHorizontal: SPACE.sm, minWidth: 24 },
  figure: { fontVariant: ['tabular-nums'], textAlign: 'center' },
});
