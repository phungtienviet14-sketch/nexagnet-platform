import { describe, expect, it } from 'vitest';
import {
  composeHeadline,
  fleetStats,
  groupQueueBySeverity,
  pendingWorkNotes,
  phaseLabel,
  queueKindLabel,
  runningSummary,
  severityTone,
  topDecisions,
  unavailableSourceNotes,
  columnLabel,
} from './control-tower';
import type { FleetPresence, QueueItem } from './types';

const fleet = (over: Partial<FleetPresence> = {}): FleetPresence => ({
  total: 6,
  idle: 1,
  onTrip: 4,
  underMaintenance: 1,
  activeDrivers: 5,
  runningRuns: 5,
  ...over,
});

const item = (kind: string, severity: string, id = kind): QueueItem => ({
  kind,
  severity,
  subject: { kind: 'RUN', id, reference: null },
  detail: {},
});

describe('composeHeadline', () => {
  it('ghep tu queueTotal va fleet cua may chu, xe dang chay tren tong xe', () => {
    expect(composeHeadline({ queueTotal: 3, fleet: fleet() })).toBe(
      '3 việc cần quyết · 4/6 xe đang chạy',
    );
  });

  it('khong co viec thi noi ro, khong im lang', () => {
    expect(composeHeadline({ queueTotal: 0, fleet: fleet({ onTrip: 0 }) })).toBe(
      'Không có việc cần quyết · 0/6 xe đang chạy',
    );
  });

  it('doi chua co xe thi khong in 0/0', () => {
    expect(composeHeadline({ queueTotal: 1, fleet: fleet({ total: 0, onTrip: 0 }) })).toBe(
      '1 việc cần quyết · chưa có xe trong đội',
    );
  });

  it('dung queueTotal chu khong phai do dai danh sach da cat', () => {
    expect(composeHeadline({ queueTotal: 1200, fleet: fleet() })).toContain('1.200 việc');
  });
});

describe('runningSummary + fleetStats', () => {
  it('vong chay dang chay luon kem so XE', () => {
    expect(runningSummary(fleet({ runningRuns: 2, onTrip: 1 }))).toBe(
      'Vòng chạy đang chạy: 2 trên 1 xe.',
    );
    expect(runningSummary(fleet({ runningRuns: 0 }))).toBe('Không có vòng chạy nào đang chạy.');
  });

  it('nhan the so dung cua web, "Xe đang chạy" dem xe', () => {
    const stats = fleetStats(fleet());
    expect(stats.map((stat) => stat.label)).toEqual([
      'Xe trong đội',
      'Xe đang chạy',
      'Đang rảnh',
      'Đang sửa chữa',
      'Lái xe đang hoạt động',
    ]);
    expect(stats.find((stat) => stat.key === 'on-trip')?.value).toBe('4');
  });
});

describe('hang viec', () => {
  it('nhom theo muc, giu thu tu may chu trong nhom, muc la xuong cuoi', () => {
    const groups = groupQueueBySeverity([
      item('A', 'CRITICAL'),
      item('B', 'WARNING'),
      item('C', 'CRITICAL'),
      item('D', 'URGENT_NEW'),
      item('E', 'INFO'),
    ]);
    expect(groups.map((group) => group.severity)).toEqual([
      'CRITICAL',
      'WARNING',
      'INFO',
      'URGENT_NEW',
    ]);
    expect(groups[0]?.items.map((entry) => entry.kind)).toEqual(['A', 'C']);
    expect(groups[3]?.tone).toBe('neutral');
  });

  it('ba viec dau theo dung thu tu may chu', () => {
    const queue = [
      item('A', 'CRITICAL'),
      item('B', 'WARNING'),
      item('C', 'INFO'),
      item('D', 'INFO'),
    ];
    expect(topDecisions(queue).map((entry) => entry.kind)).toEqual(['A', 'B', 'C']);
  });

  it('ma la van hien, kem chinh ma', () => {
    expect(queueKindLabel('SOMETHING_NEW')).toContain('SOMETHING_NEW');
    expect(queueKindLabel('DELIVERY_PROOF_DOCUMENT_MISSING')).toContain('chứng từ giao hàng');
    expect(queueKindLabel('DRIVER_WAITING_ALLOWANCE_AWAITING_APPROVAL')).toBe(
      'Phụ cấp chờ của lái xe đang chờ duyệt',
    );
  });

  it('chi CRITICAL mau do', () => {
    expect(severityTone('CRITICAL')).toBe('danger');
    expect(severityTone('WARNING')).toBe('caution');
    expect(severityTone('INFO')).toBe('neutral');
  });
});

describe('vi sao thieu muc', () => {
  it('nguon khach tat va viec nen tang chua theo doi la hai cau khac nhau', () => {
    const disabled = unavailableSourceNotes(['FUEL', 'FIELD_OPERATIONS']);
    const pending = pendingWorkNotes([
      { kind: 'RECEIVER_WAITING_ABOVE_THRESHOLD', reason: 'AWAITING_WAITING_THRESHOLD_POLICY' },
    ]);
    expect(disabled[0]).toContain('chưa bật');
    expect(disabled[1]).toContain('Chờ người nhận');
    expect(pending[0]).toContain('ngưỡng');
    expect(pending[0]).not.toContain('chưa bật');
  });

  it('ly do la van hien ma', () => {
    expect(pendingWorkNotes([{ kind: 'X', reason: 'NEW_REASON' }])[0]).toContain('NEW_REASON');
  });
});

describe('nhan cot va giai doan', () => {
  it('IN_TRANSIT la "Trên đường", khong bao gio "Đang chạy"', () => {
    expect(columnLabel('IN_TRANSIT')).toBe('Trên đường');
    expect(phaseLabel('IN_TRANSIT')).toBe('Trên đường');
    expect(phaseLabel('IN_TRANSIT')).not.toContain('Đang chạy');
  });

  it('giai doan null la gach, khong doan', () => {
    expect(phaseLabel(null)).toBe('—');
  });
});
