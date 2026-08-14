import { describe, expect, it, vi } from 'vitest';
import {
  ZALO_RISK_ACKNOWLEDGEMENTS,
  confirmedLegacyGroupLinks,
  zaloLoginAvailability,
  zaloStateLabel,
  type ZaloStatus,
} from './zalo';

const STATUS: ZaloStatus = {
  channelMode: 'zca',
  state: 'logged_out',
  qrVersion: 0,
  allowedGroupIds: [],
};

describe('zaloStateLabel', () => {
  it('hien thi huong dan quet QR ro rang', () => {
    expect(zaloStateLabel('qr_ready')).toContain('Quét QR');
  });

  it('khong mo ta ready thanh mock', () => {
    expect(zaloStateLabel('ready')).toContain('Đã kết nối');
    expect(zaloStateLabel('ready').toLowerCase()).not.toContain('mock');
  });
});

describe('confirmedLegacyGroupLinks', () => {
  it('only links a legacy group after the operator confirms the exact old and new IDs', () => {
    const confirm = vi.fn(() => true);
    const links = confirmedLegacyGroupLinks(
      [
        {
          id: 'chat-new',
          globalId: 'stable-1',
          name: 'Nhóm đại lý An',
          memberCount: 3,
          allowed: false,
          legacyCandidate: {
            groupId: 'group-db-1',
            chatId: 'chat-old',
            name: 'Nhóm đại lý An',
            dealerName: 'Đại lý An',
          },
        },
      ],
      ['chat-new'],
      confirm,
    );

    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/chat-old[\s\S]*chat-new/));
    expect(links).toEqual([{ currentChatId: 'chat-new', existingGroupId: 'group-db-1' }]);
  });

  it('does not link when the operator declines', () => {
    expect(
      confirmedLegacyGroupLinks(
        [
          {
            id: 'chat-new',
            name: 'Nhóm',
            memberCount: 3,
            allowed: false,
            legacyCandidate: {
              groupId: 'group-db-1',
              chatId: 'chat-old',
              name: 'Nhóm',
            },
          },
        ],
        ['chat-new'],
        () => false,
      ),
    ).toEqual([]);
  });
});

describe('ZALO_RISK_ACKNOWLEDGEMENTS', () => {
  it('tach rieng hai rui ro: ToS Zalo (D16) va tai khoan phu/SIM rieng (D20)', () => {
    expect(ZALO_RISK_ACKNOWLEDGEMENTS.map((item) => item.id)).toEqual([
      'tos_risk',
      'secondary_account',
    ]);
  });

  it('noi ro hau qua chu khong chi noi "co rui ro"', () => {
    const tos = ZALO_RISK_ACKNOWLEDGEMENTS.find((item) => item.id === 'tos_risk')!;
    const account = ZALO_RISK_ACKNOWLEDGEMENTS.find((item) => item.id === 'secondary_account')!;
    expect(tos.detail).toMatch(/khóa/i);
    expect(account.label).toMatch(/SIM riêng/i);
    expect(account.label).toMatch(/không phải tài khoản Sale chính/i);
  });
});

describe('zaloLoginAvailability', () => {
  it('chua co status -> dang tai, khong ket luan gi', () => {
    expect(zaloLoginAvailability(undefined)).toEqual({ kind: 'loading' });
  });

  it('zca chua dang nhap -> cho dang nhap', () => {
    expect(zaloLoginAvailability(STATUS)).toEqual({ kind: 'available' });
  });

  it('loi ket noi van cho thu dang nhap lai', () => {
    expect(zaloLoginAvailability({ ...STATUS, state: 'error' })).toEqual({ kind: 'available' });
  });

  it('da ket noi thi khong hien lai hop xac nhan rui ro', () => {
    expect(zaloLoginAvailability({ ...STATUS, state: 'ready' })).toEqual({ kind: 'connected' });
  });

  // Truoc day CHANNEL_MODE=mock chi hien "Kenh ZCA dang tat": nguoi van hanh khong biet la CO Y
  // hay hong. Nay noi ro la khoa co chu dich va viec mo khoa thuoc ve nguoi deploy.
  it('CHANNEL_MODE=mock -> noi ro dang khoa CO Y, khong phai loi', () => {
    const result = zaloLoginAvailability({ ...STATUS, channelMode: 'mock' });
    expect(result.kind).toBe('channel_locked');
    if (result.kind !== 'channel_locked') throw new Error('sai nhanh');
    expect(result.title).toMatch(/chủ ý/i);
    expect(result.detail).toMatch(/CHANNEL_MODE/);
  });

  it('CHANNEL_MODE=bot -> cung khoa, vi zca khong chay o che do do', () => {
    expect(zaloLoginAvailability({ ...STATUS, channelMode: 'bot' }).kind).toBe('channel_locked');
  });

  it('hybrid van cho dang nhap zca', () => {
    expect(zaloLoginAvailability({ ...STATUS, channelMode: 'hybrid' }).kind).toBe('available');
  });
});
