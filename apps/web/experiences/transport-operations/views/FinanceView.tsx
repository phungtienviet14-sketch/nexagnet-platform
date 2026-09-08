'use client';

import { MetricCard, PageHeader } from '../components/primitives';
import { ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useFinanceSummary,
  useNavigationInput,
} from '../hooks/useTransportWorkspace';
import { buildSectionUrl } from '../navigation';
import { hasOperationsScope, operationsEmptyMessage } from '../transport-actions';
import { toFinance } from '../workspace/finance';

/**
 * BANG TAI CHINH — sau dong tien canh nhau, va KHONG mot o tong nao (#244 G5).
 *
 * ===========================================================================
 * CAU CONG BO DI CUNG CON SO, khong xuong chan trang.
 *
 * `GD-13` doi cau "chua gom chi phi co dinh" nam canh bien truc tiep, va #244 G5 cam goi con so do
 * la mot khoan lai da tru het chi phi. O day cau do duoc dat NGAY TRONG the mang con so — de mot
 * nguoi doc luot qua bang van khong the hieu nham.
 *
 * Man hinh nay chi sap xep: moi phep dinh dang va moi cau chu da duoc `toFinance` quyet o mot ham
 * thuan co bai kiem, ke ca cau canh bao nhieu ma tien.
 */
export function FinanceView() {
  const navigation = useNavigationInput();
  const summary = toSectionQuery(useFinanceSummary(navigation));

  if (!hasOperationsScope(navigation.role)) {
    return (
      <>
        <PageHeader title="Bảng tài chính" />
        <ErrorState message={operationsEmptyMessage(navigation.role)} />
      </>
    );
  }

  const model = summary.data === undefined ? null : toFinance(summary.data);

  return (
    <>
      <PageHeader
        title="Bảng tài chính"
        summary="Doanh thu, biên trực tiếp, và sáu dòng tiền giữ riêng — không cộng chung."
        context={model === null ? undefined : `Số liệu ngày ${model.generatedFor}`}
      />

      {summary.errorMessage === null ? null : (
        <ErrorState message={summary.errorMessage} onRetry={summary.refetch} />
      )}
      {summary.isLoading ? <LoadingState label="Đang đọc số liệu tài chính…" /> : null}

      {model === null ? null : (
        <>
          {model.currencyWarning === null ? null : (
            <p className="tx-note tx-note--warn">{model.currencyWarning}</p>
          )}

          <section className="tx-panel" aria-label="Biên trực tiếp">
            <h2>Doanh thu và biên trực tiếp</h2>
            <div className="tx-cards">
              <MetricCard label="Doanh thu" value={model.margin.revenue} />
              <MetricCard label="Chi phí trực tiếp" value={model.margin.deduction} />
              <MetricCard
                label="Biên trực tiếp"
                value={model.margin.margin}
                hint={model.margin.disclosure}
              />
              <MetricCard
                label="Tỷ lệ biên trực tiếp"
                value={model.margin.ratio}
                hint={model.margin.disclosure}
              />
            </div>
            <p className="tx-panel__lead">{model.margin.coverage}</p>
          </section>

          <section className="tx-panel" aria-label="Sáu dòng tiền">
            <h2>Sáu dòng tiền, giữ riêng</h2>
            <p className="tx-panel__lead">
              Mỗi dòng là một quan hệ nợ với một đối tượng khác nhau. Bảng này cố ý không có ô tổng:
              cộng chúng lại cho ra một con số không ai nợ ai cả.
            </p>
            <div className="tx-cards">
              {model.rows.map((row) => (
                <MetricCard
                  key={row.key}
                  label={row.label}
                  value={row.value}
                  hint={row.direction === 'RECEIVABLE' ? 'Phải thu' : 'Phải trả'}
                  href={row.section === null ? undefined : buildSectionUrl(row.section)}
                />
              ))}
            </div>
          </section>

          <section className="tx-panel" aria-label="Công nợ quá hạn">
            <h2>Trong đó, quá hạn</h2>
            <div className="tx-cards">
              <MetricCard
                label="Khách hàng nợ quá hạn"
                value={model.receivableOverdue}
                href={buildSectionUrl('ar-ap')}
              />
            </div>
          </section>

          {model.disabledSourceNotes.length === 0 ? null : (
            <section className="tx-panel" aria-label="Nghiệp vụ chưa bật">
              <h2>Mục bảng không có, vì khách chưa bật nghiệp vụ</h2>
              <ul className="tx-notes">
                {model.disabledSourceNotes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
