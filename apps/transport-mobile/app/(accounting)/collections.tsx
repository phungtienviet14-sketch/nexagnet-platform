import { useArSummary } from '../../src/features/accounting/queries';
import { businessTodayIn } from '../../src/features/office/business-date';
import { isQuietReadFailure } from '../../src/features/office/finance';
import { useFinanceSummary, useOfficeAccess } from '../../src/features/office/queries';
import { useBranding } from '../../src/branding/BrandingProvider';
import { formatBusinessDate, formatVnd } from '../../src/format';
import { AccountButton } from '../../src/ui/AccountButton';
import { Screen } from '../../src/ui/Screen';
import { ErrorBlock, LoadingBlock } from '../../src/ui/States';
import { Card, KeyValue, Section } from '../../src/ui/Surface';
import { SyncBanner } from '../../src/ui/SyncBanner';
import { Text } from '../../src/ui/Text';

/**
 * "THU TIỀN" — so phai thu cua may chu tai ngay `asOf` = ngay nghiep vu cua bang tai chinh (neu co),
 * khong thi "hom nay" theo mui gio DOANH NGHIEP. Moi so mot dong, khong cong gop.
 */
export default function AccountingCollections() {
  const { can, has } = useOfficeAccess();
  const { timeZone } = useBranding();
  const settlementOn = has('transport-settlement');
  const finance = useFinanceSummary(settlementOn && can('transport.settlement.report.read'));
  const asOf = finance.data?.generatedFor ?? businessTodayIn(timeZone);
  const arOn = settlementOn && can('transport.customer_reconciliation.read');
  const ar = useArSummary(asOf, arOn);
  const view = ar.data;
  return (
    <Screen
      title="Thu tiền"
      eyebrow={`Công nợ khách tại ngày ${formatBusinessDate(asOf)}`}
      trailing={<AccountButton />}
      banner={<SyncBanner />}
      onRefresh={() => void ar.refetch()}
      refreshing={ar.isRefetching}
      testID="accounting-collections"
    >
      {!arOn || (ar.isError && isQuietReadFailure(ar.error)) ? (
        <Text variant="caption" tone="faint">
          Sổ phải thu chưa bật cho doanh nghiệp này, hoặc tài khoản không có quyền xem.
        </Text>
      ) : null}
      {arOn && ar.isPending ? <LoadingBlock lines={4} label="Đang đọc công nợ khách…" /> : null}
      {ar.isError && !isQuietReadFailure(ar.error) ? (
        <ErrorBlock
          error={ar.error}
          title="Chưa đọc được công nợ khách"
          onRetry={() => void ar.refetch()}
        />
      ) : null}
      {view ? (
        <>
          <Card rail="caution">
            <KeyValue label="Khách còn nợ" value={formatVnd(view.outstandingAmount)} strong />
            <KeyValue
              label="Quá hạn"
              value={formatVnd(view.overdueAmount)}
              tone={view.overdueAmount > 0 ? 'caution' : 'ink'}
              strong
            />
            <KeyValue label="Đến hạn" value={formatVnd(view.dueAmount)} />
            <KeyValue label="Chưa đến hạn" value={formatVnd(view.notYetDueAmount)} />
          </Card>
          <Card>
            <KeyValue
              label="Chờ đối soát (chưa phải công nợ)"
              value={formatVnd(view.pendingReconciliationAmount)}
            />
            <KeyValue
              label="Tiền nhận trước chưa gắn chứng từ"
              value={formatVnd(view.unallocatedCreditAmount)}
            />
          </Card>
          <Section title="Tiền về gần đây">
            {view.payments.length === 0 ? (
              <Text variant="caption" tone="faint">
                Chưa có khoản tiền về nào.
              </Text>
            ) : (
              view.payments
                .slice(0, 8)
                .map((entry) => (
                  <KeyValue
                    key={entry.payment.id}
                    label={`${formatBusinessDate(entry.payment.businessDate)}${entry.payment.externalRef ? ` · ${entry.payment.externalRef}` : ''}`}
                    value={formatVnd(entry.payment.amount)}
                  />
                ))
            )}
          </Section>
        </>
      ) : null}
      <Text variant="caption" tone="faint">
        Ghi nhận tiền về, chốt số với khách và gắn tiền vào chứng từ: hiện làm trên máy tính.
      </Text>
    </Screen>
  );
}
