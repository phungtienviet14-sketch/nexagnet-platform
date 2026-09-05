'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { MetricCard, StatusBadge } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import {
  toSectionQuery,
  useDriverExpenseCategories,
  useDriverFuelSlips,
  useDriverFund,
  useDriverPayslips,
  useDriverTrips,
  useFuelSuppliers,
  useNavigationInput,
} from '../hooks/useTransportWorkspace';
import type { DriverScreenId } from '../navigation';
import { evidenceUrls, newCorrelationKey, transportApi } from '../transport-api';
import { toFundBalance, toFundLedgerRows } from '../workspace/driver-fund';
import {
  currentDriverTrip,
  driverTripActions,
  EVIDENCE_UPLOAD_HINT,
  toDriverFuelSlipRows,
  toDriverHome,
  toDriverTripCard,
} from '../workspace/driver';
import { toDriverPayslipRows } from '../workspace/payroll';

/**
 * BE MAT LAI XE — `GD-23`, va moi payload di qua kieu khung nhin rieng khong co doanh thu (`INV-09`).
 *
 * Uu tien la 1–2 cham cho viec thuong lam (#161 §3): trang chu tra ve DUNG MOT chuyen dang lam kem
 * thao tac cua chinh no, chu khong tra ve mot danh sach de nguoi ta tu tim.
 *
 * MOI man hinh o day deu goi duoc mot duong that. Truoc T7D co HAI man chi doc duoc — nop phieu
 * dau (thieu `vehicleId`) va phieu luong (chua co route) — va ca hai da duoc #168 mo.
 */
export function DriverSurface({ screen }: { readonly screen: DriverScreenId }) {
  switch (screen) {
    case 'home':
      return <DriverHome />;
    case 'trip':
      return <DriverTrip />;
    case 'fuel':
      return <DriverFuel />;
    case 'expense':
      return <DriverExpense />;
    case 'fund':
      return <DriverFund />;
    case 'history':
      return <DriverHistory />;
    case 'payslip':
      return <DriverPayslip />;
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
 * NHIEN LIEU — nay NOP duoc tu dien thoai.
 *
 * Truoc T7B man nay chi doc duoc: `POST /transport/me/fuel/slips` doi `vehicleId`, va khung nhin
 * cua lai xe chi mang BIEN SO. `#168 B2` them `vehicleId` vao `DriverTripView`, nen ma xe nay den
 * tu CHINH phan cong cua nguoi dang dang nhap — khong tu mot o nhap, khong tu mot danh sach doi xe.
 *
 * Chuyen chua duoc phan cong xe thi bieu mau KHONG hien. Bay mot o nhap roi de nguoi ta go het so
 * lit, so tien, so km — roi bam gui va nhan 400 — la te hon nhieu so voi noi truoc.
 */
function DriverFuel() {
  const navigation = useNavigationInput();
  const queryClient = useQueryClient();
  const trips = toSectionQuery(useDriverTrips(navigation));
  const slips = toSectionQuery(useDriverFuelSlips(navigation));
  const suppliers = toSectionQuery(useFuelSuppliers(navigation));

  const [failure, setFailure] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [form, setForm] = useState({
    supplierId: '',
    liters: '',
    amount: '',
    odometerKm: '',
    invoiceNo: '',
  });
  const [correlationKey, setCorrelationKey] = useState(() => newCorrelationKey());

  const trip = currentDriverTrip(trips.data ?? []);
  const rows = toDriverFuelSlipRows(slips.data ?? []);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['transport', 'me'] });
  };

  const submit = useMutation({
    mutationFn: () => {
      if (trip === null || trip.vehicleId === null) {
        throw new Error('Chuyến hiện tại chưa được phân công xe.');
      }
      return transportApi.me.submitFuelSlip({
        tripId: trip.id,
        vehicleId: trip.vehicleId,
        supplierId: form.supplierId,
        liters: form.liters,
        amount: Number(form.amount),
        odometerKm: Number(form.odometerKm),
        occurredAt: new Date().toISOString(),
        paymentMethod: 'DRIVER_CASH',
        invoiceNo: form.invoiceNo.trim() === '' ? null : form.invoiceNo.trim(),
        // MOT khoa cho MOT lan bam, giu qua cac lan thu lai — mang loi roi bam lai khong duoc tao
        // ra hai phieu.
        correlationKey,
      });
    },
    onSuccess: () => {
      setFailure(null);
      setSuccess('Đã gửi phiếu đổ dầu. Kế toán sẽ xác thực khi đối soát.');
      setForm({ supplierId: '', liters: '', amount: '', odometerKm: '', invoiceNo: '' });
      setCorrelationKey(newCorrelationKey());
      invalidate();
    },
    onError: (error: Error) => {
      setSuccess(null);
      setFailure(error.message);
    },
  });

  const upload = useMutation({
    mutationFn: (input: { readonly slipId: string; readonly file: File }) =>
      transportApi.me.uploadFuelEvidence(input.slipId, input.file),
    onSuccess: () => {
      setFailure(null);
      setSuccess('Đã đính ảnh vào phiếu.');
      invalidate();
    },
    onError: (error: Error) => {
      setSuccess(null);
      setFailure(error.message);
    },
  });

  const resubmit = useMutation({
    mutationFn: (slipId: string) => transportApi.me.resubmitFuelSlip(slipId),
    onSuccess: () => {
      setFailure(null);
      setSuccess('Đã nộp lại phiếu.');
      invalidate();
    },
    onError: (error: Error) => {
      setSuccess(null);
      setFailure(error.message);
    },
  });

  const canSubmit =
    trip !== null &&
    trip.vehicleId !== null &&
    form.supplierId !== '' &&
    form.liters.trim() !== '' &&
    form.amount.trim() !== '' &&
    form.odometerKm.trim() !== '';

  return (
    <>
      <h1 className="tx-driver__title">Nhiên liệu</h1>
      {failure === null ? null : <ErrorState message={failure} />}
      {success === null ? null : (
        <p className="tx-note tx-note--ok" role="status">
          {success}
        </p>
      )}

      <section className="tx-driver__card" aria-label="Ghi phiếu đổ nhiên liệu">
        <h2>Ghi phiếu đổ nhiên liệu</h2>
        {trip === null ? (
          <EmptyState title="Bạn chưa có chuyến nào đang mở, nên chưa ghi phiếu được." />
        ) : trip.vehicleId === null ? (
          <p className="tx-note tx-note--warn">
            Chuyến {trip.code} chưa được phân công xe. Hãy báo điều hành phân xe trước khi ghi
            phiếu.
          </p>
        ) : (
          <form
            className="tx-driver__form"
            onSubmit={(event) => {
              event.preventDefault();
              submit.mutate();
            }}
          >
            <p className="tx-note">
              Chuyến {trip.code} · xe {trip.vehicleRegistrationPlate ?? '—'}
            </p>
            <label className="tx-field">
              <span>Cây xăng</span>
              <select
                value={form.supplierId}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, supplierId: event.target.value }))
                }
                required
              >
                <option value="">Chọn cây xăng</option>
                {(suppliers.data ?? []).map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="tx-field">
              <span>Số lít</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.001"
                min="0"
                value={form.liters}
                onChange={(event) => setForm((prev) => ({ ...prev, liters: event.target.value }))}
                required
              />
            </label>
            <label className="tx-field">
              <span>Số tiền (đồng)</span>
              <input
                type="number"
                inputMode="numeric"
                step="1"
                min="0"
                value={form.amount}
                onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
                required
              />
            </label>
            <label className="tx-field">
              <span>Số km trên đồng hồ</span>
              <input
                type="number"
                inputMode="numeric"
                step="1"
                min="0"
                value={form.odometerKm}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, odometerKm: event.target.value }))
                }
                required
              />
            </label>
            <label className="tx-field">
              <span>Số hoá đơn (nếu có)</span>
              <input
                type="text"
                value={form.invoiceNo}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, invoiceNo: event.target.value }))
                }
              />
            </label>
            <button
              type="submit"
              className="tx-btn tx-btn--go tx-btn--wide"
              disabled={!canSubmit || submit.isPending}
            >
              {submit.isPending ? 'Đang gửi…' : 'Gửi phiếu'}
            </button>
          </form>
        )}
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
                  {row.rejectedNote === null ? null : (
                    <span className="tx-note tx-note--warn">{row.rejectedNote}</span>
                  )}
                  {/*
                    ANH doc qua route CO XAC THUC, khong qua URL ky: kho anh la bucket PRIVATE chua
                    PII, va mot URL ky con song sau khi phien het han.
                  */}
                  {row.evidence.length === 0 ? null : (
                    <span className="tx-driver__thumbs">
                      {row.evidence.map((evidence) =>
                        evidence.contentType === 'application/pdf' ? (
                          <a
                            key={evidence.id}
                            href={evidenceUrls.driverFuelSlip(row.id, evidence.id)}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Xem chứng từ PDF
                          </a>
                        ) : (
                          <img
                            key={evidence.id}
                            src={evidenceUrls.driverFuelSlip(row.id, evidence.id)}
                            alt={`Ảnh chứng từ của phiếu ngày ${row.businessDateLabel}`}
                            loading="lazy"
                          />
                        ),
                      )}
                    </span>
                  )}
                  <label className="tx-field tx-field--file">
                    <span>Đính ảnh chứng từ</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      disabled={upload.isPending}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) upload.mutate({ slipId: row.id, file });
                        event.target.value = '';
                      }}
                    />
                  </label>
                  <span className="tx-note">{EVIDENCE_UPLOAD_HINT}</span>
                </div>
                <div className="tx-driver__badges">
                  <StatusBadge label={row.verificationLabel} tone={row.tone} />
                  {row.canResubmit ? (
                    <button
                      type="button"
                      className="tx-btn"
                      disabled={resubmit.isPending}
                      onClick={() => resubmit.mutate(row.id)}
                    >
                      {resubmit.isPending ? 'Đang gửi…' : 'Nộp lại phiếu'}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

/**
 * KHOAN CHI THUONG cua chinh lai xe — `#168 B3` + `#169` acceptance 4.
 *
 * Danh muc nhom chi phi den tu may chu (`#168 B4`): truoc do nguoi dung phai GO THU mot ma roi doi
 * 400 de biet minh go sai. `unrestricted` la mot truong tuong minh — `[]` nghia la khach cho nhap
 * tu do, KHONG phai "khong nhom nao hop le".
 *
 * Anh la TUY CHON, va khi co thi no di CUNG mot lan goi voi khoan chi: `evidenceLocator` la mot COT
 * duoc dat luc `INSERT`, va so cai append-only khong cho sua mot hang da ghi de gan anh sau.
 */
function DriverExpense() {
  const navigation = useNavigationInput();
  const queryClient = useQueryClient();
  const trips = toSectionQuery(useDriverTrips(navigation));
  const catalogue = toSectionQuery(useDriverExpenseCategories(navigation));

  const [failure, setFailure] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tripId, setTripId] = useState('');
  const [categoryCode, setCategoryCode] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [correlationKey, setCorrelationKey] = useState(() => newCorrelationKey());

  const openTrips = (trips.data ?? []).filter(
    (trip) => trip.status === 'PLANNED' || trip.status === 'IN_TRANSIT',
  );
  const categories = catalogue.data?.categories ?? [];
  const unrestricted = catalogue.data?.unrestricted ?? false;

  const record = useMutation({
    mutationFn: () => {
      const input = {
        tripId,
        categoryCode: categoryCode.trim(),
        amount: Number(amount),
        note: note.trim() === '' ? null : note.trim(),
        correlationKey,
      };
      return file === null
        ? transportApi.me.recordExpense(input)
        : transportApi.me.recordExpenseWithEvidence(input, file);
    },
    onSuccess: () => {
      setFailure(null);
      setSuccess('Đã ghi khoản chi vào quỹ của bạn.');
      setTripId('');
      setCategoryCode('');
      setAmount('');
      setNote('');
      setFile(null);
      setCorrelationKey(newCorrelationKey());
      void queryClient.invalidateQueries({ queryKey: ['transport', 'me'] });
    },
    onError: (error: Error) => {
      setSuccess(null);
      setFailure(error.message);
    },
  });

  const canRecord = tripId !== '' && categoryCode.trim() !== '' && amount.trim() !== '';

  return (
    <>
      <h1 className="tx-driver__title">Ghi khoản chi</h1>
      {failure === null ? null : <ErrorState message={failure} />}
      {success === null ? null : (
        <p className="tx-note tx-note--ok" role="status">
          {success}
        </p>
      )}

      <section className="tx-driver__card" aria-label="Ghi một khoản chi">
        <p className="tx-driver__lead">
          Khoản chi này trừ vào quỹ tạm ứng của chính bạn, trên chuyến bạn được phân công.
        </p>
        {openTrips.length === 0 ? (
          <EmptyState title="Bạn chưa có chuyến nào đang mở để ghi khoản chi." />
        ) : (
          <form
            className="tx-driver__form"
            onSubmit={(event) => {
              event.preventDefault();
              record.mutate();
            }}
          >
            <label className="tx-field">
              <span>Chuyến</span>
              <select value={tripId} onChange={(event) => setTripId(event.target.value)} required>
                <option value="">Chọn chuyến</option>
                {openTrips.map((trip) => (
                  <option key={trip.id} value={trip.id}>
                    {trip.code} · {trip.originLabel} → {trip.destinationLabel}
                  </option>
                ))}
              </select>
            </label>

            {/*
              Danh muc DONG thi cho chon; danh muc de trong (`unrestricted`) thi cho go tu do. Hai
              truong hop nay doi nguoc nhau ve nghia, nen khong duoc gop thanh mot o nhap.
            */}
            <label className="tx-field">
              <span>Nhóm chi phí</span>
              {unrestricted || categories.length === 0 ? (
                <input
                  type="text"
                  value={categoryCode}
                  onChange={(event) => setCategoryCode(event.target.value)}
                  placeholder="Ví dụ: BOT, bãi xe, sửa dọc đường"
                  required
                />
              ) : (
                <select
                  value={categoryCode}
                  onChange={(event) => setCategoryCode(event.target.value)}
                  required
                >
                  <option value="">Chọn nhóm chi phí</option>
                  {categories.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              )}
            </label>

            <label className="tx-field">
              <span>Số tiền (đồng)</span>
              <input
                type="number"
                inputMode="numeric"
                step="1"
                min="0"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </label>

            <label className="tx-field">
              <span>Ghi chú</span>
              <input type="text" value={note} onChange={(event) => setNote(event.target.value)} />
            </label>

            <label className="tx-field tx-field--file">
              <span>Ảnh chứng từ (nếu có)</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>

            <button
              type="submit"
              className="tx-btn tx-btn--go tx-btn--wide"
              disabled={!canRecord || record.isPending}
            >
              {record.isPending ? 'Đang gửi…' : 'Ghi khoản chi'}
            </button>
          </form>
        )}
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

/**
 * PHIEU LUONG CUA CHINH MINH — `#168 B8`.
 *
 * KHONG loc `DRAFT` o day, va do khong phai thieu sot: may chu tra `null` cho phieu tam tinh ngay o
 * ham dung khung nhin, va kieu tra ve la `Exclude<PayslipStatus, 'DRAFT'>`. Mot lop loc thu hai o
 * man hinh se lech khoi lop dau vao mot ngay nao do.
 *
 * Phieu DA BI DAO van hien: giau no se lam phieu dao thanh mot dong am khong co doi ung.
 */
function DriverPayslip() {
  const navigation = useNavigationInput();
  const payslips = toSectionQuery(useDriverPayslips(navigation));

  if (payslips.isLoading) return <LoadingState label="Đang đọc phiếu lương…" />;
  if (payslips.errorMessage !== null) {
    return <ErrorState message={payslips.errorMessage} onRetry={payslips.refetch} />;
  }

  const rows = toDriverPayslipRows(payslips.data ?? []);

  return (
    <>
      <h1 className="tx-driver__title">Phiếu lương</h1>
      {rows.length === 0 ? (
        <EmptyState title="Bạn chưa có phiếu lương nào đã công bố." />
      ) : (
        <ul className="tx-driver__list">
          {rows.map((row) => (
            <li key={row.id}>
              <div>
                <strong>
                  {row.periodLabel} · {row.netLabel}
                </strong>
                <span>{row.rangeLabel}</span>
                <span>
                  {row.tripCountLabel} chuyến · {row.distanceLabel}
                </span>
                <span>
                  Tổng thu nhập {row.grossLabel} · khấu trừ {row.deductionsLabel}
                </span>
                {row.correctionReason === null ? null : (
                  <span className="tx-note tx-note--warn">Lý do sửa: {row.correctionReason}</span>
                )}
                {row.components.length === 0 ? null : (
                  <span className="tx-driver__components">
                    {row.components.map((component) => (
                      <span key={component.key}>
                        {component.label}: {component.isDeduction ? '− ' : ''}
                        {component.amountLabel}
                      </span>
                    ))}
                  </span>
                )}
                {row.paidAtLabel === '—' ? null : <span>Đã trả lúc {row.paidAtLabel}</span>}
              </div>
              <StatusBadge label={row.statusLabel} tone={row.tone} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
