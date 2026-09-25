import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { formatBusinessDate } from '../../../format';
import { SPACE } from '../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../ui/States';
import { Card, Pill, Section } from '../../../ui/Surface';
import { Text } from '../../../ui/Text';
import { TRIP_STATUS_LABEL } from '../labels';
import { useMyTrips } from '../queries';
import type { DriverTripView } from '../types';

/**
 * CHUYEN THEO CACH LAM CU — LOI PHU, dong san, khong mang nut (`#340`). Viec duoc dieu (vong chay)
 * la nguon "co viec hay khong"; chuyen cu chi de doc lai. Doc hong thi NOI RA o day, khong giau.
 */
export function LegacyTrips({
  enabled,
  initiallyOpen = false,
}: {
  readonly enabled: boolean;
  readonly initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const trips = useMyTrips(enabled && open);
  if (!enabled) return null;
  return (
    <Section
      title="Chuyến cũ"
      action={
        <Button
          kind="ghost"
          size="compact"
          label={open ? 'Thu gọn' : 'Mở'}
          icon={open ? 'chevron-up' : 'chevron-down'}
          onPress={() => setOpen((value) => !value)}
          testID="driver-legacy-toggle"
        />
      }
    >
      {!open ? (
        <Text variant="caption" tone="faint">
          Chuyến theo cách làm trước đây — chỉ để xem lại, không bấm việc ở đây.
        </Text>
      ) : trips.isPending ? (
        <LoadingBlock lines={2} label="Đang đọc chuyến cũ…" />
      ) : trips.isError ? (
        <ErrorBlock
          error={trips.error}
          title="Chưa đọc được chuyến theo cách làm trước đây"
          onRetry={() => void trips.refetch()}
        />
      ) : trips.data.length === 0 ? (
        <EmptyBlock icon="history" title="Không có chuyến cũ nào." />
      ) : (
        <View style={styles.list}>
          {trips.data.slice(0, 10).map((trip) => (
            <TripRow key={trip.id} trip={trip} />
          ))}
        </View>
      )}
    </Section>
  );
}

function TripRow({ trip }: { readonly trip: DriverTripView }) {
  return (
    <Card testID={`driver-trip-${trip.id}`}>
      <View style={styles.row}>
        <Text variant="bodyStrong" style={styles.flex}>
          {trip.code}
        </Text>
        <Pill label={TRIP_STATUS_LABEL[trip.status] ?? trip.status} tone="neutral" />
      </View>
      <Text variant="body">
        {trip.originLabel} → {trip.destinationLabel}
      </Text>
      <Text variant="caption" tone="muted">
        {formatBusinessDate(trip.businessDate)}
        {trip.vehicleRegistrationPlate ? ` · Xe ${trip.vehicleRegistrationPlate}` : ''}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: SPACE.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  flex: { flex: 1 },
});
