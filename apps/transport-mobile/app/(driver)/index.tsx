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
import { useDriverGates, useFieldWork, useOpenIntake } from '../../src/features/driver/queries';
import {
  openIntakeCard,
  showAssignedNote,
  SITE_INTAKE_START,
} from '../../src/features/driver/site-intake-flow';
import type { DriverIntakeView } from '../../src/features/driver/types';
import { useFieldFlow } from '../../src/features/driver/use-field-flow';
import { useQueueView, type QueueView } from '../../src/features/driver/use-queue';
import { SPACE } from '../../src/theme/tokens';
import { AccountButton } from '../../src/ui/AccountButton';
import { Button } from '../../src/ui/Button';
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
  const openIntake = useOpenIntake(gates.siteIntake);
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
  const startIntake = () => router.push('/(driver)/intake');
  const chooseDestination = (intakeId: string) =>
    router.push({ pathname: '/(driver)/intake', params: { intakeId } });
  const refresh = () => {
    void work.refetch();
    if (gates.siteIntake) void openIntake.refetch();
  };

  return (
    <Screen
      title="Việc"
      eyebrow={productName}
      trailing={<AccountButton />}
      banner={<SyncBanner />}
      refreshing={work.isRefetching || openIntake.isRefetching}
      onRefresh={refresh}
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
          <OpenIntakeCard
            intake={gates.siteIntake ? openIntake.data : null}
            canChoose={gates.siteIntakeConfirm}
            onChoose={chooseDestination}
          />
          <WorkBody
            model={model}
            queue={queue}
            flow={flow}
            receivedAtMs={work.dataUpdatedAt}
            timeZone={timeZone}
            canIntake={gates.siteIntake}
            openIntake={gates.siteIntake ? openIntake.data : null}
            onStartIntake={startIntake}
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
  openIntake,
  onStartIntake,
  tracking,
  onOpenRun,
}: {
  readonly model: FieldScreenModel;
  readonly queue: QueueView;
  readonly flow: ReturnType<typeof useFieldFlow>;
  readonly receivedAtMs: number;
  readonly timeZone: string;
  readonly canIntake: boolean;
  readonly openIntake: DriverIntakeView | null | undefined;
  readonly onStartIntake: () => void;
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
          // KHONG co viec -> lai xe duoc goi di lay hang thi tu nhan chuyen o noi minh dung. Co
          // chuyen chua xong thi the nay KHONG hien: chuyen dang mo thang (#267 ACTIVE_RUN).
          <View testID="driver-site-intake-entry">
            <Card rail="signal">
              <Text variant="heading">{SITE_INTAKE_START.title}</Text>
              <Text variant="body" tone="muted">
                {SITE_INTAKE_HINT}
              </Text>
              <View style={styles.gap} />
              <Button
                kind="signal"
                size="hero"
                icon="map-marker-radius"
                label={SITE_INTAKE_START.button}
                onPress={onStartIntake}
                testID="driver-site-intake-start"
              />
            </Card>
          </View>
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
      {showAssignedNote(canIntake, openIntake, current?.runId ?? null) ? (
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

/**
 * "CHUA CO DIEM GIAO" — lai xe da nhan chuyen roi thoat giua chung: dua lai DUNG buoc chon diem giao
 * cua lan nhan chuyen do. Viec tiep theo tren chuyen (moc, chung tu) van la nut may chu tinh ben duoi.
 */
function OpenIntakeCard({
  intake,
  canChoose,
  onChoose,
}: {
  readonly intake: DriverIntakeView | null | undefined;
  readonly canChoose: boolean;
  readonly onChoose: (intakeId: string) => void;
}) {
  const model = openIntakeCard(intake, canChoose);
  if (!intake || !model) return null;
  return (
    <View testID="driver-site-intake-open">
      <Card rail="caution">
        <Text variant="bodyStrong">{model.title}</Text>
        <Text variant="caption" tone="muted">
          {model.detail}
        </Text>
        {model.caption ? (
          <Text variant="caption" tone="faint">
            {model.caption}
          </Text>
        ) : null}
        {model.chooseLabel ? (
          <>
            <View style={styles.gap} />
            <Button
              kind="primary"
              icon="map-marker-check-outline"
              label={model.chooseLabel}
              onPress={() => onChoose(intake.intakeId)}
              testID="driver-site-intake-choose-destination"
            />
          </>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { height: SPACE.md },
});
