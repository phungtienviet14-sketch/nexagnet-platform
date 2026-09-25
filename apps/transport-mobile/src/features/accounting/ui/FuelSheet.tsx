import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useBranding } from '../../../branding/BrandingProvider';
import { formatBusinessDate, formatClock, formatLiters, formatVnd } from '../../../format';
import { useHttp } from '../../../session/SessionProvider';
import { RADIUS, SPACE } from '../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { Field } from '../../../ui/Field';
import { Sheet } from '../../../ui/Sheet';
import { KeyValue, Pill } from '../../../ui/Surface';
import { Text } from '../../../ui/Text';
import { FUEL_POLICY } from '../../office/decision-errors';
import { useOfficeAccess } from '../../office/queries';
import type { DecisionOutcomeReport } from '../../office/ui/ClaimDecisionSheet';
import { FailureNotice } from '../../office/ui/FailureNotice';
import { useDecision } from '../../office/useDecision';
import {
  checkRejectReason,
  fuelActions,
  fuelContextLabel,
  isImageEvidence,
  PAYMENT_METHOD_LABEL,
  reviewReasonLabel,
  verifyConsequence,
} from '../fuel';
import type { FuelEntryRow } from '../types';

/**
 * MOT PHIEU DAU: anh chung tu (tai co xac thuc qua `expo-image` + `http.authHeaders()`), cac so lai
 * xe khai, hau qua cua lan xac thuc noi TRUOC khi bam. Xac thuc lap lai an toan; tu choi can ly do.
 */
export function FuelSheet({
  row,
  onClose,
  onDecided,
  optimistic,
}: {
  readonly row: FuelEntryRow | null;
  readonly onClose: () => void;
  readonly onDecided: (report: DecisionOutcomeReport) => void;
  readonly optimistic?: () => () => void;
}) {
  const http = useHttp();
  const { timeZone } = useBranding();
  const { can } = useOfficeAccess();
  const decision = useDecision(FUEL_POLICY);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { reset } = decision;

  useEffect(() => {
    setRejecting(false);
    setReason('');
    setError(null);
    reset();
  }, [row, reset]);

  const actions = row
    ? fuelActions(row.verificationStatus, can('transport.fuel.entry.verify'))
    : null;
  const evidence = row?.evidence.find((item) => isImageEvidence(item.contentType)) ?? null;
  const base = row ? `/transport/fuel/entries/${encodeURIComponent(row.id)}` : '';

  function send(path: string, body: unknown, message: string) {
    void decision.run(() => http.post(path, body), {
      optimistic,
      onSuccess: () => onDecided({ alreadyDone: false, message }),
      onAlreadyDone: (failure) => onDecided({ alreadyDone: true, message: failure.message }),
    });
  }

  function reject() {
    const checked = checkRejectReason(reason);
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    setError(null);
    send(`${base}/reject`, { reason: checked.value }, 'Đã từ chối phiếu đổ dầu.');
  }

  const footer = !actions ? null : rejecting ? (
    <>
      <Button
        kind="danger"
        label="Từ chối phiếu"
        loading={decision.busy}
        onPress={reject}
        testID="decision-confirm"
      />
      <Button
        kind="ghost"
        label="Quay lại"
        disabled={decision.busy}
        onPress={() => setRejecting(false)}
      />
    </>
  ) : actions.canVerify ? (
    <View style={styles.row}>
      <Button
        kind="danger"
        label="Từ chối"
        onPress={() => setRejecting(true)}
        style={styles.flex}
        testID="decision-reject"
      />
      <Button
        kind="signal"
        label="Xác thực"
        icon="check"
        loading={decision.busy}
        onPress={() => send(`${base}/verify`, undefined, 'Đã xác thực phiếu đổ dầu.')}
        style={styles.flex}
        testID="decision-approve"
      />
    </View>
  ) : actions.canResubmit ? (
    <Button
      kind="secondary"
      label="Cho nộp lại"
      loading={decision.busy}
      onPress={() => send(`${base}/resubmit`, undefined, 'Đã cho lái xe nộp lại phiếu.')}
      testID="decision-resubmit"
    />
  ) : null;

  return (
    <Sheet
      visible={row !== null}
      onClose={onClose}
      title="Phiếu đổ dầu"
      subtitle={
        row
          ? `${row.driverName ?? 'Lái xe chưa đọc được tên'} · ${row.vehiclePlate ?? 'Xe chưa đọc được biển'}`
          : undefined
      }
      footer={footer}
    >
      {row ? (
        <View style={styles.body} testID="fuel-detail">
          {evidence ? (
            <Image
              source={{
                uri: http.url(`${base}/evidence/${encodeURIComponent(evidence.id)}`),
                headers: http.authHeaders(),
              }}
              style={styles.image}
              contentFit="contain"
              accessibilityLabel="Ảnh chứng từ đổ dầu"
              testID="fuel-evidence"
            />
          ) : (
            <Text variant="caption" tone="caution">
              {row.evidenceCount === 0
                ? 'Phiếu không kèm ảnh chứng từ.'
                : 'Chứng từ không phải ảnh — mở trên máy tính.'}
            </Text>
          )}
          <Text variant="figureLarge">{formatVnd(row.amount)}</Text>
          <View style={styles.pills}>
            <Pill
              label={PAYMENT_METHOD_LABEL[row.paymentMethod] ?? row.paymentMethod}
              tone="neutral"
            />
            {row.reviewReasons.map((reasonCode) => (
              <Pill key={reasonCode} label={reviewReasonLabel(reasonCode)} tone="caution" />
            ))}
          </View>
          <KeyValue label="Việc" value={fuelContextLabel(row)} />
          <KeyValue label="Số lít" value={formatLiters(row.litersUnits)} />
          <KeyValue
            label="Cây xăng"
            value={row.stationName ?? row.supplierName ?? 'Chưa đọc được tên'}
          />
          <KeyValue label="Ngày" value={formatBusinessDate(row.businessDate)} />
          <KeyValue label="Lúc đổ" value={formatClock(row.occurredAt, timeZone)} />
          {row.invoiceNo ? <KeyValue label="Số hoá đơn" value={row.invoiceNo} /> : null}
          {row.reviewNote ? <KeyValue label="Ghi chú soát" value={row.reviewNote} /> : null}
          {actions?.canVerify ? (
            <Text variant="caption" tone="muted" testID="fuel-verify-consequence">
              {verifyConsequence(row)}
            </Text>
          ) : null}
          {rejecting ? (
            <Field
              label="Lý do từ chối"
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={500}
              error={error}
              testID="decision-reason"
            />
          ) : null}
          <FailureNotice failure={decision.failure} />
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: SPACE.sm },
  row: { flexDirection: 'row', gap: SPACE.sm },
  flex: { flex: 1 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  image: { width: '100%', height: 240, borderRadius: RADIUS.ticket },
});
