import { StyleSheet, View } from 'react-native';
import { isQuietReadFailure } from '../../office/finance';
import { useBranding } from '../../../branding/BrandingProvider';
import { SPACE } from '../../../theme/tokens';
import { Sheet } from '../../../ui/Sheet';
import { ErrorBlock, LoadingBlock } from '../../../ui/States';
import { Divider, KeyValue, Pill } from '../../../ui/Surface';
import { Text } from '../../../ui/Text';
import { useOfficeAccess } from '../../office/queries';
import { LocationHealthBlock } from '../../office/ui/LocationHealthBlock';
import type { VehicleRow } from '../fleet';
import { journeyLegLines, recentTimeline } from '../orders';
import { useJourney, useLocationHealth } from '../queries';

/**
 * MOT XE: suc khoe vi tri (`/vehicles/:id/location-health`, mot xe mot lan goi — may chu chua co
 * duong doc ca doi) va tom tat hanh trinh cua vong chay dau tien tren bang (`/journey/runs/:code`).
 */
export function VehicleSheet({
  row,
  onClose,
}: {
  readonly row: VehicleRow | null;
  readonly onClose: () => void;
}) {
  const { timeZone } = useBranding();
  const { can, has } = useOfficeAccess();
  const proofEnabled = has('transport-proof') && can('transport.tracking.read');
  const health = useLocationHealth(row?.vehicleId ?? null, proofEnabled);
  const run = row?.runs[0] ?? null;
  const journey = useJourney(run?.runCode ?? null);

  return (
    <Sheet
      visible={row !== null}
      onClose={onClose}
      title={row?.plate ?? ''}
      subtitle={row?.vehicleClass ?? undefined}
    >
      {row ? (
        <View style={styles.body} testID="director-vehicle-detail">
          <Text variant="overline" tone="muted">
            Vị trí
          </Text>
          {!proofEnabled ? (
            <Text variant="caption" tone="faint">
              Doanh nghiệp chưa bật bám vị trí, hoặc tài khoản không có quyền xem.
            </Text>
          ) : health.isPending ? (
            <LoadingBlock lines={2} label="Đang đọc tình trạng vị trí…" />
          ) : health.isError ? (
            isQuietReadFailure(health.error) ? (
              <Text variant="caption" tone="faint">
                Máy chủ chưa mở phần vị trí cho tài khoản này.
              </Text>
            ) : (
              <ErrorBlock error={health.error} onRetry={() => void health.refetch()} />
            )
          ) : (
            <LocationHealthBlock health={health.data} timeZone={timeZone} />
          )}

          <Divider />
          <Text variant="overline" tone="muted">
            Hành trình
          </Text>
          {run === null ? (
            <Text variant="caption" tone="faint">
              Xe không có vòng chạy nào trên bảng hôm nay.
            </Text>
          ) : (
            <>
              <View style={styles.pills}>
                <Pill label={run.runCode} tone="brand" />
                <Pill label={run.columnLabel} tone="neutral" />
                {run.isEmptyLeg ? (
                  <Pill label="RỖNG" tone="caution" icon="package-variant-remove" />
                ) : null}
              </View>
              <KeyValue label="Lái xe" value={run.driverName} />
              <KeyValue label="Tổng km" value={run.totalKm} />
              <KeyValue label="Km rỗng" value={run.emptyKm} />
              {journey.isPending ? <LoadingBlock lines={2} label="Đang đọc hành trình…" /> : null}
              {journey.isError ? (
                <ErrorBlock error={journey.error} onRetry={() => void journey.refetch()} />
              ) : null}
              {journey.data ? (
                <>
                  {journeyLegLines(journey.data).map((line) => (
                    <Text key={line} variant="caption" tone="muted">
                      {line}
                    </Text>
                  ))}
                  {recentTimeline(journey.data, timeZone).map((event) => (
                    <KeyValue
                      key={event.key}
                      label={`${event.label} · ${event.proof}`}
                      value={event.at}
                    />
                  ))}
                  {journey.data.timeline.length === 0 ? (
                    <Text variant="caption" tone="faint">
                      Chưa có mốc hiện trường nào.
                    </Text>
                  ) : null}
                </>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: SPACE.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
});
