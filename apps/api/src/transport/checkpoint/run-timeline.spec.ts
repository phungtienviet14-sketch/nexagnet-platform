import { describe, expect, it } from 'vitest';
import { buildRunTimeline, deriveLegPhase } from './run-timeline.js';
import type { RunCheckpoint, RunCheckpointType } from './checkpoint.types.js';

const at = (iso: string): Date => new Date(iso);

let seq = 0;
const checkpoint = (
  type: RunCheckpointType,
  receivedAt: string,
  overrides: Partial<RunCheckpoint> = {},
): RunCheckpoint => ({
  id: `cp_${String(++seq).padStart(3, '0')}`,
  type,
  runId: 'run_1',
  legId: 'leg_1',
  recordedBy: 'lx.binh',
  driverId: 'drv_1',
  observationId: null,
  clientEventId: `evt_${seq}`,
  capturedAt: null,
  receivedAt: at(receivedAt),
  businessDate: '2026-09-07',
  note: null,
  createdAt: at(receivedAt),
  ...overrides,
});

describe('giai doan suy ra cua mot chang', () => {
  it('chua co moc nao thi chang con o ke hoach', () => {
    expect(deriveLegPhase([])).toBe('PLANNED');
  });

  /**
   * BAI QUAN TRONG NHAT cua phep chieu. Moc la GHI THEM: mot chang da giao xong VAN con moc
   * `PICKUP_ARRIVAL` trong danh sach. Doc xuoi tu tren xuong se bao chang do dang o diem lay hang.
   */
  it('moc muon nhat thang, khong phai moc dau tien', () => {
    expect(
      deriveLegPhase([
        'PICKUP_ARRIVAL',
        'GATE_ENTRY',
        'LOADING',
        'PICKUP_DEPARTURE',
        'DELIVERY_ARRIVAL',
        'DELIVERY_ACCEPTED',
      ]),
    ).toBe('DELIVERED');
  });

  it('da roi diem lay hang, chua den noi giao thi la dang chay', () => {
    expect(deriveLegPhase(['PICKUP_ARRIVAL', 'LOADING', 'PICKUP_DEPARTURE'])).toBe('IN_TRANSIT');
  });

  it('da den noi giao, chua ai nhan thi la da den noi', () => {
    expect(deriveLegPhase(['PICKUP_ARRIVAL', 'PICKUP_DEPARTURE', 'DELIVERY_ARRIVAL'])).toBe(
      'ARRIVED',
    );
  });

  it('vao cong ma chua kip ghi moc den noi van tinh la dang o diem lay hang', () => {
    expect(deriveLegPhase(['GATE_ENTRY'])).toBe('AT_PICKUP');
  });
});

describe('dong thoi gian', () => {
  it('xep theo gio MAY CHU, khong theo gio may khach', () => {
    // Mot chiec dien thoai bao gio bat dau la 23:00 hom truoc. Gio do KHONG duoc keo moc len dau.
    const timeline = buildRunTimeline('run_1', [
      checkpoint('DELIVERY_ARRIVAL', '2026-09-07T14:05:00Z', { observationId: 'obs_9' }),
      checkpoint('PICKUP_ARRIVAL', '2026-09-07T08:15:00Z', {
        capturedAt: at('2026-09-06T23:00:00Z'),
      }),
    ]);
    expect(timeline.entries.map((entry) => entry.type)).toEqual([
      'PICKUP_ARRIVAL',
      'DELIVERY_ARRIVAL',
    ]);
  });

  it('hai moc cung mili giay van cho ra mot thu tu on dinh', () => {
    const same = '2026-09-07T14:05:00Z';
    const first = buildRunTimeline('run_1', [
      checkpoint('DELIVERY_ARRIVAL', same, { id: 'cp_b', observationId: 'obs_1' }),
      checkpoint('LOADING', same, { id: 'cp_a' }),
    ]);
    const second = buildRunTimeline('run_1', [
      checkpoint('LOADING', same, { id: 'cp_a' }),
      checkpoint('DELIVERY_ARRIVAL', same, { id: 'cp_b', observationId: 'obs_1' }),
    ]);
    expect(first.entries.map((entry) => entry.checkpointId)).toEqual(['cp_a', 'cp_b']);
    expect(second.entries.map((entry) => entry.checkpointId)).toEqual(['cp_a', 'cp_b']);
  });

  /** `#243` F6: canh bao thieu chung cu, KHONG bia ra mot lan hoan thanh. */
  it('den noi giao ma khong co ban dinh vi thi len canh bao, va moc VAN hien', () => {
    const timeline = buildRunTimeline('run_1', [
      checkpoint('DELIVERY_ARRIVAL', '2026-09-07T14:05:00Z', { observationId: null }),
    ]);
    expect(timeline.entries).toHaveLength(1);
    expect(timeline.entries[0]?.warnings).toEqual(['LOCATION_PROOF_MISSING']);
    expect(timeline.warningCount).toBe(1);
  });

  it('den noi giao co ban dinh vi thi khong canh bao', () => {
    const timeline = buildRunTimeline('run_1', [
      checkpoint('DELIVERY_ARRIVAL', '2026-09-07T14:05:00Z', { observationId: 'obs_1' }),
    ]);
    expect(timeline.entries[0]?.warnings).toEqual([]);
    expect(timeline.entries[0]?.hasLocationProof).toBe(true);
    expect(timeline.warningCount).toBe(0);
  });

  it('moc muc vong chay khong lam lech giai doan cua chang', () => {
    const timeline = buildRunTimeline('run_1', [
      checkpoint('ASSIGNED', '2026-09-07T07:10:00Z', { legId: null }),
      checkpoint('DEPARTED', '2026-09-07T07:32:00Z', { legId: null }),
      checkpoint('PICKUP_ARRIVAL', '2026-09-07T08:15:00Z'),
    ]);
    expect(timeline.legPhases).toEqual({ leg_1: 'AT_PICKUP' });
  });

  it('hai chang co giai doan rieng', () => {
    const timeline = buildRunTimeline('run_1', [
      checkpoint('PICKUP_ARRIVAL', '2026-09-07T08:15:00Z', { legId: 'leg_1' }),
      checkpoint('PICKUP_DEPARTURE', '2026-09-07T09:30:00Z', { legId: 'leg_1' }),
      checkpoint('PICKUP_ARRIVAL', '2026-09-07T10:00:00Z', { legId: 'leg_2' }),
    ]);
    expect(timeline.legPhases).toEqual({ leg_1: 'IN_TRANSIT', leg_2: 'AT_PICKUP' });
  });

  /** KHONG mot toa do nao ra khoi phep chieu — cung quy uoc voi `OperationalProofService`. */
  it('khong mot truong nao mang toa do', () => {
    const timeline = buildRunTimeline('run_1', [
      checkpoint('DELIVERY_ARRIVAL', '2026-09-07T14:05:00Z', { observationId: 'obs_1' }),
    ]);
    const serialised = JSON.stringify(timeline);
    expect(serialised).not.toMatch(/latitude|longitude/i);
  });
});
