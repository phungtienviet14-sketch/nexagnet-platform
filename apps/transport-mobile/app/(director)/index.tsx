import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useBranding } from '../../src/branding/BrandingProvider';
import { formatBusinessDate } from '../../src/format';
import {
  composeHeadline,
  fleetStats,
  formatCount,
  pendingWorkNotes,
  queueItemKey,
  runningSummary,
  topDecisions,
  unavailableSourceNotes,
} from '../../src/features/office/control-tower';
import {
  useControlTower,
  useFinanceSummary,
  useOfficeAccess,
  useRefetchOnFocus,
} from '../../src/features/office/queries';
import {
  useDriverOrderActivity,
  useSiteIntakeGates,
} from '../../src/features/office/site-intake-queries';
import type { ControlTowerView, QueueItem } from '../../src/features/office/types';
import { MoneySection } from '../../src/features/office/ui/MoneySection';
import { WhyMissing } from '../../src/features/office/ui/WhyMissing';
import { DecisionCard, FleetStrip, Headline } from '../../src/features/director/ui/Briefing';
import { DriverOrdersSection } from '../../src/features/director/ui/DriverOrders';
import { SPACE } from '../../src/theme/tokens';
import { AccountButton } from '../../src/ui/AccountButton';
import { Button } from '../../src/ui/Button';
import { Screen } from '../../src/ui/Screen';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../src/ui/States';
import { Section } from '../../src/ui/Surface';
import { SyncBanner } from '../../src/ui/SyncBanner';

/**
 * "HÔM NAY" — ban tin buoi sang cua giam doc. Ba cau hoi, dung thu tu: viec gi can toi quyet, xe dang
 * the nao, tien dang o dau. MOI con so la cua may chu (`/control-tower`, `/finance/summary`); man
 * hinh chi ghep cau. Doc lai khi keo xuong / khi quay lai tab (neu cu hon 1 phut) — khong doc lien
 * tuc: thap dieu hanh ton mot lan goi cho moi vong chay o may chu.
 */
export default function DirectorToday() {
  const router = useRouter();
  const { can, has } = useOfficeAccess();
  const tower = useControlTower();
  const financeEnabled = has('transport-settlement') && can('transport.settlement.report.read');
  const finance = useFinanceSummary(financeEnabled);
  // #398: TIN TUC "Đơn mới từ tài xế" — doc rieng, KHONG cham toi so viec can quyet cua thap dieu hanh.
  const { timeZone } = useBranding();
  const intakeGates = useSiteIntakeGates();
  const driverOrders = useDriverOrderActivity(intakeGates.read);
  useRefetchOnFocus(tower.refetch, tower.dataUpdatedAt);
  useRefetchOnFocus(driverOrders.refetch, driverOrders.dataUpdatedAt);

  const openItem = (item: QueueItem) =>
    router.push({ pathname: '/inbox', params: { open: queueItemKey(item) } });

  const openOrder = (orderId: string) =>
    router.push({ pathname: '/order/[id]', params: { id: orderId } });

  // Ban tin nam NGAY SAU "Cần quyết trước" khi co bang dieu hanh; bang hong thi van hien rieng.
  const news = (
    <DriverOrdersSection
      query={driverOrders}
      enabled={intakeGates.read}
      timeZone={timeZone}
      onOpenOrder={openOrder}
    />
  );

  const refresh = () => {
    void tower.refetch();
    if (financeEnabled) void finance.refetch();
    if (intakeGates.read) void driverOrders.refetch();
  };

  return (
    <Screen
      title="Hôm nay"
      eyebrow={
        tower.data
          ? `Số liệu ngày ${formatBusinessDate(tower.data.generatedFor)}`
          : 'Bản tin buổi sáng'
      }
      trailing={<AccountButton />}
      banner={<SyncBanner />}
      onRefresh={refresh}
      refreshing={tower.isRefetching || finance.isRefetching || driverOrders.isRefetching}
      testID="director-today"
    >
      {tower.isPending ? <LoadingBlock lines={4} label="Đang đọc bảng điều hành…" /> : null}
      {tower.isError ? (
        <ErrorBlock
          error={tower.error}
          title="Chưa đọc được bảng điều hành"
          onRetry={() => void tower.refetch()}
        />
      ) : null}
      {tower.data ? (
        <Briefing
          view={tower.data}
          news={news}
          onOpen={openItem}
          onInbox={() => router.push('/inbox')}
        />
      ) : (
        news
      )}
      <MoneySection query={finance} enabled={financeEnabled} />
    </Screen>
  );
}

function Briefing({
  view,
  news,
  onOpen,
  onInbox,
}: {
  readonly view: ControlTowerView;
  /** "Đơn mới từ tài xế" — TIN, dat sau viec can quyet, khong doi so nao cua khoi tren. */
  readonly news: ReactNode;
  readonly onOpen: (item: QueueItem) => void;
  readonly onInbox: () => void;
}) {
  const top = topDecisions(view.queue);
  const first = top[0];
  return (
    <View style={styles.stack}>
      <Headline text={composeHeadline(view)} runningLine={runningSummary(view.fleet)} />
      {first ? (
        <Button
          kind="signal"
          size="hero"
          icon="gavel"
          label="Quyết việc đầu tiên"
          hint="Mở việc được máy chủ xếp đầu hàng"
          onPress={() => onOpen(first)}
          testID="director-decide-first"
        />
      ) : null}

      <Section
        title="Cần quyết trước"
        action={
          view.queueTotal > top.length ? (
            <Button
              kind="ghost"
              size="compact"
              label={`Cả ${formatCount(view.queueTotal)} việc`}
              onPress={onInbox}
              testID="director-open-inbox"
            />
          ) : null
        }
      >
        {top.length === 0 ? (
          <EmptyBlock
            icon="check-decagram-outline"
            title="Không có việc nào đang chờ quyết"
            detail="Xem “Vì sao thiếu mục” bên dưới: có việc hệ thống chưa theo dõi được."
          />
        ) : (
          top.map((item) => <DecisionCard key={queueItemKey(item)} item={item} onPress={onOpen} />)
        )}
      </Section>

      {news}

      <Section title="Đội xe">
        <FleetStrip stats={fleetStats(view.fleet)} />
      </Section>

      <View style={styles.why}>
        <WhyMissing
          disabledNotes={unavailableSourceNotes(view.unavailableSources)}
          pendingNotes={pendingWorkNotes(view.pendingWork)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.lg },
  why: { marginTop: SPACE.sm },
});
