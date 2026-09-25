import { randomUUID } from 'expo-crypto';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { userMessage } from '../../src/api/errors';
import { useBranding } from '../../src/branding/BrandingProvider';
import type { PickedFile } from '../../src/capture/pickers';
import { useCapture, type CaptureChoice } from '../../src/capture/use-capture';
import { CaptureChoiceSheet } from '../../src/features/driver/components/CaptureChoiceSheet';
import {
  digitsOnly,
  emptyFuelForm,
  fuelRunOptions,
  fuelSlipCommand,
  groupThousands,
  hasProblems,
  soleOptionId,
  toFuelSlipBody,
  validateFuelForm,
  type FuelForm,
  type FuelFormProblems,
  type FuelRunOption,
} from '../../src/features/driver/fuel-form';
import { FUEL_PAYMENT_METHOD_LABEL } from '../../src/features/driver/labels';
import {
  useDriverGates,
  useFuelRuns,
  useFuelStations,
  useFuelSuppliers,
} from '../../src/features/driver/queries';
import { FUEL_PAYMENT_METHODS, type DriverFuelSupplierView } from '../../src/features/driver/types';
import { persistAttachment } from '../../src/outbox/attachments';
import { useOutbox } from '../../src/outbox/OutboxProvider';
import { SPACE } from '../../src/theme/tokens';
import { Button } from '../../src/ui/Button';
import { ChoiceRow, Segmented } from '../../src/ui/Choice';
import { Field } from '../../src/ui/Field';
import { Notice } from '../../src/ui/Notice';
import { Screen } from '../../src/ui/Screen';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../src/ui/States';
import { Section } from '../../src/ui/Surface';
import { Text } from '../../src/ui/Text';

/**
 * GHI PHIEU DO DAU — luu TREN MAY truoc (hang doi), co song thi tu gui. Than phieu DONG BANG mot lan
 * (`toFuelSlipBody`), `correlationKey` = `clientEventId` nen bam doi hay gui lai sau loi mang van la
 * MOT phieu. Anh hoa don la tuy chon; neu co, hang doi tai len SAU khi phieu da co tren may chu.
 *
 * Tab KHONG go man khi roi di: phieu CHUA dong vao thi lam moi gio mac dinh moi lan quay lai; luu
 * xong thi bo phieu nhap (khoa moi) de phieu sau khong trung khoa phieu truoc.
 */
interface Draft {
  readonly form: FuelForm;
  readonly key: string;
  readonly photo: PickedFile | null;
  readonly touched: boolean;
  readonly attempted: boolean;
}

function freshDraft(): Draft {
  return {
    form: emptyFuelForm(new Date()),
    key: randomUUID(),
    photo: null,
    touched: false,
    attempted: false,
  };
}

const PHOTO_SOURCE: Readonly<Record<PickedFile['captureMode'], string>> = {
  LIVE_CAMERA: 'ảnh vừa chụp',
  GALLERY: 'từ thư viện',
  UNKNOWN: 'tệp đã chọn',
};

const PAYMENT_OPTIONS = FUEL_PAYMENT_METHODS.map((method) => ({
  value: method,
  label: FUEL_PAYMENT_METHOD_LABEL[method],
}));

export default function FuelNew() {
  const router = useRouter();
  const gates = useDriverGates();
  const { timeZone } = useBranding();
  const { enqueue } = useOutbox();
  const capture = useCapture();
  const runs = useFuelRuns(gates.fuelSubmit);
  const suppliers = useFuelSuppliers(gates.fuelSubmit);
  const [draft, setDraft] = useState(freshDraft);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setDraft((current) => (current.touched ? current : freshDraft()));
    }, []),
  );

  const runOptions = fuelRunOptions(runs.data ?? []);
  const supplierList = suppliers.data ?? [];
  const form: FuelForm = {
    ...draft.form,
    runId: draft.form.runId ?? soleOptionId(runOptions, (option) => option.runId),
    supplierId: draft.form.supplierId || (soleOptionId(supplierList, (item) => item.id) ?? ''),
  };
  const stations = useFuelStations(form.supplierId);
  const selectedRun = runOptions.find((option) => option.runId === form.runId) ?? null;
  const problems: FuelFormProblems = draft.attempted ? validateFuelForm(form, new Date()) : {};

  const leave = () => (router.canGoBack() ? router.back() : router.replace('/(driver)/fuel'));
  const edit = (patch: Partial<FuelForm>) =>
    setDraft((current) => ({ ...current, touched: true, form: { ...current.form, ...patch } }));

  async function choose(choice: CaptureChoice) {
    setSheetOpen(false);
    setCapturing(true);
    setFailure(null);
    try {
      const outcome = await capture(choice);
      if (outcome.kind === 'OK') {
        setDraft((current) => ({ ...current, touched: true, photo: outcome.file }));
      } else if (outcome.kind !== 'CANCELLED') setFailure(outcome.message);
    } finally {
      setCapturing(false);
    }
  }

  async function save() {
    const now = new Date();
    if (hasProblems(validateFuelForm(form, now))) {
      setDraft((current) => ({ ...current, attempted: true }));
      return;
    }
    setSaving(true);
    setFailure(null);
    try {
      const body = toFuelSlipBody({ form, correlationKey: draft.key, timeZone, now });
      const photo = draft.photo;
      const attachments = photo
        ? [await persistAttachment(photo.uri, photo.contentType, photo.captureMode)]
        : null;
      await enqueue(
        fuelSlipCommand(body),
        attachments ? { clientEventId: draft.key, attachments } : { clientEventId: draft.key },
      );
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setDraft(freshDraft());
      leave();
    } catch (error) {
      setFailure(`Chưa lưu được phiếu trên máy: ${userMessage(error)}`);
    } finally {
      setSaving(false);
    }
  }

  const close = <Button kind="ghost" size="compact" label="Đóng" onPress={leave} />;

  if (!gates.fuelSubmit) {
    return (
      <Screen title="Ghi phiếu đổ dầu" trailing={close} testID="fuel-form">
        <EmptyBlock
          icon="gas-station-outline"
          title="Tài khoản chưa ghi được phiếu đổ dầu"
          detail="Doanh nghiệp chưa bật nhiên liệu, hoặc tài khoản chưa có quyền ghi."
        />
      </Screen>
    );
  }

  return (
    <Screen
      title="Ghi phiếu đổ dầu"
      eyebrow="Lưu trên máy trước — có sóng sẽ tự gửi"
      trailing={close}
      testID="fuel-form"
    >
      <Section title="Vòng xe">
        <RunChoices
          query={runs}
          options={runOptions}
          selected={selectedRun}
          legId={form.legId}
          problem={problems.context}
          onRun={(runId) => edit({ runId, legId: null })}
          onLeg={(runId, legId) => edit({ runId, legId })}
        />
      </Section>

      <Section title="Cây xăng">
        {suppliers.isPending ? <LoadingBlock lines={2} label="Đang đọc cây xăng…" /> : null}
        {suppliers.isError ? (
          <ErrorBlock error={suppliers.error} onRetry={() => void suppliers.refetch()} />
        ) : null}
        {suppliers.data && supplierList.length === 0 ? (
          <Notice
            tone="caution"
            icon="gas-station-outline"
            title="Chưa có cây xăng nào được khai"
            detail="Báo văn phòng thêm cây xăng rồi ghi phiếu."
          />
        ) : null}
        {supplierList.map((supplier: DriverFuelSupplierView) => (
          <ChoiceRow
            key={supplier.id}
            label={supplier.name}
            selected={form.supplierId === supplier.id}
            onPress={() => edit({ supplierId: supplier.id, stationId: '' })}
            testID={`fuel-supplier-${supplier.id}`}
          />
        ))}
        {problems.supplier ? (
          <Text variant="caption" tone="danger">
            {problems.supplier}
          </Text>
        ) : null}
        {form.supplierId !== '' && (stations.data?.length ?? 0) > 0 ? (
          <View style={styles.sub}>
            <Text variant="label" tone="muted">
              Trạm (không bắt buộc)
            </Text>
            <ChoiceRow
              label="Không khai trạm"
              selected={form.stationId === ''}
              onPress={() => edit({ stationId: '' })}
            />
            {(stations.data ?? []).map((station) => (
              <ChoiceRow
                key={station.id}
                label={station.name}
                detail={station.address}
                selected={form.stationId === station.id}
                onPress={() => edit({ stationId: station.id })}
              />
            ))}
          </View>
        ) : null}
      </Section>

      <Section title="Số liệu trên hoá đơn">
        <Field
          label="Số lít"
          value={form.liters}
          onChangeText={(liters) => edit({ liters })}
          keyboardType="decimal-pad"
          suffix="lít"
          error={problems.liters}
          testID="fuel-liters"
        />
        <Field
          label="Số tiền"
          value={groupThousands(form.amountDigits)}
          onChangeText={(text) => edit({ amountDigits: digitsOnly(text) })}
          keyboardType="number-pad"
          suffix="₫"
          error={problems.amount}
          testID="fuel-amount"
        />
        <Field
          label="Số km trên đồng hồ"
          value={form.odometerKm}
          onChangeText={(odometerKm) => edit({ odometerKm: digitsOnly(odometerKm) })}
          keyboardType="number-pad"
          suffix="km"
          error={problems.odometer}
          testID="fuel-odometer"
        />
      </Section>

      <Section title="Ai trả tiền">
        <Segmented
          options={PAYMENT_OPTIONS}
          value={form.paymentMethod}
          onChange={(paymentMethod) => edit({ paymentMethod })}
          testID="fuel-payment"
        />
      </Section>

      <Section title="Thời điểm đổ">
        <View style={styles.row}>
          <View style={styles.flex}>
            <Field
              label="Ngày"
              value={form.dateText}
              onChangeText={(dateText) => edit({ dateText })}
              hint="dd/mm/yyyy"
            />
          </View>
          <View style={styles.flex}>
            <Field
              label="Giờ"
              value={form.timeText}
              onChangeText={(timeText) => edit({ timeText })}
              hint="HH:mm"
            />
          </View>
        </View>
        {problems.occurredAt ? (
          <Text variant="caption" tone="danger">
            {problems.occurredAt}
          </Text>
        ) : (
          <Text variant="caption" tone="faint">
            Mặc định là lúc mở phiếu. Đổ lúc khác thì sửa lại cho đúng.
          </Text>
        )}
      </Section>

      <Section title="Hoá đơn">
        <Field
          label="Số hoá đơn (không bắt buộc)"
          value={form.invoiceNo}
          onChangeText={(invoiceNo) => edit({ invoiceNo })}
          autoCapitalize="characters"
        />
        {draft.photo ? (
          <Notice
            tone="live"
            icon="image-check-outline"
            title={`Đã có ảnh hoá đơn (${PHOTO_SOURCE[draft.photo.captureMode]})`}
            detail="Ảnh gửi kèm sau khi phiếu lên hệ thống."
            testID="fuel-photo-ready"
          />
        ) : null}
        <View style={styles.row}>
          <Button
            kind="secondary"
            label={draft.photo ? 'Đổi ảnh' : 'Chụp ảnh hoá đơn'}
            icon="camera-outline"
            loading={capturing}
            onPress={() => setSheetOpen(true)}
            style={styles.flex}
            testID="fuel-photo"
          />
          {draft.photo ? (
            <Button
              kind="ghost"
              label="Bỏ ảnh"
              onPress={() => setDraft((current) => ({ ...current, photo: null }))}
            />
          ) : null}
        </View>
      </Section>

      {failure ? <Notice tone="danger" icon="alert-circle-outline" title={failure} /> : null}
      {draft.attempted && hasProblems(problems) ? (
        <Notice
          tone="caution"
          icon="form-textbox"
          title="Phiếu còn thiếu"
          detail="Xem các dòng báo đỏ ở trên."
        />
      ) : null}
      <Button
        kind="signal"
        size="hero"
        label="Lưu phiếu"
        icon="content-save-outline"
        loading={saving}
        disabled={capturing}
        onPress={() => void save()}
        testID="fuel-submit"
      />

      <CaptureChoiceSheet
        visible={sheetOpen}
        title="Ảnh hoá đơn đổ dầu"
        hint="Chụp rõ số lít, số tiền và tên cây xăng."
        busy={capturing}
        failure={null}
        onClose={() => setSheetOpen(false)}
        onChoose={(choice) => void choose(choice)}
      />
    </Screen>
  );
}

function RunChoices({
  query,
  options,
  selected,
  legId,
  problem,
  onRun,
  onLeg,
}: {
  readonly query: ReturnType<typeof useFuelRuns>;
  readonly options: readonly FuelRunOption[];
  readonly selected: FuelRunOption | null;
  readonly legId: string | null;
  readonly problem: string | undefined;
  readonly onRun: (runId: string) => void;
  readonly onLeg: (runId: string, legId: string | null) => void;
}) {
  if (query.isPending) return <LoadingBlock lines={2} label="Đang đọc vòng xe…" />;
  if (query.isError) {
    return <ErrorBlock error={query.error} onRetry={() => void query.refetch()} />;
  }
  if (options.length === 0) {
    return (
      <Notice
        tone="caution"
        icon="truck-outline"
        title="Chưa có vòng xe nào để ghi phiếu"
        detail="Phiếu đổ dầu gắn với vòng xe đang chạy — báo điều hành."
      />
    );
  }
  return (
    <>
      {options.map((option) => (
        <ChoiceRow
          key={option.runId}
          label={option.label}
          detail={option.vehicleLabel}
          selected={selected?.runId === option.runId}
          onPress={() => onRun(option.runId)}
          testID={`fuel-run-${option.runId}`}
        />
      ))}
      {problem ? (
        <Text variant="caption" tone="danger">
          {/* Cau chung cua bo kiem ("chua co viec duoc dieu") sai khi DA co vong xe ma chua chon. */}
          Chọn vòng xe.
        </Text>
      ) : null}
      {selected && selected.legs.length > 0 ? (
        <View style={styles.sub}>
          <Text variant="label" tone="muted">
            Chặng (không bắt buộc)
          </Text>
          <ChoiceRow
            label="Không gắn chặng"
            selected={legId === null}
            onPress={() => onLeg(selected.runId, null)}
          />
          {selected.legs.map((leg) => (
            <ChoiceRow
              key={leg.legId}
              label={leg.label}
              selected={legId === leg.legId}
              onPress={() => onLeg(selected.runId, leg.legId)}
            />
          ))}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: SPACE.sm, alignItems: 'flex-start' },
  flex: { flex: 1 },
  sub: { gap: SPACE.sm, marginTop: SPACE.sm },
});
