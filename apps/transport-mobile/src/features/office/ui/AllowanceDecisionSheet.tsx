import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { formatBusinessDate, formatVnd } from '../../../format';
import { useHttp } from '../../../session/SessionProvider';
import { SPACE } from '../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { Field } from '../../../ui/Field';
import { Sheet } from '../../../ui/Sheet';
import { EmptyBlock } from '../../../ui/States';
import { Card, KeyValue } from '../../../ui/Surface';
import { Text } from '../../../ui/Text';
import { ALLOWANCE_POLICY } from '../decision-errors';
import type { WaitingAllowance } from '../decision-types';
import { buildAllowanceDecision, type AllowanceOutcome, type FieldErrors } from '../decisions';
import { groupDigits } from '../form-input';
import {
  driverNameOf,
  newIdempotencyKey,
  useDrivers,
  useOfficeAccess,
  useOfficeScope,
} from '../queries';
import { useDecision } from '../useDecision';
import type { DecisionOutcomeReport } from './ClaimDecisionSheet';
import { FailureNotice } from './FailureNotice';

/**
 * QUYET PHU CAP CHO — `POST /transport/waiting-allowances/:id/decision`.
 *
 * Muc hang viec cua thap dieu hanh chi mang SO LUONG; danh sach that doc tu `/pending`. To truot nay
 * nhan ca danh sach: nhieu khoan -> chon mot; mot khoan -> vao thang form. Khoa chong ghi trung sinh
 * LUC CHON khoan (mot lan), giu qua moi lan bam lai sau loi mang: may chu tra lai chinh quyet dinh
 * da ghi. Tach bach: may chu chan nguoi gan voi chinh lai xe nhan tien (`WAITING_ALLOWANCE_SELF_DEALING`).
 */
interface Selection {
  readonly allowance: WaitingAllowance;
  readonly key: string;
}

export function AllowanceDecisionSheet({
  visible,
  allowances,
  initialId,
  onClose,
  onDecided,
  optimistic,
}: {
  readonly visible: boolean;
  readonly allowances: readonly WaitingAllowance[];
  readonly initialId?: string | null;
  readonly onClose: () => void;
  readonly onDecided: (report: DecisionOutcomeReport, allowanceId: string) => void;
  readonly optimistic?: (allowanceId: string) => () => void;
}) {
  const http = useHttp();
  const scope = useOfficeScope();
  const { can } = useOfficeAccess();
  const drivers = useDrivers(visible);
  const decision = useDecision(ALLOWANCE_POLICY);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [outcome, setOutcome] = useState<AllowanceOutcome | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const { reset } = decision;

  // Khoan DA quyet trong lan mo nay — an ngay, khong doi danh sach doc lai (tranh chon lai no).
  const [handled, setHandled] = useState<ReadonlySet<string>>(new Set());
  const open = allowances.filter((entry) => !handled.has(entry.id));

  const select = useCallback(
    (allowance: WaitingAllowance) => {
      setSelection({ allowance, key: newIdempotencyKey('allowance') });
      setOutcome(null);
      setAmount(groupDigits(allowance.candidateAmount));
      setNote('');
      setErrors({});
      reset();
    },
    [reset],
  );

  useEffect(() => {
    if (visible) return;
    setSelection(null);
    setHandled(new Set());
  }, [visible, scope]);

  // Mo thang form khi chi con MOT khoan, hoac khi nguoi goi chi dinh khoan. `autoPick` la CHINH
  // doi tuong trong du lieu may chu, nen tham chieu on dinh giua cac lan ve.
  const autoPick =
    visible && selection === null
      ? (open.find((entry) => entry.id === initialId) ?? (open.length === 1 ? open[0] : undefined))
      : undefined;
  useEffect(() => {
    if (autoPick) select(autoPick);
  }, [autoPick, select]);

  function markHandled(id: string) {
    setHandled((previous) => new Set([...previous, id]));
    setSelection(null);
  }

  const mayDecide = can('transport.waiting_allowance.decide');
  const current = selection?.allowance ?? null;

  function submit() {
    if (!selection || !outcome) return;
    const built = buildAllowanceDecision(
      selection.allowance,
      { outcome, approvedAmount: amount, note },
      selection.key,
    );
    if (!built.ok) {
      setErrors(built.errors ?? {});
      return;
    }
    setErrors({});
    const id = selection.allowance.id;
    void decision.run(
      () =>
        http.post<WaitingAllowance>(
          `/transport/waiting-allowances/${encodeURIComponent(id)}/decision`,
          built.value,
        ),
      {
        optimistic: optimistic ? () => optimistic(id) : undefined,
        onSuccess: () => {
          markHandled(id);
          onDecided(
            {
              alreadyDone: false,
              message: outcome === 'APPROVED' ? 'Đã duyệt phụ cấp chờ.' : 'Đã từ chối phụ cấp chờ.',
            },
            id,
          );
        },
        onAlreadyDone: (failure) => {
          markHandled(id);
          onDecided({ alreadyDone: true, message: failure.message }, id);
        },
      },
    );
  }

  const footer =
    current === null || !mayDecide ? null : outcome === null ? (
      <View style={styles.row}>
        <Button
          kind="danger"
          label="Từ chối"
          icon="close"
          onPress={() => setOutcome('REJECTED')}
          style={styles.flex}
          testID="decision-reject"
        />
        <Button
          kind="signal"
          label="Duyệt"
          icon="check"
          onPress={() => setOutcome('APPROVED')}
          style={styles.flex}
          testID="decision-approve"
        />
      </View>
    ) : (
      <>
        <Button
          kind={outcome === 'APPROVED' ? 'signal' : 'danger'}
          label={outcome === 'APPROVED' ? 'Duyệt phụ cấp' : 'Từ chối phụ cấp'}
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
      visible={visible}
      onClose={onClose}
      title="Phụ cấp chờ"
      subtitle={
        current ? driverNameOf(drivers.data, current.driverId) : `${open.length} khoản chờ duyệt`
      }
      footer={footer}
    >
      {current === null ? (
        open.length === 0 ? (
          <EmptyBlock title="Không còn khoản phụ cấp nào chờ duyệt" />
        ) : (
          open.map((entry) => (
            <Card
              key={entry.id}
              rail="caution"
              onPress={() => select(entry)}
              testID={`allowance-${entry.id}`}
              accessibilityLabel={`Phụ cấp ${formatVnd(entry.candidateAmount)} cho ${driverNameOf(drivers.data, entry.driverId)}`}
            >
              <Text variant="bodyStrong">{driverNameOf(drivers.data, entry.driverId)}</Text>
              <KeyValue label="Đề nghị" value={formatVnd(entry.candidateAmount)} strong />
              <Text variant="caption" tone="muted">
                {formatBusinessDate(entry.businessDate)} · {entry.reason}
              </Text>
            </Card>
          ))
        )
      ) : (
        <View style={styles.body} testID="allowance-detail">
          <Text variant="figureLarge">{formatVnd(current.candidateAmount)}</Text>
          <KeyValue label="Ngày" value={formatBusinessDate(current.businessDate)} />
          <Text variant="body">Văn phòng đề nghị vì: {current.reason}</Text>
          {!mayDecide ? (
            <Text variant="caption" tone="muted">
              Tài khoản này không có quyền quyết phụ cấp chờ — chỉ xem.
            </Text>
          ) : null}
          {outcome === 'APPROVED' ? (
            <Field
              label="Số duyệt (đồng)"
              value={amount}
              onChangeText={setAmount}
              keyboardType="number-pad"
              error={errors.approvedAmount}
              hint={`Tối đa ${formatVnd(current.candidateAmount)}.`}
              testID="decision-amount"
            />
          ) : null}
          {outcome !== null ? (
            <Field
              label="Ghi chú (không bắt buộc)"
              value={note}
              onChangeText={setNote}
              error={errors.note}
              multiline
            />
          ) : null}
          <FailureNotice failure={decision.failure} />
          {open.length > 1 && !decision.busy ? (
            <Button
              kind="ghost"
              size="compact"
              label="Chọn khoản khác"
              onPress={() => setSelection(null)}
            />
          ) : null}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: SPACE.sm },
  row: { flexDirection: 'row', gap: SPACE.sm },
  flex: { flex: 1 },
});
