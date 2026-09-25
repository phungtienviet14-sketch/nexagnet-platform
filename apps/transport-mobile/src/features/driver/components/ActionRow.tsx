import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { isAlreadyDone, reasonText } from '../../../i18n/reasons';
import { SPACE } from '../../../theme/tokens';
import { Button } from '../../../ui/Button';
import { Icon } from '../../../ui/Icon';
import { Pill } from '../../../ui/Surface';
import { Text } from '../../../ui/Text';
import type { LocalActionState } from '../pending-actions';
import type { DriverFieldAction } from '../types';

/**
 * MOT NUT PHU cua chang dang lam, kem TRANG THAI TREN MAY cua chinh no.
 *
 * Da xep hang -> khong con la nut: mot dong "Đã lưu trên máy — chờ gửi", de khong ai bam lan hai.
 * Bi may chu tu choi -> ly do bang tieng Viet + loi vao "Việc trên máy" de quyet gui lai hay bo.
 */
export function ActionRow({
  action,
  local,
  disabled,
  onPress,
  testID,
}: {
  readonly action: DriverFieldAction;
  readonly local: LocalActionState | null;
  readonly disabled: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  if (local?.kind === 'QUEUED') {
    return (
      <View style={styles.status} testID={`${testID}-queued`}>
        <Pill label="Đã lưu trên máy — chờ gửi" tone="pending" icon="cloud-upload-outline" />
        <Text variant="bodyStrong">{action.label}</Text>
      </View>
    );
  }
  if (local?.kind === 'BLOCKED')
    return <BlockedRow action={action} local={local} testID={testID} />;
  return (
    <Button
      kind="secondary"
      label={action.requiresLocation ? `${action.label} (cần vị trí)` : action.label}
      icon={iconFor(action)}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
    />
  );
}

function BlockedRow({
  action,
  local,
  testID,
}: {
  readonly action: DriverFieldAction;
  readonly local: LocalActionState;
  readonly testID: string;
}) {
  const router = useRouter();
  const done = isAlreadyDone(local.entry.lastError);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${action.label}: ${reasonText(local.entry.lastError)}. Mở việc trên máy.`}
      onPress={() => router.push('/sync')}
      testID={`${testID}-blocked`}
      style={styles.status}
    >
      <Pill
        label={done ? 'Đã có trên hệ thống' : 'Máy chủ không nhận'}
        tone={done ? 'neutral' : 'danger'}
        icon={done ? 'check' : 'alert-octagon-outline'}
      />
      <Text variant="bodyStrong">{action.label}</Text>
      <View style={styles.row}>
        <Text variant="caption" tone={done ? 'muted' : 'danger'} style={styles.flex}>
          {reasonText(local.entry.lastError)}
        </Text>
        <Icon name="chevron-right" tone="muted" />
      </View>
    </Pressable>
  );
}

export function iconFor(action: DriverFieldAction) {
  switch (action.kind) {
    case 'CHECKPOINT':
      return action.requiresLocation ? ('map-marker-check' as const) : ('flag-checkered' as const);
    case 'WAITING_START':
      return 'timer-sand' as const;
    case 'DOCUMENT':
      return 'camera-document' as const;
    case 'RECEIPT_HANDOVER':
      return 'file-sign' as const;
  }
}

const styles = StyleSheet.create({
  status: { gap: SPACE.xs, paddingVertical: SPACE.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  flex: { flex: 1 },
});
