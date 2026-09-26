import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import {
  DestinationStep,
  DoneStep,
  LoadFailedStep,
  OfflineStep,
  ProposalStep,
  ReceivedStep,
} from '../../src/features/driver/components/IntakeSteps';
import { useDriverGates, useInvalidateDriver } from '../../src/features/driver/queries';
import { useSiteIntakeFlow } from '../../src/features/driver/use-site-intake';
import { Button } from '../../src/ui/Button';
import { Screen } from '../../src/ui/Screen';
import { EmptyBlock, LoadingBlock } from '../../src/ui/States';

/**
 * "NHẬN CHUYẾN" — man TOAN MAN HINH an khoi thanh tab (`#398`): lai xe duoc goi di lay hang, toi noi,
 * ung dung de nghi dia diem tu vi tri, lai xe bam "Nhận chuyến tại đây", roi chon diem giao (hoac
 * "Chưa biết"). KHONG co tab thu nam; lai xe vao day tu the tren man Viec.
 *
 * Route nam trong nhom TAB: tab khong go man khi roi di, nen man chi song khi DANG duoc nhin — moi lan
 * vao la mot lan doc vi tri + de nghi MOI (mot de nghi cu cua nua tieng truoc la sai cho). Tham so
 * `intakeId` (tu the "Chưa có điểm giao") mo thang buoc chon diem giao cua dung lan nhan chuyen do.
 */
export default function IntakeRoute() {
  const params = useLocalSearchParams<{ intakeId?: string }>();
  const intakeId =
    typeof params.intakeId === 'string' && params.intakeId !== '' ? params.intakeId : null;
  return useIsFocused() ? <IntakeScreen requestedIntakeId={intakeId} /> : null;
}

function IntakeScreen({ requestedIntakeId }: { readonly requestedIntakeId: string | null }) {
  const router = useRouter();
  // Tham so cua route trong TAB SONG qua lan roi man (dieu huong khong kem tham so giu tham so cu):
  // doc MOT lan luc vao roi xoa — lan bam "Nhận chuyến" sau khong duoc mo lai lan nhan chuyen cu.
  const [intakeId] = useState(requestedIntakeId);
  useEffect(() => {
    if (requestedIntakeId !== null) router.setParams({ intakeId: undefined });
  }, [requestedIntakeId, router]);
  const gates = useDriverGates();
  const invalidate = useInvalidateDriver();
  const flow = useSiteIntakeFlow(intakeId);
  const { state } = flow;

  // Ve man Viec: lui (bo man nay khoi lich su tab) neu den tu Viec, khong thi thay the thang toi tab
  // Viec. Doc lai MOI thu cua lai xe de man Viec hien ngay viec may chu vua tinh (moc, chung tu…).
  const back = () => (router.canGoBack() ? router.back() : router.replace('/(driver)'));
  const backToWork = () => {
    void invalidate();
    back();
  };
  const picking = state.step === 'PICK_DESTINATION';

  return (
    <Screen
      title="Nhận chuyến"
      trailing={
        state.step === 'DONE' || picking ? null : (
          <Button
            kind="ghost"
            size="compact"
            label="Quay lại"
            onPress={back}
            disabled={state.busy}
          />
        )
      }
      scroll={!picking}
      contentStyle={picking ? styles.fill : undefined}
      testID="site-intake-screen"
    >
      {!gates.siteIntake ? (
        <EmptyBlock
          icon="map-marker-off-outline"
          title="Doanh nghiệp chưa bật nhận chuyến tại địa điểm"
          detail="Việc văn phòng giao vẫn hiện ở màn Việc."
        />
      ) : state.step === 'LOCATING' ? (
        <LoadingBlock
          lines={3}
          label={
            intakeId ? 'Đang đọc chuyến vừa nhận…' : 'Đang lấy vị trí và tìm địa điểm quanh đây…'
          }
        />
      ) : state.step === 'OFFLINE' ? (
        <OfflineStep onRetry={() => void flow.locate()} onBack={back} />
      ) : state.step === 'LOAD_FAILED' ? (
        <LoadFailedStep
          message={state.loadFailure ?? ''}
          onRetry={() => void flow.locate()}
          onBack={back}
        />
      ) : state.step === 'PROPOSAL' ? (
        <ProposalStep
          flow={flow}
          canConfirm={gates.siteIntakeConfirm}
          onBack={back}
          onBackToWork={backToWork}
        />
      ) : state.step === 'RECEIVED' ? (
        <ReceivedStep flow={flow} canChoose={gates.siteIntakeConfirm} />
      ) : picking ? (
        <DestinationStep flow={flow} />
      ) : state.done ? (
        <DoneStep done={state.done} onBackToWork={backToWork} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
