import { useState } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';
import { useBranding } from '../../src/branding/BrandingProvider';
import { formatClock } from '../../src/format';
import { captureFixWithin } from '../../src/features/driver/fix-capture';
import { toFieldScreen } from '../../src/features/driver/field-work';
import { isFixStale, legPoints, nextStop } from '../../src/features/driver/map-model';
import { useDriverGates, useFieldWork } from '../../src/features/driver/queries';
import { directionsFallbackUrl, directionsUrl } from '../../src/map/directions';
import type { MapPoint } from '../../src/map/map-types';
import { RunMap } from '../../src/map/RunMap';
import type { FrozenFix } from '../../src/outbox/field-actions';
import { SPACE } from '../../src/theme/tokens';
import { AccountButton } from '../../src/ui/AccountButton';
import { Button } from '../../src/ui/Button';
import { Notice } from '../../src/ui/Notice';
import { Screen } from '../../src/ui/Screen';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../src/ui/States';
import { SyncBanner } from '../../src/ui/SyncBanner';
import { Text } from '../../src/ui/Text';

async function openDirections(point: MapPoint) {
  const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
  const url = directionsUrl(platform, point);
  await Linking.openURL(url).catch(() => Linking.openURL(directionsFallbackUrl(point)));
}

/**
 * "BẢN ĐỒ" — diem lay/giao cua chang dang lam (toa do THAT cua don), "Vị trí của tôi" lay MOT lan
 * khi bam (khong bam lien tuc), va mo chi duong bang ung dung ban do cua may.
 */
export default function DriverMap() {
  const gates = useDriverGates();
  const { timeZone } = useBranding();
  const work = useFieldWork(gates.field);
  const [fix, setFix] = useState<FrozenFix | null>(null);
  const [locating, setLocating] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const model = work.data ? toFieldScreen(work.data) : null;
  const card = model?.current ?? model?.others[0] ?? null;
  const legPts = card ? legPoints(card) : [];
  const me: MapPoint[] = fix
    ? [
        {
          id: 'me',
          kind: 'me',
          latitude: fix.latitude,
          longitude: fix.longitude,
          label: `Vị trí của tôi lúc ${formatClock(fix.capturedAt, timeZone)}`,
          stale: isFixStale(fix.capturedAt, Date.now()),
        },
      ]
    : [];
  const target = card ? legPts.find((point) => point.kind === nextStop(card.phase)) : undefined;
  const other = legPts.find((point) => point !== target);

  async function locate() {
    setLocating(true);
    setFailure(null);
    const outcome = await captureFixWithin(null);
    setLocating(false);
    if (outcome.kind === 'OK') setFix(outcome.fix);
    else setFailure(outcome.message.replace(/ — mốc chưa được ghi\.?$/, '.'));
  }

  return (
    <Screen
      title="Bản đồ"
      eyebrow={card ? `${card.runCode} · ${card.title}` : undefined}
      trailing={<AccountButton />}
      banner={<SyncBanner />}
      refreshing={work.isRefetching}
      onRefresh={() => void work.refetch()}
      testID="driver-map"
    >
      {work.isPending && gates.field ? (
        <LoadingBlock label="Đang đọc việc được điều cho bạn…" />
      ) : work.isError && !work.data ? (
        <ErrorBlock error={work.error} onRetry={() => void work.refetch()} />
      ) : !card ? (
        <EmptyBlock icon="map-outline" title="Chưa có chặng nào để xem trên bản đồ." />
      ) : (
        <>
          <Text variant="heading">{card.route}</Text>
          {legPts.length === 0 ? (
            <Notice
              tone="neutral"
              icon="map-marker-off-outline"
              title="Đơn này chưa có toạ độ lấy/giao"
            />
          ) : null}
          <RunMap points={[...legPts, ...me]} height={320} testID="map-view" />
          {failure ? <Notice tone="caution" icon="crosshairs-question" title={failure} /> : null}
          <View style={styles.actions}>
            {target ? (
              <Button
                kind="signal"
                size="hero"
                label={`Mở chỉ đường tới ${target.kind === 'pickup' ? 'điểm lấy' : 'điểm giao'}`}
                icon="navigation-variant"
                onPress={() => void openDirections(target)}
                testID="map-directions"
              />
            ) : null}
            {other ? (
              <Button
                kind="secondary"
                label={`Chỉ đường tới ${other.kind === 'pickup' ? 'điểm lấy' : 'điểm giao'}`}
                icon="directions"
                onPress={() => void openDirections(other)}
                testID="map-directions-other"
              />
            ) : null}
            <Button
              kind="secondary"
              label="Vị trí của tôi"
              icon="crosshairs-gps"
              loading={locating}
              hint="Lấy vị trí một lần, không bám liên tục"
              onPress={() => void locate()}
              testID="map-my-location"
            />
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: SPACE.sm },
});
