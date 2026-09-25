import type { UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useBranding } from '../../src/branding/BrandingProvider';
import {
  ledgerWindow,
  toFundBalance,
  toFundLedgerRows,
  toPayslipRow,
  toSettlementFigures,
  type PayslipRow,
} from '../../src/features/driver/money';
import {
  useDriverGates,
  useMyFund,
  useMyPayslips,
  useMySettlement,
} from '../../src/features/driver/queries';
import type {
  DriverFundStatement,
  DriverPayslipView,
  DriverSettlementSelfStatement,
} from '../../src/features/driver/types';
import { isQuietReadFailure } from '../../src/features/office/finance';
import { SPACE } from '../../src/theme/tokens';
import { AccountButton } from '../../src/ui/AccountButton';
import { Button } from '../../src/ui/Button';
import { Notice } from '../../src/ui/Notice';
import { Screen } from '../../src/ui/Screen';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../src/ui/States';
import { Card, KeyValue, Pill, Section } from '../../src/ui/Surface';
import { SyncBanner } from '../../src/ui/SyncBanner';
import { Text } from '../../src/ui/Text';

/**
 * "TIỀN" CUA LAI XE — CHI DOC: quy (chieu so du doc tu `balanceStance` cua may chu), quyet toan
 * (bon con so), phieu luong. Moi con so do MAY CHU tinh; man nay khong cong, khong dao dau.
 */
export default function DriverMoney() {
  const gates = useDriverGates();
  const { timeZone } = useBranding();
  const fund = useMyFund(gates.fund);
  const settlement = useMySettlement(gates.settlement);
  const payslips = useMyPayslips(gates.payslips);
  const none = !gates.fund && !gates.settlement && !gates.payslips;
  const refresh = () => {
    if (gates.fund) void fund.refetch();
    if (gates.settlement) void settlement.refetch();
    if (gates.payslips) void payslips.refetch();
  };

  return (
    <Screen
      title="Tiền"
      eyebrow="Quỹ, lương, phiếu lương"
      trailing={<AccountButton />}
      banner={<SyncBanner />}
      onRefresh={none ? undefined : refresh}
      refreshing={fund.isRefetching || settlement.isRefetching || payslips.isRefetching}
      testID="driver-money"
    >
      {none ? (
        <EmptyBlock
          icon="wallet-outline"
          title="Quỹ và lương chưa bật"
          detail="Doanh nghiệp chưa bật, hoặc tài khoản chưa có quyền xem."
        />
      ) : null}
      {gates.fund ? <FundSection query={fund} /> : null}
      {gates.settlement ? <SettlementSection query={settlement} /> : null}
      {gates.payslips ? <PayslipSection query={payslips} timeZone={timeZone} /> : null}
      {none ? null : (
        <Text variant="caption" tone="faint">
          Số liệu do máy chủ tính, màn này chỉ để xem. Tạm ứng, hoàn quỹ và chi lương làm với văn
          phòng.
        </Text>
      )}
    </Screen>
  );
}

function ReadState({
  query,
  label,
  quietText,
}: {
  readonly query: UseQueryResult<unknown>;
  readonly label: string;
  readonly quietText: string;
}) {
  if (query.isPending) return <LoadingBlock lines={2} label={label} />;
  if (!query.isError) return null;
  if (isQuietReadFailure(query.error)) {
    return (
      <Text variant="caption" tone="faint">
        {quietText}
      </Text>
    );
  }
  return <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />;
}

function FundSection({ query }: { readonly query: UseQueryResult<DriverFundStatement> }) {
  const [showAll, setShowAll] = useState(false);
  const statement = query.data;
  const balance = statement ? toFundBalance(statement) : null;
  const ledger = statement ? ledgerWindow(toFundLedgerRows(statement.entries), showAll) : null;
  return (
    <Section title="Quỹ của tôi">
      <ReadState
        query={query}
        label="Đang đọc quỹ…"
        quietText="Chưa xem được quỹ: doanh nghiệp chưa bật hoặc tài khoản chưa có quyền."
      />
      {balance ? (
        <Card rail={balance.tone} testID="money-fund">
          <Pill label={balance.stanceLabel} tone={balance.tone} />
          <Text variant="figure">{balance.balanceLabel}</Text>
          <Text variant="caption" tone="muted">
            {balance.sentence}
          </Text>
        </Card>
      ) : null}
      {ledger?.rows.map((row) => (
        <View key={row.id} style={styles.line}>
          <View style={styles.flex}>
            <Text variant="label" tone={row.isReversed ? 'faint' : 'ink'}>
              {row.kindLabel}
              {row.isReversed ? ' (đã đảo)' : ''}
              {row.isReversal ? ' — bút toán đảo' : ''}
            </Text>
            <Text variant="caption" tone="muted">
              {row.businessDateLabel}
              {row.note ? ` · ${row.note}` : ''}
            </Text>
          </View>
          <Text variant="label" tone={row.isReversed ? 'faint' : 'ink'}>
            {row.amountLabel}
          </Text>
        </View>
      ))}
      {ledger && (ledger.hiddenCount > 0 || showAll) ? (
        <Button
          kind="ghost"
          size="compact"
          label={showAll ? 'Thu gọn' : `Xem tất cả (thêm ${ledger.hiddenCount} dòng)`}
          onPress={() => setShowAll((value) => !value)}
          testID="money-fund-toggle"
        />
      ) : null}
    </Section>
  );
}

function SettlementSection({
  query,
}: {
  readonly query: UseQueryResult<DriverSettlementSelfStatement>;
}) {
  return (
    <Section title="Quyết toán">
      <ReadState
        query={query}
        label="Đang đọc quyết toán…"
        quietText="Chưa xem được quyết toán: doanh nghiệp chưa bật hoặc tài khoản chưa có quyền."
      />
      {query.data ? (
        <Card testID="money-settlement">
          {toSettlementFigures(query.data).map((figure) => (
            <KeyValue key={figure.key} label={figure.label} value={figure.value} />
          ))}
        </Card>
      ) : null}
    </Section>
  );
}

function PayslipSection({
  query,
  timeZone,
}: {
  readonly query: UseQueryResult<readonly DriverPayslipView[]>;
  readonly timeZone: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const rows = (query.data ?? []).map((payslip) => toPayslipRow(payslip, timeZone));
  return (
    <Section title="Phiếu lương">
      <ReadState
        query={query}
        label="Đang đọc phiếu lương…"
        quietText="Chưa xem được phiếu lương: doanh nghiệp chưa bật hoặc tài khoản chưa có quyền."
      />
      {query.data && rows.length === 0 ? (
        <EmptyBlock icon="file-document-outline" title="Chưa có phiếu lương nào" />
      ) : null}
      {rows.map((row) => (
        <PayslipCard
          key={row.id}
          row={row}
          expanded={open === row.id}
          onToggle={() => setOpen((current) => (current === row.id ? null : row.id))}
        />
      ))}
    </Section>
  );
}

function PayslipCard({
  row,
  expanded,
  onToggle,
}: {
  readonly row: PayslipRow;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  return (
    <Card
      rail={row.tone}
      onPress={onToggle}
      testID={`payslip-${row.id}`}
      accessibilityLabel={`Phiếu lương ${row.periodLabel}, thực nhận ${row.netLabel}`}
    >
      <View style={styles.head}>
        <Text variant="bodyStrong" style={styles.flex}>
          {row.periodLabel}
        </Text>
        <Pill label={row.statusLabel} tone={row.tone} />
      </View>
      <Text variant="caption" tone="muted">
        {row.rangeLabel} · {row.kindLabel}
      </Text>
      <KeyValue label="Thực nhận" value={row.netLabel} strong />
      {expanded ? (
        <>
          <KeyValue label="Tổng thu nhập" value={row.grossLabel} />
          <KeyValue label="Khấu trừ" value={row.deductionsLabel} />
          <KeyValue label="Số chuyến" value={row.tripCountLabel} />
          <KeyValue label="Quãng đường" value={row.distanceLabel} />
          <KeyValue label="Duyệt lúc" value={row.approvedAtLabel} />
          {row.paidAtLabel ? <KeyValue label="Đã trả lúc" value={row.paidAtLabel} /> : null}
          {row.correctionReason ? (
            <Notice
              tone="caution"
              icon="information-outline"
              title="Lý do điều chỉnh"
              detail={row.correctionReason}
            />
          ) : null}
          {row.components.map((component) => (
            <View key={component.key} style={styles.line}>
              <View style={styles.flex}>
                <Text variant="label">{component.label}</Text>
                <Text variant="caption" tone="muted">
                  {component.isDeduction ? 'Khấu trừ · ' : ''}
                  {component.sourceLabel}
                  {component.quantityLabel ? ` · ${component.quantityLabel}` : ''}
                  {component.note ? ` · ${component.note}` : ''}
                </Text>
              </View>
              <Text variant="label" tone={component.isDeduction ? 'danger' : 'ink'}>
                {component.isDeduction ? `−${component.amountLabel}` : component.amountLabel}
              </Text>
            </View>
          ))}
        </>
      ) : (
        <Text variant="caption" tone="faint">
          Chạm để xem chi tiết
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  flex: { flex: 1 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md },
});
