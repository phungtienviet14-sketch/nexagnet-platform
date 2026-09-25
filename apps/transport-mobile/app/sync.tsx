import type { OutboxItem } from '@netviet/driver-outbox';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { formatClock } from '../src/format';
import { isAlreadyDone, reasonText } from '../src/i18n/reasons';
import { useOutbox } from '../src/outbox/OutboxProvider';
import type { SentEntry } from '../src/outbox/sqlite-outbox-store';
import { SPACE } from '../src/theme/tokens';
import { Button } from '../src/ui/Button';
import { Screen } from '../src/ui/Screen';
import { EmptyBlock } from '../src/ui/States';
import { Card, Pill, Section } from '../src/ui/Surface';
import { Text } from '../src/ui/Text';

/**
 * TRUNG TAM DONG BO — tra loi "viec toi bam da len chua?" bang TUNG VIEC, khong bang mot den.
 *
 * Ba nhom, dung thu tu can chu y: KHONG gui duoc (can nguoi quyet) · DANG CHO (tu gui) · DA GUI
 * (so nho de yen tam). Diem vi tri nen gop thanh mot dong — hang tram diem khong giup ai.
 */
function titleOf(item: {
  readonly kind: string;
  readonly payload: Readonly<Record<string, unknown>>;
}): string {
  const label = item.payload.label;
  if (typeof label === 'string' && label.trim() !== '') return label;
  return item.kind === 'OBSERVATION' ? 'Điểm vị trí nền' : 'Việc hiện trường';
}

export default function SyncCenter() {
  const outbox = useOutbox();
  const router = useRouter();
  const [pending, setPending] = useState<readonly OutboxItem[]>([]);
  const [blocked, setBlocked] = useState<readonly OutboxItem[]>([]);
  const [sent, setSent] = useState<readonly SentEntry[]>([]);

  const { listPending, listBlocked, listSent, revision } = outbox;
  const reload = useCallback(async () => {
    const [p, b, s] = await Promise.all([listPending(), listBlocked(), listSent()]);
    setPending(p);
    setBlocked(b);
    setSent(s);
  }, [listPending, listBlocked, listSent]);

  useEffect(() => {
    void reload();
  }, [reload, revision]);

  const proofs = pending.filter((item) => item.kind === 'PROOF');
  const points = pending.filter((item) => item.kind === 'OBSERVATION');

  function confirmDiscard(item: OutboxItem) {
    Alert.alert(
      'Bỏ việc này?',
      'Việc sẽ bị xoá khỏi máy và KHÔNG được gửi lên hệ thống. Chỉ bỏ khi bạn chắc văn phòng không cần nó.',
      [
        { text: 'Giữ lại', style: 'cancel' },
        { text: 'Bỏ', style: 'destructive', onPress: () => void outbox.discard(item.id) },
      ],
    );
  }

  return (
    <Screen
      eyebrow={outbox.online ? 'Đang có kết nối' : 'Đang ngoại tuyến'}
      title="Việc trên máy"
      trailing={<Button kind="ghost" size="compact" label="Đóng" onPress={() => router.back()} />}
      refreshing={outbox.running}
      onRefresh={() => void outbox.syncNow()}
    >
      <Button
        kind="primary"
        label={outbox.running ? 'Đang gửi…' : 'Gửi ngay'}
        icon="cloud-upload"
        loading={outbox.running}
        onPress={() => void outbox.syncNow()}
        testID="sync-now"
      />
      {outbox.paused ? (
        <Card rail="caution">
          <Text variant="bodyStrong">Phiên đăng nhập đã hết hạn</Text>
          <Text variant="caption" tone="muted">
            Việc vẫn nằm trên máy. Đăng nhập lại (cùng tài khoản) để gửi tiếp.
          </Text>
        </Card>
      ) : null}

      <Section title={`Không gửi được · ${blocked.length}`}>
        {blocked.length === 0 ? (
          <Text variant="caption" tone="faint">
            Không có việc nào bị máy chủ từ chối.
          </Text>
        ) : (
          blocked.map((item) => {
            const done = isAlreadyDone(item.lastError);
            return (
              <Card
                key={item.id}
                rail={done ? 'neutral' : 'danger'}
                testID={`blocked-${item.clientEventId}`}
              >
                <View style={styles.row}>
                  <Text variant="bodyStrong" style={styles.flex}>
                    {titleOf(item)}
                  </Text>
                  <Text variant="caption" tone="faint">
                    {formatClock(item.capturedAt)}
                  </Text>
                </View>
                <Text variant="caption" tone={done ? 'muted' : 'danger'}>
                  {reasonText(item.lastError)}
                </Text>
                <View style={styles.actions}>
                  {done ? null : (
                    <Button
                      kind="secondary"
                      size="compact"
                      label="Gửi lại"
                      icon="refresh"
                      onPress={() => void outbox.requeue(item.id)}
                    />
                  )}
                  <Button
                    kind="ghost"
                    size="compact"
                    label={done ? 'Đã hiểu, bỏ' : 'Bỏ việc này'}
                    onPress={() => confirmDiscard(item)}
                  />
                </View>
              </Card>
            );
          })
        )}
      </Section>

      <Section title={`Đang chờ gửi · ${proofs.length + points.length}`}>
        {proofs.length === 0 && points.length === 0 ? (
          <EmptyBlock icon="cloud-check-outline" title="Mọi việc đã lên hệ thống" />
        ) : null}
        {proofs.map((item) => (
          <Card key={item.id} rail="pending">
            <View style={styles.row}>
              <Text variant="bodyStrong" style={styles.flex}>
                {titleOf(item)}
              </Text>
              <Pill label={item.attempts > 0 ? `Thử ${item.attempts} lần` : 'Chờ'} tone="pending" />
            </View>
            <Text variant="caption" tone="muted">
              Bấm lúc {formatClock(item.capturedAt)}
              {item.lastError ? ` · ${reasonText(item.lastError)}` : ''}
            </Text>
          </Card>
        ))}
        {points.length > 0 ? (
          <Card rail="pending">
            <Text variant="bodyStrong">{points.length} điểm vị trí nền</Text>
            <Text variant="caption" tone="muted">
              Từ {formatClock(points[0]?.capturedAt)} đến {formatClock(points.at(-1)?.capturedAt)} —
              giữ đúng giờ ghi, gửi theo lô.
            </Text>
          </Card>
        ) : null}
      </Section>

      <Section title="Đã gửi gần đây">
        {sent
          .filter((entry) => entry.kind === 'PROOF')
          .slice(0, 20)
          .map((entry) => (
            <View key={entry.id} style={styles.sentRow}>
              <Text variant="label" style={styles.flex}>
                {titleOf(entry)}
              </Text>
              <Text variant="caption" tone="live">
                lên lúc {formatClock(entry.sentAt)}
              </Text>
            </View>
          ))}
        {sent.length === 0 ? (
          <Text variant="caption" tone="faint">
            Chưa có việc nào được gửi từ máy này.
          </Text>
        ) : null}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.sm, flexWrap: 'wrap' },
  sentRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingVertical: SPACE.xs },
});
