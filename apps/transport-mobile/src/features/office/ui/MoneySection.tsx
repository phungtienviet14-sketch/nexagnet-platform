import type { UseQueryResult } from '@tanstack/react-query';
import { formatBusinessDate, formatVnd } from '../../../format';
import { ErrorBlock, LoadingBlock } from '../../../ui/States';
import { KeyValue, Section } from '../../../ui/Surface';
import { Text } from '../../../ui/Text';
import {
  currencyWarning,
  financeSourceNotes,
  isQuietReadFailure,
  marginView,
  moneyRows,
} from '../finance';
import type { FinanceSummaryView } from '../types';
import { Bullet } from './Blocks';
import { CurrencyWarning, MarginCard, MoneyChips } from './Money';

/**
 * KHOI TIEN dung chung (Hom nay cua giam doc, Tong quan cua ke toan). Nang luc tat / khong co quyen
 * doc bao cao -> mot cau nho, khong phai khoi loi do: phan con lai cua man van dung duoc.
 */
export function MoneySection({
  query,
  enabled,
  title = 'Tiền',
}: {
  readonly query: UseQueryResult<FinanceSummaryView>;
  readonly enabled: boolean;
  readonly title?: string;
}) {
  if (!enabled) {
    return (
      <Section title={title}>
        <Text variant="caption" tone="faint" testID="money-unavailable">
          Sổ tiền chưa bật cho doanh nghiệp này, hoặc tài khoản không có quyền xem báo cáo tiền.
        </Text>
      </Section>
    );
  }
  if (query.isPending) {
    return (
      <Section title={title}>
        <LoadingBlock label="Đang đọc sổ tiền…" />
      </Section>
    );
  }
  if (query.isError) {
    return (
      <Section title={title}>
        {isQuietReadFailure(query.error) ? (
          <Text variant="caption" tone="faint" testID="money-unavailable">
            Sổ tiền chưa bật cho doanh nghiệp này, hoặc tài khoản không có quyền xem báo cáo tiền.
          </Text>
        ) : (
          <ErrorBlock
            error={query.error}
            title="Chưa đọc được sổ tiền"
            onRetry={() => void query.refetch()}
          />
        )}
      </Section>
    );
  }
  const view = query.data;
  return (
    <Section title={`${title} · ngày ${formatBusinessDate(view.generatedFor)}`}>
      <CurrencyWarning text={currencyWarning(view)} />
      <MoneyChips rows={moneyRows(view)} testID="money-rows" />
      <KeyValue
        label="Công nợ khách quá hạn"
        value={formatVnd(view.receivable.overdueTotal)}
        tone={view.receivable.overdueTotal > 0 ? 'caution' : 'ink'}
        strong
      />
      <MarginCard margin={marginView(view.directMargin)} testID="margin-card" />
      {financeSourceNotes(view.unavailableSources).map((note) => (
        <Bullet key={note}>{note}</Bullet>
      ))}
    </Section>
  );
}
