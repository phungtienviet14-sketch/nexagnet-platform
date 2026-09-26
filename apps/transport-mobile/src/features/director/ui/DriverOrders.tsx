import type { UseQueryResult } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';
import { userMessage } from '../../../api/errors';
import { SPACE } from '../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { Card, Section } from '../../../ui/Surface';
import { Text } from '../../../ui/Text';
import {
  DRIVER_ORDERS_TITLE,
  driverOrderCard,
  type DriverOrderCard,
} from '../../office/site-intake-review';
import type { DriverOrderActivityView } from '../../office/types';
import { Notice } from '../../office/ui/Blocks';

/**
 * "ĐƠN MỚI TỪ TÀI XẾ" tren "Hôm nay" — TIN TUC, khong phai viec can quyet (`#398`).
 *
 * Khong dung toi cau mo dau, `queueTotal`, "việc cần quyết" hay "Quyết việc đầu tiên": don tu tao
 * binh thuong khong cho ai bam gi. Khong co nut duyet, khong co nut Hủy o day — bat thuong xu ly tren
 * chi tiet don. Doc hong chi la mot dong nho, KHONG chan phan con lai cua man.
 */
export function DriverOrdersSection({
  query,
  enabled,
  timeZone,
  onOpenOrder,
}: {
  readonly query: UseQueryResult<readonly DriverOrderActivityView[]>;
  readonly enabled: boolean;
  readonly timeZone: string;
  readonly onOpenOrder: (orderId: string) => void;
}) {
  if (!enabled || query.isPending) return null;
  if (query.isError) {
    return (
      <Notice
        tone="neutral"
        icon="cloud-alert"
        title="Chưa đọc được đơn mới từ tài xế"
        detail={userMessage(query.error)}
        testID="director-driver-orders-error"
      />
    );
  }
  const cards = (query.data ?? []).map((item) => driverOrderCard(item, timeZone));
  return (
    <View testID="director-driver-orders">
      <Section title={DRIVER_ORDERS_TITLE}>
        {cards.length === 0 ? (
          <Text variant="caption" tone="faint">
            Chưa có đơn mới nào từ tài xế trong 24 giờ qua.
          </Text>
        ) : (
          cards.map((card) => <DriverOrderItem key={card.key} card={card} onOpen={onOpenOrder} />)
        )}
      </Section>
    </View>
  );
}

function DriverOrderItem({
  card,
  onOpen,
}: {
  readonly card: DriverOrderCard;
  readonly onOpen: (orderId: string) => void;
}) {
  return (
    <View testID={card.testID}>
      <Card rail="live">
        <Text variant="overline" tone="live">
          {card.overline}
        </Text>
        <Text variant="bodyStrong">{card.who}</Text>
        <Text variant="caption" tone="muted">
          {card.route}
        </Text>
        <Text variant="caption" tone="muted">
          {card.when} · {card.orderCode}
        </Text>
        {card.exceptionNote ? (
          <Text variant="caption" tone="caution">
            {card.exceptionNote}
          </Text>
        ) : null}
        <View style={styles.action}>
          <Button
            kind="ghost"
            size="compact"
            icon="file-document-outline"
            label="Xem đơn"
            onPress={() => onOpen(card.orderId)}
            testID={`${card.testID}-open`}
          />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  action: { alignItems: 'flex-start', marginTop: SPACE.xs },
});
