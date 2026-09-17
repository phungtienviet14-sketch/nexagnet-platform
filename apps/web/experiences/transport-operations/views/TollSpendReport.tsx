'use client';

import { useState } from 'react';
import { DataTable } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import { TOLL_PROVIDER_LABEL, formatCount } from '../customer-view';
import { toSectionQuery, useTollSpendReport } from '../hooks/useTransportWorkspace';
import type { NavigationInput } from '../navigation';
import type { TollSpendReportQuery } from '../toll-report-types';
import {
  TOLL_PROVIDERS,
  type TollImport,
  type TollMatchState,
  type TollProvider,
  type TollProviderSurface,
} from '../transport-types';
import { downloadCsv } from '../workspace/exports';
import {
  TOLL_SPEND_DISCLOSURE,
  toTollReportCoverage,
  toTollSpendReportModel,
  tollSpendCsv,
  type TollDuplicateRowModel,
  type TollSpendAmountCell,
  type TollSpendReportModel,
  type TollSpendTotalRowModel,
  type TollUnattributedRowModel,
  type TollVehicleSpendRowModel,
} from '../workspace/toll-report';

/**
 * CHI PHI PHI DUONG BO THEO XE / KY — `#314` G9.
 *
 * ==============================================================================================
 * TRINH DUYET KHONG CONG MOT DONG TIEN NAO
 * ==============================================================================================
 *
 * May chu gom, cong va xep tung dong vao dung mot bang (`GET /transport/toll/reports/spend`). Man hinh
 * chi dinh dang. Ky mac dinh cung do MAY CHU chon (thang nghiep vu hien tai theo mui gio khach): o
 * ngay de trong cho toi khi bao cao dau tien ve, roi hien dung ky may chu da dung.
 *
 * ==============================================================================================
 * NOI THAT TRUOC BANG SO
 * ==============================================================================================
 *
 * Loi rao "xac nhan khong phai thanh toan" va do phu du lieu (chua co duong API nao, lan nap gan nhat
 * cua tung nha cung cap) dung TREN bang so. Mot bang tien khong co hai cau do se duoc doc nhu mot
 * bang da hach toan va da day du.
 */
interface ReportDraft {
  /** `null` = nguoi dung chua sua — o nhap hien ky may chu da dung. */
  readonly from: string | null;
  readonly to: string | null;
  readonly provider: TollProvider | 'ALL';
}

export function TollSpendReport({
  navigation,
  providers,
  imports,
  onOpenQueue,
}: {
  readonly navigation: NavigationInput;
  readonly providers: TollProviderSurface | undefined;
  readonly imports: readonly TollImport[] | undefined;
  readonly onOpenQueue: (matchState: TollMatchState) => void;
}) {
  const [draft, setDraft] = useState<ReportDraft>({ from: null, to: null, provider: 'ALL' });
  const [applied, setApplied] = useState<TollSpendReportQuery>({});
  const [failure, setFailure] = useState<string | null>(null);

  const report = toSectionQuery(useTollSpendReport(navigation, applied));
  const coverage = toTollReportCoverage(providers, imports);
  const model = report.data === undefined ? null : toTollSpendReportModel(report.data);

  const fromValue = draft.from ?? report.data?.from ?? '';
  const toValue = draft.to ?? report.data?.to ?? '';

  /** Cung khuon `ExportsView.run`: mot lan tai tep hong KHONG duoc lam trang man hinh. */
  const download = () => {
    setFailure(null);
    try {
      if (report.data === undefined) {
        setFailure('Chưa có báo cáo để tải.');
        return;
      }
      downloadCsv(tollSpendCsv(report.data));
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'Không tải được tệp CSV.');
    }
  };

  return (
    <section className="tx-panel" aria-labelledby="toll-spend-heading">
      <h2 id="toll-spend-heading">Chi phí phí đường bộ theo xe</h2>
      <p className="tx-panel__lead">{TOLL_SPEND_DISCLOSURE}</p>

      {coverage.apiNotice === null ? null : (
        <p className="tx-note tx-note--warn">{coverage.apiNotice}</p>
      )}
      <ul className="tx-detail__reasons" aria-label="Lần nạp gần nhất theo nhà cung cấp">
        {coverage.lastImports.map((entry) => (
          <li key={entry.provider}>
            {entry.providerLabel}: {entry.label}
          </li>
        ))}
      </ul>

      <form
        className="tx-filters"
        aria-label="Chọn kỳ báo cáo chi phí phí đường bộ"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied({
            from: fromValue === '' ? null : fromValue,
            to: toValue === '' ? null : toValue,
            provider: draft.provider === 'ALL' ? null : draft.provider,
          });
        }}
      >
        <label className="tx-field tx-field--inline">
          <span>Từ ngày</span>
          <input
            type="date"
            value={fromValue}
            onChange={(event) => setDraft({ ...draft, from: event.target.value })}
          />
        </label>
        <label className="tx-field tx-field--inline">
          <span>Đến ngày</span>
          <input
            type="date"
            value={toValue}
            onChange={(event) => setDraft({ ...draft, to: event.target.value })}
          />
        </label>
        <label className="tx-field tx-field--inline">
          <span>Nhà cung cấp</span>
          <select
            aria-label="Nhà cung cấp trong báo cáo"
            value={draft.provider}
            onChange={(event) =>
              setDraft({ ...draft, provider: event.target.value as TollProvider | 'ALL' })
            }
          >
            <option value="ALL">Mọi nhà cung cấp</option>
            {TOLL_PROVIDERS.map((provider) => (
              <option key={provider} value={provider}>
                {TOLL_PROVIDER_LABEL[provider]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="tx-btn tx-btn--go">
          Xem báo cáo
        </button>
        <button
          type="button"
          className="tx-btn"
          disabled={report.data === undefined}
          onClick={download}
        >
          Tải CSV
        </button>
      </form>

      {failure === null ? null : <ErrorState message={failure} />}
      {report.isBlocked ? (
        <EmptyState title="Vai của bạn không đọc được báo cáo phí đường bộ." />
      ) : null}
      {report.isLoading ? <LoadingState label="Đang lập báo cáo chi phí…" /> : null}
      {report.errorMessage === null ? null : (
        <ErrorState message={report.errorMessage} onRetry={report.refetch} />
      )}
      {model === null ? null : <ReportBody model={model} onOpenQueue={onOpenQueue} />}
    </section>
  );
}

/** O tien: so tien kem so dong. O KHONG co dong nao chi hien `—`. */
function AmountCell({ cell }: { readonly cell: TollSpendAmountCell }) {
  if (cell.isEmpty) return <>—</>;
  return (
    <>
      {cell.amountLabel}
      <br />
      <small>{cell.rowCountLabel}</small>
    </>
  );
}

function ReportBody({
  model,
  onOpenQueue,
}: {
  readonly model: TollSpendReportModel;
  readonly onOpenQueue: (matchState: TollMatchState) => void;
}) {
  return (
    <>
      <p className="tx-note" role="status">
        Kỳ {model.periodLabel} · {model.providerLabel} · {model.generatedOnLabel}.
      </p>
      {model.pendingPersonRowCount === 0 ? null : (
        <p className="tx-note tx-note--warn">
          Còn {formatCount(model.pendingPersonRowCount)} dòng chờ người (chưa gắn được xe hoặc nghi
          trùng) — số liệu theo xe chưa đầy đủ cho tới khi xử lý xong.
        </p>
      )}

      {model.isEmpty ? (
        <EmptyState title={model.emptyNotice} />
      ) : (
        <>
          <h3>Tổng theo loại giao dịch</h3>
          <DataTable<TollSpendTotalRowModel>
            caption="Tổng phí đường bộ theo loại giao dịch trong kỳ"
            rows={model.totals}
            rowKey={(row) => row.key}
            columns={[
              {
                key: 'kind',
                header: 'Loại giao dịch',
                isRowHeader: true,
                render: (row) =>
                  row.currencyCode === 'VND'
                    ? row.kindLabel
                    : `${row.kindLabel} (${row.currencyCode})`,
              },
              {
                key: 'attributed-confirmed',
                header: 'Đã gắn xe · đã có người xác nhận',
                isNumeric: true,
                render: (row) => <AmountCell cell={row.attributedConfirmed} />,
              },
              {
                key: 'attributed-open',
                header: 'Đã gắn xe · chưa đối soát xong',
                isNumeric: true,
                render: (row) => <AmountCell cell={row.attributedOpen} />,
              },
              {
                key: 'unattributed-confirmed',
                header: 'Chưa gắn xe · đã có người xác nhận',
                isNumeric: true,
                render: (row) => <AmountCell cell={row.unattributedConfirmed} />,
              },
              {
                key: 'unattributed-open',
                header: 'Chưa gắn xe · chưa đối soát xong',
                isNumeric: true,
                render: (row) => <AmountCell cell={row.unattributedOpen} />,
              },
              {
                key: 'excluded',
                header: 'Không tính vì trùng',
                isNumeric: true,
                render: (row) => <AmountCell cell={row.excluded} />,
              },
            ]}
          />

          <h3>Theo xe</h3>
          {model.vehicles.length === 0 ? (
            <p className="tx-note">Chưa có dòng nào gắn được xe trong kỳ này.</p>
          ) : (
            <DataTable<TollVehicleSpendRowModel>
              caption="Phí đường bộ theo xe và tháng"
              rows={model.vehicles}
              rowKey={(row) => row.key}
              columns={[
                {
                  key: 'vehicle',
                  header: 'Xe',
                  isRowHeader: true,
                  render: (row) => row.vehicleLabel,
                },
                { key: 'month', header: 'Tháng', render: (row) => row.monthLabel },
                { key: 'kind', header: 'Loại', render: (row) => row.kindLabel },
                {
                  key: 'confirmed',
                  header: 'Đã có người xác nhận',
                  isNumeric: true,
                  render: (row) => <AmountCell cell={row.confirmed} />,
                },
                {
                  key: 'open',
                  header: 'Chưa đối soát xong',
                  isNumeric: true,
                  render: (row) => <AmountCell cell={row.open} />,
                },
              ]}
            />
          )}

          <h3>Chưa gắn được vào một xe</h3>
          {model.unattributed.length === 0 ? (
            <p className="tx-note">Không có dòng nào chưa gắn xe trong kỳ này.</p>
          ) : (
            <DataTable<TollUnattributedRowModel>
              caption="Phí đường bộ chưa gắn được vào một xe — không bao giờ được chia cho xe"
              rows={model.unattributed}
              rowKey={(row) => row.key}
              columns={[
                {
                  key: 'reason',
                  header: 'Vì sao',
                  isRowHeader: true,
                  render: (row) => row.reasonLabel,
                },
                { key: 'month', header: 'Tháng', render: (row) => row.monthLabel },
                { key: 'kind', header: 'Loại', render: (row) => row.kindLabel },
                {
                  key: 'confirmed',
                  header: 'Đã có người xác nhận',
                  isNumeric: true,
                  render: (row) => <AmountCell cell={row.confirmed} />,
                },
                {
                  key: 'open',
                  header: 'Chưa đối soát xong',
                  isNumeric: true,
                  render: (row) => <AmountCell cell={row.open} />,
                },
                {
                  key: 'queue',
                  header: 'Việc',
                  render: (row) =>
                    row.queueMatchState === null ? (
                      '—'
                    ) : (
                      <button
                        type="button"
                        className="tx-btn tx-btn--small"
                        aria-label={`Mở hàng chờ: ${row.reasonLabel}, tháng ${row.monthLabel}`}
                        onClick={() => {
                          if (row.queueMatchState !== null) onOpenQueue(row.queueMatchState);
                        }}
                      >
                        Mở hàng chờ
                      </button>
                    ),
                },
              ]}
            />
          )}

          <h3>Dòng trùng — không tính vào tổng nào</h3>
          {model.duplicates.length === 0 ? (
            <p className="tx-note">Không có dòng trùng hay nghi trùng trong kỳ này.</p>
          ) : (
            <DataTable<TollDuplicateRowModel>
              caption="Dòng trùng và nghi trùng trong kỳ"
              rows={model.duplicates}
              rowKey={(row) => row.key}
              columns={[
                {
                  key: 'state',
                  header: 'Trạng thái',
                  isRowHeader: true,
                  render: (row) => row.stateLabel,
                },
                { key: 'month', header: 'Tháng', render: (row) => row.monthLabel },
                { key: 'kind', header: 'Loại', render: (row) => row.kindLabel },
                {
                  key: 'total',
                  header: 'Không tính',
                  isNumeric: true,
                  render: (row) => <AmountCell cell={row.total} />,
                },
                {
                  key: 'queue',
                  header: 'Việc',
                  render: (row) =>
                    row.queueMatchState === null ? (
                      '—'
                    ) : (
                      <button
                        type="button"
                        className="tx-btn tx-btn--small"
                        aria-label={`Mở hàng chờ: ${row.stateLabel}, tháng ${row.monthLabel}`}
                        onClick={() => {
                          if (row.queueMatchState !== null) onOpenQueue(row.queueMatchState);
                        }}
                      >
                        Mở hàng chờ
                      </button>
                    ),
                },
              ]}
            />
          )}
        </>
      )}
    </>
  );
}
