'use client';

import type { ReactNode } from 'react';
import { formatVnd } from '../../../lib/format';
import { CUSTOMER_INTENT_LABEL, CUSTOMER_STAGE_LABEL } from '../customer-view';
import type { CustomerOrderDetail } from '../workspace/order-detail';

/**
 * MOT DON, MO RA XEM — o chi tiet dung chung cho Đơn hàng, Hội thoại va Duyệt & gửi.
 *
 * Nhan `CustomerOrderDetail`, KHONG nhan `OrderView`. Ranh gioi duoc giu bang KIEU: khong co
 * duong nao de mot truong ky thuat di vao day ma khong phai sua `workspace/order-detail.ts`
 * truoc, va sua o do thi `order-detail.spec.ts` do.
 *
 * O nay CO Y khong biet gi ve thao tac: nut duyet/tu choi/danh dau da nhap don di vao qua
 * `actions`. Nho vay cung mot o chi tiet dung duoc o ca ba muc, va muc chi doc thi khong phai
 * mang theo mot nut nao.
 */

function formatMoment(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  return at.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="b2b-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Money({ amount }: { amount: number | null }) {
  return <>{amount === null ? 'Chưa có' : formatVnd(amount)}</>;
}

export interface OrderDetailPanelProps {
  readonly order: CustomerOrderDetail;
  readonly actions?: ReactNode;
}

export function OrderDetailPanel({ order, actions }: OrderDetailPanelProps) {
  return (
    <article className="b2b-detail">
      <header className="b2b-detail__head">
        <div className="b2b-detail__lead">
          <span className={`b2b-pill b2b-pill--${order.stage}`}>
            {CUSTOMER_STAGE_LABEL[order.stage]}
          </span>
          <span className="b2b-detail__intent">{CUSTOMER_INTENT_LABEL[order.intent]}</span>
          <time className="b2b-detail__time" dateTime={order.receivedAt}>
            {formatMoment(order.receivedAt)}
          </time>
        </div>
        <h3 className="b2b-detail__title">{order.dealerName ?? 'Chưa xác định đại lý'}</h3>
        <p className="b2b-detail__sub">{order.groupName ?? 'Chưa gán nhóm'}</p>
      </header>

      <section className="b2b-detail__block" aria-label="Tin nhắn gốc">
        <h4 className="b2b-detail__blocktitle">Tin khách đã nhắn</h4>
        <p className="b2b-detail__quote">{order.excerpt}</p>
      </section>

      {order.attentionNotes.length > 0 ? (
        <section className="b2b-detail__block" aria-label="Cảnh báo của đơn">
          <h4 className="b2b-detail__blocktitle">Cần chú ý</h4>
          <ul className="b2b-notes">
            {order.attentionNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {order.lines.length > 0 ? (
        <section className="b2b-detail__block" aria-label="Hàng trong đơn">
          <h4 className="b2b-detail__blocktitle">Hàng trong đơn</h4>
          <table className="b2b-lines">
            <thead>
              <tr>
                <th scope="col">Sản phẩm</th>
                <th scope="col" className="b2b-lines__num">
                  SL
                </th>
                <th scope="col" className="b2b-lines__num">
                  Đơn giá
                </th>
                <th scope="col" className="b2b-lines__num">
                  Thành tiền
                </th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line, index) => (
                <tr key={`${line.productName}-${index}`}>
                  <th scope="row">
                    {line.productName}
                    {line.recognised ? null : (
                      <span className="b2b-flag-note">Chưa khớp danh mục</span>
                    )}
                  </th>
                  <td className="b2b-lines__num">{line.quantity}</td>
                  <td className="b2b-lines__num">
                    <Money amount={line.unitPrice} />
                  </td>
                  <td className="b2b-lines__num">
                    <Money amount={line.lineTotal} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      {actions ? <div className="b2b-detail__actions">{actions}</div> : null}
      <OrderFacts order={order} />
    </article>
  );
}

function OrderFacts({ order }: { order: CustomerOrderDetail }) {
  return (
    <>
      <section className="b2b-detail__block" aria-label="Thông tin đơn">
        <h4 className="b2b-detail__blocktitle">Thông tin đơn</h4>
        <dl className="b2b-fields">
          {order.orderTypeLabel ? <Field label="Hình thức">{order.orderTypeLabel}</Field> : null}
          {order.branch ? <Field label="Chi nhánh">{order.branch}</Field> : null}
          {order.policyLabel ? <Field label="Chính sách">{order.policyLabel}</Field> : null}
          {order.totalQuantity !== null ? (
            <Field label="Tổng số lượng">{order.totalQuantity}</Field>
          ) : null}
          {order.shippingFee !== null ? (
            <Field label="Cước vận chuyển">
              <Money amount={order.shippingFee} />
            </Field>
          ) : null}
          {order.codFee !== null ? (
            <Field label="Phí thu hộ">
              <Money amount={order.codFee} />
            </Field>
          ) : null}
          {order.vatAmount !== null ? (
            <Field label="VAT">
              <Money amount={order.vatAmount} />
            </Field>
          ) : null}
          {order.grandTotal !== null ? (
            <Field label="Tổng đơn">
              <strong className="b2b-detail__total">
                <Money amount={order.grandTotal} />
              </strong>
            </Field>
          ) : null}
        </dl>
      </section>

      {order.deliverTo ? (
        <section className="b2b-detail__block" aria-label="Giao tới">
          <h4 className="b2b-detail__blocktitle">Giao tới</h4>
          <dl className="b2b-fields">
            {order.deliverTo.name ? <Field label="Người nhận">{order.deliverTo.name}</Field> : null}
            {order.deliverTo.phone ? (
              <Field label="Số điện thoại">{order.deliverTo.phone}</Field>
            ) : null}
            {order.deliverTo.address ? (
              <Field label="Địa chỉ">{order.deliverTo.address}</Field>
            ) : null}
          </dl>
        </section>
      ) : null}

      <section className="b2b-detail__block" aria-label="Diễn biến">
        <h4 className="b2b-detail__blocktitle">Diễn biến</h4>
        <ol className="b2b-timeline">
          {order.timeline.map((entry) => (
            <li key={entry.key} className="b2b-timeline__row">
              <span className="b2b-timeline__label">{entry.label}</span>
              {entry.at ? (
                <time className="b2b-timeline__at" dateTime={entry.at}>
                  {formatMoment(entry.at)}
                </time>
              ) : null}
              {entry.detail ? <span className="b2b-timeline__detail">{entry.detail}</span> : null}
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
