import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useBranding } from '../../src/branding/BrandingProvider';
import { BUILD_INFO } from '../../src/config/build-info';
import { formatClock } from '../../src/format';
import { LegStrip } from '../../src/features/driver/components/LegStrip';
import { LegacyTrips } from '../../src/features/driver/components/LegacyTrips';
import { NextActionCard } from '../../src/features/driver/components/NextActionCard';
import { QueuedFlash } from '../../src/features/driver/components/QueuedFlash';
import {
  TrackingCard,
  useStopTrackingWhenRunClosed,
  useTrackingState,
} from '../../src/features/driver/components/TrackingCard';
import {
  toFieldScreen,
  type FieldLegCard,
  type FieldScreenModel,
} from '../../src/features/driver/field-work';
import { ASSIGNED_NOTE, SITE_INTAKE_HINT } from '../../src/features/driver/labels';
import { useDriverGates, useFieldWork } from '../../src/features/driver/queries';
import { useFieldFlow } from '../../src/features/driver/use-field-flow';
import { useQueueView, type QueueView } from '../../src/features/driver/use-queue';
import { SPACE } from '../../src/theme/tokens';
import { AccountButton } from '../../src/ui/AccountButton';
import { Notice } from '../../src/ui/Notice';
import { Screen } from '../../src/ui/Screen';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../src/ui/States';
import { Card, Section } from '../../src/ui/Surface';
import { SyncBanner } from '../../src/ui/SyncBanner';
import { Text } from '../../src/ui/Text';

/**
 * "VIỆC" — cau tra loi cho "bay gio toi lam gi", tu VIEC DUOC DIEU (vong chay), khong tu chuyen cu.
 *
 * Ba trang thai khong lan vao nhau: dang doc, doc hong (khong bao gio la "khong co viec"), va may
 * chu noi that la khong co gi. Mot lan lam moi hong sau mot lan doc tot giu lai lan doc tot va NOI
 * RA la cu. Moi nut o day la nut may chu da tinh; man chi them trang thai TREN MAY cua tung nut.
 */
export default function DriverWork() {
  const router = useRouter();
  const gates = useDriverGates();
  const { productName, timeZone } = useBranding();
  const work = useFieldWork(gates.field);
  const queue = useQueueView();
  const flow = useFieldFlow(queue.entries);
  const trackingState = useTrackingState();
  const fresh = work.isSuccess && !work.isRefetchError;
  useStopTrackingWhenRunClosed(
    fresh ? (work.data?.runs.map((run) => run.runId) ?? []) : null,
    trackingState.tracking,
    trackingState.refresh,
  );
  const model = work.data ? toFieldScreen(work.data) : null;
  const openRun = (card: FieldLegCard) =>
    router.push({ pathname: '/(driver)/run/[runId]', params: { runId: card.runId } });

  return (
    <Screen
      title="Việc"
      eyebrow={productName}
      trailing={<AccountButton />}
      banner={<SyncBanner />}
      refreshing={work.isRefetching}
      onRefresh={() => void work.refetch()}
      testID="driver-work"
    >
      {!gates.field ? (
        <EmptyBlock
          icon="clipboard-off-outline"
          title="Doanh nghiệp chưa bật ghi mốc hiện trường"
          detail="Chuyến của bạn vẫn xem được ở mục Chuyến cũ bên dưới."
        />
      ) : work.isPending ? (
        <LoadingBlock lines={4} label="Đang đọc việc được điều cho bạn…" />
      ) : !model ? (
        <ErrorBlock
          error={work.error}
          title="Chưa đọc được việc được điều"
          onRetry={() => void work.refetch()}
        />
      ) : (
        <>
          {work.isRefetchError ? (
            <Notice
              tone="caution"
              icon="cloud-alert"
              title="Chưa làm mới được việc — đang hiện lần đọc trước."
              detail={`Đọc lúc ${formatClock(new Date(work.dataUpdatedAt).toISOString(), timeZone)}.`}
            />
          ) : null}
          {flow.failure ? (
            <Notice
              tone="danger"
              icon="alert-circle-outline"
              title={flow.failure}
              testID="driver-failure"
            />
          ) : null}
          {flow.flash ? (
            <QueuedFlash flash={flow.flash} entries={queue.entries} sentIds={queue.sentIds} />
          ) : null}
          <WorkBody
            model={model}
            queue={queue}
            flow={flow}
            receivedAtMs={work.dataUpdatedAt}
            timeZone={timeZone}
            canIntake={gates.siteIntake}
            tracking={BUILD_INFO.backgroundLocationBuild && gates.tracking ? trackingState : null}
            onOpenRun={openRun}
          />
        </>
      )}
      <LegacyTrips enabled={gates.trips} initiallyOpen={!gates.field} />
      {flow.sheets}
    </Screen>
  );
}

function WorkBody({
  model,
  queue,
  flow,
  receivedAtMs,
  timeZone,
  canIntake,
  tracking,
  onOpenRun,
}: {
  readonly model: FieldScreenModel;
  readonly queue: QueueView;
  readonly flow: ReturnType<typeof useFieldFlow>;
  readonly receivedAtMs: number;
  readonly timeZone: string;
  readonly canIntake: boolean;
  readonly tracking: ReturnType<typeof useTrackingState> | null;
  readonly onOpenRun: (card: FieldLegCard) => void;
}) {
  if (model.kind === 'NO_WORK') {
    return (
      <>
        <EmptyBlock
          icon="truck-outline"
          title={model.headline}
          detail="Việc văn phòng giao sẽ hiện ở đây."
        />
        {canIntake ? (
          <Card testID="driver-site-intake-entry">
            <Text variant="body" tone="muted">
              {SITE_INTAKE_HINT}
            </Text>
            <View style={styles.gap} />
            {/* Man "Nhận việc" tren di dong chua dung xong (logic thuan da co + test): tam thoi chi
                noi thang, khong bay mot nut dan toi man trong. */}
            <Text variant="caption" tone="faint" testID="driver-site-intake">
              Màn Nhận việc trên ứng dụng đang được hoàn thiện — tạm thời dùng bản web.
            </Text>
          </Card>
        ) : null}
      </>
    );
  }
  const current = model.current;
  return (
    <>
      {current ? (
        <NextActionCard
          card={current}
          entries={queue.entries}
          busy={flow.busy}
          receivedAtMs={receivedAtMs}
          timeZone={timeZone}
          onAct={(action) => flow.act(current, action)}
          onActWithNote={(action) => flow.actWithNote(current, action)}
          onOpenRun={() => onOpenRun(current)}
        />
      ) : (
        <EmptyBlock
          icon="check-circle-outline"
          title={model.headline}
          detail="Vòng chạy vẫn đang mở — văn phòng tiến chặng; việc mới sẽ hiện ở đây."
        />
      )}
      {current && tracking ? (
        <TrackingCard
          runId={current.runId}
          runCode={current.runCode}
          tracking={tracking.tracking}
          facts={tracking.facts}
          refresh={tracking.refresh}
        />
      ) : null}
      {canIntake ? (
        <Text variant="caption" tone="faint">
          {ASSIGNED_NOTE}
        </Text>
      ) : null}
      {model.others.length > 0 ? (
        <Section title={current ? 'Các chặng khác' : 'Các chặng đang mở'}>
          <LegStrip cards={model.others} entries={queue.entries} onOpen={onOpenRun} />
        </Section>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  gap: { height: SPACE.md },
});
