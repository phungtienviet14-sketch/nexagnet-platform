import {
  BeVietnamPro_400Regular,
  BeVietnamPro_500Medium,
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold,
  BeVietnamPro_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/be-vietnam-pro';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BrandingProvider, useBranding } from '../src/branding/BrandingProvider';
import { OutboxProvider } from '../src/outbox/OutboxProvider';
import { createQueryClient, wireQueryToDevice } from '../src/query';
import { SessionProvider, useSession } from '../src/session/SessionProvider';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';
import '../src/location/background-task';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  const [fontsLoaded, fontError] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
    BeVietnamPro_800ExtraBold,
  });

  useEffect(() => {
    wireQueryToDevice();
  }, []);

  // Loi nap font khong duoc chan ung dung: roi ve font he thong van dung duoc hon mot man trang.
  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <BrandingProvider>
              <ThemedApp />
            </BrandingProvider>
          </SessionProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function ThemedApp() {
  const { brandColor } = useBranding();
  return (
    <ThemeProvider brandColor={brandColor}>
      <OutboxProvider>
        <Navigator />
      </OutboxProvider>
    </ThemeProvider>
  );
}

function Navigator() {
  const { status } = useSession();
  const { color, scheme } = useTheme();
  useEffect(() => {
    if (status !== 'booting') void SplashScreen.hideAsync();
  }, [status]);
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.canvas } }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(driver)" />
        <Stack.Screen name="(director)" />
        <Stack.Screen name="(accounting)" />
        <Stack.Screen name="account" options={{ presentation: 'modal' }} />
        <Stack.Screen name="sync" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}
