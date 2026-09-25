import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useHttp } from '../../../session/SessionProvider';
import { useTheme } from '../../../theme/ThemeProvider';
import { RADIUS, SPACE, TOUCH } from '../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { Sheet } from '../../../ui/Sheet';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../ui/States';
import { Text } from '../../../ui/Text';
import { PLAIN_POLICY } from '../../office/decision-errors';
import { useDrivers, useOfficeAccess } from '../../office/queries';
import type { QueueItem } from '../../office/types';
import type { DecisionOutcomeReport } from '../../office/ui/ClaimDecisionSheet';
import { FailureNotice } from '../../office/ui/FailureNotice';
import { useDecision } from '../../office/useDecision';

/**
 * PHAN CONG LAI XE cho mot vong chay DANG CHAY ma chua ai lai — muc CRITICAL duy nhat cua hang
 * viec. `POST /transport/runs/:id/assignment {driverId}`.
 *
 * Lenh nay lap lai an toan o may chu: gui lai CUNG lai xe thi may chu tra lai phan cong dang co
 * (`RUN_ASSIGNMENT_UNCHANGED`), nen sau mot lan mat mang chi can bam lai. Ma vong chay lay tu
 * `subject.reference` (ma nghiep vu), id chi dung de goi API.
 */
export function AssignDriverSheet({
  item,
  busyDrivers,
  onClose,
  onDecided,
}: {
  readonly item: QueueItem | null;
  readonly busyDrivers: ReadonlyMap<string, readonly string[]>;
  readonly onClose: () => void;
  readonly onDecided: (report: DecisionOutcomeReport) => void;
}) {
  const http = useHttp();
  const { color } = useTheme();
  const { can } = useOfficeAccess();
  const drivers = useDrivers(item !== null);
  const decision = useDecision(PLAIN_POLICY);
  const [picked, setPicked] = useState<string | null>(null);
  const { reset } = decision;

  useEffect(() => {
    setPicked(null);
    reset();
  }, [item, reset]);

  const active = (drivers.data ?? []).filter((driver) => driver.status === 'ACTIVE');
  const runCode = item?.subject.reference ?? 'vòng chạy này';
  const mayAssign = can('transport.run.manage');

  function submit() {
    if (!item || !picked) return;
    const name = active.find((driver) => driver.id === picked)?.fullName ?? 'lái xe';
    void decision.run(
      () =>
        http.post(`/transport/runs/${encodeURIComponent(item.subject.id)}/assignment`, {
          driverId: picked,
        }),
      {
        onSuccess: () =>
          onDecided({ alreadyDone: false, message: `Đã phân công ${name} cho ${runCode}.` }),
        onAlreadyDone: (failure) => onDecided({ alreadyDone: true, message: failure.message }),
      },
    );
  }

  return (
    <Sheet
      visible={item !== null}
      onClose={onClose}
      title="Phân công lái xe"
      subtitle={`Vòng chạy ${runCode} đang chạy mà chưa có lái xe.`}
      footer={
        mayAssign ? (
          <Button
            kind="signal"
            label={picked ? 'Phân công lái xe này' : 'Chọn một lái xe'}
            disabled={picked === null}
            loading={decision.busy}
            onPress={submit}
            testID="decision-approve"
          />
        ) : null
      }
    >
      {!mayAssign ? (
        <Text variant="caption" tone="muted">
          Tài khoản này không có quyền phân công — chỉ xem.
        </Text>
      ) : null}
      {drivers.isPending ? <LoadingBlock label="Đang đọc danh sách lái xe…" /> : null}
      {drivers.isError ? (
        <ErrorBlock error={drivers.error} onRetry={() => void drivers.refetch()} />
      ) : null}
      {drivers.data && active.length === 0 ? (
        <EmptyBlock title="Không có lái xe nào đang hoạt động" />
      ) : null}
      {active.map((driver) => {
        const selected = picked === driver.id;
        const runs = busyDrivers.get(driver.id);
        return (
          <Pressable
            key={driver.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => setPicked(driver.id)}
            testID={`assign-driver-${driver.id}`}
            style={[
              styles.option,
              {
                borderColor: selected ? color.brand : color.line,
                backgroundColor: selected ? color.brandSoft : color.surface,
              },
            ]}
          >
            <Icon
              name={selected ? 'radiobox-marked' : 'radiobox-blank'}
              tone={selected ? 'brand' : 'muted'}
            />
            <View style={styles.flex}>
              <Text variant="bodyStrong">{driver.fullName}</Text>
              <Text variant="caption" tone="muted">
                {runs && runs.length > 0 ? `Đang có trên bảng: ${runs.join(', ')}` : driver.phone}
              </Text>
            </View>
          </Pressable>
        );
      })}
      <FailureNotice failure={decision.failure} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  option: {
    minHeight: TOUCH.min,
    borderWidth: 1.5,
    borderRadius: RADIUS.control,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  flex: { flex: 1 },
});
