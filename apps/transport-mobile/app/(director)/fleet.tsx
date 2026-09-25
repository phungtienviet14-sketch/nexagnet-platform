import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { buildVehicleRows, type VehicleRow } from '../../src/features/director/fleet';
import { VehicleSheet } from '../../src/features/director/ui/VehicleSheet';
import { fleetPhrase, runningSummary } from '../../src/features/office/control-tower';
import {
  useControlTower,
  useDrivers,
  useRefetchOnFocus,
  useVehicles,
} from '../../src/features/office/queries';
import { formatBusinessDate } from '../../src/format';
import { SPACE } from '../../src/theme/tokens';
import { AccountButton } from '../../src/ui/AccountButton';
import { Icon } from '../../src/ui/Icon';
import { Screen } from '../../src/ui/Screen';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../src/ui/States';
import { Card, Pill } from '../../src/ui/Surface';
import { SyncBanner } from '../../src/ui/SyncBanner';
import { Text } from '../../src/ui/Text';

/**
 * "ĐỘI XE" — xe TRUOC (bien so), roi vong chay cua xe tren bang: cot quy trinh, chang dang lam
 * (co co "RỖNG"), lai xe, km (null la "—"). So "dang chay" o dau man la cua MAY CHU; danh sach chi
 * sap xe dang lam viec len truoc. Cham mot xe -> suc khoe vi tri (bang chu) + hanh trinh.
 */
export default function DirectorFleet() {
  const tower = useControlTower();
  const vehicles = useVehicles();
  const drivers = useDrivers();
  useRefetchOnFocus(tower.refetch, tower.dataUpdatedAt);
  const [selected, setSelected] = useState<VehicleRow | null>(null);

  const rows = useMemo(
    () =>
      tower.data && vehicles.data
        ? buildVehicleRows(tower.data, vehicles.data, drivers.data ?? [])
        : null,
    [tower.data, vehicles.data, drivers.data],
  );
  const failed = tower.error ?? vehicles.error;

  return (
    <Screen
      title="Đội xe"
      eyebrow={
        tower.data ? `Bảng ngày ${formatBusinessDate(tower.data.generatedFor)}` : 'Xe và vòng chạy'
      }
      trailing={<AccountButton />}
      banner={<SyncBanner />}
      onRefresh={() => {
        void tower.refetch();
        void vehicles.refetch();
        void drivers.refetch();
      }}
      refreshing={tower.isRefetching || vehicles.isRefetching}
      testID="director-fleet"
    >
      {tower.data ? (
        <View style={styles.summary}>
          <Text variant="heading" testID="director-fleet-phrase">
            {fleetPhrase(tower.data.fleet)}
          </Text>
          <Text variant="caption" tone="muted">
            {runningSummary(tower.data.fleet)}
          </Text>
        </View>
      ) : null}
      {tower.isPending || vehicles.isPending ? (
        <LoadingBlock lines={5} label="Đang đọc đội xe…" />
      ) : null}
      {failed ? (
        <ErrorBlock
          error={failed}
          title="Chưa đọc được đội xe"
          onRetry={() => {
            void tower.refetch();
            void vehicles.refetch();
          }}
        />
      ) : null}
      {rows && rows.length === 0 ? (
        <EmptyBlock icon="truck-outline" title="Chưa có xe nào trong đội" />
      ) : null}
      {(rows ?? []).map((row) => (
        <VehicleCard key={row.vehicleId} row={row} onPress={() => setSelected(row)} />
      ))}
      <VehicleSheet row={selected} onClose={() => setSelected(null)} />
    </Screen>
  );
}

function VehicleCard({ row, onPress }: { readonly row: VehicleRow; readonly onPress: () => void }) {
  const working = row.runs.some((run) => run.column !== 'PLANNED' && run.column !== 'DELIVERED');
  return (
    <Card
      rail={working ? 'brand' : undefined}
      onPress={onPress}
      testID={`director-vehicle-${row.vehicleId}`}
      accessibilityLabel={`Xe ${row.plate}`}
    >
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text variant="heading">{row.plate}</Text>
          {row.vehicleClass ? (
            <Text variant="caption" tone="muted">
              {row.vehicleClass}
            </Text>
          ) : null}
        </View>
        {row.isUnderMaintenance ? (
          <Pill label="Đang sửa chữa" tone="neutral" icon="wrench" />
        ) : null}
        <Icon name="chevron-right" tone="muted" />
      </View>
      {row.runs.length === 0 ? (
        <Text variant="caption" tone="faint">
          Không có vòng chạy trên bảng.
        </Text>
      ) : (
        row.runs.map((run) => (
          <View key={run.key} style={styles.run}>
            <View style={styles.pills}>
              <Pill
                label={run.columnLabel}
                tone={run.column === 'DELIVERED' ? 'live' : 'neutral'}
              />
              <Text variant="label">{run.runCode}</Text>
              {run.isEmptyLeg ? (
                <Pill label="RỖNG" tone="caution" icon="package-variant-remove" />
              ) : null}
            </View>
            {run.legLabel ? (
              <Text variant="caption" tone={run.isEmptyLeg ? 'caution' : 'muted'}>
                {run.legLabel} · {run.phaseLabel}
              </Text>
            ) : null}
            <Text variant="caption" tone={run.driverId === null ? 'danger' : 'muted'}>
              {run.driverName} · {run.totalKm} (rỗng {run.emptyKm})
            </Text>
          </View>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  summary: { gap: SPACE.xs, marginBottom: SPACE.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  flex: { flex: 1 },
  run: { gap: 2, marginTop: SPACE.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACE.sm },
});
