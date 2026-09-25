import { StyleSheet, View } from 'react-native';
import { SPACE } from '../../../theme/tokens';
import { KeyValue, Pill } from '../../../ui/Surface';
import { Text } from '../../../ui/Text';
import { toLocationHealth } from '../location-health';
import type { VehicleLocationHealth } from '../types';

/**
 * SUC KHOE VI TRI bang CHU — khong ve ban do o day (ban do do mot phan khac cua ung dung lo). Mau
 * trung tinh cho "khong bat theo doi", khong bao gio do; dong "Thiết bị thực tế chưa được chứng minh"
 * luon co mat. Toa do chi la mot dong chu khi may chu tra (giam doc); ke toan khong co dong nao.
 */
export function LocationHealthBlock({
  health,
  timeZone,
}: {
  readonly health: VehicleLocationHealth;
  readonly timeZone: string;
}) {
  const model = toLocationHealth(health, timeZone);
  return (
    <View style={styles.wrap} testID="location-health">
      <Pill
        label={model.statusLabel}
        tone={model.tone}
        icon={
          model.tone === 'live'
            ? 'crosshairs-gps'
            : model.tone === 'neutral'
              ? 'map-marker-off-outline'
              : 'map-marker-question-outline'
        }
      />
      <Text variant="caption" tone="muted">
        {model.reason}
      </Text>
      {model.location ? (
        <>
          <KeyValue label={model.location.label} value={model.location.observedAt} strong />
          {model.location.coordinates ? (
            <KeyValue label="Toạ độ" value={model.location.coordinates} />
          ) : null}
        </>
      ) : null}
      {model.sources.map((source) => (
        <KeyValue
          key={source.key}
          label={`${source.label} · ${source.statusLabel}`}
          value={source.age}
          tone={source.tone === 'caution' ? 'caution' : 'ink'}
        />
      ))}
      <Text variant="caption" tone="faint" testID="device-proof-note">
        {model.deviceProofNote}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: SPACE.xs },
});
