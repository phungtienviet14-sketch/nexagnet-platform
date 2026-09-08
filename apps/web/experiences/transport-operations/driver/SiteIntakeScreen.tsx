'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from '../components/SectionState';
import { newCorrelationKey, transportApi } from '../transport-api';
import type {
  SiteIntakeLocationInput,
  SiteIntakeProposal,
  SiteIntakeResult,
} from '../transport-types';
import { toSiteIntakeScreen, type SiteIntakeScreen } from '../workspace/site-intake';

/**
 * NHAN VIEC TAI DIA DIEM A — `#267` H6.
 *
 * ============================================================================================
 * MOT DIEU MA MAN HINH NAY KHONG BAO GIO LAM
 * ============================================================================================
 *
 * No khong tao mot chuyen nao khi chua co nguoi cham. Duong `propose` va duong `confirm` la HAI
 * ham khac nhau cua `transportApi.me`, va `propose` khong ghi mot hang nao o may chu — nen ke ca
 * mot lan lam moi tu dong cung khong the sinh ra mot vong chay.
 *
 * Quyet dinh "hien nut gi" khong nam trong JSX ma nam o `toSiteIntakeScreen()` — mot ham thuan co
 * bai kiem. Sau ba lan sua giao dien, cau *"da co chuyen thi khong hien Tao chuyen"* van doc lai
 * duoc o do.
 *
 * ============================================================================================
 * KHOA CHONG LAP SINH MOT LAN, KHONG SINH MOI LAN THU LAI
 * ============================================================================================
 *
 * `clientEventId` duoc chot khi lai xe cham, roi GIU NGUYEN qua moi lan thu lai. Sinh moi o moi
 * lan goi se bien mot lan mat song thanh hai vong chay — dung dieu ma `#267` H3 cam.
 */
export function DriverSiteIntake() {
  const queryClient = useQueryClient();
  const [proposal, setProposal] = useState<SiteIntakeProposal | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [chosenSiteId, setChosenSiteId] = useState<string | null>(null);
  const [created, setCreated] = useState<SiteIntakeResult | null>(null);
  /** Chot MOT LAN cho moi lan cham, va giu qua cac lan thu lai. */
  const eventKey = useRef<string | null>(null);
  const locationRef = useRef<SiteIntakeLocationInput>({});

  const ask = useCallback(async () => {
    setLocating(true);
    setFailure(null);
    const location = await readBrowserLocation();
    locationRef.current = location;
    try {
      setProposal(await transportApi.me.proposeSite(location));
    } catch (error) {
      setFailure((error as Error).message);
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    void ask();
  }, [ask]);

  const confirm = useMutation({
    mutationFn: (siteId: string) => {
      eventKey.current ??= newCorrelationKey();
      return transportApi.me.confirmSite({
        ...locationRef.current,
        siteId,
        clientEventId: eventKey.current,
      });
    },
    onSuccess: (result) => {
      setCreated(result);
      setFailure(null);
      eventKey.current = null;
      void queryClient.invalidateQueries({ queryKey: ['transport', 'me'] });
      void ask();
    },
    // KHONG xoa `eventKey`: lan thu lai phai mang DUNG khoa cu, neu khong mot lan mat song se
    // thanh hai vong chay.
    onError: (error: Error) => setFailure(error.message),
  });

  if (created !== null) {
    return <IntakeCreated result={created} onContinue={() => setCreated(null)} />;
  }
  if (locating && proposal === null) return <LoadingState label="Đang đọc vị trí của bạn…" />;
  if (failure !== null && proposal === null) return <ErrorState message={failure} onRetry={ask} />;
  if (proposal === null) return <EmptyState title="Chưa đọc được vị trí." />;

  const screen = toSiteIntakeScreen(proposal);
  const selectable = screen.mode === 'CHOOSE';
  const target = selectable ? chosenSiteId : (screen.candidates[0]?.siteId ?? null);

  return (
    <>
      <h1 className="tx-driver__title">Nhận việc</h1>
      {failure === null ? null : <ErrorState message={failure} />}

      <section className="tx-driver__card tx-intake" aria-label="Địa điểm quanh bạn">
        <p className="tx-intake__headline">{screen.headline}</p>

        {screen.candidates.length === 0 ? null : (
          <ul className="tx-intake__list" role={selectable ? 'radiogroup' : undefined}>
            {screen.candidates.map((row) => (
              <li key={row.siteId}>
                <SiteCard
                  row={row}
                  selectable={selectable}
                  selected={selectable && chosenSiteId === row.siteId}
                  onSelect={() => setChosenSiteId(row.siteId)}
                />
              </li>
            ))}
          </ul>
        )}

        {screen.openRuns.length === 0 ? null : (
          <dl className="tx-intake__runs">
            {screen.openRuns.map((run) => (
              <div key={run.runId}>
                <dt>Chuyến hiện tại</dt>
                <dd>{run.code}</dd>
              </div>
            ))}
          </dl>
        )}

        {screen.notice === null ? null : <p className="tx-intake__notice">{screen.notice}</p>}
        <p className="tx-intake__trust">{screen.trustLabel}</p>

        <div className="tx-driver__actions">
          {screen.canCreate && screen.primaryLabel !== null ? (
            <button
              type="button"
              className="tx-btn tx-btn--go tx-btn--wide"
              disabled={confirm.isPending || target === null}
              onClick={() => {
                if (target !== null) confirm.mutate(target);
              }}
            >
              {confirm.isPending ? 'Đang gửi…' : screen.primaryLabel}
            </button>
          ) : null}

          {screen.mode === 'ACTIVE_RUN' && screen.primaryLabel !== null ? (
            <p className="tx-intake__handoff">{screen.primaryLabel} — mở màn “Chuyến”.</p>
          ) : null}

          {screen.secondaryLabel === null ? null : (
            <button
              type="button"
              className="tx-btn tx-btn--wide"
              disabled={confirm.isPending}
              onClick={() => {
                setChosenSiteId(null);
                void ask();
              }}
            >
              {screen.secondaryLabel}
            </button>
          )}
        </div>
      </section>
    </>
  );
}

function SiteCard({
  row,
  selectable,
  selected,
  onSelect,
}: {
  readonly row: SiteIntakeScreen['candidates'][number];
  readonly selectable: boolean;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const body = (
    <>
      <span className="tx-intake__company">{row.companyLine}</span>
      <span className="tx-intake__site">{row.siteLine}</span>
      {row.addressLine === null ? null : (
        <span className="tx-intake__address">{row.addressLine}</span>
      )}
      <span className="tx-intake__meta">
        {row.distanceLine}
        {row.uncertain ? ' · có thể là nơi này' : null}
      </span>
    </>
  );

  if (!selectable) return <div className="tx-intake__card">{body}</div>;

  /**
   * `role="radio"` + `aria-checked`, va KHONG mot the nao duoc chon san.
   *
   * `#267` H6: *"Never show a random first candidate as selected truth."* `row.preselected` luon la
   * `false` o tang mo hinh; day la cho no di vao DOM.
   */
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected || row.preselected}
      className={`tx-intake__card tx-intake__card--pick${selected ? ' is-selected' : ''}`}
      onClick={onSelect}
    >
      {body}
    </button>
  );
}

function IntakeCreated({
  result,
  onContinue,
}: {
  readonly result: SiteIntakeResult;
  readonly onContinue: () => void;
}) {
  return (
    <>
      <h1 className="tx-driver__title">Đã tạo chuyến</h1>
      <section className="tx-driver__card tx-intake" aria-label="Chuyến vừa tạo">
        <dl className="tx-driver__facts">
          <dt>Mã chuyến</dt>
          <dd>{result.runCode}</dd>
          <dt>Điểm lấy hàng</dt>
          <dd>
            {result.counterpartyName} — {result.siteName}
          </dd>
          <dt>Điểm giao</dt>
          {/*
            NOI THAT VE CAI CHUA BIET. `#267` H4 cam bia du lieu; chuoi nay khong phai mot dia diem
            ma la mot loi khai rang van phong con phai bo sung.
          */}
          <dd>{result.destinationPending ? 'Chưa xác định — văn phòng bổ sung sau' : '—'}</dd>
          <dt>Vị trí</dt>
          <dd>
            {result.locationTrust === 'SERVER_BOUND'
              ? 'Đã xác thực'
              : 'Do máy bạn báo — chưa có bản định vị làm chứng'}
          </dd>
        </dl>
        {result.replayed ? (
          <p className="tx-intake__notice">
            Lần bấm này gửi lại đúng lệnh cũ — không có chuyến thứ hai nào được tạo.
          </p>
        ) : null}
        <p className="tx-intake__notice">
          Việc tiếp theo: chụp giấy vào cổng / phiếu bốc hàng ở màn “Chuyến”.
        </p>
        <div className="tx-driver__actions">
          <button type="button" className="tx-btn tx-btn--wide" onClick={onContinue}>
            Xong
          </button>
        </div>
      </section>
    </>
  );
}

/**
 * VI TRI TU TRINH DUYET — va ba dieu no KHONG lam.
 *
 * Khong nem khi nguoi dung tu choi quyen: mot lai xe khong bat dinh vi van phai chon kho bang tay,
 * nen duong do tra ve mot doi tuong RONG chu khong phai mot loi. May chu se noi `NO_MATCH` va man
 * hinh se hoi ho.
 *
 * Khong doi vo han: `timeout` 8 giay roi bo cuoc. Mot dien thoai trong nha xuong co the khong bao
 * gio tra ve, va mot man hinh quay mai la mot man hinh hong.
 *
 * Khong nhan mot ban ghi cu: `maximumAge: 0`. Mot ban dinh vi trong bo dem cua trinh duyet noi ve
 * noi lai xe DA TUNG o — va `#267` H7 cam mot vi tri qua han lang le tao mot lan lay hang.
 */
async function readBrowserLocation(): Promise<SiteIntakeLocationInput> {
  if (typeof navigator === 'undefined' || navigator.geolocation === undefined) return {};
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMetres: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : null,
        }),
      () => resolve({}),
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 0 },
    );
  });
}
