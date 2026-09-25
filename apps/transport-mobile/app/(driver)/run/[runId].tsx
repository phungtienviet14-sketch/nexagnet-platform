import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { legsOfRun } from '../../../src/features/driver/field-work';
import { legPoints } from '../../../src/features/driver/map-model';
import { LegStrip } from '../../../src/features/driver/components/LegStrip';
import { useDriverGates, useFieldWork } from '../../../src/features/driver/queries';
import { useQueueView } from '../../../src/features/driver/use-queue';
import { RunMap } from '../../../src/map/RunMap';
import { Button } from '../../../src/ui/Button';
import { Screen } from '../../../src/ui/Screen';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../src/ui/States';
import { Section } from '../../../src/ui/Surface';

/** CHI TIET VONG CHAY — moi chang (chi doc) + ban do nho. Nut bam van chi o man "Việc". */
export default function RunDetail() {
  return useIsFocused() ? <RunDetailScreen /> : null;
}

function RunDetailScreen() {
  const router = useRouter();
  const { runId } = useLocalSearchParams<{ runId: string }>();
  const gates = useDriverGates();
  const work = useFieldWork(gates.field);
  const queue = useQueueView();
  const legs = work.data && runId ? legsOfRun(work.data, runId) : [];
  const points = legs.flatMap(legPoints);
  const back = <Button kind="ghost" size="compact" label="Đóng" onPress={() => router.back()} />;

  return (
    <Screen
      title={legs[0]?.runCode ?? 'Vòng chạy'}
      eyebrow="Vòng chạy"
      trailing={back}
      refreshing={work.isRefetching}
      onRefresh={() => void work.refetch()}
      testID="driver-run-detail"
    >
      {work.isPending ? (
        <LoadingBlock label="Đang đọc vòng chạy…" />
      ) : work.isError && !work.data ? (
        <ErrorBlock error={work.error} onRetry={() => void work.refetch()} />
      ) : legs.length === 0 ? (
        <EmptyBlock icon="map-marker-path" title="Vòng chạy này không còn mở." />
      ) : (
        <>
          <RunMap points={points} height={220} testID="run-map" />
          <Section title="Các chặng">
            <LegStrip cards={legs} entries={queue.entries} onOpen={() => router.back()} />
          </Section>
        </>
      )}
    </Screen>
  );
}
