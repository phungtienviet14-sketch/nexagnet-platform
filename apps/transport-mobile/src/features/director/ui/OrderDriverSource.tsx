import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { userMessage } from '../../../api/errors';
import { formatClock } from '../../../format';
import { SPACE } from '../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { Card, KeyValue, Pill } from '../../../ui/Surface';
import { Text } from '../../../ui/Text';
import {
  exceptionOutcomeText,
  isNotDriverDirect,
  ORDER_SOURCE_TITLE,
  orderSourceLines,
} from '../../office/site-intake-review';
import { useOrderIntakeSource, useSiteIntakeGates } from '../../office/site-intake-queries';
import { Notice } from '../../office/ui/Blocks';
import { SiteIntakeReviewSheet } from '../../office/ui/SiteIntakeReviewSheet';

/**
 * NGUON CUA DON — "Tạo từ xác nhận của tài xế" (`#398`), tren chi tiet don cua giam doc.
 *
 * `by-order` tra 404 cho moi don KHONG den tu duong nay: do la cau tra loi binh thuong, man khong ve
 * gi ca. Bao bat thuong / huy mo CUNG to truot voi "Cần xử lý" (khong co luong thu hai), va chi khi
 * may chu cho (`canReportException`) VA tai khoan co quyen.
 */
export function OrderDriverSource({
  orderId,
  timeZone,
}: {
  readonly orderId: string;
  readonly timeZone: string;
}) {
  const gates = useSiteIntakeGates();
  const source = useOrderIntakeSource(orderId, gates.read);
  const [reporting, setReporting] = useState(false);

  if (!gates.read || source.isPending) return null;
  if (source.isError) {
    return isNotDriverDirect(source.error) ? null : (
      <Notice
        tone="neutral"
        icon="cloud-alert"
        title="Chưa đọc được nguồn của đơn"
        detail={userMessage(source.error)}
      />
    );
  }
  const view = source.data;
  return (
    <View testID="order-driver-source">
      <Card rail="live">
        <View style={styles.head}>
          <Pill label={ORDER_SOURCE_TITLE} tone="live" icon="account-hard-hat" />
        </View>
        {orderSourceLines(view, timeZone).map((line) => (
          <KeyValue key={line.label} label={line.label} value={line.value} />
        ))}
        {view.exception ? (
          <Text variant="caption" tone="caution" testID="order-driver-source-exception">
            {exceptionOutcomeText({ outcome: view.exception.outcome })} Lý do:{' '}
            {view.exception.reason} · {formatClock(view.exception.at, timeZone)}
          </Text>
        ) : null}
        {gates.exception && view.canReportException ? (
          <View style={styles.action}>
            <Button
              kind="danger"
              size="compact"
              icon="alert-octagon-outline"
              label="Báo bất thường / Hủy"
              onPress={() => setReporting(true)}
              testID="site-intake-exception-open"
            />
          </View>
        ) : null}
      </Card>
      <SiteIntakeReviewSheet
        intakeId={reporting ? view.intakeId : null}
        initialMode="EXCEPTION"
        onClose={() => setReporting(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', marginBottom: SPACE.xs },
  action: { alignItems: 'flex-start', marginTop: SPACE.sm },
});
