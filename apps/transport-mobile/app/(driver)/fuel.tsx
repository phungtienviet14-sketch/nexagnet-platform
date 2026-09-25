import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useBranding } from '../../src/branding/BrandingProvider';
import {
  pendingFuelSlips,
  toFuelSlipRows,
  type FuelSlipRow,
} from '../../src/features/driver/fuel-slips';
import { useDriverGates, useFuelSlips } from '../../src/features/driver/queries';
import { useQueueView } from '../../src/features/driver/use-queue';
import { isQuietReadFailure } from '../../src/features/office/finance';
import { SPACE } from '../../src/theme/tokens';
import { AccountButton } from '../../src/ui/AccountButton';
import { Button } from '../../src/ui/Button';
import { Notice } from '../../src/ui/Notice';
import { Screen } from '../../src/ui/Screen';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../src/ui/States';
import { Card, KeyValue, Pill, Section } from '../../src/ui/Surface';
import { SyncBanner } from '../../src/ui/SyncBanner';
import { Text } from '../../src/ui/Text';

/**
 * "NHIÊN LIỆU" — MOT nut ho phach "Ghi phiếu đổ dầu"; roi phieu CON TREN MAY (de khong ghi lai lan
 * nua); roi phieu da len may chu. Xac thuc va doi soat la cua MAY CHU — the chi doc lai.
 */
export default function DriverFuel() {
  const router = useRouter();
  const gates = useDriverGates();
  const { timeZone } = useBranding();
  const slips = useFuelSlips(gates.fuelRead);
  const { entries } = useQueueView();
  const pending = pendingFuelSlips(entries);
  const quiet = slips.isError && isQuietReadFailure(slips.error);
  const rows = slips.data ? toFuelSlipRows(slips.data, timeZone) : [];

  return (
    <Screen
      title="Nhiên liệu"
      eyebrow="Phiếu đổ dầu của tôi"
      trailing={<AccountButton />}
      banner={<SyncBanner />}
      onRefresh={gates.fuelRead ? () => void slips.refetch() : undefined}
      refreshing={slips.isRefetching}
      testID="driver-fuel"
    >
      {gates.fuelSubmit ? (
        <Button
          kind="signal"
          size="hero"
          label="Ghi phiếu đổ dầu"
          icon="gas-station"
          hint="Ghi được cả khi mất sóng — có sóng sẽ tự gửi"
          onPress={() => router.push('/(driver)/fuel-new')}
          testID="fuel-new"
        />
      ) : null}
      {!gates.fuelRead && !gates.fuelSubmit ? (
        <EmptyBlock
          icon="gas-station-outline"
          title="Phiếu đổ dầu chưa bật"
          detail="Doanh nghiệp chưa bật nhiên liệu, hoặc tài khoản chưa có quyền."
        />
      ) : null}

      {pending.length > 0 ? (
        <Section title="Đang nằm trên máy">
          {pending.map((slip) => (
            <Notice
              key={slip.id}
              tone={slip.blocked ? 'danger' : 'pending'}
              icon={slip.blocked ? 'alert-octagon-outline' : 'cloud-upload-outline'}
              title={slip.label}
              detail={slip.detail}
              testID="fuel-pending"
            />
          ))}
        </Section>
      ) : null}

      {gates.fuelRead ? (
        <Section title="Đã lên hệ thống">
          {slips.isPending ? <LoadingBlock lines={3} label="Đang đọc phiếu đổ dầu…" /> : null}
          {slips.isError && !quiet ? (
            <ErrorBlock error={slips.error} onRetry={() => void slips.refetch()} />
          ) : null}
          {quiet ? (
            <Text variant="caption" tone="faint">
              Chưa đọc được phiếu: doanh nghiệp chưa bật hoặc tài khoản chưa có quyền xem.
            </Text>
          ) : null}
          {slips.data && rows.length === 0 ? (
            <EmptyBlock icon="gas-station-outline" title="Chưa có phiếu nào" />
          ) : null}
          {rows.map((row) => (
            <FuelSlipCard key={row.id} row={row} />
          ))}
        </Section>
      ) : null}
    </Screen>
  );
}

function FuelSlipCard({ row }: { readonly row: FuelSlipRow }) {
  return (
    <Card rail={row.verificationTone} testID={`fuel-slip-${row.id}`}>
      <View style={styles.head}>
        <Text variant="bodyStrong" style={styles.flex}>
          {row.headline}
        </Text>
        <Pill label={row.verificationLabel} tone={row.verificationTone} />
      </View>
      <Text variant="caption" tone="muted">
        {row.businessDateLabel} · {row.occurredAtLabel} · {row.contextLabel}
      </Text>
      {row.rejectedNote ? (
        <Notice
          tone="danger"
          icon="alert-circle-outline"
          title="Kế toán từ chối phiếu này"
          detail={row.rejectedNote}
        />
      ) : null}
      {row.canResubmit ? (
        <Text variant="caption" tone="faint">
          Nộp lại phiếu bị từ chối chưa làm được trên ứng dụng — báo văn phòng.
        </Text>
      ) : null}
      <KeyValue label="Thanh toán" value={row.paymentLabel} />
      {row.stationLabel ? <KeyValue label="Trạm" value={row.stationLabel} /> : null}
      <KeyValue label="Đồng hồ" value={row.odometerLabel} />
      <KeyValue label="Tiêu hao" value={row.consumptionLabel} />
      {row.invoiceNo ? <KeyValue label="Số hoá đơn" value={row.invoiceNo} /> : null}
      <KeyValue label="Chứng từ" value={row.evidenceCountLabel} />
      <View style={styles.pills}>
        <Pill label={row.reconciliationLabel} tone={row.reconciliationTone} />
      </View>
      {row.reviewReasonLabels.map((reason) => (
        <Text key={reason} variant="caption" tone="muted">
          • {reason}
        </Text>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  flex: { flex: 1 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs },
});
