import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useBranding } from '../../../branding/BrandingProvider';
import { formatBusinessDate, formatClock } from '../../../format';
import { useHttp } from '../../../session/SessionProvider';
import { useTheme } from '../../../theme/ThemeProvider';
import { RADIUS, SPACE, TOUCH } from '../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { Field } from '../../../ui/Field';
import { Icon } from '../../../ui/Icon';
import { Sheet } from '../../../ui/Sheet';
import { LoadingBlock } from '../../../ui/States';
import { Divider, KeyValue } from '../../../ui/Surface';
import { Text } from '../../../ui/Text';
import { CLOSE_OUT_POLICY } from '../../office/decision-errors';
import type {
  CloseOutOutcome,
  OperationalDocument,
  OrderCompletionDetail,
  OrderCompletionRow,
} from '../../office/decision-types';
import { useOfficeKey } from '../../office/queries';
import type { DecisionOutcomeReport } from '../../office/ui/ClaimDecisionSheet';
import { FailureNotice } from '../../office/ui/FailureNotice';
import { useDecision } from '../../office/useDecision';
import {
  activeDocuments,
  buildCloseOut,
  CLOSE_OUT_LABEL,
  COMPLETION_STATE_LABEL,
  documentLabel,
} from '../inbox';

/**
 * KET THUC DON — ba ket qua qua CUNG mot cong (`…/orders/:orderId/decisions`).
 *
 * `supersedesId` doc LUC MO (ban moi nhat cua ho so), khong luc bam: hai nguoi cung mo mot don thi
 * nguoi bam sau nhan `ACCEPTANCE_SUPERSEDES_STALE` va phai xem lai, thay vi ghi de len nhau. Khoa
 * chong ghi trung do nguoi goi sinh LUC MO; mat mang -> bam lai -> may chu tra lai chinh quyet dinh.
 */
export interface CloseOutTarget {
  readonly row: OrderCompletionRow;
  readonly key: string;
}

export function CloseOutSheet({
  target,
  onClose,
  onDecided,
}: {
  readonly target: CloseOutTarget | null;
  readonly onClose: () => void;
  readonly onDecided: (report: DecisionOutcomeReport) => void;
}) {
  const http = useHttp();
  const { color } = useTheme();
  const { timeZone } = useBranding();
  const row = target?.row ?? null;
  const orderId = row?.orderId ?? '';
  const detailKey = useOfficeKey('director', 'close-out', orderId);
  const documentsKey = useOfficeKey('director', 'order-documents', orderId);
  const detail = useQuery({
    queryKey: detailKey,
    enabled: row !== null && row.acceptanceId !== null,
    staleTime: 0,
    queryFn: () =>
      http.get<OrderCompletionDetail>(
        `/transport/commercial-acceptance/orders/${encodeURIComponent(orderId)}`,
      ),
  });
  const documents = useQuery({
    queryKey: documentsKey,
    enabled: row !== null,
    retry: false,
    queryFn: () =>
      http.get<readonly OperationalDocument[]>(
        `/transport/orders/${encodeURIComponent(orderId)}/documents`,
      ),
  });
  const decision = useDecision(CLOSE_OUT_POLICY);
  const [outcome, setOutcome] = useState<CloseOutOutcome | null>(null);
  const [evidence, setEvidence] = useState<readonly string[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { reset } = decision;

  useEffect(() => {
    setOutcome(null);
    setEvidence([]);
    setNote('');
    setError(null);
    reset();
  }, [target, reset]);

  const usable = activeDocuments(documents.data ?? []);
  const supersedesId = detail.data?.acceptance.latestDecisionId ?? null;
  const waitingForHistory = row?.acceptanceId !== null && (detail.isPending || detail.isFetching);

  function toggle(id: string) {
    setEvidence((held) => (held.includes(id) ? held.filter((x) => x !== id) : [...held, id]));
  }

  function submit() {
    if (!target || !outcome) return;
    const built = buildCloseOut({
      outcome,
      evidence,
      note,
      supersedesId,
      idempotencyKey: target.key,
    });
    if (!built.ok) {
      setError(built.message);
      return;
    }
    setError(null);
    void decision.run(
      () =>
        http.post<OrderCompletionDetail>(
          `/transport/commercial-acceptance/orders/${encodeURIComponent(target.row.orderId)}/decisions`,
          built.value,
        ),
      {
        onSuccess: () =>
          onDecided({
            alreadyDone: false,
            message: `Đơn ${target.row.orderCode}: ${CLOSE_OUT_LABEL[outcome].toLowerCase()}.`,
          }),
        onAlreadyDone: (failure) => onDecided({ alreadyDone: true, message: failure.message }),
        // Nguoi khac vua quyet truoc -> doc lai ban moi nhat de lan quyet sau mang dung `supersedesId`.
        onFailure: (failure) => {
          if (failure.reason?.startsWith('ACCEPTANCE_SUPERSEDES')) void detail.refetch();
        },
      },
    );
  }

  const footer = !row ? null : outcome === null ? (
    <>
      <Button
        kind="signal"
        label="Đã kết thúc"
        icon="check-all"
        onPress={() => setOutcome('APPROVED')}
        testID="decision-approve"
      />
      <View style={styles.row}>
        <Button
          kind="secondary"
          label="Cần bổ sung"
          onPress={() => setOutcome('NEEDS_CORRECTION')}
          style={styles.flex}
          testID="decision-needs-correction"
        />
        <Button
          kind="danger"
          label="Từ chối"
          onPress={() => setOutcome('REJECTED')}
          style={styles.flex}
          testID="decision-reject"
        />
      </View>
    </>
  ) : (
    <>
      <Button
        kind={outcome === 'REJECTED' ? 'danger' : 'signal'}
        label={`Ghi: ${CLOSE_OUT_LABEL[outcome]}`}
        loading={decision.busy}
        disabled={waitingForHistory}
        onPress={submit}
        testID="decision-confirm"
      />
      <Button
        kind="ghost"
        label="Quay lại"
        disabled={decision.busy}
        onPress={() => setOutcome(null)}
      />
    </>
  );

  return (
    <Sheet
      visible={target !== null}
      onClose={onClose}
      title={row ? `Kết thúc đơn ${row.orderCode}` : ''}
      subtitle={row ? `${row.originLabel} → ${row.destinationLabel}` : undefined}
      footer={footer}
    >
      {row ? (
        <View style={styles.body}>
          <KeyValue label="Ngày" value={formatBusinessDate(row.businessDate)} />
          <KeyValue label="Trạng thái" value={COMPLETION_STATE_LABEL[row.state] ?? row.state} />
          {row.runCode ? <KeyValue label="Vòng chạy (tham khảo)" value={row.runCode} /> : null}
          {waitingForHistory ? (
            <LoadingBlock lines={1} label="Đang đọc lịch sử quyết định…" />
          ) : null}
          {(detail.data?.decisions ?? []).map((entry) => (
            <KeyValue
              key={entry.id}
              label={`#${entry.sequence} · ${formatClock(entry.decidedAt, timeZone)}${entry.decidedByActor ? ` · ${entry.decidedByActor.label}` : ''}`}
              value={COMPLETION_STATE_LABEL[entry.outcome] ?? entry.outcome}
            />
          ))}
          {outcome !== null ? (
            <>
              <Divider />
              <Text variant="overline" tone="muted">
                Căn cứ
              </Text>
              {documents.isError ? (
                <Text variant="caption" tone="faint">
                  Chưa đọc được chứng từ số của đơn — ghi rõ căn cứ bên dưới.
                </Text>
              ) : null}
              {usable.map((document) => {
                const on = evidence.includes(document.id);
                return (
                  <Pressable
                    key={document.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() => toggle(document.id)}
                    style={[styles.option, { borderColor: on ? color.brand : color.line }]}
                  >
                    <Icon
                      name={on ? 'checkbox-marked' : 'checkbox-blank-outline'}
                      tone={on ? 'brand' : 'muted'}
                    />
                    <View style={styles.flex}>
                      <Text variant="label">{documentLabel(document)}</Text>
                      <Text variant="caption" tone="muted">
                        Nhận lúc {formatClock(document.receivedAt, timeZone)}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
              {evidence.length === 0 ? (
                <Field
                  label="Bên nhận đã nhận / xác nhận gì"
                  value={note}
                  onChangeText={setNote}
                  multiline
                  error={error}
                  hint="Bắt buộc khi không chọn chứng từ số."
                  testID="closeout-note"
                />
              ) : null}
            </>
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
  option: {
    minHeight: TOUCH.min,
    borderWidth: 1.5,
    borderRadius: RADIUS.control,
    paddingHorizontal: SPACE.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
});
