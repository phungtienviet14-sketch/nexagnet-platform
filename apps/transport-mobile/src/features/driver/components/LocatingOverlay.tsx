import { ActivityIndicator, Modal, StyleSheet, View } from 'react-native';
import { useTheme } from '../../../theme/ThemeProvider';
import { RADIUS, SPACE } from '../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { Text } from '../../../ui/Text';
import type { LocatingState } from '../use-field-actions';

/**
 * "ĐANG LẤY VỊ TRÍ…" — toan man hinh, vi day la luc lai xe can biet ung dung DANG LAM GI.
 *
 * Moc bat buoc vi tri: chi co "Huỷ" (khong co vi tri = khong ghi — noi ro o man sau). Moc khong bat
 * buoc: them "Ghi không kèm vị trí" — lai xe khong bi giu lai vi GPS, va nhan cua viec noi that gio
 * cua no la gio may chu nhan.
 */
export function LocatingOverlay({
  state,
  onCancel,
  onSkip,
}: {
  readonly state: LocatingState | null;
  readonly onCancel: () => void;
  readonly onSkip: () => void;
}) {
  const { color } = useTheme();
  return (
    <Modal visible={state !== null} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.scrim, { backgroundColor: color.scrim }]}>
        <View
          style={[styles.panel, { backgroundColor: color.surface }]}
          accessibilityViewIsModal
          testID="locating-overlay"
        >
          <View style={[styles.badge, { backgroundColor: color.brandSoft }]}>
            <Icon name="crosshairs-gps" size={30} tone="brand" />
          </View>
          <Text variant="title" align="center" accessibilityRole="header">
            Đang lấy vị trí…
          </Text>
          <Text variant="body" tone="muted" align="center">
            {state?.required
              ? `Mốc “${state.label}” cần vị trí làm bằng chứng. Đứng ở chỗ thoáng, giữ máy yên.`
              : `Vị trí giúp ghi đúng giờ bạn bấm “${state?.label ?? ''}”. Chờ tối đa 8 giây.`}
          </Text>
          <ActivityIndicator size="large" color={color.brand} />
          <View style={styles.actions}>
            {state && !state.required ? (
              <Button
                kind="secondary"
                label="Ghi không kèm vị trí"
                icon="map-marker-off-outline"
                hint="Giờ của mốc sẽ tính theo lúc máy chủ nhận"
                onPress={onSkip}
                testID="locating-skip"
              />
            ) : null}
            <Button kind="ghost" label="Huỷ" onPress={onCancel} testID="locating-cancel" />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, justifyContent: 'center', padding: SPACE.xl },
  panel: { borderRadius: RADIUS.sheet, padding: SPACE.xxl, gap: SPACE.lg, alignItems: 'stretch' },
  badge: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { gap: SPACE.sm },
});
