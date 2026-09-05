'use client';

import { useMemo, useState } from 'react';
import { useTenantRuntime } from '../../../lib/tenant-runtime-context';
import { DataTable, MetricCard, PageHeader, StatusBadge } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useApByFlow,
  useArAging,
  useCustomers,
  useDirectMarginRollup,
  useNavigationInput,
  usePartnerPosition,
  usePartners,
  useTripDirectMargin,
  useTrips,
} from '../hooks/useTransportWorkspace';
import { SETTLEMENT_FLOWS, type SettlementFlow } from '../transport-types';
import {
  REVENUE_MISSING_NOTE,
  ROLLUP_BATCH_LIMIT,
  toApFlow,
  toArAging,
  toDirectMargin,
  toDirectMarginRollup,
  toPartnerPosition,
  toSettlementDirectory,
} from '../workspace/settlement';
import { businessTodayIn } from './business-today';

/**
 * `TX-05` tren man hinh — BA muc, MOT nguon.
 *
 * Ba muc tach ra vi chung tra loi ba cau hoi khac nhau ("cong ty dang o dau ve tien", "ai no ai",
 * "chuyen nao lam ra tien"), nhung chung dung chung mot danh ba. Nen chung o cung mot tep: tach
 * thanh ba tep se de ba ban sao cua cung mot phep tra cuu ten troi di.
 *
 * KHONG mot lenh ghi nao trong ca tep. `TX-05` di vao HTTP o T7 chi voi sau route DOC — xem
 * `#168 B1`.
 */

/** Danh ba dung chung — doi `counterpartyId` thanh ten nguoi doc nhan ra. */
function useSettlementDirectory() {
  const navigation = useNavigationInput();
  const customers = toSectionQuery(useCustomers(navigation));
  const partners = toSectionQuery(usePartners(navigation));
  return useMemo(
    () =>
      toSettlementDirectory({
        customers: customers.data ?? [],
        partners: partners.data ?? [],
      }),
    [customers.data, partners.data],
  );
}

/* ------------------------------------------------------------------ *
 * Cong no & quyet toan — tuoi no phai thu
 * ------------------------------------------------------------------ */

export function SettlementView() {
  const navigation = useNavigationInput();
  const tenant = useTenantRuntime();
  const directory = useSettlementDirectory();
  const [asOf, setAsOf] = useState(() => businessTodayIn(tenant.transport?.timeZone));
  const [customerId, setCustomerId] = useState<string | null>(null);
  const customers = toSectionQuery(useCustomers(navigation));
  const aging = toSectionQuery(useArAging(navigation, asOf, customerId));

  const model = toArAging(aging.data ?? null, directory);

  return (
    <>
      <PageHeader
        title="Công nợ & quyết toán"
        summary="Năm dòng tiền giữ riêng: khách hàng, nhà xe, nguồn đơn, cây xăng, lái xe."
      />

      {/*
        MOC `asOf` la mot O NHAP, khong phai mot mac dinh im lang. May chu bat buoc tham so nay
        chinh vi ly do do: hai nguoi mo cung man hinh cach nhau qua nua dem se doc ra hai bang khac
        nhau, va khong bang nao ghi lai moc cua no.
      */}
      <form className="tx-filters" role="search" aria-label="Chọn mốc đọc công nợ">
        <label className="tx-field">
          <span>Tính đến ngày</span>
          <input
            type="date"
            value={asOf}
            onChange={(event) => setAsOf(event.target.value)}
            required
          />
        </label>
        <label className="tx-field">
          <span>Khách hàng</span>
          <select
            aria-label="Khách hàng"
            value={customerId ?? ''}
            onChange={(event) =>
              setCustomerId(event.target.value === '' ? null : event.target.value)
            }
          >
            <option value="">Tất cả khách hàng</option>
            {(customers.data ?? []).map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </label>
      </form>

      {aging.errorMessage === null ? null : (
        <ErrorState message={aging.errorMessage} onRetry={aging.refetch} />
      )}
      {aging.isLoading ? <LoadingState label="Đang đọc công nợ phải thu…" /> : null}

      <section className="tx-cards" aria-label="Tổng hợp công nợ phải thu">
        <MetricCard label="Tổng còn nợ" value={model.outstandingLabel} />
        <MetricCard label="Trong đó quá hạn" value={model.overdueLabel} />
        {model.buckets.map((bucket) => (
          <MetricCard key={bucket.bucket} label={bucket.label} value={bucket.amountLabel} />
        ))}
      </section>

      <p className="tx-note" role="status">
        {model.headline}
      </p>

      {model.rows.length === 0 && !aging.isLoading ? (
        <EmptyState title={`Không có chứng từ nào còn nợ tính đến ${model.asOfLabel}.`} />
      ) : (
        <DataTable
          caption={`Chứng từ còn nợ tính đến ${model.asOfLabel}`}
          rows={model.rows}
          rowKey={(row) => row.documentId}
          columns={[
            {
              key: 'customer',
              header: 'Khách hàng',
              isRowHeader: true,
              render: (row) => row.counterpartyLabel,
            },
            { key: 'date', header: 'Ngày chứng từ', render: (row) => row.businessDateLabel },
            { key: 'due', header: 'Hạn thanh toán', render: (row) => row.dueDateLabel },
            {
              key: 'amount',
              header: 'Còn nợ',
              isNumeric: true,
              render: (row) => row.outstandingLabel,
            },
            {
              key: 'bucket',
              header: 'Tuổi nợ',
              render: (row) => <StatusBadge label={row.bucketLabel} tone={row.tone} />,
            },
          ]}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * AR/AP — nam dong giu RIENG
 * ------------------------------------------------------------------ */

function ApFlowPanel({ flow }: { readonly flow: SettlementFlow }) {
  const navigation = useNavigationInput();
  const directory = useSettlementDirectory();
  const query = toSectionQuery(useApByFlow(navigation, flow));
  const model = toApFlow(flow, query.data ?? null, directory);

  return (
    <section className="tx-panel" aria-label={`Phải trả — ${model.flowLabel}`}>
      <h2>
        {model.flowLabel} · {model.totalLabel}
      </h2>
      {query.errorMessage === null ? null : (
        <ErrorState message={query.errorMessage} onRetry={query.refetch} />
      )}
      {query.isLoading ? <LoadingState label={`Đang đọc ${model.flowLabel}…`} /> : null}
      {model.isEmpty && !query.isLoading ? (
        <EmptyState title={`Không còn khoản phải trả nào ở dòng ${model.flowLabel}.`} />
      ) : (
        <DataTable
          caption={`Phải trả — ${model.flowLabel}`}
          rows={model.rows}
          rowKey={(row) => row.counterpartyId}
          columns={[
            {
              key: 'party',
              header: 'Đối tác',
              isRowHeader: true,
              render: (row) => row.counterpartyLabel,
            },
            {
              key: 'count',
              header: 'Số chứng từ',
              isNumeric: true,
              render: (row) => row.documentCountLabel,
            },
            {
              key: 'amount',
              header: 'Còn nợ',
              isNumeric: true,
              render: (row) => row.outstandingLabel,
            },
          ]}
        />
      )}
    </section>
  );
}

function PartnerPositionPanel() {
  const navigation = useNavigationInput();
  const directory = useSettlementDirectory();
  const partners = toSectionQuery(usePartners(navigation));
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const position = toSectionQuery(usePartnerPosition(navigation, partnerId));
  const model = toPartnerPosition(position.data ?? null, directory);

  return (
    <section className="tx-panel" aria-label="Vị thế đối tác">
      <h2>Vị thế đối tác</h2>
      <label className="tx-field">
        <span>Đối tác</span>
        <select
          aria-label="Đối tác"
          value={partnerId ?? ''}
          onChange={(event) => setPartnerId(event.target.value === '' ? null : event.target.value)}
        >
          <option value="">Chọn một đối tác</option>
          {(partners.data ?? []).map((partner) => (
            <option key={partner.id} value={partner.id}>
              {partner.name}
            </option>
          ))}
        </select>
      </label>

      {position.errorMessage === null ? null : (
        <ErrorState message={position.errorMessage} onRetry={position.refetch} />
      )}
      {position.isLoading ? <LoadingState label="Đang đọc vị thế đối tác…" /> : null}

      {model === null ? (
        partnerId === null ? (
          <EmptyState title="Chọn một đối tác để xem cả hai chiều." />
        ) : null
      ) : (
        <>
          <div className="tx-cards">
            <MetricCard label="Họ nợ mình" value={model.receivableLabel} />
            <MetricCard label="Mình nợ họ — cước nhà xe" value={model.carrierPayableLabel} />
            <MetricCard label="Mình nợ họ — hoa hồng" value={model.commissionPayableLabel} />
            <MetricCard label="Chênh lệch" value={model.netDisplayLabel} hint="chỉ để xem" />
          </div>
          {/*
            Cau nay KHONG duoc bo. `netDisplay` khong ton tai trong bang nao va khong ai tra tien
            theo no; nguon cam bu tru phap ly (`GD-15`).
          */}
          <p className="tx-note tx-note--warn" role="note">
            {model.netDisclosure}
          </p>
        </>
      )}
    </section>
  );
}

export function ArApView() {
  return (
    <>
      <PageHeader
        title="AR/AP"
        summary="Tuổi nợ phải thu và phải trả theo từng đối tác."
        context={
          <p className="tx-note">
            Bốn dòng tiền phải trả được giữ riêng, không cộng chung: một đối tác có thể vừa là nhà
            xe vừa là nguồn đơn, nên khoá phân biệt là vai chứ không phải đối tác.
          </p>
        }
      />
      <PartnerPositionPanel />
      {SETTLEMENT_FLOWS.filter((flow) => flow !== 'CUSTOMER_FREIGHT').map((flow) => (
        <ApFlowPanel key={flow} flow={flow} />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Bien truc tiep
 * ------------------------------------------------------------------ */

export function MarginView() {
  const navigation = useNavigationInput();
  const trips = toSectionQuery(useTrips(navigation));
  const [tripId, setTripId] = useState<string | null>(null);

  // Cong don chay tren DUNG danh sach chuyen dang xem. Tran mot lo la cua may chu (route cong don
  // lap tung chuyen); o day chi lay lo dau, va cau duoi NOI RA dieu do thay vi im lang cat bot.
  const tripIds = useMemo(
    () => (trips.data ?? []).map((trip) => trip.id).slice(0, ROLLUP_BATCH_LIMIT),
    [trips.data],
  );
  const rollup = toSectionQuery(useDirectMarginRollup(navigation, tripIds));
  const margin = toSectionQuery(useTripDirectMargin(navigation, tripId));

  const rollupModel = toDirectMarginRollup(rollup.data ?? null);
  const marginModel = toDirectMargin(margin.data ?? null);
  const totalTrips = (trips.data ?? []).length;

  return (
    <>
      <PageHeader
        title="Biên trực tiếp"
        summary="Doanh thu trừ chi phí trực tiếp của từng chuyến — chưa gồm chi phí cố định."
      />

      {rollup.errorMessage === null ? null : (
        <ErrorState message={rollup.errorMessage} onRetry={rollup.refetch} />
      )}
      {rollup.isLoading ? <LoadingState label="Đang cộng dồn biên trực tiếp…" /> : null}

      {rollupModel === null ? null : (
        <section className="tx-panel" aria-label="Cộng dồn biên trực tiếp">
          <h2>Cộng dồn</h2>
          <div className="tx-cards">
            <MetricCard label="Doanh thu" value={rollupModel.revenueLabel} />
            <MetricCard label="Trừ chi phí trực tiếp" value={rollupModel.deductionLabel} />
            <MetricCard
              label="Biên trực tiếp"
              value={rollupModel.marginLabel}
              hint={rollupModel.disclosure}
            />
            <MetricCard label="Tỷ suất" value={rollupModel.marginRateLabel} />
          </div>
          <p className="tx-note">{rollupModel.coverageNote}</p>
          {totalTrips > tripIds.length ? (
            <p className="tx-note tx-note--warn">
              Đang cộng trên {tripIds.length} chuyến đầu tiên trong {totalTrips} chuyến đang xem.
            </p>
          ) : null}
        </section>
      )}

      <section className="tx-panel" aria-label="Biên của một chuyến">
        <h2>Theo từng chuyến</h2>
        <label className="tx-field">
          <span>Chuyến</span>
          <select
            aria-label="Chuyến"
            value={tripId ?? ''}
            onChange={(event) => setTripId(event.target.value === '' ? null : event.target.value)}
          >
            <option value="">Chọn một chuyến</option>
            {(trips.data ?? []).map((trip) => (
              <option key={trip.id} value={trip.id}>
                {trip.code} · {trip.originLabel} → {trip.destinationLabel}
              </option>
            ))}
          </select>
        </label>

        {margin.isLoading ? <LoadingState label="Đang đọc biên của chuyến…" /> : null}
        {margin.errorMessage === null ? null : (
          <ErrorState message={margin.errorMessage} onRetry={margin.refetch} />
        )}

        {marginModel === null ? (
          tripId === null ? (
            <EmptyState title="Chọn một chuyến để xem biên trực tiếp." />
          ) : null
        ) : (
          <>
            <div className="tx-cards">
              <MetricCard label="Loại chuyến" value={marginModel.tripKindLabel} />
              <MetricCard label="Doanh thu" value={marginModel.revenueLabel} />
              <MetricCard label="Chi phí trực tiếp" value={marginModel.directCostLabel} />
              <MetricCard label="Cước nhà xe" value={marginModel.carrierPayableLabel} />
              <MetricCard label="Hoa hồng nguồn đơn" value={marginModel.commissionLabel} />
              <MetricCard
                label="Biên trực tiếp"
                value={marginModel.marginLabel}
                hint={marginModel.disclosure}
              />
              <MetricCard label="Tỷ suất" value={marginModel.marginRateLabel} />
            </div>
            {marginModel.isRevenueMissing ? (
              <p className="tx-note tx-note--warn">{REVENUE_MISSING_NOTE}</p>
            ) : null}
            {marginModel.inconsistencyNote === null ? null : (
              <p className="tx-note tx-note--warn" role="alert">
                {marginModel.inconsistencyNote}
              </p>
            )}
          </>
        )}
      </section>
    </>
  );
}
