'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { DataTable, StatusBadge } from '../components/primitives';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import { TOLL_REVIEW_ACTION_LABEL } from '../customer-view';
import { toSectionQuery, useTollCandidates } from '../hooks/useTransportWorkspace';
import type { NavigationInput } from '../navigation';
import { transportApi } from '../transport-api';
import type { TollCandidateQuery, TollMatchState, TollReviewState } from '../transport-types';
import { toTollQueueModel, type TollCandidateRow } from '../workspace/toll';

/**
 * HANG CHO DOI SOAT tung dong ETC.
 *
 * ==============================================================================================
 * MOT DONG CHUA GIAI DUOC XE O LAI DAY. MAN HINH KHONG DIEN GIUP.
 * ==============================================================================================
 *
 * May chu khong bao gio chon bua mot chiec xe khi co nhieu ung vien (`AMBIGUOUS`), nen man hinh
 * cung khong duoc chon giup. Cot xe de TRONG, va bien so THO tu tep van hien ra canh do — do la
 * bang chung, khong phai ket luan. Neu man hinh dien mot chiec xe vao, mot chi phi se duoc gan cho
 * mot chiec xe khong ai xac nhan, roi no di tiep vao moi bao cao theo xe.
 *
 * ==============================================================================================
 * `CONFIRMED` NGHIA LA MOT NGUOI DA NHIN, KHONG PHAI TIEN DA DI
 * ==============================================================================================
 *
 * Ba trang thai doi soat khong mot cai nao noi ve thanh toan (`#269 J7`). Cot "Doi soat" o day tra
 * loi dung mot cau: *da co nguoi nhin dong nay chua*.
 */

const MATCH_STATE_FILTERS: readonly (TollMatchState | 'ALL')[] = [
  'ALL',
  'MATCHED',
  'ACCOUNT_UNRESOLVED',
  'VEHICLE_UNRESOLVED',
  'AMBIGUOUS',
  'DUPLICATE_CANDIDATE',
];

const REVIEW_STATE_FILTERS: readonly (TollReviewState | 'ALL')[] = [
  'ALL',
  'PENDING',
  'CONFIRMED',
  'REOPENED',
];

const PAGE_SIZE = 20;

export function TollCandidateQueue({ navigation }: { readonly navigation: NavigationInput }) {
  const queryClient = useQueryClient();
  const [matchState, setMatchState] = useState<TollMatchState | 'ALL'>('ALL');
  const [reviewState, setReviewState] = useState<TollReviewState | 'ALL'>('ALL');
  const [offset, setOffset] = useState(0);
  const [vehicleDraft, setVehicleDraft] = useState<Record<string, string>>({});

  const query: TollCandidateQuery = {
    matchState: matchState === 'ALL' ? null : matchState,
    reviewState: reviewState === 'ALL' ? null : reviewState,
    limit: PAGE_SIZE,
    offset,
  };
  const candidates = toSectionQuery(useTollCandidates(navigation, query));

  const review = useMutation({
    mutationFn: (input: {
      readonly id: string;
      readonly action: 'RESOLVE_VEHICLE' | 'CONFIRM' | 'REOPEN';
      readonly vehicleId: string | null;
    }) =>
      transportApi.toll.review(input.id, {
        action: input.action,
        vehicleId: input.vehicleId,
        duplicateOfCandidateId: null,
        note: null,
      }),
    onSuccess: () => {
      // Mot lan quyet doi CA dong do VA cac so dem, nen lam moi ca nhanh `toll`.
      void queryClient.invalidateQueries({ queryKey: ['transport', 'toll'] });
    },
  });

  if (candidates.isLoading) return <LoadingState label="Đang tải hàng chờ đối soát…" />;
  if (candidates.errorMessage !== null) {
    return <ErrorState message={candidates.errorMessage} onRetry={candidates.refetch} />;
  }
  if (candidates.isBlocked || candidates.data === undefined) {
    return <EmptyState title="Vai của bạn không đọc được hàng chờ đối soát phí đường bộ." />;
  }

  const model = toTollQueueModel(candidates.data, navigation.role);

  const rowActions = (row: TollCandidateRow) => {
    const draft = vehicleDraft[row.id] ?? '';
    return (
      <div className="tx-rowactions">
        {row.vehicleApplicable && row.vehicleId === null ? (
          <>
            <label className="tx-sronly" htmlFor={`veh-${row.id}`}>
              Mã xe cho dòng số {row.rowNumber}
            </label>
            <input
              id={`veh-${row.id}`}
              className="tx-input tx-input--inline"
              value={draft}
              placeholder="Mã xe"
              onChange={(event) => {
                setVehicleDraft((current) => ({ ...current, [row.id]: event.target.value }));
              }}
            />
            <button
              type="button"
              className="tx-button tx-button--quiet"
              disabled={draft.trim() === '' || review.isPending}
              onClick={() => {
                review.mutate({ id: row.id, action: 'RESOLVE_VEHICLE', vehicleId: draft.trim() });
              }}
            >
              {TOLL_REVIEW_ACTION_LABEL.RESOLVE_VEHICLE}
            </button>
          </>
        ) : null}

        {row.reviewStateLabel === 'Đã có người xác nhận' ? (
          <button
            type="button"
            className="tx-button tx-button--quiet"
            disabled={review.isPending}
            onClick={() => {
              review.mutate({ id: row.id, action: 'REOPEN', vehicleId: null });
            }}
          >
            {TOLL_REVIEW_ACTION_LABEL.REOPEN}
          </button>
        ) : (
          <button
            type="button"
            className="tx-button tx-button--quiet"
            disabled={review.isPending}
            onClick={() => {
              review.mutate({ id: row.id, action: 'CONFIRM', vehicleId: null });
            }}
          >
            {TOLL_REVIEW_ACTION_LABEL.CONFIRM}
          </button>
        )}
      </div>
    );
  };

  const columns = [
    {
      key: 'row',
      header: 'Dòng',
      isRowHeader: true,
      /*
       * KHONG tien to "#".
       *
       * Be mat khach chan moi khuon `#<hai chu so tro len>` — khuon do dung de bat ma Issue/PR
       * lot ra man hinh, va mot so dong thu 10 se khop ngay vao no. Tieu de cot da noi "Dong",
       * nen tien to khong them nghia gi ma lam do mot bai kiem be mat khach.
       */
      render: (row: TollCandidateRow) => String(row.rowNumber),
    },
    {
      key: 'provider',
      header: 'Nhà cung cấp',
      render: (row: TollCandidateRow) => row.providerLabel,
    },
    { key: 'kind', header: 'Loại', render: (row: TollCandidateRow) => row.kindLabel },
    { key: 'date', header: 'Ngày', render: (row: TollCandidateRow) => row.businessDateLabel },
    {
      key: 'amount',
      header: 'Số tiền',
      isNumeric: true,
      render: (row: TollCandidateRow) => row.amountLabel,
    },
    { key: 'station', header: 'Trạm', render: (row: TollCandidateRow) => row.stationLabel },
    {
      key: 'plate',
      header: 'Biển số trên tệp',
      render: (row: TollCandidateRow) => row.vehiclePlateRaw,
    },
    {
      key: 'vehicle',
      header: 'Xe đã khớp',
      // Bo trong khi may chu chua giai duoc — xem khoi chu thich dau tep.
      render: (row: TollCandidateRow) =>
        row.vehicleId ?? <span className="tx-muted">— chờ người chỉ định —</span>,
    },
    {
      key: 'match',
      header: 'Khớp xe',
      render: (row: TollCandidateRow) => (
        <StatusBadge label={row.matchStateLabel} tone={row.matchStateTone} />
      ),
    },
    {
      key: 'review',
      header: 'Đối soát',
      render: (row: TollCandidateRow) => (
        <StatusBadge
          label={row.reviewStateLabel}
          tone={row.reviewStateTone}
          title="Trạng thái này nói đã có người nhìn dòng này chưa — không nói tiền đã trả."
        />
      ),
    },
    {
      key: 'actions',
      header: 'Việc',
      render: (row: TollCandidateRow) =>
        model.canResolve ? rowActions(row) : <span className="tx-muted">—</span>,
    },
  ];

  return (
    <section className="tx-panel" aria-labelledby="toll-queue-heading">
      <h2 id="toll-queue-heading">Hàng chờ đối soát</h2>
      <p className="tx-panel__hint">
        {model.shownLabel} trên {model.totalLabel} dòng · {model.pendingCountLabel} dòng còn chờ
        người. Một dòng đã khớp xe vẫn còn chờ xác nhận — chọn được xe không nghĩa là đối soát xong.
      </p>

      <div className="tx-filters">
        <label htmlFor="toll-match-filter">Khớp xe</label>
        <select
          id="toll-match-filter"
          value={matchState}
          onChange={(event) => {
            setMatchState(event.target.value as TollMatchState | 'ALL');
            setOffset(0);
          }}
        >
          {MATCH_STATE_FILTERS.map((value) => (
            <option key={value} value={value}>
              {value === 'ALL' ? 'Tất cả' : value}
            </option>
          ))}
        </select>

        <label htmlFor="toll-review-filter">Đối soát</label>
        <select
          id="toll-review-filter"
          value={reviewState}
          onChange={(event) => {
            setReviewState(event.target.value as TollReviewState | 'ALL');
            setOffset(0);
          }}
        >
          {REVIEW_STATE_FILTERS.map((value) => (
            <option key={value} value={value}>
              {value === 'ALL' ? 'Tất cả' : value}
            </option>
          ))}
        </select>
      </div>

      {review.error === null ? null : <ErrorState message={review.error.message} />}

      {model.rows.length === 0 ? (
        <EmptyState title={model.emptyNotice} />
      ) : (
        <>
          <DataTable
            caption="Các dòng phí đường bộ đang chờ đối soát"
            columns={columns}
            rows={model.rows}
            rowKey={(row) => row.id}
          />
          {model.hasMore ? (
            <button
              type="button"
              className="tx-button tx-button--quiet"
              onClick={() => {
                setOffset(offset + PAGE_SIZE);
              }}
            >
              Xem tiếp {PAGE_SIZE} dòng
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
