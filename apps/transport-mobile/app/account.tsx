import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Linking, Platform, StyleSheet, View } from 'react-native';
import { useBranding } from '../src/branding/BrandingProvider';
import { BUILD_INFO } from '../src/config/build-info';
import { formatClock } from '../src/format';
import {
  runTrackingStatus,
  stopRunTracking,
  type TrackingStatus,
} from '../src/location/background-task';
import { describeLocation, type LocationFacts } from '../src/location/location-state';
import { useOutbox } from '../src/outbox/OutboxProvider';
import { useSession } from '../src/session/SessionProvider';
import { ROLE_LABEL, experienceForRole } from '../src/session/session-types';
import { SPACE } from '../src/theme/tokens';
import { BrandMark } from '../src/ui/BrandMark';
import { Button } from '../src/ui/Button';
import { Screen } from '../src/ui/Screen';
import { Card, Divider, KeyValue, Pill, Section } from '../src/ui/Surface';
import { Text } from '../src/ui/Text';

async function readLocationFacts(tracking: TrackingStatus): Promise<LocationFacts> {
  if (Platform.OS === 'web') {
    return {
      servicesEnabled: true,
      foreground: 'undetermined',
      foregroundCanAskAgain: true,
      background: 'undetermined',
      buildSupportsBackground: false,
      backgroundTaskRunning: false,
      platform: 'web',
    };
  }
  const [services, foreground, background] = await Promise.all([
    Location.hasServicesEnabledAsync(),
    Location.getForegroundPermissionsAsync(),
    BUILD_INFO.backgroundLocationBuild
      ? Location.getBackgroundPermissionsAsync()
      : Promise.resolve(null),
  ]);
  return {
    servicesEnabled: services,
    foreground: foreground.status as LocationFacts['foreground'],
    foregroundCanAskAgain: foreground.canAskAgain,
    background: (background?.status ?? 'undetermined') as LocationFacts['background'],
    buildSupportsBackground: BUILD_INFO.backgroundLocationBuild,
    backgroundTaskRunning: tracking.running,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  };
}

/**
 * "TÔI" — dung chung moi vai: ai dang dang nhap, vao doanh nghiep nao, may nay dang the nao voi vi
 * tri va hang doi, va ban ung dung nao. Man dau tien van phong can khi lai xe goi bao loi.
 */
export default function AccountScreen() {
  const router = useRouter();
  const { session, serverUrl, signOut, lastVerifyError } = useSession();
  const { productName, descriptor } = useBranding();
  const outbox = useOutbox();
  const [facts, setFacts] = useState<LocationFacts | null>(null);
  const [tracking, setTracking] = useState<TrackingStatus>({
    running: false,
    runId: null,
    runCode: null,
  });
  const isDriver = session ? experienceForRole(session.user.role) === 'driver' : false;

  const refresh = useCallback(async () => {
    const status = await runTrackingStatus();
    setTracking(status);
    setFacts(await readLocationFacts(status));
  }, []);

  useEffect(() => {
    void refresh();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  const statement = facts ? describeLocation(facts) : null;

  function handleSignOut() {
    const waiting = outbox.pending + outbox.blocked;
    const detail =
      waiting > 0
        ? `Còn ${waiting} việc chưa lên hệ thống. Chúng vẫn nằm trên máy và chỉ gửi được khi CHÍNH tài khoản này đăng nhập lại.`
        : 'Bạn sẽ cần mật khẩu để vào lại.';
    Alert.alert('Đăng xuất?', detail, [
      { text: 'Ở lại', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            await stopRunTracking();
            await signOut();
            router.replace('/');
          })(),
      },
    ]);
  }

  if (!session) return null;
  return (
    <Screen
      title="Tài khoản"
      trailing={<Button kind="ghost" size="compact" label="Đóng" onPress={() => router.back()} />}
    >
      <Card>
        <View style={styles.identity}>
          <BrandMark monogram={descriptor?.tenant?.branding.monogram ?? 'NX'} size={48} />
          <View style={styles.flex}>
            <Text variant="heading">{session.user.name}</Text>
            <Text variant="caption" tone="muted">
              {session.user.username} · {productName}
            </Text>
          </View>
          <Pill label={ROLE_LABEL[session.user.role]} tone="brand" />
        </View>
        <Divider />
        <KeyValue label="Máy chủ" value={serverUrl?.replace(/^https?:\/\//, '') ?? '—'} />
        <KeyValue
          label="Xác nhận phiên gần nhất"
          value={lastVerifyError ? 'chưa kết nối được' : formatClock(session.verifiedAt)}
          tone={lastVerifyError ? 'caution' : 'ink'}
        />
      </Card>

      {isDriver && statement ? (
        <Section title="Vị trí trên máy này">
          <Card
            rail={
              statement.pointInTime.tone === 'live'
                ? 'live'
                : statement.pointInTime.tone === 'danger'
                  ? 'danger'
                  : 'caution'
            }
          >
            <Text variant="bodyStrong">Vị trí lúc bấm mốc</Text>
            <Text variant="caption" tone="muted">
              {statement.pointInTime.text}
            </Text>
            {!statement.pointInTime.ok ? (
              <Button
                kind="secondary"
                size="compact"
                label="Mở Cài đặt"
                icon="cog"
                onPress={() => void Linking.openSettings()}
              />
            ) : null}
          </Card>
          <Card rail={statement.background.tone === 'live' ? 'live' : 'neutral'}>
            <Text variant="bodyStrong">{statement.background.title}</Text>
            <Text variant="caption" tone="muted">
              {statement.background.detail}
            </Text>
            {tracking.running ? (
              <Button
                kind="secondary"
                size="compact"
                label={`Tắt bám vị trí (${tracking.runCode ?? ''})`}
                icon="map-marker-off"
                onPress={() => void stopRunTracking().then(refresh)}
              />
            ) : null}
            <Text variant="caption" tone="faint">
              Tình trạng thử nghiệm: đã nghiên cứu, CHƯA được chứng minh trên thiết bị thật.
            </Text>
          </Card>
        </Section>
      ) : null}

      <Section title="Dữ liệu trên máy">
        <Card onPress={() => router.push('/sync')} accessibilityLabel="Mở danh sách việc trên máy">
          <View style={styles.identity}>
            <View style={styles.flex}>
              <Text variant="bodyStrong">Việc chờ gửi: {outbox.pending}</Text>
              <Text variant="caption" tone={outbox.blocked > 0 ? 'danger' : 'muted'}>
                {outbox.blocked > 0
                  ? `${outbox.blocked} việc bị từ chối — cần xem`
                  : 'Không có việc bị từ chối'}
              </Text>
            </View>
            <Text variant="label" tone="brand">
              Xem
            </Text>
          </View>
        </Card>
      </Section>

      <Section title="Phiên bản">
        <Card>
          <KeyValue label="Ứng dụng" value={BUILD_INFO.appName} />
          <KeyValue
            label="Phiên bản"
            value={`${BUILD_INFO.version} (bản dựng ${BUILD_INFO.buildNumber})`}
            strong
          />
          <KeyValue label="Kênh" value={BUILD_INFO.variant} />
          <KeyValue label="Nền tảng" value={BUILD_INFO.platform} />
          {BUILD_INFO.gitSha ? (
            <KeyValue label="Mã nguồn" value={BUILD_INFO.gitSha.slice(0, 10)} />
          ) : null}
        </Card>
      </Section>

      <View style={styles.footer}>
        <Button
          kind="danger"
          label="Đăng xuất"
          icon="logout"
          onPress={handleSignOut}
          testID="sign-out"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, paddingBottom: SPACE.md },
  flex: { flex: 1 },
  footer: { marginTop: SPACE.xxl },
});
