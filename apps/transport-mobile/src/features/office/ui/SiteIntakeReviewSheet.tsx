import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { attemptFor, type CommandAttempt } from '../../../api/command-attempt';
import { useBranding } from '../../../branding/BrandingProvider';
import { formatClock } from '../../../format';
import { useHttp } from '../../../session/SessionProvider';
import { SPACE } from '../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { ChoiceRow } from '../../../ui/Choice';
import { Field } from '../../../ui/Field';
import { Sheet } from '../../../ui/Sheet';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../ui/States';
import { Divider, KeyValue, Pill } from '../../../ui/Surface';
import { Text } from '../../../ui/Text';
import type { DestinationRow } from '../../driver/site-intake-flow';
import { newIdempotencyKey, useOfficeAccess, useOfficeKey } from '../queries';
import {
  bindableOrderLine,
  commandOutcomeText,
  completeDestinationBody,
  destinationCommandIdentity,
  EXCEPTION_REASON_MAX,
  exceptionConsequence,
  exceptionOutcomeText,
  exceptionReasonReady,
  knownPlaceRows,
  knownPlacesNote,
  locationLine,
  missingLine,
  originLine,
  pickedDestinationLine,
  REVIEW_SEARCH_MAX_CHARS,
  REVIEW_STATUS_LABEL,
  reviewActions,
  reviewSearchOutcome,
  samePick,
  SITE_INTAKE_POLICY,
} from '../site-intake-review';
import {
  useBindableOrders,
  useInvalidateSiteIntake,
  useKnownPlaces,
  useReviewDestinationSearch,
  useSiteIntakeReview,
  type ReviewDestinationSearch,
} from '../site-intake-queries';
import type {
  KnownPlacesResponse,
  SiteIntakeCommandResponse,
  SiteIntakeCommercialOutcome,
  SiteIntakeExceptionResult,
  SiteIntakeReviewView,
} from '../types';
import { useDecision } from '../useDecision';
import { Notice } from './Blocks';
import { FailureNotice } from './FailureNotice';

/**
 * VIEC TAI XE NHAN TRUC TIEP — MOT to truot cho giam doc ("Cần xử lý", chi tiet don) VA ke toan
 * ("Cần duyệt"): cung mot ban ghi may chu, khong co hop thu thu hai.
 *
 * Nut chi hien khi MAY CHU cho phep tren viec nay (`actions`) va tai khoan co quyen — ke toan khong
 * co quyen bao bat thuong nen khong thay nut do, khong can nhanh theo vai. Moi lenh TRUC TUYEN, co
 * khoa chong ghi trung rieng cho tung noi dung (`attemptFor`), giu qua moi lan bam lai sau loi mang.
 * Ket cuc hien la cau may chu tra ve SAU lenh — khong phai y dinh cua nguoi bam.
 */
type Mode = 'IDLE' | 'DESTINATION' | 'BIND' | 'EXCEPTION';

const BASE = '/transport/site-intakes';

export function SiteIntakeReviewSheet({
  intakeId,
  onClose,
  initialMode = 'IDLE',
}: {
  readonly intakeId: string | null;
  readonly onClose: () => void;
  /** Chi tiet don mo thang form bao bat thuong. */
  readonly initialMode?: 'IDLE' | 'EXCEPTION';
}) {
  const http = useHttp();
  const queryClient = useQueryClient();
  const { timeZone } = useBranding();
  const { can } = useOfficeAccess();
  const review = useSiteIntakeReview(intakeId);
  const reviewKey = useOfficeKey('office', 'site-intake', intakeId);
  const invalidate = useInvalidateSiteIntake();
  const decision = useDecision(SITE_INTAKE_POLICY);
  const attempts = useRef<Readonly<Record<string, CommandAttempt>>>({});
  const [requested, setMode] = useState<Mode>(initialMode);
  const [picked, setPicked] = useState<DestinationRow | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [query, setQuery] = useState('');
  const [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState<string | null>(null);
  const { reset } = decision;
  const { search, run: runSearch, clear: clearSearch } = useReviewDestinationSearch();

  // Mo lai (viec khac) = lenh moi: khoa moi, form sach.
  useEffect(() => {
    attempts.current = {};
    setMode(initialMode);
    setPicked(null);
    setOrderId(null);
    setFilter('');
    setQuery('');
    setReason('');
    setOutcome(null);
    clearSearch();
    reset();
  }, [intakeId, initialMode, reset, clearSearch]);

  const view = review.data ?? null;
  const allowed = view ? reviewActions(view, can) : null;
  const mode = effectiveMode(requested, allowed);
  const places = useKnownPlaces(mode === 'DESTINATION');
  const bindable = useBindableOrders(intakeId, mode === 'BIND');

  function keyFor(identity: string): string {
    const attempt = attemptFor(attempts.current[identity] ?? null, identity, () =>
      newIdempotencyKey('intake'),
    );
    attempts.current = { ...attempts.current, [identity]: attempt };
    return attempt.key;
  }

  function settle(intake: SiteIntakeReviewView, text: string) {
    queryClient.setQueryData(reviewKey, intake);
    setOutcome(text);
    setMode('IDLE');
    setPicked(null);
    setOrderId(null);
    setQuery('');
    setReason('');
    clearSearch();
    invalidate();
  }

  function command<T>(
    path: string,
    identity: string,
    body: (key: string) => Readonly<Record<string, unknown>>,
    describe: (outcome: T) => string,
  ) {
    if (!view) return;
    const url = `${BASE}/${encodeURIComponent(view.intakeId)}/${path}`;
    void decision.run(() => http.post<SiteIntakeCommandResponse<T>>(url, body(keyFor(identity))), {
      onSuccess: (response) => settle(response.intake, describe(response.outcome)),
      onAlreadyDone: (failure) => {
        setOutcome(failure.message);
        setMode('IDLE');
        invalidate();
      },
    });
  }

  const describeCommercial = (result: SiteIntakeCommercialOutcome) => commandOutcomeText(result);
  const describeException = (result: SiteIntakeExceptionResult) => exceptionOutcomeText(result);

  function sendDestination() {
    if (picked === null) return;
    // `choice` la DUNG than may chu doi chieu: dia diem da biet, hoac ket qua tim NGUYEN VAN (chuoi
    // da gui + nhan + toa do may chu tra). Khong co nhanh nao dung toa do tu go.
    const { choice } = picked;
    command(
      'complete',
      destinationCommandIdentity(choice),
      (key) => completeDestinationBody(key, choice),
      describeCommercial,
    );
  }
  function sendAttest() {
    command(
      'complete',
      'attest-origin',
      (key) => ({ idempotencyKey: key, attestOrigin: true }),
      describeCommercial,
    );
  }
  function sendComplete() {
    command('complete', 'complete', (key) => ({ idempotencyKey: key }), describeCommercial);
  }
  function sendBind() {
    if (orderId === null) return;
    command(
      'bind-order',
      `bind:${orderId}`,
      (key) => ({ orderId, idempotencyKey: key }),
      describeCommercial,
    );
  }
  function sendException() {
    // MOT khoa cho ca lan mo: sua ly do roi gui lai sau loi mang van la CUNG lenh — may chu tra lai
    // ket cuc da ghi neu lan truoc da toi.
    const text = reason.trim();
    command(
      'exception',
      'exception',
      (key) => ({ reason: text, idempotencyKey: key }),
      describeException,
    );
  }

  const back = () => {
    setMode('IDLE');
    reset();
  };
  const busy = decision.busy;

  const footer =
    !view || !allowed ? null : mode === 'IDLE' ? (
      <IdleActions
        allowed={allowed}
        busy={busy}
        onDestination={() => setMode('DESTINATION')}
        onAttest={sendAttest}
        onBind={() => setMode('BIND')}
        onComplete={sendComplete}
        onException={() => setMode('EXCEPTION')}
      />
    ) : (
      <>
        {mode === 'DESTINATION' ? (
          <Button
            kind="signal"
            label="Gửi điểm giao"
            icon="map-marker-check-outline"
            disabled={picked === null}
            loading={busy}
            onPress={sendDestination}
            testID="site-intake-destination-send"
          />
        ) : null}
        {mode === 'BIND' ? (
          <Button
            kind="signal"
            label="Gắn vào đơn này"
            icon="link-variant"
            disabled={orderId === null}
            loading={busy}
            onPress={sendBind}
            testID="site-intake-bind-submit"
          />
        ) : null}
        {mode === 'EXCEPTION' ? (
          <Button
            kind="danger"
            label="Gửi báo bất thường"
            icon="alert-octagon-outline"
            disabled={!exceptionReasonReady(reason)}
            loading={busy}
            onPress={sendException}
            testID="site-intake-exception-submit"
          />
        ) : null}
        <Button
          kind="ghost"
          label="Quay lại"
          disabled={busy}
          onPress={back}
          testID="site-intake-mode-back"
        />
      </>
    );

  return (
    <Sheet
      visible={intakeId !== null}
      onClose={onClose}
      title="Việc tài xế nhận trực tiếp"
      subtitle={view ? (view.driver.name ?? 'Lái xe chưa đọc được tên') : undefined}
      footer={footer}
    >
      <View style={styles.body} testID="site-intake-review-sheet">
        {review.isPending ? <LoadingBlock label="Đang đọc việc tài xế nhận…" /> : null}
        {review.isError ? (
          <ErrorBlock error={review.error} onRetry={() => void review.refetch()} />
        ) : null}
        {view ? (
          <ReviewFacts view={view} timeZone={timeZone} showException={outcome === null} />
        ) : null}
        {outcome ? <Notice tone="live" title={outcome} testID="site-intake-outcome" /> : null}
        <FailureNotice failure={decision.failure} />
        {view && mode === 'DESTINATION' ? (
          <DestinationForm
            places={places}
            filter={filter}
            onFilter={setFilter}
            query={query}
            onQuery={setQuery}
            search={search}
            onSearch={() => void runSearch(query)}
            picked={picked}
            onPick={setPicked}
          />
        ) : null}
        {view && mode === 'BIND' ? (
          <View style={styles.form}>
            {bindable.isPending ? <LoadingBlock lines={2} /> : null}
            {bindable.isError ? (
              <ErrorBlock error={bindable.error} onRetry={() => void bindable.refetch()} />
            ) : null}
            {bindable.data && bindable.data.length === 0 ? (
              <EmptyBlock
                icon="package-variant"
                title="Không có đơn mở nào cùng nơi lấy hàng mà chưa lập kế hoạch"
              />
            ) : null}
            {(bindable.data ?? []).map((order) => (
              <ChoiceRow
                key={order.id}
                label={order.code}
                detail={bindableOrderLine(order)}
                selected={orderId === order.id}
                onPress={() => setOrderId(order.id)}
                testID={`site-intake-bind-${order.id}`}
              />
            ))}
          </View>
        ) : null}
        {view && mode === 'EXCEPTION' ? (
          <View style={styles.form}>
            <Text variant="caption" tone="caution">
              {exceptionConsequence(view)}
            </Text>
            <Field
              label="Lý do (bắt buộc)"
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={EXCEPTION_REASON_MAX}
              hint="Ít nhất 3 ký tự — ghi rõ vì sao."
              testID="site-intake-exception-reason"
            />
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}

function IdleActions({
  allowed,
  busy,
  onDestination,
  onAttest,
  onBind,
  onComplete,
  onException,
}: {
  readonly allowed: ReturnType<typeof reviewActions>;
  readonly busy: boolean;
  readonly onDestination: () => void;
  readonly onAttest: () => void;
  readonly onBind: () => void;
  readonly onComplete: () => void;
  readonly onException: () => void;
}) {
  return (
    <>
      {allowed.complete ? (
        <Button
          kind="signal"
          label="Hoàn thiện"
          icon="check-decagram"
          loading={busy}
          onPress={onComplete}
          testID="site-intake-complete"
        />
      ) : null}
      {allowed.setDestination ? (
        <Button
          kind="primary"
          label="Chọn điểm giao"
          icon="map-marker-check-outline"
          disabled={busy}
          onPress={onDestination}
          testID="site-intake-set-destination"
        />
      ) : null}
      {allowed.attestOrigin ? (
        <Button
          kind="secondary"
          label="Xác nhận nơi lấy hàng"
          icon="map-marker-account-outline"
          loading={busy}
          onPress={onAttest}
          testID="site-intake-attest-origin"
        />
      ) : null}
      {allowed.bindOrder ? (
        <Button
          kind="secondary"
          label="Gắn vào đơn có sẵn"
          icon="link-variant"
          disabled={busy}
          onPress={onBind}
          testID="site-intake-bind-open"
        />
      ) : null}
      {allowed.reportException ? (
        <Button
          kind="danger"
          label="Báo bất thường / Hủy"
          icon="alert-octagon-outline"
          disabled={busy}
          onPress={onException}
          testID="site-intake-exception-open"
        />
      ) : null}
    </>
  );
}

/**
 * CHON DIEM GIAO — hai nguon #379: dia diem da biet (loc khong dau) va tim theo ten. Khong o go toa
 * do, khong chu tu do thanh diem giao, khong chon san. Tim tat / ban / khong ra gi thi noi dung vay.
 */
function DestinationForm({
  places,
  filter,
  onFilter,
  query,
  onQuery,
  search,
  onSearch,
  picked,
  onPick,
}: {
  readonly places: UseQueryResult<KnownPlacesResponse>;
  readonly filter: string;
  readonly onFilter: (next: string) => void;
  readonly query: string;
  readonly onQuery: (next: string) => void;
  readonly search: ReviewDestinationSearch;
  readonly onSearch: () => void;
  readonly picked: DestinationRow | null;
  readonly onPick: (row: DestinationRow) => void;
}) {
  const all = places.data?.places ?? [];
  const known = knownPlaceRows(all, filter);
  const note = places.data
    ? knownPlacesNote({ available: places.data.available, total: all.length, shown: known.length })
    : null;
  const knownCount = places.data?.available ? all.length : 0;
  const found = search.result
    ? reviewSearchOutcome(search.result.response, search.result.query, knownCount)
    : null;

  return (
    <View style={styles.form}>
      <Field
        label="Lọc địa điểm đã biết"
        value={filter}
        onChangeText={onFilter}
        autoCorrect={false}
        testID="site-intake-place-filter"
      />
      {places.isPending ? <LoadingBlock lines={2} label="Đang đọc địa điểm đã biết…" /> : null}
      {places.isError ? (
        <ErrorBlock
          error={places.error}
          title="Chưa đọc được địa điểm đã biết"
          onRetry={() => void places.refetch()}
        />
      ) : null}
      {note ? (
        <Text variant="caption" tone="muted" testID="site-intake-place-note">
          {note}
        </Text>
      ) : null}
      {known.map((row) => (
        <ChoiceRow
          key={row.key}
          label={row.label}
          detail={row.detail}
          selected={samePick(row, picked)}
          onPress={() => onPick(row)}
          testID={row.testID}
        />
      ))}
      <Divider />
      <Field
        label="Tìm theo tên hoặc địa chỉ"
        value={query}
        onChangeText={onQuery}
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={onSearch}
        maxLength={REVIEW_SEARCH_MAX_CHARS}
        error={search.problem}
        testID="site-intake-review-search-query"
      />
      <Button
        kind="secondary"
        icon="magnify"
        label="Tìm"
        loading={search.busy}
        onPress={onSearch}
        testID="site-intake-review-search-submit"
      />
      {search.error ? (
        <ErrorBlock error={search.error} title="Chưa tìm được" onRetry={onSearch} />
      ) : null}
      {found?.notice ? (
        <Notice
          tone="neutral"
          icon="information-outline"
          title={found.notice}
          testID="site-intake-review-search-notice"
        />
      ) : null}
      {(found?.rows ?? []).map((row) => (
        <ChoiceRow
          key={row.key}
          label={row.label}
          detail={row.detail}
          selected={samePick(row, picked)}
          onPress={() => onPick(row)}
          testID={row.testID}
        />
      ))}
      {found?.attribution ? (
        <Text variant="caption" tone="faint" testID="site-intake-review-search-attribution">
          {found.attribution}
        </Text>
      ) : null}
      <Text
        variant={picked ? 'bodyStrong' : 'caption'}
        tone={picked ? 'ink' : 'muted'}
        testID="site-intake-review-destination-picked"
      >
        {pickedDestinationLine(picked)}
      </Text>
    </View>
  );
}

/** Quyen/`actions` doi sau mot lenh -> form khong con lam duoc thi ve IDLE, khong treo nut chet. */
function effectiveMode(mode: Mode, allowed: ReturnType<typeof reviewActions> | null): Mode {
  if (allowed === null) return 'IDLE';
  if (mode === 'DESTINATION' && !allowed.setDestination) return 'IDLE';
  if (mode === 'BIND' && !allowed.bindOrder) return 'IDLE';
  if (mode === 'EXCEPTION' && !allowed.reportException) return 'IDLE';
  return mode;
}

function ReviewFacts({
  view,
  timeZone,
  showException,
}: {
  readonly view: SiteIntakeReviewView;
  readonly timeZone: string;
  /** An khi ket cuc VUA gui dang hien — cung mot su that, khong noi hai lan. */
  readonly showException: boolean;
}) {
  const pending = view.status === 'PENDING' && view.readiness.kind !== 'REJECTED';
  return (
    <>
      <View style={styles.pills}>
        <Pill
          label={REVIEW_STATUS_LABEL[view.status] ?? view.status}
          tone={
            view.status === 'ORDER_BOUND'
              ? 'live'
              : view.status === 'REJECTED'
                ? 'neutral'
                : 'caution'
          }
        />
        <Pill label={view.movementStarted ? 'Xe đã lăn bánh' : 'Xe chưa lăn bánh'} tone="neutral" />
      </View>
      {pending ? (
        <Text variant="bodyStrong" tone="caution" testID="site-intake-missing">
          {missingLine(view.readiness.reasons)}
        </Text>
      ) : null}
      <KeyValue label="Lái xe" value={view.driver.name ?? 'Lái xe chưa đọc được tên'} />
      <KeyValue label="Xe" value={view.vehicle.plate ?? 'Xe chưa đọc được biển'} />
      <KeyValue label="Nơi lấy hàng" value={originLine(view.origin)} />
      {view.origin.address ? <KeyValue label="Địa chỉ" value={view.origin.address} /> : null}
      <KeyValue label="Tài xế xác nhận lúc" value={formatClock(view.confirmedAt, timeZone)} />
      <KeyValue label="Vị trí" value={locationLine(view.location)} />
      {view.originAttestedAt ? (
        <KeyValue
          label="Văn phòng xác nhận nơi lấy"
          value={formatClock(view.originAttestedAt, timeZone)}
        />
      ) : null}
      <KeyValue label="Điểm giao" value={view.destination?.label ?? 'Chưa có'} />
      <KeyValue label="Vòng chạy" value={view.run.code} />
      {view.order ? <KeyValue label="Đơn" value={view.order.code} strong /> : null}
      {view.exception && showException ? (
        <>
          <Divider />
          <Notice
            tone="neutral"
            icon="alert-octagon-outline"
            title={exceptionOutcomeText({ outcome: view.exception.outcome })}
            detail={`Lý do: ${view.exception.reason} · ${formatClock(view.exception.at, timeZone)}`}
            testID="site-intake-exception-recorded"
          />
        </>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  body: { gap: SPACE.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  form: { gap: SPACE.sm, marginTop: SPACE.sm },
});
