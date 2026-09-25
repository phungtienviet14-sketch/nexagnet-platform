import { CameraView, useCameraPermissions } from 'expo-camera';
import { useIsFocused, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureBridge } from '../../src/capture/capture-bridge';
import { SPACE } from '../../src/theme/tokens';
import { Button } from '../../src/ui/Button';
import { Icon } from '../../src/ui/Icon';
import { Text } from '../../src/ui/Text';

/**
 * MAY ANH TRONG UNG DUNG — toan man hinh, mot nut chup lon, mot nut dong.
 *
 * Anh o day la anh VUA CHUP (`LIVE_CAMERA`). Man nay khong xu ly, khong xep hang: no giao anh qua
 * `captureBridge` cho man da mo no, roi quay lai. Roi man ma chua chup (vuot lui, nut Dong) thi giao
 * `null` — man goi hieu la "huy", khong treo mai.
 *
 * Route nay nam trong nhom TAB (an khoi thanh tab): tab KHONG go man khi roi di, nen may anh chi
 * duoc dung khi man dang duoc nhin — roi man la go han (tat camera, huy yeu cau treo).
 */
export default function CaptureRoute() {
  return useIsFocused() ? <CaptureScreen /> : null;
}

function CaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) void requestPermission();
  }, [permission, requestPermission]);

  // Roi man bang BAT KY cach nao: yeu cau con treo thi ket thuc bang `null`.
  useEffect(() => () => captureBridge.deliverCapture(null), []);

  function close() {
    captureBridge.deliverCapture(null);
    if (router.canGoBack()) router.back();
  }

  async function shoot() {
    const camera = cameraRef.current;
    if (!camera || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      const picture = await camera.takePictureAsync({ quality: 0.9, exif: false });
      captureBridge.deliverCapture({
        uri: picture.uri,
        width: picture.width,
        height: picture.height,
      });
      if (router.canGoBack()) router.back();
    } catch {
      setFailure('Chưa chụp được ảnh — giữ máy yên rồi bấm lại.');
    } finally {
      setBusy(false);
    }
  }

  const denied = permission !== null && !permission.granted && !permission.canAskAgain;

  return (
    <View style={styles.root} testID="capture-screen">
      {permission?.granted ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          onCameraReady={() => setReady(true)}
          onMountError={() => setFailure('Không mở được máy ảnh trên máy này.')}
        />
      ) : null}

      <View style={[styles.top, { paddingTop: insets.top + SPACE.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Đóng máy ảnh"
          onPress={close}
          hitSlop={12}
          testID="capture-close"
          style={styles.close}
        >
          <Icon name="close" size={28} tone="onBrand" />
        </Pressable>
        <Text variant="bodyStrong" tone="onBrand" style={styles.flex}>
          Chụp rõ cả tờ giấy, đủ chữ ký và con số
        </Text>
      </View>

      {denied || permission?.granted === false ? (
        <View style={styles.center}>
          <Text variant="heading" tone="onBrand" align="center">
            {denied
              ? 'Chưa có quyền dùng máy ảnh.'
              : 'Ứng dụng cần quyền máy ảnh để chụp chứng từ.'}
          </Text>
          <Text variant="body" tone="onBrand" align="center">
            {denied
              ? 'Mở Cài đặt để cho phép, hoặc đóng lại và chọn ảnh từ thư viện.'
              : 'Cho phép ở hộp thoại của máy, hoặc đóng lại và chọn ảnh từ thư viện.'}
          </Text>
          {denied && Platform.OS !== 'web' ? (
            <Button
              kind="secondary"
              label="Mở Cài đặt"
              icon="cog"
              onPress={() => void Linking.openSettings()}
              style={styles.onDark}
            />
          ) : (
            <Button
              kind="secondary"
              label="Cho phép máy ảnh"
              icon="camera"
              onPress={() => void requestPermission()}
              style={styles.onDark}
            />
          )}
        </View>
      ) : null}

      <View style={[styles.bottom, { paddingBottom: insets.bottom + SPACE.xl }]}>
        {failure ? (
          <Text variant="bodyStrong" tone="onBrand" align="center" accessibilityLiveRegion="polite">
            {failure}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Chụp ảnh"
          accessibilityState={{ disabled: !ready || busy, busy }}
          disabled={!ready || busy}
          onPress={() => void shoot()}
          testID="capture-shutter"
          style={({ pressed }) => [
            styles.shutter,
            { opacity: !ready || busy ? 0.4 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] },
          ]}
        >
          <View style={styles.shutterInner} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A0B0D' },
  flex: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: SPACE.xl,
    paddingBottom: SPACE.md,
    backgroundColor: 'rgba(10,11,13,0.55)',
  },
  close: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, justifyContent: 'center', padding: SPACE.xxl, gap: SPACE.md },
  onDark: { backgroundColor: '#FFFFFF' },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    gap: SPACE.md,
    paddingTop: SPACE.lg,
    backgroundColor: 'rgba(10,11,13,0.55)',
  },
  shutter: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#FFFFFF' },
});
