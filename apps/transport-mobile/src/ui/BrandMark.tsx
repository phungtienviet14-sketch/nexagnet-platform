import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { RADIUS } from '../theme/tokens';
import { Text } from './Text';

/**
 * DAU THUONG HIEU trong ung dung: o vuong bo goc mau thuong hieu + chu viet tat cua doanh nghiep
 * (`branding.monogram`). Icon tren man hinh chinh thi co dinh (mot ung dung tren cua hang), nen
 * day la cho doanh nghiep NHIN THAY chinh minh.
 */
export function BrandMark({
  monogram,
  size = 56,
}: {
  readonly monogram: string;
  readonly size?: number;
}) {
  const { color } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.mark,
        {
          width: size,
          height: size,
          borderRadius: size > 48 ? RADIUS.card : RADIUS.control,
          backgroundColor: color.brand,
        },
      ]}
    >
      <View style={[styles.stripe, { backgroundColor: color.signal }]} />
      <Text variant={size > 48 ? 'title' : 'bodyStrong'} tone="onBrand">
        {monogram.slice(0, 3).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  stripe: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 6 },
});
