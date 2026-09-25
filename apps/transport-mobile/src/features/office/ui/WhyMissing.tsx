import { StyleSheet, View } from 'react-native';
import { SPACE } from '../../../theme/tokens';
import { Text } from '../../../ui/Text';
import { Bullet, Collapsible } from './Blocks';

/**
 * "VÌ SAO THIẾU MỤC" — hai danh sach TACH ROI, khong bao gio gop thanh "khong co viec":
 *   · khach CHUA BAT nghiep vu (goi quan tri de bat);
 *   · nen tang CHUA THEO DOI DUOC (khong ai phai lam gi — chi can biet la khong co).
 * Khong co gi ca thi khong chiem cho.
 */
export function WhyMissing({
  disabledNotes,
  pendingNotes,
  testID = 'why-missing',
}: {
  readonly disabledNotes: readonly string[];
  readonly pendingNotes: readonly string[];
  readonly testID?: string;
}) {
  const total = disabledNotes.length + pendingNotes.length;
  if (total === 0) return null;
  return (
    <Collapsible
      title="Vì sao thiếu mục"
      summary={`${total} điều bảng chưa thể hiện — không có nghĩa là không có việc.`}
      testID={testID}
    >
      {disabledNotes.length > 0 ? (
        <View style={styles.group}>
          <Text variant="overline" tone="muted">
            Doanh nghiệp chưa bật
          </Text>
          {disabledNotes.map((note) => (
            <Bullet key={note}>{note}</Bullet>
          ))}
        </View>
      ) : null}
      {pendingNotes.length > 0 ? (
        <View style={styles.group}>
          <Text variant="overline" tone="muted">
            Hệ thống chưa theo dõi được
          </Text>
          {pendingNotes.map((note) => (
            <Bullet key={note}>{note}</Bullet>
          ))}
        </View>
      ) : null}
    </Collapsible>
  );
}

const styles = StyleSheet.create({
  group: { gap: SPACE.xs, marginTop: SPACE.sm },
});
