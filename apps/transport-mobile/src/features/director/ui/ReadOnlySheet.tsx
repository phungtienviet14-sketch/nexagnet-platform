import { StyleSheet, View } from 'react-native';
import { SPACE } from '../../../theme/tokens';
import { Sheet } from '../../../ui/Sheet';
import { KeyValue, Pill } from '../../../ui/Surface';
import { Text } from '../../../ui/Text';
import { queueKindLabel, SEVERITY_LABEL, severityTone } from '../../office/control-tower';
import type { QueueItem } from '../../office/types';
import { Notice } from '../../office/ui/Blocks';
import { queueDetailLines } from '../inbox';

/**
 * VIEC KHONG LAM TREN DIEN THOAI (nhien lieu, giay to, bao duong, thieu km, chung tu...) — xem duoc,
 * khong gia vo sua duoc. Noi thang cho lam: may tinh.
 */
export function ReadOnlySheet({
  item,
  onClose,
}: {
  readonly item: QueueItem | null;
  readonly onClose: () => void;
}) {
  const lines = item ? queueDetailLines(item) : [];
  return (
    <Sheet
      visible={item !== null}
      onClose={onClose}
      title={item ? queueKindLabel(item.kind) : ''}
      subtitle={item?.subject.reference ?? undefined}
    >
      {item ? (
        <View style={styles.body} testID="director-readonly-detail">
          <Pill
            label={SEVERITY_LABEL[item.severity] ?? item.severity}
            tone={severityTone(item.severity)}
          />
          {lines.map((line) => (
            <KeyValue key={line.key} label={line.label} value={line.value} />
          ))}
          {lines.length === 0 ? (
            <Text variant="caption" tone="faint">
              Máy chủ không kèm chi tiết đọc được cho việc này.
            </Text>
          ) : null}
          <Notice
            tone="neutral"
            icon="monitor"
            title="Xử lý trên máy tính"
            detail="Việc này cần bảng biểu hoặc chứng từ đầy đủ — mở trang quản trị trên máy tính để xử lý."
            testID="director-desktop-only"
          />
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: SPACE.sm },
});
