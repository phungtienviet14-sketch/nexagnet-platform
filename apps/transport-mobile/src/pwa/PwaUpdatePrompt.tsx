import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SPACE } from '../theme/tokens';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { Card } from '../ui/Surface';
import { Text } from '../ui/Text';
import { registerServiceWorker, type PwaUpdate } from './register-sw';

/**
 * "CO BAN CAP NHAT" cua PWA — mot the noi phia tren thanh tab, CHI hien khi service worker moi da
 * cai xong va dang cho. Native khong bao gio thay no (`registerServiceWorker` la ham rong).
 *
 * AN TOAN la ba dieu: khong tu tai lai (nguoi dung co the dang go phieu dau); "Tải lại" doi hang doi
 * gui XONG luot dang chay (`busy`) roi moi thay ma — khong cat ngang mot lan tai anh chung tu; va
 * viec chua gui nam trong IndexedDB nen song sot qua lan tai lai.
 */
const TAB_BAR_HEIGHT = 66;

export function PwaUpdatePrompt({ busy }: { readonly busy: boolean }) {
  const insets = useSafeAreaInsets();
  const [update, setUpdate] = useState<PwaUpdate | null>(null);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => registerServiceWorker(setUpdate), []);

  useEffect(() => {
    if (accepted && !busy) update?.apply();
  }, [accepted, busy, update]);

  if (!update) return null;
  const waiting = accepted && busy;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.dock, { bottom: TAB_BAR_HEIGHT + insets.bottom + SPACE.md }]}
    >
      <Card rail="brand" style={styles.card} testID="pwa-update">
        <View style={styles.row}>
          <Icon name="update" size={22} tone="brand" />
          <View style={styles.text}>
            <Text variant="bodyStrong">Có bản cập nhật</Text>
            <Text variant="caption" tone="muted">
              {waiting
                ? 'Đang gửi nốt việc trên máy — tải lại ngay sau đó.'
                : 'Tải lại để dùng bản mới. Việc chưa gửi vẫn nằm trên máy.'}
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          <Button
            kind="ghost"
            size="compact"
            label="Để sau"
            disabled={accepted}
            onPress={() => setUpdate(null)}
          />
          <Button
            kind="primary"
            size="compact"
            label="Tải lại"
            icon="refresh"
            loading={waiting}
            onPress={() => setAccepted(true)}
            testID="pwa-update-apply"
          />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: SPACE.md, right: SPACE.md, alignItems: 'center' },
  card: {
    width: '100%',
    maxWidth: 480,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 28,
    shadowOpacity: 0.18,
    elevation: 8,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  text: { flex: 1, gap: SPACE.hair },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACE.sm,
    marginTop: SPACE.md,
  },
});
