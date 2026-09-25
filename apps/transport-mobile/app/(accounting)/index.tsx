import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  buildQueue,
  cardModel,
  chipCount,
  entryKey,
  filterQueue,
  nextAfter,
  QUEUE_FILTER_LABEL,
  QUEUE_FILTERS,
  queueCounts,
  type QueueEntry,
  type QueueFilter,
} from '../../src/features/accounting/queue';
import {
  useFuelInbox,
  usePendingAllowanceList,
  usePendingClaims,
} from '../../src/features/accounting/queries';
import { FuelSheet } from '../../src/features/accounting/ui/FuelSheet';
import { isQuietReadFailure } from '../../src/features/office/finance';
import {
  driverNameOf,
  useDrivers,
  useOfficeAccess,
  useOfficeKey,
} from '../../src/features/office/queries';
import { AllowanceDecisionSheet } from '../../src/features/office/ui/AllowanceDecisionSheet';
import { Notice } from '../../src/features/office/ui/Blocks';
import { FilterChips } from '../../src/features/office/ui/Chips';
import {
  ClaimDecisionSheet,
  type DecisionOutcomeReport,
} from '../../src/features/office/ui/ClaimDecisionSheet';
import { noticeFromReport, useNotice } from '../../src/features/office/useNotice';
import { SPACE } from '../../src/theme/tokens';
import { AccountButton } from '../../src/ui/AccountButton';
import { Screen } from '../../src/ui/Screen';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../src/ui/States';
import { Card, Pill } from '../../src/ui/Surface';
import { SyncBanner } from '../../src/ui/SyncBanner';
import { Text } from '../../src/ui/Text';

/**
 * "CẦN DUYỆT" — MOT hang tu ba nguon (de nghi chi, phieu dau, phu cap cho). Cham the -> to truot ->
 * quyet -> tu mo viec KE TIEP (nhip "inbox zero"). The bi go khoi hang NGAY khi bam (lac quan) va tra
 * lai neu may chu khong nhan. Nguon tat / khong co quyen noi mot cau nho, khong lam trong ca hang.
 */
export default function AccountingQueue() {
  const { can, has } = useOfficeAccess();
  const queryClient = useQueryClient();
  const claimsOn = has('transport-costing') && can('transport.expense.claim.read');
  const fuelOn = has('transport-fuel') && can('transport.fuel.entry.read');
  const allowancesOn = has('transport-checkpoint') && can('transport.waiting_allowance.propose');
  const claims = usePendingClaims(claimsOn);
  const fuel = useFuelInbox(fuelOn);
  const allowances = usePendingAllowanceList(allowancesOn);
  const drivers = useDrivers();
  const claimsKey = useOfficeKey('accounting', 'claims');
  const fuelKey = useOfficeKey('accounting', 'fuel', 'DECLARED');
  const allowancesKey = useOfficeKey('accounting', 'allowances');
  const [filter, setFilter] = useState<QueueFilter>('ALL');
  const [open, setOpen] = useState<QueueEntry | null>(null);
  const [notice, showNotice] = useNotice();

  const sources = { claims: claims.data, fuel: fuel.data, allowances: allowances.data };
  const visible = filterQueue(buildQueue(sources), filter);
  const counts = queueCounts(sources);
  const nameOf = (driverId: string) => driverNameOf(drivers.data, driverId);

  /** Go the khoi danh sach dang nho; tra ve ham hoan tac khi may chu khong nhan. */
  function removeOptimistically(key: QueryKey, id: string): () => void {
    const snapshot = queryClient.getQueryData(key);
    queryClient.setQueryData(key, (data: unknown) => {
      if (Array.isArray(data)) return data.filter((item: { id: string }) => item.id !== id);
      if (data && typeof data === 'object' && 'rows' in data) {
        const page = data as { rows: ReadonlyArray<{ id: string }> };
        return { ...page, rows: page.rows.filter((row) => row.id !== id) };
      }
      return data;
    });
    return () => queryClient.setQueryData(key, snapshot);
  }

  function decided(entry: QueueEntry, report: DecisionOutcomeReport) {
    showNotice(noticeFromReport(report));
    setOpen(nextAfter(visible, entryKey(entry)));
    void queryClient.invalidateQueries({ queryKey: ['accounting'] });
  }

  const refresh = () => {
    if (claimsOn) void claims.refetch();
    if (fuelOn) void fuel.refetch();
    if (allowancesOn) void allowances.refetch();
  };
  const loading =
    (claimsOn && claims.isPending) ||
    (fuelOn && fuel.isPending) ||
    (allowancesOn && allowances.isPending);
  const failures = [
    { label: 'Đề nghị chi', on: claimsOn, query: claims },
    { label: 'Phiếu dầu', on: fuelOn, query: fuel },
    { label: 'Phụ cấp chờ', on: allowancesOn, query: allowances },
  ].filter((source) => source.on && source.query.isError);
  const total = chipCount(counts.ALL);

  return (
    <Screen
      title="Cần duyệt"
      eyebrow={total ? `${total} việc chờ duyệt` : 'Hàng duyệt'}
      trailing={<AccountButton />}
      banner={<SyncBanner />}
      onRefresh={refresh}
      refreshing={claims.isRefetching || fuel.isRefetching || allowances.isRefetching}
      testID="accounting-queue"
    >
      {notice ? (
        <Notice
          tone={notice.tone}
          title={notice.title}
          detail={notice.detail}
          testID="decision-notice"
        />
      ) : null}
      <FilterChips
        label="Lọc theo loại"
        selected={filter}
        onSelect={(key) => setFilter(key as QueueFilter)}
        options={QUEUE_FILTERS.map((key) => ({
          key,
          label: QUEUE_FILTER_LABEL[key],
          count: chipCount(counts[key]),
          testID: `accounting-queue-filter-${key}`,
        }))}
      />
      {loading ? <LoadingBlock lines={4} label="Đang đọc hàng duyệt…" /> : null}
      {failures.map((source) =>
        isQuietReadFailure(source.query.error) ? (
          <Text key={source.label} variant="caption" tone="faint">
            {source.label}: chưa bật cho doanh nghiệp này hoặc tài khoản không có quyền xem.
          </Text>
        ) : (
          <ErrorBlock
            key={source.label}
            title={`Chưa đọc được ${source.label.toLowerCase()}`}
            error={source.query.error}
            onRetry={() => void source.query.refetch()}
          />
        ),
      )}
      {!loading && failures.length === 0 && visible.length === 0 ? (
        <EmptyBlock
          icon="inbox-outline"
          title="Hết việc chờ duyệt"
          detail="Máy chủ không còn mục nào ở loại này."
        />
      ) : null}
      {visible.map((entry) => {
        const model = cardModel(entry, nameOf);
        return (
          <Card
            key={entryKey(entry)}
            rail={entry.type === 'FUEL' ? 'pending' : 'caution'}
            onPress={() => setOpen(entry)}
            testID={`accounting-card-${entry.id}`}
            accessibilityLabel={`${model.typeLabel}: ${model.title}, ${model.amount}`}
          >
            <Text variant="overline" tone="muted">
              {model.typeLabel}
            </Text>
            <View style={styles.row}>
              <Text variant="bodyStrong" style={styles.flex}>
                {model.title}
              </Text>
              <Text variant="figure">{model.amount}</Text>
            </View>
            <Text variant="caption" tone="muted">
              {model.subline}
            </Text>
            {model.warnings.length > 0 ? (
              <View style={styles.pills}>
                {model.warnings.map((warning) => (
                  <Pill
                    key={warning}
                    label={warning}
                    tone={warning === 'Chưa gắn chuyến' ? 'caution' : 'neutral'}
                  />
                ))}
              </View>
            ) : null}
          </Card>
        );
      })}

      <ClaimDecisionSheet
        claimId={open?.type === 'CLAIM' ? open.id : null}
        onClose={() => setOpen(null)}
        optimistic={open ? () => removeOptimistically(claimsKey, open.id) : undefined}
        onDecided={(report) => open && decided(open, report)}
      />
      <FuelSheet
        row={open?.type === 'FUEL' ? open.fuel : null}
        onClose={() => setOpen(null)}
        optimistic={open ? () => removeOptimistically(fuelKey, open.id) : undefined}
        onDecided={(report) => open && decided(open, report)}
      />
      <AllowanceDecisionSheet
        visible={open?.type === 'ALLOWANCE'}
        allowances={open?.type === 'ALLOWANCE' ? [open.allowance] : []}
        initialId={open?.type === 'ALLOWANCE' ? open.id : null}
        onClose={() => setOpen(null)}
        optimistic={(id) => removeOptimistically(allowancesKey, id)}
        onDecided={(report) => open && decided(open, report)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', gap: SPACE.md },
  flex: { flex: 1 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.xs, marginTop: SPACE.xs },
});
