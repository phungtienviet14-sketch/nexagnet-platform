'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { DataTable, MetricCard, StatusBadge } from '../components/primitives';
import { ErrorState, LoadingState } from '../components/SectionState';
import { newCorrelationKey, transportApi } from '../transport-api';
import { toCustomerArWorkspace } from '../workspace/customer-ar';
import { businessTodayIn } from './business-today';
import { useTenantRuntime } from '../../../lib/tenant-runtime-context';

const numberValue = (data: FormData, name: string): number => Number(data.get(name));
const optional = (data: FormData, name: string): string | null => {
  const value = String(data.get(name) ?? '').trim();
  return value === '' ? null : value;
};

export function CustomerArWorkspace() {
  const tenant = useTenantRuntime();
  const client = useQueryClient();
  const [asOf, setAsOf] = useState(() => businessTodayIn(tenant.transport?.timeZone));
  const [notice, setNotice] = useState<string | null>(null);
  const [lastPaymentId, setLastPaymentId] = useState<string>('');
  const actionKeys = useRef(new Map<string, string>());
  const keyFor = (slot: string): string => {
    const held = actionKeys.current.get(slot);
    if (held !== undefined) return held;
    const created = newCorrelationKey();
    actionKeys.current.set(slot, created);
    return created;
  };

  const pending = useQuery({
    queryKey: ['transport', 'customer-ar', 'pending'],
    queryFn: () => transportApi.customerAr.pending(),
  });
  const batches = useQuery({
    queryKey: ['transport', 'customer-ar', 'batches'],
    queryFn: () => transportApi.customerAr.batches(),
  });
  const summary = useQuery({
    queryKey: ['transport', 'customer-ar', 'summary', asOf],
    queryFn: () => transportApi.customerAr.summary(asOf),
  });

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['transport', 'customer-ar'] });
  };
  const mutation = useMutation({
    mutationFn: async (job: () => Promise<unknown>) => job(),
    onSuccess: () => refresh(),
  });

  const model = useMemo(
    () =>
      summary.data === undefined
        ? null
        : toCustomerArWorkspace({
            asOf,
            pending: pending.data?.orders ?? [],
            batches: batches.data?.batches ?? [],
            summary: summary.data,
          }),
    [asOf, batches.data, pending.data, summary.data],
  );

  const error = pending.error ?? batches.error ?? summary.error ?? mutation.error;

  return (
    <section className="tx-panel" aria-label="Đối soát và công nợ khách hàng">
      <h2>Đối soát doanh thu · Phải thu · Thanh toán / trả trước</h2>
      <p className="tx-note">
        Doanh thu chờ đối soát đứng riêng. Chỉ số tiền đã xác nhận mới thành phải thu chính thức;
        tiền nhận trước nằm ở tín dụng chưa phân bổ cho tới khi kế toán gắn vào chứng từ.
      </p>

      <label className="tx-field">
        <span>Tính đến ngày</span>
        <input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
      </label>
      {error === null ? null : <ErrorState message={(error as Error).message} />}
      {pending.isLoading || batches.isLoading || summary.isLoading ? (
        <LoadingState label="Đang đọc sổ đối soát khách hàng…" />
      ) : null}
      {notice === null ? null : (
        <p className="tx-note" role="status">
          {notice}
        </p>
      )}

      {model === null ? null : (
        <>
          {model.combinedTotalsAllowed &&
          model.pendingAmountLabel !== null &&
          model.officialAmountLabel !== null ? (
            <div className="tx-cards">
              <MetricCard label="Chờ đối soát (chưa phải AR)" value={model.pendingAmountLabel} />
              <MetricCard label="Phải thu chính thức" value={model.officialAmountLabel} />
            </div>
          ) : (
            <p className="tx-note tx-note--warn">
              Có nhiều tiền tệ: không cộng gộp. Đọc từng sổ tiền tệ riêng bên dưới.
            </p>
          )}
          {model.currencyGroups.map((group) => (
            <section
              key={group.currencyCode}
              className="tx-panel"
              aria-label={`Sổ ${group.currencyCode}`}
            >
              <h3>Sổ {group.currencyCode}</h3>
              <div className="tx-cards">
                <MetricCard label="Còn phải thu" value={group.outstandingLabel} />
                <MetricCard label="Chưa đến hạn" value={group.notYetDueLabel} />
                <MetricCard label="Đến hạn" value={group.dueLabel} />
                <MetricCard label="Quá hạn" value={group.overdueLabel} />
                <MetricCard label="Đã phân bổ" value={group.paidLabel} />
                <MetricCard
                  label="Tiền nhận trước / chưa phân bổ"
                  value={group.unallocatedCreditLabel}
                />
              </div>
            </section>
          ))}

          <DataTable
            caption="Đơn chờ đối soát"
            rows={model.pendingRows}
            rowKey={(row) => row.orderId}
            columns={[
              { key: 'order', header: 'Đơn', isRowHeader: true, render: (row) => row.orderCode },
              { key: 'customer', header: 'Khách', render: (row) => row.customerId },
              { key: 'date', header: 'Ngày', render: (row) => row.businessDate },
              {
                key: 'amount',
                header: 'Đề nghị',
                isNumeric: true,
                render: (row) =>
                  `${row.proposedAmount.toLocaleString('vi-VN')} ${row.currencyCode}`,
              },
            ]}
          />
        </>
      )}

      <div className="tx-grid tx-grid--two">
        <form
          className="tx-panel tx-filters"
          aria-label="Xác nhận đối soát trực tiếp"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const orderId = String(data.get('orderId') ?? '');
            mutation.mutate(
              () =>
                transportApi.customerAr.confirmOrder(orderId, {
                  confirmedAmount: numberValue(data, 'confirmedAmount'),
                  currencyCode: String(data.get('currencyCode') ?? 'VND'),
                  businessDate: String(data.get('businessDate') ?? asOf),
                  differenceReason: optional(data, 'differenceReason'),
                  confirmationReference: optional(data, 'reference'),
                  evidenceRefs:
                    optional(data, 'evidenceRef') === null ? [] : [String(data.get('evidenceRef'))],
                  idempotencyKey: keyFor(
                    `confirm:${orderId}:${JSON.stringify(Object.fromEntries(data))}`,
                  ),
                }),
              { onSuccess: () => setNotice('Đã xác nhận đối soát và tạo phải thu chính thức.') },
            );
          }}
        >
          <h3>Xác nhận một đơn</h3>
          <label className="tx-field">
            <span>Đơn chờ đối soát</span>
            <select name="orderId" required defaultValue="">
              <option value="">— Chọn đơn —</option>
              {(pending.data?.orders ?? []).map((row) => (
                <option key={row.orderId} value={row.orderId}>
                  {row.orderCode}
                </option>
              ))}
            </select>
          </label>
          <label className="tx-field">
            <span>Số tiền xác nhận</span>
            <input name="confirmedAmount" type="number" min="1" required />
          </label>
          <label className="tx-field">
            <span>Tiền tệ</span>
            <input name="currencyCode" defaultValue="VND" pattern="[A-Z]{3}" required />
          </label>
          <label className="tx-field">
            <span>Ngày nghiệp vụ</span>
            <input name="businessDate" type="date" defaultValue={asOf} required />
          </label>
          <label className="tx-field">
            <span>Lý do chênh lệch (nếu có)</span>
            <input name="differenceReason" />
          </label>
          <label className="tx-field">
            <span>Tham chiếu xác nhận</span>
            <input name="reference" />
          </label>
          <label className="tx-field">
            <span>Mã bằng chứng</span>
            <input name="evidenceRef" />
          </label>
          <button className="tx-btn" type="submit" disabled={mutation.isPending}>
            Xác nhận đối soát
          </button>
        </form>

        <form
          className="tx-panel tx-filters"
          aria-label="Tạo lô đối soát"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const customerId = String(data.get('customerId') ?? '');
            const currencyCode = String(data.get('currencyCode') ?? 'VND');
            const orderIds = (pending.data?.orders ?? [])
              .filter((row) => row.customerId === customerId && row.currencyCode === currencyCode)
              .map((row) => row.orderId);
            mutation.mutate(
              () =>
                transportApi.customerAr.createBatch({
                  customerId,
                  orderIds,
                  currencyCode,
                  periodStart: optional(data, 'periodStart'),
                  periodEnd: optional(data, 'periodEnd'),
                  reference: optional(data, 'reference'),
                  note: optional(data, 'note'),
                  idempotencyKey: keyFor(`batch:${JSON.stringify(Object.fromEntries(data))}`),
                }),
              { onSuccess: () => setNotice('Đã tạo lô đối soát từ các đơn đang chờ của khách.') },
            );
          }}
        >
          <h3>Tạo lô đối soát</h3>
          <label className="tx-field">
            <span>Mã khách hàng</span>
            <input name="customerId" required />
          </label>
          <label className="tx-field">
            <span>Tiền tệ</span>
            <input name="currencyCode" defaultValue="VND" required />
          </label>
          <label className="tx-field">
            <span>Từ ngày</span>
            <input name="periodStart" type="date" />
          </label>
          <label className="tx-field">
            <span>Đến ngày</span>
            <input name="periodEnd" type="date" />
          </label>
          <label className="tx-field">
            <span>Tham chiếu</span>
            <input name="reference" />
          </label>
          <label className="tx-field">
            <span>Ghi chú</span>
            <input name="note" />
          </label>
          <button className="tx-btn" type="submit" disabled={mutation.isPending}>
            Tạo lô
          </button>
        </form>
      </div>

      {(batches.data?.batches ?? []).map((batch) => (
        <section className="tx-panel" key={batch.id} aria-label={`Lô đối soát ${batch.id}`}>
          <h3>
            Lô {batch.id} · {batch.customerId}
          </h3>
          <p>
            <StatusBadge label={batch.status} tone={batch.status === 'CLOSED' ? 'done' : 'wait'} />
          </p>
          <ul className="tx-notes">
            {batch.lines.map((line) => (
              <li key={line.id}>
                {line.orderCode} · {line.proposedAmount.toLocaleString('vi-VN')} {line.currencyCode}{' '}
                · {line.state}
                {line.state !== 'PENDING' ? null : (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="tx-btn tx-btn--small"
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate(
                          () =>
                            transportApi.customerAr.resolveBatch(batch.id, {
                              decisions: [
                                {
                                  lineId: line.id,
                                  action: 'CONFIRM',
                                  confirmedAmount: line.proposedAmount,
                                  businessDate: asOf,
                                  evidenceRefs: [],
                                },
                              ],
                              idempotencyKey: keyFor(
                                `batch-confirm:${batch.id}:${line.id}:${asOf}`,
                              ),
                            }),
                          {
                            onSuccess: () =>
                              setNotice(`Đã xác nhận dòng ${line.orderCode} trong lô.`),
                          },
                        )
                      }
                    >
                      Xác nhận số đề nghị
                    </button>{' '}
                    <button
                      type="button"
                      className="tx-btn tx-btn--small"
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate(
                          () =>
                            transportApi.customerAr.resolveBatch(batch.id, {
                              decisions: [
                                {
                                  lineId: line.id,
                                  action: 'DEFER',
                                  reason: 'Chờ khách hàng đối chiếu thêm',
                                },
                              ],
                              idempotencyKey: keyFor(`batch-defer:${batch.id}:${line.id}`),
                            }),
                          {
                            onSuccess: () =>
                              setNotice(`Đã hoãn dòng ${line.orderCode}; chưa tạo AR.`),
                          },
                        )
                      }
                    >
                      Hoãn đối soát
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <div className="tx-grid tx-grid--two">
        <form
          className="tx-panel tx-filters"
          aria-label="Ghi nhận thanh toán hoặc trả trước"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            mutation.mutate(
              () =>
                transportApi.customerAr.recordPayment({
                  customerId: String(data.get('customerId') ?? ''),
                  amount: numberValue(data, 'amount'),
                  currencyCode: String(data.get('currencyCode') ?? 'VND'),
                  receivedAt: new Date(String(data.get('receivedAt'))).toISOString(),
                  businessDate: String(data.get('businessDate') ?? asOf),
                  externalRef: optional(data, 'externalRef'),
                  note: optional(data, 'note'),
                  idempotencyKey: keyFor(`payment:${JSON.stringify(Object.fromEntries(data))}`),
                }),
              {
                onSuccess: (result) => {
                  const id = (result as { payment?: { id?: string } }).payment?.id ?? '';
                  setLastPaymentId(id);
                  setNotice('Đã ghi nhận tiền; phần chưa phân bổ được giữ là tiền nhận trước.');
                },
              },
            );
          }}
        >
          <h3>Ghi nhận tiền vào</h3>
          <label className="tx-field">
            <span>Mã khách hàng</span>
            <input name="customerId" required />
          </label>
          <label className="tx-field">
            <span>Số tiền</span>
            <input name="amount" type="number" min="1" required />
          </label>
          <label className="tx-field">
            <span>Tiền tệ</span>
            <input name="currencyCode" defaultValue="VND" required />
          </label>
          <label className="tx-field">
            <span>Thời điểm nhận</span>
            <input name="receivedAt" type="datetime-local" required />
          </label>
          <label className="tx-field">
            <span>Ngày nghiệp vụ</span>
            <input name="businessDate" type="date" defaultValue={asOf} required />
          </label>
          <label className="tx-field">
            <span>Tham chiếu ngân hàng</span>
            <input name="externalRef" />
          </label>
          <label className="tx-field">
            <span>Ghi chú</span>
            <input name="note" />
          </label>
          <button className="tx-btn" type="submit" disabled={mutation.isPending}>
            Ghi nhận thanh toán
          </button>
        </form>

        <form
          className="tx-panel tx-filters"
          aria-label="Phân bổ thanh toán"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            mutation.mutate(
              () =>
                transportApi.customerAr.allocatePayment(String(data.get('paymentId') ?? ''), {
                  documentId: String(data.get('documentId') ?? ''),
                  amount: numberValue(data, 'amount'),
                  businessDate: String(data.get('businessDate') ?? asOf),
                  note: optional(data, 'note'),
                  idempotencyKey: keyFor(`allocation:${JSON.stringify(Object.fromEntries(data))}`),
                }),
              { onSuccess: () => setNotice('Đã phân bổ tiền vào chứng từ phải thu.') },
            );
          }}
        >
          <h3>Phân bổ tiền</h3>
          <label className="tx-field">
            <span>Mã thanh toán</span>
            <input name="paymentId" defaultValue={lastPaymentId} required />
          </label>
          <label className="tx-field">
            <span>Mã chứng từ phải thu</span>
            <input name="documentId" required />
          </label>
          <label className="tx-field">
            <span>Số tiền phân bổ</span>
            <input name="amount" type="number" min="1" required />
          </label>
          <label className="tx-field">
            <span>Ngày nghiệp vụ</span>
            <input name="businessDate" type="date" defaultValue={asOf} required />
          </label>
          <label className="tx-field">
            <span>Ghi chú</span>
            <input name="note" />
          </label>
          <button className="tx-btn" type="submit" disabled={mutation.isPending}>
            Phân bổ
          </button>
        </form>
      </div>
    </section>
  );
}
