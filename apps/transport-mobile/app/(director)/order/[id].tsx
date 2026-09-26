import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useBranding } from '../../../src/branding/BrandingProvider';
import {
  legRows,
  orderDateLabel,
  orderStatusLabel,
  orderStatusTone,
} from '../../../src/features/director/orders';
import { useOrder } from '../../../src/features/director/queries';
import { OrderDriverSource } from '../../../src/features/director/ui/OrderDriverSource';
import { useCustomers, useOfficeAccess, useOfficeKey } from '../../../src/features/office/queries';
import type { ControlTowerView } from '../../../src/features/office/types';
import { formatVnd } from '../../../src/format';
import { SPACE } from '../../../src/theme/tokens';
import { Button } from '../../../src/ui/Button';
import { Screen } from '../../../src/ui/Screen';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../src/ui/States';
import { Card, KeyValue, Pill, Section } from '../../../src/ui/Surface';
import { Text } from '../../../src/ui/Text';

/**
 * CHI TIET MOT DON — `GET /transport/orders/:id` + `/legs`. Cuoc hien vi may chu tra cho van phong
 * (giam doc). Chang RONG noi bang chu; km `null` la "—". Ma vong chay cua chang lay tu bang dieu
 * hanh DANG CO trong bo nho (khong goi them), thieu thi khong hien. Don tao tu xac nhan cua tai xe
 * (`#398`) co them the nguon + bao bat thuong / huy.
 */
export default function DirectorOrderDetail() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = typeof id === 'string' ? id : '';
  const { order, legs } = useOrder(orderId);
  const { can } = useOfficeAccess();
  const { timeZone } = useBranding();
  const customers = useCustomers(can('transport.customer.read'));
  const queryClient = useQueryClient();
  const towerKey = useOfficeKey('director', 'control-tower');
  const tower = queryClient.getQueryData<ControlTowerView>(towerKey);
  const runCodeOf = (runId: string): string | null =>
    tower?.board.flatMap((column) => column.cards).find((card) => card.runId === runId)?.runCode ??
    null;

  const data = order.data;
  const customer =
    data?.customerId === null
      ? 'Chưa gắn khách'
      : (customers.data?.find((entry) => entry.id === data?.customerId)?.name ??
        'Khách chưa đọc được tên');

  return (
    <Screen
      title={data ? `Đơn ${data.code}` : 'Đơn hàng'}
      eyebrow={data ? orderDateLabel(data) : undefined}
      trailing={
        <Button kind="ghost" size="compact" label="Quay lại" onPress={() => router.back()} />
      }
      onRefresh={() => {
        void order.refetch();
        void legs.refetch();
      }}
      refreshing={order.isRefetching || legs.isRefetching}
      testID="director-order-detail"
    >
      {order.isPending ? <LoadingBlock lines={4} label="Đang đọc đơn…" /> : null}
      {order.isError ? (
        <ErrorBlock error={order.error} onRetry={() => void order.refetch()} />
      ) : null}
      {data ? (
        <Card>
          <View style={styles.head}>
            <Pill label={orderStatusLabel(data.status)} tone={orderStatusTone(data.status)} />
          </View>
          <KeyValue label="Khách hàng" value={customer} />
          <KeyValue label="Lấy hàng" value={data.originLabel} />
          <KeyValue label="Giao hàng" value={data.destinationLabel} />
          {data.cargoDescription ? (
            <KeyValue label="Hàng hoá" value={data.cargoDescription} />
          ) : null}
          <KeyValue
            label="Cước"
            value={data.freightAmount === null ? 'Chưa nhập cước' : formatVnd(data.freightAmount)}
            strong
          />
          {data.note ? <KeyValue label="Ghi chú" value={data.note} /> : null}
          {data.cancellationReason ? (
            <Text variant="caption" tone="danger">
              Lý do huỷ: {data.cancellationReason}
            </Text>
          ) : null}
        </Card>
      ) : null}
      {/* #398: don tao tu xac nhan cua tai xe -> the nguon; don khac (404) -> khong ve gi. */}
      {data ? <OrderDriverSource orderId={orderId} timeZone={timeZone} /> : null}

      <Section title="Chặng phục vụ đơn">
        {legs.isPending ? <LoadingBlock lines={2} /> : null}
        {legs.isError ? (
          <ErrorBlock error={legs.error} onRetry={() => void legs.refetch()} />
        ) : null}
        {legs.data && legs.data.length === 0 ? (
          <EmptyBlock icon="map-marker-path" title="Đơn chưa được xếp vào vòng chạy nào" />
        ) : null}
        {legRows(legs.data ?? []).map((leg) => (
          <Card key={leg.key} rail={leg.isEmpty ? 'caution' : 'brand'}>
            <View style={styles.head}>
              <Text variant="bodyStrong" style={styles.flex}>
                {leg.title}
              </Text>
              <Pill label={leg.status} tone="neutral" />
            </View>
            <Text variant="caption" tone="muted">
              {leg.route}
            </Text>
            <KeyValue label="Km thực tế" value={leg.km} />
            <KeyValue label="Km dự kiến" value={leg.plannedKm} />
            {runCodeOf(leg.runId) ? (
              <KeyValue label="Vòng chạy" value={runCodeOf(leg.runId) ?? ''} />
            ) : null}
          </Card>
        ))}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, marginBottom: SPACE.xs },
  flex: { flex: 1 },
});
