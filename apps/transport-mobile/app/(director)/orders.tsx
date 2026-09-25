import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import {
  countByStatus,
  filterOrders,
  ORDER_FILTER_LABEL,
  ORDER_FILTERS,
  orderDateLabel,
  orderStatusLabel,
  orderStatusTone,
  type OrderFilter,
} from '../../src/features/director/orders';
import { useOrders } from '../../src/features/director/queries';
import { formatCount } from '../../src/features/office/control-tower';
import { useCustomers, useOfficeAccess } from '../../src/features/office/queries';
import type { TransportOrder } from '../../src/features/office/types';
import { FilterChips } from '../../src/features/office/ui/Chips';
import { formatVnd } from '../../src/format';
import { useTheme } from '../../src/theme/ThemeProvider';
import { SPACE } from '../../src/theme/tokens';
import { AccountButton } from '../../src/ui/AccountButton';
import { Field } from '../../src/ui/Field';
import { Icon } from '../../src/ui/Icon';
import { Screen } from '../../src/ui/Screen';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../src/ui/States';
import { Card, Pill } from '../../src/ui/Surface';
import { SyncBanner } from '../../src/ui/SyncBanner';
import { Text } from '../../src/ui/Text';

/**
 * "ĐƠN HÀNG" — ca danh sach (may chu chua phan trang), loc trang thai + tim khong dau tren ma don,
 * ten khach, hai dau tuyen. Danh sach AO (FlatList): vai tram don van cuon muot tren may re.
 */
export default function DirectorOrders() {
  const router = useRouter();
  const { color } = useTheme();
  const { can } = useOfficeAccess();
  const orders = useOrders();
  const customers = useCustomers(can('transport.customer.read'));
  const [status, setStatus] = useState<OrderFilter>('ALL');
  const [search, setSearch] = useState('');

  const nameOf = useMemo(() => {
    const byId = new Map((customers.data ?? []).map((customer) => [customer.id, customer.name]));
    return (id: string | null): string =>
      id === null ? 'Chưa gắn khách' : (byId.get(id) ?? 'Khách chưa đọc được tên');
  }, [customers.data]);
  const visible = useMemo(
    () => filterOrders(orders.data ?? [], { status, search }, nameOf),
    [orders.data, status, search, nameOf],
  );
  const counts = countByStatus(orders.data ?? []);

  const header = (
    <View style={styles.header}>
      <Field
        label="Tìm đơn"
        value={search}
        onChangeText={setSearch}
        placeholder="Mã đơn, tên khách, điểm lấy/giao"
        autoCorrect={false}
        testID="director-orders-search"
      />
      <FilterChips
        label="Lọc theo trạng thái"
        selected={status}
        onSelect={(key) => setStatus(key as OrderFilter)}
        options={ORDER_FILTERS.map((key) => ({
          key,
          label: ORDER_FILTER_LABEL[key],
          count: orders.data ? formatCount(counts[key]) : null,
          testID: `director-orders-filter-${key}`,
        }))}
      />
      {orders.isPending ? <LoadingBlock lines={5} label="Đang đọc đơn hàng…" /> : null}
      {orders.isError ? (
        <ErrorBlock
          error={orders.error}
          title="Chưa đọc được đơn hàng"
          onRetry={() => void orders.refetch()}
        />
      ) : null}
    </View>
  );

  return (
    <Screen
      title="Đơn hàng"
      eyebrow={orders.data ? `${formatCount(orders.data.length)} đơn` : 'Danh sách đơn'}
      trailing={<AccountButton />}
      banner={<SyncBanner />}
      scroll={false}
      contentStyle={styles.fill}
      testID="director-orders"
    >
      <FlatList
        data={visible}
        keyExtractor={(order) => order.id}
        ListHeaderComponent={header}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={12}
        windowSize={7}
        refreshControl={
          <RefreshControl
            refreshing={orders.isRefetching}
            onRefresh={() => void orders.refetch()}
            tintColor={color.brand}
            colors={[color.brand]}
          />
        }
        ListEmptyComponent={
          orders.data ? (
            <EmptyBlock
              icon="package-variant"
              title={orders.data.length === 0 ? 'Chưa có đơn nào' : 'Không có đơn khớp bộ lọc'}
            />
          ) : null
        }
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            customer={nameOf(item.customerId)}
            onPress={() => router.push({ pathname: '/order/[id]', params: { id: item.id } })}
          />
        )}
      />
    </Screen>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

function OrderCard({
  order,
  customer,
  onPress,
}: {
  readonly order: TransportOrder;
  readonly customer: string;
  readonly onPress: () => void;
}) {
  return (
    <Card
      onPress={onPress}
      testID={`director-order-${order.code}`}
      accessibilityLabel={`Đơn ${order.code}`}
    >
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text variant="bodyStrong">{order.code}</Text>
          <Text variant="caption" tone="muted">
            {customer} · {orderDateLabel(order)}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {order.originLabel} → {order.destinationLabel}
          </Text>
        </View>
        <View style={styles.side}>
          <Pill label={orderStatusLabel(order.status)} tone={orderStatusTone(order.status)} />
          <Text variant="label" tone={order.freightAmount === null ? 'faint' : 'ink'}>
            {order.freightAmount === null ? 'Chưa có cước' : formatVnd(order.freightAmount)}
          </Text>
        </View>
        <Icon name="chevron-right" tone="muted" />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, paddingHorizontal: 0 },
  list: { paddingHorizontal: SPACE.xl, paddingBottom: SPACE.section },
  header: { gap: SPACE.md, marginBottom: SPACE.md },
  separator: { height: SPACE.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  flex: { flex: 1, gap: 2 },
  side: { alignItems: 'flex-end', gap: SPACE.xs },
});
