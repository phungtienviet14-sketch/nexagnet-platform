import { useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';
import { userMessage } from '../../src/api/errors';
import { useBranding } from '../../src/branding/BrandingProvider';
import { useSession } from '../../src/session/SessionProvider';
import { SPACE } from '../../src/theme/tokens';
import { BrandMark } from '../../src/ui/BrandMark';
import { Button } from '../../src/ui/Button';
import { Field } from '../../src/ui/Field';
import { Screen } from '../../src/ui/Screen';
import { Card } from '../../src/ui/Surface';
import { Text } from '../../src/ui/Text';

/** BUOC 2 — dang nhap bang tai khoan van phong cap. Khong co "dang ky": tai khoan do Giam doc tao. */
export default function LoginScreen() {
  const { signIn, serverUrl, notice, changeServer, serverFixed } = useSession();
  const { productName, descriptor } = useBranding();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const monogram = descriptor?.tenant?.branding.monogram ?? 'NX';
  const host = serverUrl?.replace(/^https?:\/\//, '') ?? '';

  async function handleSignIn() {
    if (username.trim() === '' || password === '') {
      setError('Nhập tên đăng nhập và mật khẩu.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn({ username, password });
    } catch (caught) {
      setError(userMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen testID="login-screen">
      <View style={styles.hero}>
        <BrandMark monogram={monogram} size={64} />
        <View style={styles.heroText}>
          <Text variant="overline" tone="muted">
            {serverFixed ? host : `Bước 2 / 2 · ${host}`}
          </Text>
          <Text variant="title">{productName}</Text>
        </View>
      </View>
      {notice ? (
        <Card rail="caution">
          <Text variant="label" tone="ink">
            {notice}
          </Text>
        </Card>
      ) : null}
      <Card>
        <View style={styles.stack}>
          <Field
            label="Tên đăng nhập"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
            returnKeyType="next"
            value={username}
            onChangeText={setUsername}
            onSubmitEditing={() => passwordRef.current?.focus()}
            testID="login-username"
          />
          <Field
            ref={passwordRef}
            label="Mật khẩu"
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={() => void handleSignIn()}
            error={error}
            testID="login-password"
          />
          <Button
            kind="primary"
            label="Đăng nhập"
            icon="login"
            loading={busy}
            onPress={() => void handleSignIn()}
            testID="login-submit"
          />
        </View>
      </Card>
      <Text variant="caption" tone="faint">
        Quên mật khẩu? Liên hệ văn phòng để được cấp lại — ứng dụng không tự đặt lại mật khẩu.
      </Text>
      {serverFixed ? null : (
        <Button
          kind="ghost"
          size="compact"
          label="Đổi doanh nghiệp / máy chủ"
          onPress={() => void changeServer()}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.lg,
    paddingTop: SPACE.xxl,
    paddingBottom: SPACE.md,
  },
  heroText: { flex: 1, gap: SPACE.hair },
  stack: { gap: SPACE.lg },
});
