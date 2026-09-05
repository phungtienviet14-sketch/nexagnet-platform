'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { MetricCard, StatusBadge } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useDriverFuelSlips,
  useDriverFund,
  useDriverTrips,
  useNavigationInput,
} from '../hooks/useTransportWorkspace';
import type { DriverScreenId } from '../navigation';
import { transportApi } from '../transport-api';
import { toFundBalance, toFundLedgerRows } from '../workspace/driver-fund';
import {
  currentDriverTrip,
  driverTripActions,
  EVIDENCE_VIEW_UNAVAILABLE,
  toDriverFuelSlipRows,
  toDriverHome,
  toDriverTripCard,
} from '../workspace/driver';

/**
 * BE MAT LAI XE — `GD-23`, va moi payload di qua kieu khung nhin rieng khong co doanh thu (`INV-09`).
 *
 * Uu tien la 1–2 cham cho viec thuong lam (#161 §3): trang chu tra ve DUNG MOT chuyen dang lam kem
 * thao tac cua chinh no, chu khong tra ve mot danh sach de nguoi ta tu tim.
 *
 * HAI man hinh KHONG co o day, va ca hai deu vi mot ly do do duoc:
 *
 *   · **Chi phi** — bo hanh dong `transport.driver.self.*` khong co duong tu ghi mot khoan chi
 *     thuong, va `POST /transport/costing/expenses` doi quyen ke toan.
 *   · **O nop phieu dau** — `POST /transport/me/fuel/slips` doi `vehicleId`, ma lai xe khong co
 *     duong nao doc ra id do (xem `api-gaps.ts#driver-cannot-learn-vehicle-id`).
 *
 * Trong ca hai truong hop, bay mot o nhap ra roi de nguoi dung bam vao mot nut chac chan that bai
 * la te hon la noi that. Doc phieu da nop thi VAN chay, nen phan do van o day.
 */
export function DriverSurface({ screen }: { readonly screen: DriverScreenId }) {
  switch (screen) {
    case 'home':
      return <DriverHome />;
    case 'trip':
      return <DriverTrip />;
    case 'fuel':
      return <DriverFuel />;
    case 'fund':
      return <DriverFund />;
    case 'history':
      return <DriverHistory />;
  }
}

function DriverHome() {
  const navigation = useNavigationInput();
  const trips = toSectionQuery(useDriverTrips(navigation));
  const fund = toSectionQuery(useDriverFund(navigation));
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<string | null>(null);

  const setStatus = useMutation({
    mutationFn: (input: { readonly id: string; readonly to: 'IN_TRANSIT' | 'DELIVERED' }) =>
      transportApi.me.setTripStatus(input.id, input.to),
    onSuccess: () => {
      setFailure(null);
      void queryClient.invalidateQueries({ queryKey: ['transport', 'me'] });
    },
    onError: (error: Error) => setFailure(error.message),
  });

  if (trips.errorMessage !== null) {
    return <ErrorState message={trips.errorMessage} onRetry={trips.refetch} />;
  }
  if (trips.isLoading) return <LoadingState label="Đang đọc chuyến của bạn…" />;

  const model = toDriverHome({ trips: trips.data ?? [], fund: fund.data ?? null });

  return (
    <>
      <h1 className="tx-driver__title">Trang chủ</h1>
      {failure === null ? null : <ErrorState message={failure} />}

      <section className="tx-driver__card" aria-label="Chuyến hiện tại">
        <h2>Chuyến hiện tại</h2>
        <p className="tx-driver__lead">{model.headline}</p>
        {model.currentTrip === null ? (
          <EmptyState title="Chưa có chuyến nào được phân công cho bạn." />
        ) : (
          <>
            <dl className="tx-driver__facts">
              <dt>Mã chuyến</dt>
              <dd>{model.currentTrip.code}</dd>
              <dt>Tuyến</dt>
              <dd>{model.currentTrip.route}</dd>
              <dt>Khách hàng</dt>
              <dd>{model.currentTrip.customerLabel}</dd>
              <dt>Xe</dt>
              <dd>{model.currentTrip.vehicleLabel}</dd>
              <dt>Hàng</dt>
              <dd>{model.currentTrip.cargoDescription ?? '—'}</dd>
            </dl>
            <div className="tx-driver__actions">
              {model.actions.map((action) => (
                <button
                  key={action.to}
                  type="button"
                  className="tx-btn tx-btn--go tx-btn--wide"
                  disabled={setStatus.isPending}
                  onClick={() => {
                    const id = model.currentTrip?.id;
                    if (id !== undefined) setStatus.mutate({ id, to: action.to });
                  }}
                >
                  {setStatus.isPending ? 'Đang gửi…' : action.label}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      {model.fund === null ? null : (
        <section className="tx-cards" aria-label="Số dư quỹ">
          <MetricCard
            label="Số dư quỹ"
            value={model.fund.balanceLabel}
            hint={model.fund.stanceLabel}
          />
          <MetricCard label="Chuyến đang mở" value={String(model.openTripCount)} />
        </section>
      )}
    </>
  );
}

function DriverTrip() {
  const navigation = useNavigationInput();
  const trips = toSectionQuery(useDriverTrips(navigation));
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<string | null>(null);

  const setStatus = useMutation({
    mutationFn: (input: { readonly id: string; readonly to: 'IN_TRANSIT' | 'DELIVERED' }) =>
      transportApi.me.setTripStatus(input.id, input.to),
    onSuccess: () => {
      setFailure(null);
      void queryClient.invalidateQueries({ queryKey: ['transport', 'me'] });
    },
    onError: (error: Error) => setFailure(error.message),
  });

  if (trips.isLoading) return <LoadingState label="Đang đọc chuyến…" />;
  if (trips.errorMessage !== null) {
    return <ErrorState message={trips.errorMessage} onRetry={trips.refetch} />;
  }

  const trip = currentDriverTrip(trips.data ?? []);
  if (trip === null) {
    return (
      <>
        <h1 className="tx-driver__title">Chuyến</h1>
        <EmptyState title="Bạn không có chuyến nào đang mở." />
      </>
    );
  }

  const card = toDriverTripCard(trip);
  const actions = driverTripActions(trip);

  return (
    <>
      <h1 className="tx-driver__title">Chuyến {card.code}</h1>
      {failure === null ? null : <ErrorState message={failure} />}
      <section className="tx-driver__card" aria-label={`Chuyến ${card.code}`}>
        <p className="tx-driver__route">{card.route}</p>
        <StatusBadge label={card.statusLabel} tone={card.tone} />
        <dl className="tx-driver__facts">
          <dt>Ngày</dt>
          <dd>{card.businessDateLabel}</dd>
          <dt>Loại chuyến</dt>
          <dd>{card.kindLabel}</dd>
          <dt>Khách hàng</dt>
          <dd>{card.customerLabel}</dd>
          <dt>Xe</dt>
          <dd>{card.vehicleLabel}</dd>
          <dt>Quãng đường</dt>
          <dd>{card.distanceLabel}</dd>
        </dl>
        <div className="tx-driver__actions">
          {actions.length === 0 ? (
            <p className="tx-note">Chuyến này hiện không có thao tác nào bạn được làm.</p>
          ) : (
            actions.map((action) => (
              <button
                key={action.to}
                type="button"
                className="tx-btn tx-btn--go tx-btn--wide"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ id: trip.id, to: action.to })}
              >
                {action.label}
              </button>
            ))
          )}
        </div>
      </section>
    </>
  );
}

/**
 * DOC duoc, NOP thi chua.
 *
 * Man nay CO Y khong co o nhap: `POST /transport/me/fuel/slips` doi `vehicleId`, va khong endpoint
 * nao ma lai xe duoc goi tra ve id do. Bay mot bieu mau roi de nguoi dung go het so lit, so tien,
 * so km — roi bam gui va nhan 400 — la te hon nhieu so voi noi truoc rang chua gui duoc.
 *
 * Cau tren man hinh noi VIEC CAN LAM (dua phieu giay cho ke toan), khong noi ly do ky thuat: lai xe
 * khong lam gi duoc voi mot cau ve `vehicleId` (#195).
 */
function DriverFuel() {
  const navigation = useNavigationInput();
  const slips = toSectionQuery(useDriverFuelSlips(navigation));
  const rows = toDriverFuelSlipRows(slips.data ?? []);

  return (
    <>
      <h1 className="tx-driver__title">Nhiên liệu</h1>

      <section className="tx-driver__card" aria-label="Nộp phiếu đổ dầu">
        <h2>Ghi phiếu đổ nhiên liệu</h2>
        <p className="tx-note tx-note--warn">
          Chưa gửi được phiếu đổ nhiên liệu từ điện thoại. Hãy đưa phiếu giấy cho kế toán nhập giúp.
        </p>
      </section>

      {slips.errorMessage === null ? null : (
        <ErrorState message={slips.errorMessage} onRetry={slips.refetch} />
      )}
      {slips.isLoading ? <LoadingState label="Đang đọc phiếu đổ dầu…" /> : null}

      <section aria-label="Phiếu đổ dầu của bạn">
        <h2>Phiếu đã gửi</h2>
        {rows.length === 0 && !slips.isLoading ? (
          <EmptyState title="Bạn chưa có phiếu đổ dầu nào." />
        ) : (
          <ul className="tx-driver__list">
            {rows.map((row) => (
              <li key={row.id}>
                <div>
                  <strong>
                    {row.litersLabel} · {row.amountLabel}
                  </strong>
                  <span>
                    {row.businessDateLabel} · {row.odometerLabel}
                  </span>
                  <span>{row.evidenceCountLabel} ảnh</span>
                </div>
                <div className="tx-driver__badges">
                  <StatusBadge label={row.verificationLabel} tone={row.tone} />
                  {row.rejectedNote === null ? null : (
                    <span className="tx-note tx-note--warn">{row.rejectedNote}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="tx-note">{EVIDENCE_VIEW_UNAVAILABLE}</p>
      </section>
    </>
  );
}

function DriverFund() {
  const navigation = useNavigationInput();
  const fund = toSectionQuery(useDriverFund(navigation));

  if (fund.isLoading) return <LoadingState label="Đang đọc quỹ của bạn…" />;
  if (fund.errorMessage !== null) {
    return <ErrorState message={fund.errorMessage} onRetry={fund.refetch} />;
  }
  if (fund.data === undefined) return <EmptyState title="Chưa đọc được sổ quỹ." />;

  const balance = toFundBalance(fund.data);
  // Lai xe KHONG dao duoc but toan: `SALE` khong co `transport.costing.reversal.post`, nen
  // `canReverse` cua moi dong se la `false` va khong nut nao hien ra.
  const rows = toFundLedgerRows(fund.data.entries, navigation.role);

  return (
    <>
      <h1 className="tx-driver__title">Quỹ của bạn</h1>
      <section className="tx-cards" aria-label="Số dư quỹ">
        <MetricCard label="Số dư" value={balance.balanceLabel} hint={balance.stanceLabel} />
      </section>
      <p className="tx-note" role="status">
        {balance.sentence}
      </p>
      <section aria-label="Bút toán quỹ">
        {rows.length === 0 ? (
          <EmptyState title="Bạn chưa có phát sinh quỹ nào." />
        ) : (
          <ul className="tx-driver__list">
            {rows.map((row) => (
              <li key={row.id}>
                <div>
                  <strong>
                    {row.kindLabel} · {row.amountLabel}
                  </strong>
                  <span>{row.businessDateLabel}</span>
                  {row.note === null ? null : <span>{row.note}</span>}
                </div>
                {row.isReversed ? <StatusBadge label="Đã bị đảo" tone="stop" /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function DriverHistory() {
  const navigation = useNavigationInput();
  const trips = toSectionQuery(useDriverTrips(navigation));

  if (trips.isLoading) return <LoadingState label="Đang đọc lịch sử…" />;
  if (trips.errorMessage !== null) {
    return <ErrorState message={trips.errorMessage} onRetry={trips.refetch} />;
  }

  // CHI du lieu cua chinh lai xe: `/transport/me/trips` khong nhan `:driverId`, danh tinh den tu
  // phien dang nhap. Day la cuong che bang CAU TRUC, khong phai mot bo loc o man hinh.
  const rows = (trips.data ?? []).map(toDriverTripCard);

  return (
    <>
      <h1 className="tx-driver__title">Lịch sử</h1>
      {rows.length === 0 ? (
        <EmptyState title="Chưa có chuyến nào trong lịch sử của bạn." />
      ) : (
        <ul className="tx-driver__list">
          {rows.map((row) => (
            <li key={row.id}>
              <div>
                <strong>
                  {row.code} · {row.route}
                </strong>
                <span>{row.businessDateLabel}</span>
                <span>{row.customerLabel}</span>
              </div>
              <StatusBadge label={row.statusLabel} tone={row.tone} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
