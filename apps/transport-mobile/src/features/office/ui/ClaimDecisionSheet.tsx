import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useBranding } from '../../../branding/BrandingProvider';
import { formatBusinessDate, formatClock, formatVnd } from '../../../format';
import { useHttp } from '../../../session/SessionProvider';
import { SPACE } from '../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { Field } from '../../../ui/Field';
import { Sheet } from '../../../ui/Sheet';
import { ErrorBlock, LoadingBlock } from '../../../ui/States';
import { Divider, KeyValue, Pill } from '../../../ui/Surface';
import { Text } from '../../../ui/Text';
import { CLAIM_POLICY, type DecisionFailure } from '../decision-errors';
import type { ExpenseClaimDetail } from '../decision-types';
import {
  buildClaimDecision,
  claimApprovalConsequence,
  type ClaimOutcome,
  type FieldErrors,
} from '../decisions';
import { driverNameOf, useDrivers, useOfficeAccess, useOfficeKey } from '../queries';
import { useDecision } from '../useDecision';
import { FailureNotice } from './FailureNotice';

/**
 * DUYET / TU CHOI MOT DE NGHI CHI — dung chung giam doc va ke toan.
 *
 * Hai buoc: chon (Duyệt / Từ chối) roi nhap LY DO (bat buoc, 1..60) va bam xac nhan. May chu KHONG
 * co khoa chong ghi trung cho lenh nay; lan gui lai sau khi mat phan hoi se nhan
 * `CLAIM_ALREADY_DECIDED`, va do la "da xong" — khong phai loi. Tach bach quyen: may chu cam nguoi
 * nhap tu duyet (`CLAIM_REVIEWER_IS_SUBMITTER`) — ly do hien nguyen van, khong hua gi them.
 */
export interface DecisionOutcomeReport {
  readonly alreadyDone: boolean;
  readonly message: string;
}

export function ClaimDecisionSheet({
  claimId,
  onClose,
  onDecided,
  optimistic,
}: {
  readonly claimId: string | null;
  readonly onClose: () => void;
  readonly onDecided: (report: DecisionOutcomeReport) => void;
  readonly optimistic?: () => () => void;
}) {
  const http = useHttp();
  const { timeZone } = useBranding();
  const { can } = useOfficeAccess();
  const drivers = useDrivers(claimId !== null);
  const queryKey = useOfficeKey('office', 'claim', claimId);
  const detail = useQuery({
    queryKey,
    enabled: claimId !== null,
    queryFn: () =>
      http.get<ExpenseClaimDetail>(
        `/transport/expense-claims/${encodeURIComponent(claimId ?? '')}`,
      ),
  });
  const decision = useDecision(CLAIM_POLICY);
  const [outcome, setOutcome] = useState<ClaimOutcome | null>(null);
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const { reset } = decision;

  useEffect(() => {
    setOutcome(null);
    setReason('');
    setAmount('');
    setNote('');
    setErrors({});
    reset();
  }, [claimId, reset]);

  const claim = detail.data?.claim ?? null;
  const pending = claim?.status === 'PENDING_REVIEW';
  const mayReview = can('transport.expense.claim.review');

  function submit() {
    if (!claim || !outcome) return;
    const built = buildClaimDecision(claim, { outcome, reason, approvedAmount: amount, note });
    if (!built.ok) {
      setErrors(built.errors ?? {});
      return;
    }
    setErrors({});
    const path = `/transport/expense-claims/${encodeURIComponent(claim.id)}/${built.value.path}`;
    void decision.run(() => http.post<ExpenseClaimDetail>(path, built.value.body), {
      optimistic,
      onSuccess: () =>
        onDecided({
          alreadyDone: false,
          message: outcome === 'APPROVE' ? 'Đã duyệt đề nghị chi.' : 'Đã từ chối đề nghị chi.',
        }),
      onAlreadyDone: (failure: DecisionFailure) =>
        onDecided({ alreadyDone: true, message: failure.message }),
    });
  }

  const footer =
    !claim || !pending || !mayReview ? null : outcome === null ? (
      <View style={styles.row}>
        <Button
          kind="danger"
          label="Từ chối"
          icon="close"
          onPress={() => setOutcome('REJECT')}
          style={styles.flex}
          testID="decision-reject"
        />
        <Button
          kind="signal"
          label="Duyệt"
          icon="check"
          onPress={() => setOutcome('APPROVE')}
          style={styles.flex}
          testID="decision-approve"
        />
      </View>
    ) : (
      <>
        <Button
          kind={outcome === 'APPROVE' ? 'signal' : 'danger'}
          label={outcome === 'APPROVE' ? 'Duyệt và ghi sổ' : 'Từ chối đề nghị'}
          loading={decision.busy}
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
      visible={claimId !== null}
      onClose={onClose}
      title="Đề nghị chi lái xe"
      subtitle={claim ? driverNameOf(drivers.data, claim.driverId) : undefined}
      footer={footer}
    >
      {detail.isPending ? <LoadingBlock label="Đang đọc đề nghị…" /> : null}
      {detail.isError ? (
        <ErrorBlock error={detail.error} onRetry={() => void detail.refetch()} />
      ) : null}
      {claim ? (
        <View style={styles.body} testID="claim-detail">
          <Text variant="figureLarge">{formatVnd(claim.claimedAmount)}</Text>
          <View style={styles.pills}>
            <Pill
              label={claim.categoryCode === 'FUEL' ? 'Nhiên liệu' : claim.categoryCode}
              tone="neutral"
            />
            {claim.tripId === null ? (
              <Pill label="Chưa gắn chuyến" tone="caution" icon="link-variant-off" />
            ) : null}
            {!pending ? <Pill label="Đã có quyết định" tone="neutral" /> : null}
          </View>
          <KeyValue label="Ngày" value={formatBusinessDate(claim.businessDate)} />
          <KeyValue label="Gửi lúc" value={formatClock(claim.submittedAt, timeZone)} />
          {claim.note ? <KeyValue label="Lái xe ghi" value={claim.note} /> : null}
          <Text variant="caption" tone={claim.tripId === null ? 'caution' : 'muted'}>
            {claimApprovalConsequence(claim)}
          </Text>
          {!mayReview ? (
            <Text variant="caption" tone="muted">
              Tài khoản này không có quyền duyệt chi — chỉ xem.
            </Text>
          ) : null}
          {detail.data && detail.data.decisions.length > 0 ? (
            <>
              <Divider />
              {detail.data.decisions.map((entry) => (
                <KeyValue
                  key={entry.id}
                  label={`${entry.outcome === 'APPROVED' ? 'Đã duyệt' : 'Đã từ chối'} · ${formatClock(entry.decidedAt, timeZone)}`}
                  value={entry.reasonCode}
                />
              ))}
            </>
          ) : null}
          {outcome !== null ? (
            <View style={styles.form}>
              <Field
                label={outcome === 'APPROVE' ? 'Lý do duyệt' : 'Lý do từ chối'}
                value={reason}
                onChangeText={setReason}
                maxLength={60}
                error={errors.reason}
                hint="Bắt buộc, tối đa 60 ký tự."
                testID="decision-reason"
              />
              {outcome === 'APPROVE' ? (
                <Field
                  label="Số duyệt (đồng)"
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="number-pad"
                  error={errors.approvedAmount}
                  hint={`Bỏ trống = duyệt đủ ${formatVnd(claim.claimedAmount)}.`}
                  testID="decision-amount"
                />
              ) : null}
              <Field
                label="Ghi chú (không bắt buộc)"
                value={note}
                onChangeText={setNote}
                error={errors.note}
                multiline
              />
            </View>
          ) : null}
          <FailureNotice failure={decision.failure} />
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: SPACE.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  form: { gap: SPACE.md, marginTop: SPACE.sm },
  row: { flexDirection: 'row', gap: SPACE.sm },
  flex: { flex: 1 },
});
