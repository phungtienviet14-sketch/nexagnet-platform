import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SPACE } from '../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { ChoiceRow } from '../../../ui/Choice';
import { Field } from '../../../ui/Field';
import { Notice } from '../../../ui/Notice';
import { Sheet } from '../../../ui/Sheet';
import { Text } from '../../../ui/Text';
import {
  RECEIPT_HANDOVER_NOTE,
  WAITING_OFFLINE_WARNING,
  WAITING_REASONS,
  WAITING_REASON_LABEL,
  WAITING_START_TRUTH,
} from '../labels';
import type { WaitingReason } from '../types';

/** GHI CHU kem mot moc — tuy chon, toi da 2000 ky tu (may chu cat o do). */
export function NoteSheet({
  visible,
  actionLabel,
  onClose,
  onSubmit,
}: {
  readonly visible: boolean;
  readonly actionLabel: string;
  readonly onClose: () => void;
  readonly onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`Ghi chú cho “${actionLabel}”`}
      subtitle="Không bắt buộc. Văn phòng đọc được ghi chú này cùng mốc."
      footer={
        <>
          <Button
            kind="primary"
            label="Ghi mốc kèm ghi chú"
            icon="check"
            onPress={() => {
              onSubmit(note);
              setNote('');
            }}
            testID="note-submit"
          />
          <Button kind="ghost" label="Huỷ" onPress={onClose} />
        </>
      }
    >
      <Field
        label="Ghi chú"
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={2000}
        placeholder="Ví dụ: cổng số 2, bảo vệ yêu cầu chờ"
        testID="note-input"
      />
    </Sheet>
  );
}

/**
 * BAT DAU CHO — chon LY DO (su that van hanh, khong phai muc gia) + ghi chu tuy chon.
 *
 * Noi that ve gio: may chu tinh gio bat dau LUC NO NHAN lenh. Ngoai tuyen thi canh bao ro: gui cang
 * muon, thoi gian cho duoc ghi cang ngan hon thuc te.
 */
export function WaitingSheet({
  visible,
  online,
  busy,
  onClose,
  onSubmit,
}: {
  readonly visible: boolean;
  readonly online: boolean;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (reason: WaitingReason, note: string) => void;
}) {
  const [reason, setReason] = useState<WaitingReason | null>(null);
  const [note, setNote] = useState('');
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Vì sao bạn phải chờ?"
      subtitle={WAITING_START_TRUTH}
      footer={
        <>
          <Button
            kind="primary"
            label="Bắt đầu chờ"
            icon="timer-sand"
            disabled={reason === null}
            loading={busy}
            onPress={() => {
              if (reason === null) return;
              onSubmit(reason, note);
              setReason(null);
              setNote('');
            }}
            testID="waiting-submit"
          />
          <Button kind="ghost" label="Huỷ" onPress={onClose} />
        </>
      }
    >
      {!online ? (
        <Notice
          tone="caution"
          icon="wifi-off"
          title="Đang ngoại tuyến"
          detail={WAITING_OFFLINE_WARNING}
        />
      ) : null}
      <View style={styles.list} accessibilityRole="radiogroup">
        {WAITING_REASONS.map((value) => (
          <ChoiceRow
            key={value}
            label={WAITING_REASON_LABEL[value]}
            selected={reason === value}
            onPress={() => setReason(value)}
            testID={`waiting-reason-${value}`}
          />
        ))}
      </View>
      <Field
        label="Ghi chú (không bắt buộc)"
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={2000}
        testID="waiting-note"
      />
    </Sheet>
  );
}

/** "TÔI ĐANG GIỮ BIÊN NHẬN" — ghi mot su that (to giay trong tay lai xe), khong phai mot anh chup. */
export function HandoverSheet({
  visible,
  busy,
  onClose,
  onConfirm,
}: {
  readonly visible: boolean;
  readonly busy: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Bạn đang giữ biên nhận?"
      subtitle={`Ghi nhận: “${RECEIPT_HANDOVER_NOTE}” đang ở trong tay bạn.`}
      footer={
        <>
          <Button
            kind="primary"
            label="Xác nhận đang giữ biên nhận"
            icon="file-sign"
            loading={busy}
            onPress={onConfirm}
            testID="handover-confirm"
          />
          <Button kind="ghost" label="Chưa, để sau" onPress={onClose} />
        </>
      }
    >
      <Text variant="body" tone="muted">
        Văn phòng sẽ ghi bước “đã nhận lại biên nhận” khi bạn nộp tờ giấy. Bước này chỉ báo tờ giấy
        đang ở chỗ bạn — không thay cho việc chụp ảnh biên nhận.
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  list: { gap: SPACE.sm },
});
