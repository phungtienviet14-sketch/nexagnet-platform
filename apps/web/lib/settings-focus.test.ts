import { describe, expect, it } from 'vitest';
import {
  canCancelCampaign,
  groupJobKind,
  leadingOverviewWork,
  rankOverviewWork,
  readinessCheckSection,
  resolveCampaignAction,
  resolveChannelFocus,
  resolveComposeStep,
  resolveGroupJob,
  resolvePolicyFocus,
  resolveReadinessFocus,
  resolveZaloJob,
  summarizeAuditFilters,
  userActionRisk,
} from './settings-focus';
import type { OverviewCard } from './settings-overview';
import type { ReadinessCheckView, RuleConfigVersion, SettingsGroupSummary } from './settings';

function card(partial: Partial<OverviewCard> & Pick<OverviewCard, 'key' | 'status'>): OverviewCard {
  return {
    title: partial.key,
    detail: 'chi tiết',
    ...partial,
  } as OverviewCard;
}

function group(partial: Partial<SettingsGroupSummary>): SettingsGroupSummary {
  return {
    id: 'g',
    groupId: 'g',
    zcaChatId: 'chat-g',
    name: 'Nhóm G',
    status: 'mapped',
    allowed: true,
    memberCount: 1,
    activeParticipants: 1,
    inactiveParticipants: 0,
    ...partial,
  } as SettingsGroupSummary;
}

function rule(partial: Partial<RuleConfigVersion>): RuleConfigVersion {
  return {
    id: 'r1',
    version: '1',
    status: 'draft',
    createdAt: '2026-09-01T00:00:00.000Z',
    payload: {},
    provisionalKeys: [],
    provisionalVerified: true,
    ...partial,
  } as RuleConfigVersion;
}

function check(partial: Partial<ReadinessCheckView>): ReadinessCheckView {
  return {
    key: 'k',
    label: 'Điều kiện',
    status: 'ready',
    blocking: true,
    detail: 'ok',
    ...partial,
  } as ReadinessCheckView;
}

describe('rankOverviewWork', () => {
  it('đưa việc đang chặn lên trước việc chỉ cần hoàn thiện', () => {
    const ranked = rankOverviewWork([
      card({ key: 'attention', status: 'attention' }),
      card({ key: 'blocked', status: 'blocked' }),
      card({ key: 'ok', status: 'ok' }),
      card({ key: 'off', status: 'off' }),
    ]);

    expect(ranked.map((entry) => entry.key)).toEqual(['blocked', 'attention', 'off', 'ok']);
  });

  it('cùng mức chặn thì việc có nút đi tiếp được xếp trước', () => {
    const withAction = card({
      key: 'co-nut',
      status: 'blocked',
      action: { label: 'Sửa', section: 'products-pricing' },
    });
    const ranked = rankOverviewWork([card({ key: 'khong-nut', status: 'blocked' }), withAction]);

    expect(ranked[0]?.key).toBe('co-nut');
  });

  it('không sửa mảng gốc', () => {
    const input = [card({ key: 'a', status: 'ok' }), card({ key: 'b', status: 'blocked' })];
    rankOverviewWork(input);
    expect(input.map((entry) => entry.key)).toEqual(['a', 'b']);
  });
});

describe('leadingOverviewWork', () => {
  it('chọn việc chặn nặng nhất mà bấm vào làm được', () => {
    const leading = leadingOverviewWork([
      card({ key: 'chan-khong-nut', status: 'blocked' }),
      card({
        key: 'chan-co-nut',
        status: 'blocked',
        action: { label: 'Sửa', section: 'products-pricing' },
      }),
    ]);

    expect(leading?.key).toBe('chan-co-nut');
  });

  it('không có việc nào bấm được thì vẫn trả về việc nặng nhất', () => {
    const leading = leadingOverviewWork([card({ key: 'chi-mot', status: 'attention' })]);
    expect(leading?.key).toBe('chi-mot');
  });

  it('không còn việc nào thì không có khối nổi bật', () => {
    expect(leadingOverviewWork([])).toBeUndefined();
  });
});

describe('resolveGroupJob', () => {
  it('nhóm chưa gán đại lý là việc chặn, đứng trước mọi việc khác', () => {
    const job = resolveGroupJob([
      group({ id: 'a', zcaChatId: 'chat-a', status: 'mapped', lastSyncedAt: undefined }),
      group({ id: 'b', zcaChatId: 'chat-b', name: 'Nhóm B', status: 'pending' }),
    ]);

    expect(groupJobKind(job)).toBe('map-group');
    expect(job.tone).toBe('blocked');
    expect(job.subject?.zcaChatId).toBe('chat-b');
  });

  it('đã gán hết thì việc tiếp theo là đồng bộ nhóm chưa từng đồng bộ', () => {
    const job = resolveGroupJob([
      group({ id: 'a', zcaChatId: 'chat-a', lastSyncedAt: '2026-09-01T00:00:00.000Z' }),
      group({ id: 'b', zcaChatId: 'chat-b', name: 'Nhóm B', lastSyncedAt: undefined }),
    ]);

    expect(groupJobKind(job)).toBe('sync-members');
    expect(job.subject?.zcaChatId).toBe('chat-b');
  });

  it('nhóm đã gỡ và nhóm không được phép không bao giờ là việc đang làm', () => {
    const job = resolveGroupJob([
      group({ id: 'a', zcaChatId: 'chat-a', lastSyncedAt: '2026-09-01T00:00:00.000Z' }),
      group({ id: 'x', zcaChatId: 'chat-x', status: 'ignored' }),
      group({ id: 'y', zcaChatId: 'chat-y', status: 'pending', allowed: false }),
    ]);

    expect(groupJobKind(job)).toBe('settled');
    expect(job.subject).toBeNull();
  });
});

describe('resolvePolicyFocus', () => {
  it('đang soạn thì nút chính là lưu bản nháp', () => {
    const focus = resolvePolicyFocus({ editing: true, previewed: false });
    expect(focus.step).toBe('draft');
    expect(focus.primaryLabel).toBe('Lưu thành bản nháp');
    expect(focus.blockedReason).toBeUndefined();
  });

  it('đã chạy thử thì vào bước xem lại và nút chính là kích hoạt', () => {
    const focus = resolvePolicyFocus({
      editing: false,
      previewed: true,
      selected: rule({ version: '2' }),
    });
    expect(focus.step).toBe('review');
    expect(focus.primaryLabel).toBe('Kích hoạt bản 2');
    expect(focus.blockedReason).toBeUndefined();
  });

  it('còn khoản chưa chốt thì nút kích hoạt bị khoá kèm lý do — không nới cổng provisional', () => {
    const focus = resolvePolicyFocus({
      editing: false,
      previewed: true,
      selected: rule({ provisionalKeys: ['A3.shipping'], provisionalVerified: false }),
    });
    expect(focus.tone).toBe('blocked');
    expect(focus.blockedReason).toContain('chưa có nguồn chính thức');
  });

  it('bản đang áp dụng thì việc tiếp theo là tạo bản nháp mới', () => {
    const focus = resolvePolicyFocus({
      editing: false,
      previewed: false,
      selected: rule({ status: 'active' }),
    });
    expect(focus.step).toBe('summary');
    expect(focus.primaryLabel).toBe('Tạo bản nháp mới');
  });
});

describe('resolveCampaignAction', () => {
  it('mỗi trạng thái chỉ lộ ra đúng một hành động', () => {
    expect(resolveCampaignAction('draft')?.kind).toBe('approve');
    expect(resolveCampaignAction('approved')?.kind).toBe('schedule');
    expect(resolveCampaignAction('partially_failed')?.kind).toBe('retry');
    expect(resolveCampaignAction('scheduled')?.kind).toBe('watch');
    expect(resolveCampaignAction('completed')).toBeNull();
    expect(resolveCampaignAction('cancelled')).toBeNull();
  });

  it('chỉ chiến dịch chưa kết thúc mới huỷ được', () => {
    expect(canCancelCampaign('draft')).toBe(true);
    expect(canCancelCampaign('running')).toBe(true);
    expect(canCancelCampaign('completed')).toBe(false);
    expect(canCancelCampaign('cancelled')).toBe(false);
  });
});

describe('resolveComposeStep', () => {
  it('thiếu tên hoặc nội dung thì vẫn ở bước soạn', () => {
    expect(resolveComposeStep({ name: '', content: 'x', targetCount: 2, reviewed: true })).toBe(
      'compose',
    );
    expect(resolveComposeStep({ name: '  ', content: 'x', targetCount: 2, reviewed: true })).toBe(
      'compose',
    );
  });

  it('có nội dung nhưng chưa chọn nhóm thì sang bước chọn nhóm', () => {
    expect(resolveComposeStep({ name: 'A', content: 'B', targetCount: 0, reviewed: true })).toBe(
      'targets',
    );
  });

  it('chỉ vào bước xem lại khi người dùng đã bấm xem lại', () => {
    expect(resolveComposeStep({ name: 'A', content: 'B', targetCount: 1, reviewed: false })).toBe(
      'targets',
    );
    expect(resolveComposeStep({ name: 'A', content: 'B', targetCount: 1, reviewed: true })).toBe(
      'review',
    );
  });
});

describe('resolveChannelFocus', () => {
  it('còn thay đổi chưa lưu thì gửi thử bị khoá và nút chính là lưu', () => {
    const focus = resolveChannelFocus({ channel: 'email', dirty: true, connected: true });
    expect(focus.canTest).toBe(false);
    expect(focus.primaryLabel).toBe('Lưu cấu hình Email');
    expect(focus.testBlockedReason).toBe('Còn thay đổi chưa lưu.');
  });

  it('Zalo chưa kết nối thì không cho gửi thử dù đã lưu', () => {
    const focus = resolveChannelFocus({ channel: 'zalo', dirty: false, connected: false });
    expect(focus.canTest).toBe(false);
    expect(focus.tone).toBe('blocked');
  });

  it('đã lưu và kênh sẵn sàng thì việc tiếp theo là gửi thử', () => {
    const focus = resolveChannelFocus({ channel: 'zalo', dirty: false, connected: true });
    expect(focus.canTest).toBe(true);
    expect(focus.primaryLabel).toBe('Gửi thử Zalo');
  });
});

describe('resolveZaloJob', () => {
  it('đang kết nối thì không còn việc phải làm', () => {
    expect(resolveZaloJob('ready').tone).toBe('ok');
    expect(resolveZaloJob('ready').subject).toBe('ready');
  });

  it('mọi trạng thái khác đều là việc chặn', () => {
    for (const state of ['logged_out', 'qr_ready', 'qr_scanned', 'error', 'unknown']) {
      expect(resolveZaloJob(state).subject).toBe('connect');
      expect(resolveZaloJob(state).tone).toBe('blocked');
    }
  });
});

describe('resolveReadinessFocus', () => {
  it('còn điều kiện bắt buộc chưa đạt thì tiêu đề nói đúng số lượng', () => {
    const focus = resolveReadinessFocus({
      goLiveReady: false,
      checks: [
        check({ key: 'a', status: 'missing' }),
        check({ key: 'b', status: 'ready' }),
        check({ key: 'c', status: 'blocked' }),
        check({ key: 'd', status: 'warning', blocking: false }),
      ],
    });

    expect(focus.title).toBe('Còn 2 điều kiện bắt buộc chưa đạt');
    expect(focus.open.map((entry) => entry.key)).toEqual(['a', 'c']);
    expect(focus.informational.map((entry) => entry.key)).toEqual(['d']);
  });

  it('không bao giờ báo sẵn sàng khi máy chủ nói chưa — kể cả khi mọi cổng đều xanh', () => {
    const focus = resolveReadinessFocus({
      goLiveReady: false,
      checks: [check({ key: 'a', status: 'missing' })],
    });
    expect(focus.tone).toBe('blocked');
  });

  it('máy chủ báo đủ điều kiện thì khối thành công là khối nổi bật', () => {
    const focus = resolveReadinessFocus({
      goLiveReady: true,
      checks: [check({ key: 'a', status: 'ready' })],
    });
    expect(focus.tone).toBe('ok');
    expect(focus.open).toHaveLength(0);
  });
});

describe('readinessCheckSection', () => {
  it('chỉ trỏ tới mục cài đặt có thật', () => {
    expect(readinessCheckSection('price.current_period')).toBe('products-pricing');
    expect(readinessCheckSection('groups.mapped')).toBe('dealers-groups');
    expect(readinessCheckSection('channel.listener')).toBe('zalo');
  });

  it('khoá lạ thì không dựng nút dẫn đi đâu cả', () => {
    expect(readinessCheckSection('khoa.khong.co.that')).toBeUndefined();
  });
});

describe('userActionRisk', () => {
  it('ba thao tác tài khoản nằm ở ba mức rủi ro khác nhau', () => {
    expect(userActionRisk('role')).toBe('routine');
    expect(userActionRisk('reset-password')).toBe('sensitive');
    expect(userActionRisk('disable')).toBe('destructive');
  });
});

describe('summarizeAuditFilters', () => {
  it('không lọc gì thì nói rõ là đang xem toàn bộ', () => {
    const summary = summarizeAuditFilters({});
    expect(summary.active).toBe(false);
    expect(summary.label).toBe('Đang xem toàn bộ lịch sử');
  });

  it('có lọc thì nêu đúng các tiêu chí đang áp dụng', () => {
    const summary = summarizeAuditFilters({ actor: 'quanly', action: 'activate' });
    expect(summary.active).toBe(true);
    expect(summary.label).toContain('quanly');
    expect(summary.label).toContain('activate');
  });
});
