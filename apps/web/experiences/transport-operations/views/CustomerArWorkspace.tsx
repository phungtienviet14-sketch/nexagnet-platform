'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { CommandPanel, DataTable, StatusBadge } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import type { StatusTone } from '../customer-view';
import { newCorrelationKey, transportApi } from '../transport-api';
import {
  CUSTOMER_AR_QUERY_ROOT,
  useCustomerArBook,
  type CustomerArScope,
} from './customer-ar-book';

const numberValue = (data: FormData, name: string): number => Number(data.get(name));
const optional = (data: FormData, name: string): string | null => {
  const value = String(data.get(name) ?? '').trim();
  return value === '' ? null : value;
};

const batchStatusTone = (status: string): StatusTone => (status === 'CLOSED' ? 'done' : 'wait');

const lineStateTone = (state: string): StatusTone => {
  switch (state) {
    case 'CONFIRMED':
      return 'done';
    case 'DEFERRED':
      return 'flat';
    default:
      return 'wait';
  }
};

/**
 * VIEC DOI SOAT & THU TIEN — nua "LAM" cua man `Cong no & quyet toan`.
 *
 * ============================================================================================
 * KHONG MOT O NHAP NAO DOI MOT ID
 * ============================================================================================
 *
 * Ba o o ban dau doi ke toan GO VAO `customerId`, `paymentId` va `documentId`. Ca ba deu la
 * `cuid` cua kho du lieu, nen cach duy nhat lay duoc chung la mo DevTools hoac doc thang DB — va
 * mot ban UAT phai lam the thi khong con la UAT cua nguoi dung nua.
 *
 * Ba o do nay la ba o CHON: nhan la ten khach / so tien + ngay nhan / ma don + so con lai, con ID
 * nam trong `value`. Than yeu cau gui len may chu KHONG doi — van la `customerId`, `paymentId`,
 * `documentId` — nen day thuan tuy la mot lop doc duoc dat trum len cung mot hop dong.
 *
 * Nhan duoc ghep o `workspace/customer-ar.ts` chu khong o day: mot bai test doc duoc dung cau ma
 * ke toan se doc, va hai man hinh khong ghep ra hai cach goi khac nhau cho cung mot dong tien.
 *
 * ============================================================================================
 * BON O NHAP NAM TRONG BON NGAN DONG SAN, XEP THEO DUNG THU TU NGHIEP VU
 * ============================================================================================
 *
 * Khoi nay tung la bon form LUON MO — hai muoi sau o nhap — nam GIUA dau trang va bang tuoi no.
 * Nguoi mo man hinh de xem *khach nao dang no* phai cuon qua het bon form moi toi duoc con so, moi
 * lan, ke ca nhung ngay khong nhap gi. Do dung la truong hop `CommandPanel` sinh ra de giai, va ly
 * do da duoc ghi san trong `components/primitives`.
 *
 * Bon ngan mang so thu tu 1→4 vi tien di qua chung THEO THU TU, khong phai vi cho dep:
 *
 *   1  chot so voi khach       ⇒ don cho doi soat  →  phai thu CHINH THUC
 *   2  gom nhieu don mot lan   ⇒ cung viec tren, lam theo ky
 *   3  ghi nhan tien ve        ⇒ tien nam o TIN DUNG CHUA PHAN BO
 *   4  gan tien vao chung tu   ⇒ den luc nay khoan no moi giam
 *
 * Ngan 4 TU MO ngay sau khi ghi nhan mot khoan tien: buoc 3 luon keo theo buoc 4, va man hinh da
 * chon san khoan vua ghi (`#296`) — de lua chon do sau mot cai nut dong thi khong ai nhin thay.
 *
 * `openLabel` cua ca bon ngan KHONG duoc chua ten nut gui cua form ben trong. Playwright khop
 * `getByRole('button', { name })` theo CHUOI CON, nen mot nut mo mang chu `Phân bổ` se lam moi lan
 * chon nut gui cua form phan bo thanh mot loi `strict mode violation`.
 */
export function CustomerArWorkspace({ scope }: { readonly scope: CustomerArScope }) {
  const client = useQueryClient();
  const book = useCustomerArBook(scope);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * Khoan tien dang chon de phan bo.
   *
   * Ghi nhan tien xong thi chon SAN khoan vua ghi — do la viec ke toan lam ngay sau do. Nhung day
   * van la mot o chon binh thuong: mot khoan tra truoc tu tuan truoc phai chon lai duoc, va `#296`
   * doi dung dieu do.
   */
  const [paymentId, setPaymentId] = useState<string>('');
  const [isAllocationOpen, setAllocationOpen] = useState(false);
  const actionKeys = useRef(new Map<string, string>());
  const keyFor = (slot: string): string => {
    const held = actionKeys.current.get(slot);
    if (held !== undefined) return held;
    const created = newCorrelationKey();
    actionKeys.current.set(slot, created);
    return created;
  };

  const refresh = () => {
    void client.invalidateQueries({ queryKey: [...CUSTOMER_AR_QUERY_ROOT] });
  };
  const mutation = useMutation({
    mutationFn: async (job: () => Promise<unknown>) => job(),
    onSuccess: () => refresh(),
  });

  const { model } = book;
  const asOf = scope.asOf;
  const errorMessage =
    book.errorMessage ?? (mutation.error === null ? null : mutation.error.message);
  const batches = model?.batches ?? [];

  return (
    <section className="tx-work" aria-label="Đối soát và công nợ khách hàng">
      <header className="tx-work__head">
        <h2>Việc đối soát &amp; thu tiền</h2>
        <p className="tx-panel__lead">
          Doanh thu chờ đối soát đứng riêng. Chỉ số tiền đã xác nhận mới thành phải thu chính thức;
          tiền nhận trước nằm ở tín dụng chưa phân bổ cho tới khi kế toán gắn vào chứng từ.
        </p>
      </header>

      {/*
        BON BUOC, VE RA THANH BON BUOC.

        Chuoi nay khong hien o dau tren man hinh cu, nen thu tu cua bon form phai tu doan. Mot dai
        bon buoc doc mot lan hieu duoc re hon mot doan van giai thich cung dieu do.
      */}
      <ol className="tx-flow" aria-label="Đường đi của một đồng tiền khách hàng">
        <li className="tx-flow__step">
          <span className="tx-flow__ord">1</span>
          <span className="tx-flow__label">Đơn giao xong</span>
          <span className="tx-flow__note">chờ đối soát — chưa phải công nợ</span>
        </li>
        <li className="tx-flow__step">
          <span className="tx-flow__ord">2</span>
          <span className="tx-flow__label">Chốt số với khách</span>
          <span className="tx-flow__note">thành phải thu chính thức, có hạn thanh toán</span>
        </li>
        <li className="tx-flow__step">
          <span className="tx-flow__ord">3</span>
          <span className="tx-flow__label">Tiền về tài khoản</span>
          <span className="tx-flow__note">nằm ở tiền nhận trước, chưa trừ vào đâu</span>
        </li>
        <li className="tx-flow__step">
          <span className="tx-flow__ord">4</span>
          <span className="tx-flow__label">Gắn tiền vào chứng từ</span>
          <span className="tx-flow__note">đến lúc này khoản nợ mới giảm</span>
        </li>
      </ol>

      {errorMessage === null ? null : <ErrorState message={errorMessage} />}
      {book.isLoading ? <LoadingState label="Đang đọc sổ đối soát khách hàng…" /> : null}
      {notice === null ? null : (
        <p className="tx-notice" role="status">
          {notice}
        </p>
      )}

      {model === null ? null : model.pendingRows.length === 0 ? (
        <EmptyState title="Không còn đơn nào chờ đối soát." />
      ) : (
        <DataTable
          caption="Đơn chờ đối soát"
          rows={model.pendingRows}
          rowKey={(row) => row.orderId}
          columns={[
            { key: 'order', header: 'Đơn', isRowHeader: true, render: (row) => row.orderCode },
            { key: 'customer', header: 'Khách', render: (row) => row.customerName },
            { key: 'date', header: 'Ngày', render: (row) => row.businessDateLabel },
            {
              key: 'amount',
              header: 'Đề nghị',
              isNumeric: true,
              render: (row) => row.proposedAmountLabel,
            },
          ]}
        />
      )}

      <div className="tx-grid tx-grid--two">
        <CommandPanel
          step={1}
          title="Chốt số với khách cho một đơn"
          openLabel="Chốt một đơn"
          hint="Ghi số hai bên đã thống nhất. Đơn thành phải thu chính thức ngay sau bước này."
        >
          <form
            className="tx-form"
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
                      optional(data, 'evidenceRef') === null
                        ? []
                        : [String(data.get('evidenceRef'))],
                    idempotencyKey: keyFor(
                      `confirm:${orderId}:${JSON.stringify(Object.fromEntries(data))}`,
                    ),
                  }),
                { onSuccess: () => setNotice('Đã xác nhận đối soát và tạo phải thu chính thức.') },
              );
            }}
          >
            <div className="tx-filters">
              <label className="tx-field">
                <span>Đơn chờ đối soát</span>
                <select name="orderId" required defaultValue="">
                  <option value="">— Chọn đơn —</option>
                  {book.pendingOrders.map((row) => (
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
            </div>
            <div className="tx-rowbtns">
              <button className="tx-btn tx-btn--go" type="submit" disabled={mutation.isPending}>
                Xác nhận đối soát
              </button>
            </div>
          </form>
        </CommandPanel>

        <CommandPanel
          step={2}
          title="Gom nhiều đơn của một khách thành lô"
          openLabel="Gom đơn theo kỳ"
          hint="Lấy mọi đơn đang chờ của khách trong cùng một tiền tệ, rồi quyết từng dòng."
        >
          <form
            className="tx-form"
            aria-label="Tạo lô đối soát"
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const customerId = String(data.get('customerId') ?? '');
              const currencyCode = String(data.get('currencyCode') ?? 'VND');
              const orderIds = book.pendingOrders
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
            <div className="tx-filters">
              <label className="tx-field">
                <span>Khách hàng</span>
                <select name="customerId" required defaultValue="">
                  <option value="">— Chọn khách hàng —</option>
                  {book.customerOptions.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
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
            </div>
            <div className="tx-rowbtns">
              <button className="tx-btn" type="submit" disabled={mutation.isPending}>
                Tạo lô
              </button>
            </div>
          </form>
        </CommandPanel>

        <CommandPanel
          step={3}
          title="Ghi nhận tiền khách đã trả"
          openLabel="Nhập tiền về"
          hint="Phần chưa gắn vào chứng từ nào được giữ là tiền nhận trước, không tự trừ nợ."
        >
          <form
            className="tx-form"
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
                    setPaymentId(id);
                    // Buoc 4 di ngay sau buoc 3 — mo san de khoan vua chon khong nam sau mot nut.
                    setAllocationOpen(true);
                    setNotice('Đã ghi nhận tiền; phần chưa phân bổ được giữ là tiền nhận trước.');
                  },
                },
              );
            }}
          >
            <div className="tx-filters">
              <label className="tx-field">
                <span>Khách hàng</span>
                <select name="customerId" required defaultValue="">
                  <option value="">— Chọn khách hàng —</option>
                  {book.customerOptions.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
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
            </div>
            <div className="tx-rowbtns">
              <button className="tx-btn tx-btn--go" type="submit" disabled={mutation.isPending}>
                Ghi nhận thanh toán
              </button>
            </div>
          </form>
        </CommandPanel>

        <CommandPanel
          step={4}
          title="Gắn tiền vào chứng từ phải thu"
          openLabel="Gắn tiền vào nợ"
          hint="Chọn khoản tiền và khoản phải thu bằng chữ — không ô nào đòi một mã nội bộ."
          isOpen={isAllocationOpen}
          onOpenChange={setAllocationOpen}
        >
          <form
            className="tx-form"
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
                    idempotencyKey: keyFor(
                      `allocation:${JSON.stringify(Object.fromEntries(data))}`,
                    ),
                  }),
                { onSuccess: () => setNotice('Đã phân bổ tiền vào chứng từ phải thu.') },
              );
            }}
          >
            <div className="tx-filters">
              <label className="tx-field tx-field--wide">
                <span>Khoản tiền đã nhận</span>
                <select
                  name="paymentId"
                  required
                  value={paymentId}
                  onChange={(event) => setPaymentId(event.target.value)}
                >
                  <option value="">— Chọn khoản tiền —</option>
                  {(model?.paymentChoices ?? []).map((choice) => (
                    <option key={choice.id} value={choice.id}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="tx-field tx-field--wide">
                <span>Khoản phải thu</span>
                <select name="documentId" required defaultValue="">
                  <option value="">— Chọn khoản phải thu —</option>
                  {(model?.receivableChoices ?? []).map((choice) => (
                    <option key={choice.documentId} value={choice.documentId}>
                      {choice.label}
                    </option>
                  ))}
                </select>
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
            </div>
            <div className="tx-rowbtns">
              <button className="tx-btn tx-btn--go" type="submit" disabled={mutation.isPending}>
                Phân bổ
              </button>
            </div>
          </form>
        </CommandPanel>
      </div>

      {batches.length === 0 ? null : (
        <section className="tx-panel" aria-label="Lô đối soát đang mở">
          <h3>Lô đối soát</h3>
          <p className="tx-panel__lead">
            Mỗi dòng là một đơn trong lô. Chốt số đề nghị thì dòng thành phải thu chính thức; hoãn
            thì dòng ở lại lô và chưa sinh một khoản công nợ nào.
          </p>
          {batches.map((batch) => (
            <div className="tx-batch" key={batch.id}>
              <div className="tx-batch__head">
                <h4>
                  {batch.customerName} · {batch.currencyCode}
                </h4>
                <StatusBadge label={batch.statusLabel} tone={batchStatusTone(batch.status)} />
              </div>
              <DataTable
                caption={`Đơn trong lô · ${batch.customerName} · ${batch.currencyCode}`}
                rows={batch.lines}
                rowKey={(line) => line.id}
                columns={[
                  {
                    key: 'order',
                    header: 'Đơn',
                    isRowHeader: true,
                    render: (line) => line.orderCode,
                  },
                  {
                    key: 'amount',
                    header: 'Đề nghị',
                    isNumeric: true,
                    render: (line) => line.proposedAmountLabel,
                  },
                  {
                    key: 'state',
                    header: 'Tình trạng',
                    render: (line) => (
                      <StatusBadge label={line.stateLabel} tone={lineStateTone(line.state)} />
                    ),
                  },
                  {
                    key: 'decide',
                    header: 'Quyết',
                    render: (line) =>
                      line.state !== 'PENDING' ? null : (
                        <span className="tx-rowbtns">
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
                          </button>
                          <button
                            /*
                              KHONG `--ghost`. Hoan doi soat la mot QUYET DINH, khong phai mot
                              duong thoat phu: `--ghost` bo ca nen lan vien, nen canh nut chot so
                              no doc ra nhu mot dong chu chu khong nhu mot cai nut bam duoc.
                            */
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
                        </span>
                      ),
                  },
                ]}
              />
            </div>
          ))}
        </section>
      )}
    </section>
  );
}
