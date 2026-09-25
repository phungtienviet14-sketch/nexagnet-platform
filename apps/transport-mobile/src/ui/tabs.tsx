import type { BottomTabNavigationOptions } from 'expo-router/tabs';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { FONT } from '../theme/typography';
import { Icon, type IconName } from './Icon';

/**
 * THANH TAB — toi da 4-5 dich den, cao, chu ro (web cu nhoi 9 tab 0.78rem vao 390px). Tab dang chon
 * co "vien thuoc" mau dieu huong sau icon, khong chi doi mau chu — nhin thay duoc ngoai nang.
 */
export function useTabOptions(): BottomTabNavigationOptions {
  const { color } = useTheme();
  const insets = useSafeAreaInsets();
  return {
    headerShown: false,
    tabBarActiveTintColor: color.brand,
    tabBarInactiveTintColor: color.inkMuted,
    tabBarStyle: {
      backgroundColor: color.surface,
      borderTopColor: color.line,
      height: 66 + insets.bottom,
      paddingTop: 8,
      paddingBottom: Math.max(insets.bottom, 10),
    },
    tabBarLabelStyle: { fontFamily: FONT.semibold, fontSize: 12 },
  };
}

export function TabIcon({ name, focused }: { readonly name: IconName; readonly focused: boolean }) {
  const { color } = useTheme();
  return (
    <View style={[styles.pill, focused ? { backgroundColor: color.brandSoft } : null]}>
      <Icon name={name} size={24} tone={focused ? 'brand' : 'muted'} />
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
