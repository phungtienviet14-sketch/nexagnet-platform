import { CameraView } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Platform } from 'react-native';
import { captureBridge } from './capture-bridge';
import {
  captureWithSystemCamera,
  fromInAppCamera,
  pickFromLibrary,
  pickPdf,
  type PickOutcome,
} from './pickers';

export type CaptureChoice = 'CAMERA' | 'LIBRARY' | 'PDF';

/**
 * BA LUA CHON THAT THA cho mot to chung tu — mot ham, moi nen tang.
 *
 * "Chụp ảnh" mo may anh TRONG ung dung (route `capture`) — do la duong DUY NHAT ta chung minh duoc
 * anh vua chup (`LIVE_CAMERA`). Trinh duyet khong co may anh (may tinh, trang khong HTTPS) thi roi
 * ve hop chup cua he thong va ghi `UNKNOWN` — khong goi no la anh song.
 */
export function useCapture(): (choice: CaptureChoice) => Promise<PickOutcome> {
  const router = useRouter();
  return useCallback(
    async (choice: CaptureChoice) => {
      if (choice === 'LIBRARY') return pickFromLibrary();
      if (choice === 'PDF') return pickPdf();
      if (Platform.OS === 'web') {
        const available = await CameraView.isAvailableAsync().catch(() => false);
        if (!available) return captureWithSystemCamera();
      }
      const waiting = captureBridge.awaitCapture();
      router.push('/(driver)/capture');
      const photo = await waiting;
      if (photo === null) return { kind: 'CANCELLED' };
      return fromInAppCamera(photo);
    },
    [router],
  );
}
