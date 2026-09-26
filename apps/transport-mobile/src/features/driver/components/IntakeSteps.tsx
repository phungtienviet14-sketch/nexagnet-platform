import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SPACE } from '../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { ChoiceRow } from '../../../ui/Choice';
import { Field } from '../../../ui/Field';
import { Notice } from '../../../ui/Notice';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../ui/States';
import { Card, Pill } from '../../../ui/Surface';
import { Text } from '../../../ui/Text';
import { useIntakeDestinations } from '../queries';
import { ACTIVE_RUN_BACK_LABEL, type SiteCandidateRow } from '../site-intake';
import {
  doneModel,
  knownDestinationRows,
  OFFLINE_DETAIL,
  OFFLINE_TEXT,
  pickSummary,
  pickupLine,
  proposalPrimary,
  RECEIVED_COPY,
  refusalAction,
  REPLAY_NOTE,
  type DestinationRow,
  type IntakeDone,
  type IntakeFailure,
} from '../site-intake-flow';
import type { SiteIntakeFlow } from '../use-site-intake';

/**
 * CAC BUOC cua man "Nhận chuyến" — chi VE. Nut nao hien, chu nao, bat/tat ra sao deu doc tu
 * `site-intake-flow.ts`; o day khong co mot `if` nghiep vu nao.
 *
 * Chu hien cho lai xe KHONG co "đơn", "vòng chạy", "chặng", "Tạo chuyến" (`#398` OWNER UI).
 */

export function FailureLine({ failure }: { readonly failure: IntakeFailure | null }) {
  if (failure === null) return null;
  if (failure.kind === 'OFFLINE') {
    return (
      <Notice
        tone="caution"
        icon="wifi-off"
        title={failure.message}
        detail={OFFLINE_DETAIL}
        testID="site-intake-offline"
      />
    );
  }
  if (failure.kind === 'UNCERTAIN') {
    return (
      <Notice
        tone="pending"
        icon="cloud-sync"
        title={failure.message}
        detail={failure.detail}
        testID="site-intake-uncertain"
      />
    );
  }
  return (
    <Notice
      tone="danger"
      icon="alert-circle-outline"
      title="Máy chủ không nhận"
      detail={failure.message}
      testID="site-intake-refused"
    />
  );
}

export function OfflineStep({
  onRetry,
  onBack,
}: {
  readonly onRetry: () => void;
  readonly onBack: () => void;
}) {
  return (
    <>
      <Notice
        tone="caution"
        icon="wifi-off"
        title={OFFLINE_TEXT}
        detail={OFFLINE_DETAIL}
        testID="site-intake-offline"
      />
      <Button
        kind="primary"
        label="Thử lại"
        icon="refresh"
        onPress={onRetry}
        testID="site-intake-retry"
      />
      <Button kind="ghost" label="Quay lại" onPress={onBack} />
    </>
  );
}

export function LoadFailedStep({
  message,
  onRetry,
  onBack,
}: {
  readonly message: string;
  readonly onRetry: () => void;
  readonly onBack: () => void;
}) {
  return (
    <>
      <Notice
        tone="danger"
        icon="cloud-alert"
        title="Chưa đọc được địa điểm quanh đây"
        detail={message}
        testID="site-intake-load-failed"
      />
      <Button
        kind="primary"
        label="Thử lại"
        icon="refresh"
        onPress={onRetry}
        testID="site-intake-retry"
      />
      <Button kind="ghost" label="Quay lại" onPress={onBack} />
    </>
  );
}

function CandidateCard({
  row,
  trustLabel,
}: {
  readonly row: SiteCandidateRow;
  readonly trustLabel: string;
}) {
  return (
    <View testID={`site-intake-candidate-${row.siteId}`}>
      <Card rail="brand">
        <Text variant="heading">{row.companyLine}</Text>
        <Text variant="bodyStrong">{row.siteLine}</Text>
        {row.addressLine ? (
          <Text variant="caption" tone="muted">
            {row.addressLine}
          </Text>
        ) : null}
        <View style={styles.pills}>
          <Pill label={row.distanceLine} tone="neutral" icon="map-marker-distance" />
          <Pill label={trustLabel} tone="neutral" icon="crosshairs-gps" />
          {row.uncertain ? <Pill label="Chỉ ở gần, chưa ở trong" tone="caution" /> : null}
        </View>
      </Card>
    </View>
  );
}

export function ProposalStep({
  flow,
  canConfirm,
  onBack,
  onBackToWork,
}: {
  readonly flow: SiteIntakeFlow;
  readonly canConfirm: boolean;
  readonly onBack: () => void;
  readonly onBackToWork: () => void;
}) {
  const { state } = flow;
  const screen = state.screen;
  if (!screen) return null;
  const primary = proposalPrimary(state, canConfirm);
  const refusal = state.failure?.kind === 'REFUSED' ? refusalAction(state.failure.next) : null;
  const retryMode = screen.mode === 'NO_MATCH' || screen.mode === 'LOCATION_UNUSABLE';

  return (
    <>
      <Text variant="title" accessibilityRole="header">
        {screen.headline}
      </Text>
      {state.locationNote ? (
        <Text variant="caption" tone="caution" testID="site-intake-location-note">
          {state.locationNote}
        </Text>
      ) : null}

      {(screen.mode === 'CONFIRM' || screen.mode === 'ACTIVE_RUN') && screen.candidates[0] ? (
        <CandidateCard row={screen.candidates[0]} trustLabel={screen.trustLabel} />
      ) : null}

      {screen.mode === 'CHOOSE' ? (
        <View style={styles.list}>
          {screen.candidates.map((row) => (
            <ChoiceRow
              key={row.siteId}
              label={row.companyLine}
              detail={[
                row.siteLine,
                row.distanceLine,
                row.uncertain ? 'chỉ ở gần' : null,
                row.addressLine,
              ]
                .filter((part): part is string => typeof part === 'string' && part !== '')
                .join(' · ')}
              selected={state.chosenSiteId === row.siteId}
              onPress={() => flow.chooseSite(row.siteId)}
              testID={`site-intake-candidate-${row.siteId}`}
            />
          ))}
          <Text variant="caption" tone="muted">
            {screen.trustLabel}
          </Text>
        </View>
      ) : null}

      {screen.mode === 'ACTIVE_RUN' ? (
        <>
          <Notice
            tone="caution"
            icon="truck-alert-outline"
            title={screen.notice ?? ''}
            testID="site-intake-active-run"
          />
          <Button
            kind="primary"
            label={ACTIVE_RUN_BACK_LABEL}
            icon="arrow-left"
            onPress={onBackToWork}
            testID="site-intake-active-run-back"
          />
        </>
      ) : screen.notice ? (
        <Notice tone="caution" icon="map-marker-question-outline" title={screen.notice} />
      ) : null}

      <FailureLine failure={state.failure} />

      {primary ? (
        <Button
          kind="signal"
          size="hero"
          icon="check-bold"
          label={primary.label}
          disabled={!primary.enabled}
          loading={state.busy}
          onPress={() => void flow.confirm()}
          testID="site-intake-confirm"
        />
      ) : null}
      {primary && !canConfirm ? (
        <Text variant="caption" tone="muted">
          Tài khoản này chưa được phép nhận chuyến — báo văn phòng.
        </Text>
      ) : null}
      {refusal ? (
        <Button
          kind="secondary"
          label={refusal.label}
          onPress={refusal.next === 'RETRY_PROPOSAL' ? () => void flow.locate() : onBackToWork}
          testID="site-intake-refusal-next"
        />
      ) : null}
      {screen.secondaryLabel ? (
        <Button
          kind={retryMode ? 'primary' : 'ghost'}
          label={screen.secondaryLabel}
          icon={retryMode ? 'refresh' : undefined}
          disabled={state.busy}
          onPress={retryMode ? () => void flow.locate() : onBack}
          testID={retryMode ? 'site-intake-retry' : 'site-intake-not-here'}
        />
      ) : null}
    </>
  );
}

export function ReceivedStep({
  flow,
  canChoose,
}: {
  readonly flow: SiteIntakeFlow;
  readonly canChoose: boolean;
}) {
  const received = flow.state.received;
  if (!received) return null;
  return (
    <>
      <View testID="site-intake-received">
        <Card rail="live">
          <Text variant="caption" tone="muted">
            {RECEIVED_COPY.title}
          </Text>
          <Text variant="heading">{pickupLine(received)}</Text>
          {received.replayed ? (
            <Text variant="caption" tone="muted">
              {REPLAY_NOTE}
            </Text>
          ) : null}
        </Card>
      </View>
      <Text variant="title" accessibilityRole="header">
        {RECEIVED_COPY.heading}
      </Text>
      {canChoose ? (
        <Button
          kind="signal"
          size="hero"
          icon="map-marker-check-outline"
          label={RECEIVED_COPY.choose}
          onPress={flow.openPicker}
          testID="site-intake-destination-choose"
        />
      ) : null}
      <Button
        kind="secondary"
        label={RECEIVED_COPY.unknown}
        onPress={flow.unknownDestination}
        testID="site-intake-destination-unknown"
      />
    </>
  );
}

function DestinationList({
  rows,
  selectedKey,
  onPick,
}: {
  readonly rows: readonly DestinationRow[];
  readonly selectedKey: string | null;
  readonly onPick: (row: DestinationRow) => void;
}) {
  return (
    <>
      {rows.map((row) => (
        <ChoiceRow
          key={row.key}
          label={row.label}
          detail={row.detail}
          selected={selectedKey === row.key}
          onPress={() => onPick(row)}
          testID={row.testID}
        />
      ))}
    </>
  );
}

/**
 * CHON DIEM GIAO — man rieng (khong phai tab Ban do): danh sach dia diem da biet + loc khong dau, tim
 * theo ten khi can. Khong o go tu do, khong cham ban do, khong bao gio mot cap so tu nghi ra.
 */
export function DestinationStep({ flow }: { readonly flow: SiteIntakeFlow }) {
  const { state, search } = flow;
  const destinations = useIntakeDestinations(true);
  const [filter, setFilter] = useState('');
  const known = knownDestinationRows(destinations.data?.places ?? [], filter);
  const summary = pickSummary(state.pick);
  const selectedKey = state.pick?.key ?? null;

  return (
    <View style={styles.fill}>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="title" accessibilityRole="header">
          {RECEIVED_COPY.heading}
        </Text>
        <Field
          label="Lọc theo tên"
          value={filter}
          onChangeText={setFilter}
          autoCorrect={false}
          placeholder="vd: dinh vu, kho so 2"
          testID="site-intake-destination-filter"
        />
        {destinations.isPending ? (
          <LoadingBlock lines={3} label="Đang đọc địa điểm đã biết…" />
        ) : null}
        {destinations.isError ? (
          <ErrorBlock
            error={destinations.error}
            title="Chưa đọc được địa điểm đã biết"
            onRetry={() => void destinations.refetch()}
          />
        ) : null}
        {destinations.data && known.length === 0 ? (
          <EmptyBlock
            icon="map-search-outline"
            title={
              filter.trim() === '' ? 'Chưa có địa điểm nào được khai' : 'Không có nơi nào khớp'
            }
            detail="Thử Tìm theo tên, hoặc quay lại chọn “Chưa biết”."
          />
        ) : null}
        <DestinationList rows={known} selectedKey={selectedKey} onPick={flow.pick} />

        <Button
          kind="ghost"
          icon="magnify"
          label="Tìm theo tên"
          loading={search.busy}
          onPress={() => void flow.runSearch(filter)}
          testID="site-intake-destination-search"
        />
        {search.problem ? (
          <Text variant="caption" tone="caution">
            {search.problem}
          </Text>
        ) : null}
        {search.outcome?.notice ? (
          <Notice
            tone="neutral"
            icon="information-outline"
            title={search.outcome.notice}
            testID="site-intake-search-notice"
          />
        ) : null}
        {search.outcome && search.outcome.rows.length > 0 ? (
          <>
            <DestinationList
              rows={search.outcome.rows}
              selectedKey={selectedKey}
              onPick={flow.pick}
            />
            {search.outcome.attribution ? (
              <Text variant="caption" tone="faint" testID="site-intake-search-attribution">
                {search.outcome.attribution}
              </Text>
            ) : null}
          </>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <FailureLine failure={state.failure} />
        {summary ? (
          <Text variant="bodyStrong" testID="site-intake-destination-summary">
            {summary}
          </Text>
        ) : (
          <Text variant="caption" tone="muted">
            Chọn một nơi trong danh sách.
          </Text>
        )}
        <Button
          kind="signal"
          icon="check-bold"
          label="Xác nhận điểm giao"
          disabled={state.pick === null}
          loading={state.busy}
          onPress={() => void flow.submitDestination()}
          testID="site-intake-destination-submit"
        />
        <Button
          kind="ghost"
          label="Quay lại"
          disabled={state.busy}
          onPress={flow.closePicker}
          testID="site-intake-destination-back"
        />
      </View>
    </View>
  );
}

export function DoneStep({
  done,
  onBackToWork,
}: {
  readonly done: IntakeDone;
  readonly onBackToWork: () => void;
}) {
  const model = doneModel(done);
  return (
    <View style={styles.list} testID="site-intake-done">
      <Card rail={model.closed ? 'caution' : 'live'}>
        <Text variant="display" accessibilityRole="header">
          {model.heading}
        </Text>
        {model.lines.map((line) => (
          <Text key={line} variant="body" tone="muted">
            {line}
          </Text>
        ))}
      </Card>
      <Button
        kind="signal"
        size="hero"
        icon="truck-fast-outline"
        label={ACTIVE_RUN_BACK_LABEL}
        onPress={onBackToWork}
        testID="site-intake-back-to-work"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { gap: SPACE.md, paddingBottom: SPACE.lg },
  list: { gap: SPACE.md },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginTop: SPACE.sm },
  footer: { gap: SPACE.sm, paddingTop: SPACE.md },
});
