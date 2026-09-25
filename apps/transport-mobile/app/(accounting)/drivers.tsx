import { useDriverBalances } from '../../src/features/accounting/queries';
import { isQuietReadFailure } from '../../src/features/office/finance';
import { driverNameOf, useDrivers, useOfficeAccess } from '../../src/features/office/queries';
import { formatVnd } from '../../src/format';
import { AccountButton } from '../../src/ui/AccountButton';
import { Screen } from '../../src/ui/Screen';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../src/ui/States';
import { Card, KeyValue, Pill } from '../../src/ui/Surface';
import { SyncBanner } from '../../src/ui/SyncBanner';
import { Text } from '../../src/ui/Text';

/**
 * "LÁI XE" — so du tung lai xe cua may chu (`/driver-settlement/balances`). Doc DAU so quy qua THE
 * DUNG `fundStance` cua may chu, khong tu dau so. Ba so (quy, luong con lai, hoan ung) tach rieng.
 */
const STANCE_LABEL: Readonly<Record<string, string>> = {
  DRIVER_HOLDS_COMPANY_CASH: 'Lái xe đang giữ tiền của công ty',
  SETTLED: 'Đã cân bằng',
  COMPANY_OWES_DRIVER: 'Công ty đang nợ lái xe',
};

export default function AccountingDrivers() {
  const { can, has } = useOfficeAccess();
  const enabled = has('transport-workforce') && can('transport.driver_settlement.read');
  const balances = useDriverBalances(enabled);
  const drivers = useDrivers();
  return (
    <Screen
      title="Lái xe"
      eyebrow="Quỹ, lương còn lại, hoàn ứng"
      trailing={<AccountButton />}
      banner={<SyncBanner />}
      onRefresh={() => void balances.refetch()}
      refreshing={balances.isRefetching}
      testID="accounting-drivers"
    >
      {!enabled || (balances.isError && isQuietReadFailure(balances.error)) ? (
        <Text variant="caption" tone="faint">
          Quyết toán lái xe chưa bật cho doanh nghiệp này, hoặc tài khoản không có quyền xem.
        </Text>
      ) : null}
      {enabled && balances.isPending ? (
        <LoadingBlock lines={4} label="Đang đọc số dư lái xe…" />
      ) : null}
      {balances.isError && !isQuietReadFailure(balances.error) ? (
        <ErrorBlock error={balances.error} onRetry={() => void balances.refetch()} />
      ) : null}
      {balances.data && balances.data.length === 0 ? (
        <EmptyBlock title="Chưa có lái xe nào có số dư" />
      ) : null}
      {(balances.data ?? []).map((row) => (
        <Card key={row.driverId} rail={row.fundStance === 'SETTLED' ? 'live' : 'caution'}>
          <Text variant="bodyStrong">{driverNameOf(drivers.data, row.driverId)}</Text>
          <Pill
            label={STANCE_LABEL[row.fundStance] ?? row.fundStance}
            tone={row.fundStance === 'SETTLED' ? 'live' : 'caution'}
          />
          <KeyValue label="Số dư quỹ" value={formatVnd(Math.abs(row.fundBalance))} />
          <KeyValue label="Lương đã ghi nhận, chưa rút" value={formatVnd(row.wageRemaining)} />
          <KeyValue
            label="Công ty còn nợ (hoàn ứng)"
            value={formatVnd(row.reimbursementOutstanding)}
          />
        </Card>
      ))}
      <Text variant="caption" tone="faint">
        Tạm ứng, hoàn quỹ và chi trả cho lái xe: hiện làm trên máy tính.
      </Text>
    </Screen>
  );
}
