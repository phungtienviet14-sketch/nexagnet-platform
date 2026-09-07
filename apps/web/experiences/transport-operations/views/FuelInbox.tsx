'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { DataTable, StatusBadge } from '../components/primitives';
import { ConfirmAction, EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import { FUEL_RECONCILIATION_STATUS_LABEL, FUEL_VERIFICATION_LABEL } from '../customer-view';
import { toSectionQuery, useFuelInbox, useNavigationInput } from '../hooks/useTransportWorkspace';
import { useRevealOnOpen } from '../hooks/useRevealOnOpen';
import { evidenceUrls, transportApi } from '../transport-api';
import {
  FUEL_RECONCILIATION_STATUSES,
  FUEL_VERIFICATION_STATUSES,
  type FuelEntryInboxQuery,
  type FuelReconciliationStatus,
  type FuelVerificationStatus,
} from '../transport-types';
import { toFuelInboxModel, type FuelInboxRowModel } from '../workspace/fuel';

/**
 * HOP THU PHIEU NHIEN LIEU — #222 P1-B.
 *
 * ==============================================================================================
 * VI SAO KHOI NAY NAM TREN CUNG MAN NHIEN LIEU
 *
 * Menu `Nhiên liệu` tu gioi thieu la *"Phiếu đổ dầu, xác thực phiếu, nhập bảng kê cây xăng và đối
 * soát"*. Truoc ban nay no chi lam duoc HAI viec cuoi: khong co danh sach phieu nao, va cong xac
 * thuc nam LONG TRONG TUNG CHUYEN — vi may chu chi doc duoc phieu theo chuyen.
 *
 * Hau qua do duoc trong buoi UAT dau tien: mot phieu 62,500 L / 1.437.500 d co that cua lai xe
 * KHONG xuat hien o dau trong menu nay, va ke toan khong co duong nao tim ra no ngoai viec mo lan
 * luot tung chuyen.
 *
 * Nen khoi nay dat TREN CUNG, truoc bang ke va doi soat: viec den hang ngay phai nam truoc viec
 * den cuoi thang.
 *
 * ==============================================================================================
 * DANH SACH THEO CHUYEN VAN O LAI
 *
 * `TripFuelEntries` trong man Chuyen xe KHONG bi thay the. Hai cau hoi khac nhau: *"chuyen nay ton
 * bao nhieu dau"* (o trong chuyen) va *"con phieu nao cho toi"* (o day). Mot cai thay the cai kia
 * se lam mat mot trong hai.
 */
export function FuelInbox() {
  const navigation = useNavigationInput();
  const queryClient = useQueryClient();

  const [query, setQuery] = useState<FuelEntryInboxQuery>({ offset: 0 });
  /**
   * O MA CHUYEN GO TAY LA TRANG THAI CUC BO, khong phai mot phan cua truy van.
   *
   * Noi thang o nhap vao `query` se ban MOT yeu cau cho MOI KY TU: go `UAT-VIET-01` la 11 lan goi
   * may chu de doc dung mot ket qua. Nen chu duoc giu o day va chi day vao truy van sau khi nguoi
   * dung ngung go.
   */
  const [tripCodeInput, setTripCodeInput] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState<FuelInboxAction | null>(null);
  const [reason, setReason] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  /*
   * 300ms — du de mot nguoi go xong mot ma chuyen, va van du nhanh de khong thay do la mot lan cho.
   * `clearTimeout` o phan don dep la thu lam no thanh mot phep DON: moi lan go lai huy lan hen truoc.
   */
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery((current) => {
        const next = tripCodeInput.trim() === '' ? null : tripCodeInput.trim();
        if ((current.tripCode ?? null) === next) return current;
        // Doi bo loc thi ve TRANG DAU — xem `patchQuery`.
        return { ...current, tripCode: next, offset: 0 };
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [tripCodeInput]);

  const inbox = toSectionQuery(useFuelInbox(navigation, query));

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['transport', 'fuel'] });
  };

  const mutation = useMutation({
    mutationFn: async (action: FuelInboxAction) => {
      if (action.id === 'verify') return transportApi.fuel.verifyEntry(action.entryId);
      if (action.id === 'resubmit') return transportApi.fuel.resubmitEntry(action.entryId);
      const note = reason.trim();
      // Chan o day thay vi de may chu tra 400: ly do tu choi la thu DUY NHAT noi cho lai xe biet
      // phai sua cai gi, nen mot lan tu choi khong ly do la mot ngo cut co ve hop le.
      if (note.length === 0) throw new Error('Từ chối phiếu thì phải ghi rõ lý do.');
      return transportApi.fuel.rejectEntry(action.entryId, note);
    },
    onSuccess: () => {
      setPending(null);
      setReason('');
      setFailure(null);
      refresh();
    },
    onError: (error: Error) => setFailure(error.message),
  });

  // Doi bo loc thi ve TRANG DAU. Giu `offset` cu se mo mot trang trong o giua mot ket qua ngan hon
  // — mot man hinh rong ma nguoi dung khong hieu vi sao.
  const patchQuery = (patch: Partial<FuelEntryInboxQuery>) =>
    setQuery((current) => ({ ...current, ...patch, offset: 0 }));

  const model = inbox.data === undefined ? null : toFuelInboxModel(inbox.data, navigation.role);

  return (
    <section aria-label="Phiếu nhiên liệu">
      <div className="tx-inbox__head">
        <h2>Phiếu nhiên liệu</h2>
        {model === null ? null : (
          <span className="tx-inbox__pending" data-idle={model.isIdle ? 'true' : 'false'}>
            {model.pendingLabel}
          </span>
        )}
      </div>

      <form
        className="tx-filters"
        role="search"
        aria-label="Bộ lọc phiếu nhiên liệu"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="tx-field">
          <span>Mã chuyến</span>
          <input
            type="search"
            placeholder="Ví dụ: UAT-VIET-01"
            value={tripCodeInput}
            onChange={(event) => setTripCodeInput(event.target.value)}
          />
        </label>
        <label className="tx-field">
          <span>Xác thực</span>
          <select
            aria-label="Xác thực"
            value={query.verification ?? 'ALL'}
            onChange={(event) =>
              patchQuery({
                verification:
                  event.target.value === 'ALL'
                    ? null
                    : (event.target.value as FuelVerificationStatus),
              })
            }
          >
            <option value="ALL">Tất cả</option>
            {FUEL_VERIFICATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {FUEL_VERIFICATION_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="tx-field">
          <span>Đối soát</span>
          <select
            aria-label="Đối soát"
            value={query.reconciliation ?? 'ALL'}
            onChange={(event) =>
              patchQuery({
                reconciliation:
                  event.target.value === 'ALL'
                    ? null
                    : (event.target.value as FuelReconciliationStatus),
              })
            }
          >
            <option value="ALL">Tất cả</option>
            {FUEL_RECONCILIATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {FUEL_RECONCILIATION_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="tx-field">
          <span>Từ ngày</span>
          <input
            type="date"
            value={query.from ?? ''}
            onChange={(event) => patchQuery({ from: event.target.value })}
          />
        </label>
        <label className="tx-field">
          <span>Đến ngày</span>
          <input
            type="date"
            value={query.to ?? ''}
            onChange={(event) => patchQuery({ to: event.target.value })}
          />
        </label>
      </form>

      {failure === null ? null : <ErrorState message={failure} />}
      {inbox.errorMessage === null ? null : (
        <ErrorState message={inbox.errorMessage} onRetry={inbox.refetch} />
      )}
      {inbox.isLoading ? <LoadingState label="Đang đọc phiếu nhiên liệu…" /> : null}

      {model === null ? null : model.rows.length === 0 ? (
        <EmptyState
          title="Không có phiếu nào khớp bộ lọc đang chọn."
          nextAction={
            <button
              type="button"
              className="tx-btn"
              onClick={() => {
                setTripCodeInput('');
                setQuery({ offset: 0 });
              }}
            >
              Bỏ bộ lọc
            </button>
          }
        />
      ) : (
        <>
          <DataTable<FuelInboxRowModel>
            caption="Phiếu đổ dầu của cả đội"
            rows={model.rows}
            rowKey={(row) => row.id}
            selectedKey={openId}
            onSelect={(row) => setOpenId(row.id === openId ? null : row.id)}
            // Bam mot phieu = "chi xem phieu nay": bang co lai mot dong nen khoi chi tiet o ngay
            // duoi, khong con nam sau ca mot trang 50 phieu.
            onShowAll={() => setOpenId(null)}
            columns={[
              {
                key: 'trip',
                header: 'Mã chuyến',
                isRowHeader: true,
                render: (row) => row.tripCode,
              },
              { key: 'date', header: 'Ngày', render: (row) => row.businessDateLabel },
              { key: 'driver', header: 'Lái xe', render: (row) => row.driverLabel },
              { key: 'vehicle', header: 'Xe', render: (row) => row.vehicleLabel },
              { key: 'supplier', header: 'Cây xăng', render: (row) => row.supplierLabel },
              {
                key: 'liters',
                header: 'Số lít',
                isNumeric: true,
                render: (row) => row.litersLabel,
              },
              {
                key: 'amount',
                header: 'Số tiền',
                isNumeric: true,
                render: (row) => row.amountLabel,
              },
              { key: 'invoice', header: 'Hoá đơn', render: (row) => row.invoiceNo ?? '—' },
              {
                key: 'evidence',
                header: 'Chứng từ',
                render: (row) => (
                  <span className="tx-inbox__evidence">{row.evidenceCountLabel} tệp</span>
                ),
              },
              {
                key: 'verification',
                header: 'Xác thực',
                render: (row) => (
                  <StatusBadge label={row.verificationLabel} tone={row.verificationTone} />
                ),
              },
              {
                key: 'reconciliation',
                header: 'Đối soát',
                render: (row) => (
                  <StatusBadge label={row.reconciliationLabel} tone={row.reconciliationTone} />
                ),
              },
            ]}
          />

          <div className="tx-inbox__pager">
            <button
              type="button"
              className="tx-btn tx-btn--small"
              disabled={!model.hasPrevious}
              onClick={() =>
                setQuery((current) => ({
                  ...current,
                  offset: Math.max((current.offset ?? 0) - (current.limit ?? 50), 0),
                }))
              }
            >
              Trang trước
            </button>
            <span>{model.rangeLabel}</span>
            <button
              type="button"
              className="tx-btn tx-btn--small"
              disabled={!model.hasNext}
              onClick={() =>
                setQuery((current) => ({
                  ...current,
                  offset: (current.offset ?? 0) + (current.limit ?? 50),
                }))
              }
            >
              Trang sau
            </button>
          </div>
        </>
      )}

      {openId === null || model === null ? null : (
        <FuelInboxDetail
          row={model.rows.find((row) => row.id === openId) ?? null}
          onAct={(action) => {
            setReason('');
            setFailure(null);
            setPending(action);
          }}
        />
      )}

      <ConfirmAction
        open={pending !== null}
        title={pending === null ? '' : CONFIRM_TITLE[pending.id]}
        detail={pending?.detail ?? undefined}
        confirmLabel={pending === null ? 'Xác nhận' : CONFIRM_LABEL[pending.id]}
        reasonLabel={pending?.id === 'reject' ? 'Lý do từ chối' : undefined}
        reason={reason}
        onReasonChange={setReason}
        isDestructive={pending?.id === 'reject'}
        isBusy={mutation.isPending}
        onConfirm={() => {
          if (pending !== null) mutation.mutate(pending);
        }}
        onCancel={() => {
          setPending(null);
          setReason('');
        }}
      />
    </section>
  );
}

interface FuelInboxAction {
  readonly id: 'verify' | 'reject' | 'resubmit';
  readonly entryId: string;
  readonly detail: string | null;
}

const CONFIRM_TITLE: Record<FuelInboxAction['id'], string> = {
  verify: 'Xác thực phiếu đổ dầu?',
  reject: 'Từ chối phiếu đổ dầu?',
  resubmit: 'Cho nộp lại phiếu này?',
};

const CONFIRM_LABEL: Record<FuelInboxAction['id'], string> = {
  verify: 'Xác thực',
  reject: 'Từ chối',
  resubmit: 'Cho nộp lại',
};

/**
 * CHI TIET MOT DONG — anh chung tu, ly do soat xet, va cac thao tac con lam duoc.
 *
 * Anh ve bang `<img>` tro THANG vao route doc byte co xac thuc: the anh gui kem cookie phien khi
 * cung goc, nen day la duong don gian nhat ma van di qua dung phep gac cua may chu. Khong `fetch`
 * roi tao `blob:`, va tuyet doi khong mot URL ky nao.
 */
function FuelInboxDetail({
  row,
  onAct,
}: {
  readonly row: FuelInboxRowModel | null;
  readonly onAct: (action: FuelInboxAction) => void;
}) {
  // Truoc lan return som: hook phai chay o MOI lan ve, khong duoc nam sau mot nhanh dieu kien.
  const reveal = useRevealOnOpen<HTMLElement>(row?.id ?? null);

  if (row === null) return null;

  return (
    <section
      className="tx-detail"
      aria-label={`Phiếu đổ dầu ${row.tripCode} ngày ${row.businessDateLabel}`}
      ref={reveal}
    >
      <h4>
        {row.tripCode} · {row.driverLabel} · {row.vehicleLabel}
      </h4>

      <dl className="tx-detail__grid">
        <div>
          <dt>Cây xăng</dt>
          <dd>{row.supplierLabel}</dd>
        </div>
        <div>
          <dt>Thời điểm</dt>
          <dd>{row.occurredAtLabel}</dd>
        </div>
        <div>
          <dt>Số lít</dt>
          <dd>{row.litersLabel}</dd>
        </div>
        <div>
          <dt>Số tiền</dt>
          <dd>{row.amountLabel}</dd>
        </div>
        <div>
          <dt>Thanh toán</dt>
          <dd>{row.paymentLabel}</dd>
        </div>
        <div>
          <dt>Số hoá đơn</dt>
          <dd>{row.invoiceNo ?? 'Không có'}</dd>
        </div>
      </dl>

      {row.rejectedNote === null ? null : (
        <p className="tx-note tx-note--warn">{row.rejectedNote}</p>
      )}

      {row.reviewReasons.length === 0 ? null : (
        <ul className="tx-detail__reasons">
          {row.reviewReasons.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      )}

      <div className="tx-evidence">
        <h5>Ảnh chứng từ</h5>
        {row.evidence.length === 0 ? (
          <p className="tx-note">Phiếu này chưa có ảnh chứng từ.</p>
        ) : (
          row.evidence.map((file) => {
            const href = evidenceUrls.fuelEntry(row.id, file.id);
            return file.contentType?.startsWith('image/') === true ? (
              <a key={file.id} href={href} target="_blank" rel="noreferrer">
                <img src={href} alt={`Ảnh chứng từ phiếu ${row.tripCode}`} />
              </a>
            ) : (
              <a key={file.id} href={href} target="_blank" rel="noreferrer">
                Mở chứng từ
              </a>
            );
          })
        )}
      </div>

      <div className="tx-detail__actions">
        {row.canVerify ? (
          <button
            type="button"
            className="tx-btn"
            onClick={() =>
              onAct({
                id: 'verify',
                entryId: row.id,
                detail: 'Sau khi xác thực, phiếu vào được kỳ đối soát bảng kê.',
              })
            }
          >
            Xác thực
          </button>
        ) : null}
        {row.canReject ? (
          <button
            type="button"
            className="tx-btn tx-btn--stop"
            onClick={() =>
              onAct({
                id: 'reject',
                entryId: row.id,
                detail: 'Lái xe đọc được lý do này và nộp lại phiếu theo đó.',
              })
            }
          >
            Từ chối
          </button>
        ) : null}
        {row.canResubmit ? (
          <button
            type="button"
            className="tx-btn"
            onClick={() =>
              onAct({
                id: 'resubmit',
                entryId: row.id,
                detail: 'Phiếu quay lại trạng thái chờ xác thực.',
              })
            }
          >
            Cho nộp lại
          </button>
        ) : null}
      </div>
    </section>
  );
}
