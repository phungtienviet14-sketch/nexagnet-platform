import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { userMessage } from '../../src/api/errors';
import { fetchClientDescriptor, TRANSPORT_EXPERIENCE } from '../../src/api/platform';
import { normalizeServerUrl } from '../../src/api/server-url';
import { ALLOW_INSECURE_LOCAL } from '../../src/config/build-info';
import { makeHttp, useSession } from '../../src/session/SessionProvider';
import { SPACE } from '../../src/theme/tokens';
import { Button } from '../../src/ui/Button';
import { Field } from '../../src/ui/Field';
import { Screen } from '../../src/ui/Screen';
import { Card } from '../../src/ui/Surface';
import { Text } from '../../src/ui/Text';

/**
 * BUOC 1 — "Doanh nghiệp của bạn ở đâu". Mot ung dung tren cua hang phuc vu NHIEU doanh nghiep,
 * moi doanh nghiep mot may chu rieng; van phong dua dia chi nay cho lai xe mot lan.
 *
 * Kiem TRUOC khi cho dang nhap: may chu phai tra loi, phai o che do dang nhap theo phien, va phai
 * la doanh nghiep VAN TAI — nhap nham dia chi cua mot he thong khac thi noi ngay, khong de lai xe
 * go mat khau vao cho khong dung.
 */
export default function ServerScreen() {
  const { chooseServer } = useSession();
  const router = useRouter();
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleContinue() {
    const normalized = normalizeServerUrl(address, ALLOW_INSECURE_LOCAL);
    if (!normalized.ok) {
      setError(normalized.message);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const descriptor = await fetchClientDescriptor(makeHttp(normalized.url, () => null));
      if (descriptor && descriptor.authMode !== 'session') {
        setError('Máy chủ này chưa bật đăng nhập theo tài khoản — báo quản trị hệ thống.');
        return;
      }
      if (descriptor?.tenant && descriptor.tenant.experience !== TRANSPORT_EXPERIENCE) {
        setError('Địa chỉ này không phải hệ thống vận tải. Kiểm tra lại với văn phòng.');
        return;
      }
      await chooseServer(normalized.url);
      router.replace('/(auth)/login');
    } catch (caught) {
      setError(userMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen eyebrow="Bước 1 / 2" title="Doanh nghiệp của bạn">
      <Text tone="muted">
        Nhập địa chỉ hệ thống mà văn phòng gửi cho bạn. Chỉ cần làm một lần trên máy này.
      </Text>
      <Card>
        <View style={styles.stack}>
          <Field
            label="Địa chỉ máy chủ"
            placeholder="van-tai.congty.vn"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            textContentType="URL"
            returnKeyType="go"
            value={address}
            onChangeText={setAddress}
            onSubmitEditing={() => void handleContinue()}
            error={error}
            testID="server-address"
          />
          <Button
            kind="primary"
            label="Tiếp tục"
            icon="arrow-right"
            loading={busy}
            onPress={() => void handleContinue()}
            testID="server-continue"
          />
        </View>
      </Card>
      <Text variant="caption" tone="faint">
        Kết nối luôn được mã hoá (HTTPS). Ứng dụng không gửi dữ liệu của bạn đi đâu khác ngoài máy
        chủ này.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({ stack: { gap: SPACE.lg } });
