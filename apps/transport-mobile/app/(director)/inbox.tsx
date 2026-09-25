import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { driverRunCodes } from '../../src/features/director/fleet';
import { COMPLETION_STATE_LABEL, decisionSheetFor } from '../../src/features/director/inbox';
import {
  useCloseOutQueue,
  useInvalidateDirector,
  usePendingAllowances,
} from '../../src/features/director/queries';
import { AssignDriverSheet } from '../../src/features/director/ui/AssignDriverSheet';
import { DecisionCard } from '../../src/features/director/ui/Briefing';
import { CloseOutSheet, type CloseOutTarget } from '../../src/features/director/ui/CloseOutSheet';
import { ReadOnlySheet } from '../../src/features/director/ui/ReadOnlySheet';
import {
  formatCount,
  groupQueueBySeverity,
  pendingWorkNotes,
  queueItemKey,
  unavailableSourceNotes,
} from '../../src/features/office/control-tower';
import type { OrderCompletionRow } from '../../src/features/office/decision-types';
import {
  newIdempotencyKey,
  useControlTower,
  useOfficeAccess,
  useRefetchOnFocus,
} from '../../src/features/office/queries';
import type { QueueItem } from '../../src/features/office/types';
import { AllowanceDecisionSheet } from '../../src/features/office/ui/AllowanceDecisionSheet';
import { Notice } from '../../src/features/office/ui/Blocks';
import {
  ClaimDecisionSheet,
  type DecisionOutcomeReport,
} from '../../src/features/office/ui/ClaimDecisionSheet';
import { WhyMissing } from '../../src/features/office/ui/WhyMissing';
import { noticeFromReport, useNotice } from '../../src/features/office/useNotice';
import { formatBusinessDate } from '../../src/format';
import { SPACE } from '../../src/theme/tokens';
import { AccountButton } from '../../src/ui/AccountButton';
import { Screen } from '../../src/ui/Screen';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../src/ui/States';
import { Card, Section } from '../../src/ui/Surface';
import { SyncBanner } from '../../src/ui/SyncBanner';
import { Text } from '../../src/ui/Text';

/**
 * "CẦN XỬ LÝ" — CA hang viec cua may chu, nhom theo muc (Khan / Can xem / De biet), dung thu tu may
 * chu trong moi nhom. Cham -> to truot quyet dinh dung loai; loai khong lam duoc tren dien thoai ->
 * to chi doc "Xử lý trên máy tính". Them mot khoi rieng: DON CHO KET THUC (khong nam trong hang viec
 * cua thap dieu hanh, doc tu `commercial-acceptance`).
 */
export default function DirectorInbox() {
  const router = useRouter();
  const params = useLocalSearchParams<{ open?: string }>();
  const { can, has } = useOfficeAccess();
  const tower = useControlTower();
  useRefetchOnFocus(tower.refetch, tower.dataUpdatedAt);
  const closeOutEnabled =
    has('transport-acceptance') && can('transport.commercial_acceptance.read');
  const closeOuts = useCloseOutQueue(closeOutEnabled);
  const invalidate = useInvalidateDirector();
  const [notice, showNotice] = useNotice();

  const [active, setActive] = useState<QueueItem | null>(null);
  const [closeOut, setCloseOut] = useState<CloseOutTarget | null>(null);
  const sheet = active ? decisionSheetFor(active.kind) : null;
  const allowances = usePendingAllowances(sheet === 'ALLOWANCE');

  // Mo thang mot viec khi den tu "Hôm nay" (`?open=<kind:id>`), roi xoa tham so.
  const queue = tower.data?.queue;
  useEffect(() => {
    if (!params.open || !queue) return;
    const item = queue.find((entry) => queueItemKey(entry) === params.open);
    if (item) setActive(item);
    router.setParams({ open: undefined });
  }, [params.open, queue, router]);

  const busyDrivers = useMemo(
    () => (tower.data ? driverRunCodes(tower.data) : new Map<string, readonly string[]>()),
    [tower.data],
  );

  function decided(report: DecisionOutcomeReport, keepOpen = false) {
    showNotice(noticeFromReport(report));
    invalidate();
    if (!keepOpen) setActive(null);
  }

  const refresh = () => {
    void tower.refetch();
    if (closeOutEnabled) void closeOuts.refetch();
  };

  return (
    <Screen
      title="Cần xử lý"
      eyebrow={tower.data ? `${formatCount(tower.data.queueTotal)} việc trong hàng` : 'Hàng việc'}
      trailing={<AccountButton />}
      banner={<SyncBanner />}
      onRefresh={refresh}
      refreshing={tower.isRefetching || closeOuts.isRefetching}
      testID="director-inbox"
    >
      {notice ? (
        <Notice
          tone={notice.tone}
          title={notice.title}
          detail={notice.detail}
          testID="decision-notice"
        />
      ) : null}
      {tower.isPending ? <LoadingBlock lines={5} label="Đang đọc hàng việc…" /> : null}
      {tower.isError ? (
        <ErrorBlock
          error={tower.error}
          title="Chưa đọc được hàng việc"
          onRetry={() => void tower.refetch()}
        />
      ) : null}
      {tower.data && tower.data.queue.length === 0 ? (
        <EmptyBlock
          icon="check-decagram-outline"
          title="Không có việc nào đang chờ"
          detail="Máy chủ trả về hàng việc trống."
        />
      ) : null}
      {tower.data
        ? groupQueueBySeverity(tower.data.queue).map((group) => (
            <Section
              key={group.severity}
              title={`${group.label} · ${formatCount(group.items.length)}`}
            >
              {group.items.map((item) => (
                <DecisionCard key={queueItemKey(item)} item={item} onPress={setActive} />
              ))}
            </Section>
          ))
        : null}

      {closeOutEnabled ? (
        <CloseOutSection
          rows={closeOuts.data}
          error={closeOuts.isError ? closeOuts.error : null}
          loading={closeOuts.isPending}
          onRetry={() => void closeOuts.refetch()}
          onOpen={(row) => setCloseOut({ row, key: newIdempotencyKey('close') })}
        />
      ) : null}

      {tower.data ? (
        <View style={styles.why}>
          <WhyMissing
            disabledNotes={unavailableSourceNotes(tower.data.unavailableSources)}
            pendingNotes={pendingWorkNotes(tower.data.pendingWork)}
          />
        </View>
      ) : null}

      <ClaimDecisionSheet
        claimId={sheet === 'CLAIM' ? (active?.subject.id ?? null) : null}
        onClose={() => setActive(null)}
        onDecided={(report) => decided(report)}
      />
      <AssignDriverSheet
        item={sheet === 'ASSIGN_DRIVER' ? active : null}
        busyDrivers={busyDrivers}
        onClose={() => setActive(null)}
        onDecided={(report) => decided(report)}
      />
      <AllowanceDecisionSheet
        visible={sheet === 'ALLOWANCE'}
        allowances={allowances.data ?? []}
        onClose={() => setActive(null)}
        onDecided={(report) => decided(report, true)}
      />
      <ReadOnlySheet item={sheet === 'READ_ONLY' ? active : null} onClose={() => setActive(null)} />
      <CloseOutSheet
        target={closeOut}
        onClose={() => setCloseOut(null)}
        onDecided={(report) => {
          decided(report);
          setCloseOut(null);
        }}
      />
    </Screen>
  );
}

function CloseOutSection({
  rows,
  error,
  loading,
  onRetry,
  onOpen,
}: {
  readonly rows: readonly OrderCompletionRow[] | undefined;
  readonly error: unknown;
  readonly loading: boolean;
  readonly onRetry: () => void;
  readonly onOpen: (row: OrderCompletionRow) => void;
}) {
  return (
    <Section title={`Đơn chờ kết thúc${rows ? ` · ${formatCount(rows.length)}` : ''}`}>
      {loading ? <LoadingBlock lines={2} /> : null}
      {error ? (
        <ErrorBlock error={error} title="Chưa đọc được đơn chờ kết thúc" onRetry={onRetry} />
      ) : null}
      {rows && rows.length === 0 ? (
        <Text variant="caption" tone="faint">
          Không có đơn giao xong nào chờ kết thúc.
        </Text>
      ) : null}
      {(rows ?? []).map((row) => (
        <Card
          key={row.orderId}
          rail="pending"
          onPress={() => onOpen(row)}
          testID={`director-closeout-${row.orderCode}`}
          accessibilityLabel={`Kết thúc đơn ${row.orderCode}`}
        >
          <Text variant="bodyStrong">{row.orderCode}</Text>
          <Text variant="caption" tone="muted">
            {row.originLabel} → {row.destinationLabel}
          </Text>
          <Text variant="caption" tone="muted">
            {formatBusinessDate(row.businessDate)} ·{' '}
            {COMPLETION_STATE_LABEL[row.state] ?? row.state} ·{' '}
            {row.evidenceCount > 0 ? `${row.evidenceCount} chứng từ` : 'bản giấy'}
          </Text>
        </Card>
      ))}
    </Section>
  );
}

const styles = StyleSheet.create({
  why: { marginTop: SPACE.xl },
});
