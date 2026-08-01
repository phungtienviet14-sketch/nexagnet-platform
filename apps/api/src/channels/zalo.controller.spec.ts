import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ZaloUserClient } from './zalo-user.client.js';
import { ZaloController } from './zalo.controller.js';

describe('ZaloController', () => {
  const apiCredentialFixture = 'x'.repeat(32);
  const startQrLogin = vi.fn();
  const setAllowedGroupIds = vi.fn();
  const client = {
    status: vi.fn(() => ({ channelMode: 'zca', state: 'logged_out', allowedGroupIds: [] })),
    startQrLogin,
    listGroups: vi.fn(async () => []),
    setAllowedGroupIds,
    qrDataUrl: vi.fn(() => 'data:image/png;base64,abc'),
  } as unknown as ZaloUserClient;
  let controller: ZaloController;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.API_KEY = apiCredentialFixture;
    process.env.CHANNEL_MODE = 'zca';
    process.env.ZALO_OPERATOR_ORIGIN = 'https://operator.example.com';
    vi.clearAllMocks();
    controller = new ZaloController(client);
  });

  it('khong tao QR neu operator chua xac nhan rui ro zca', () => {
    expect(() =>
      controller.login({ acceptedRisk: false }, 'https://operator.example.com'),
    ).toThrow(BadRequestException);
    expect(startQrLogin).not.toHaveBeenCalled();
  });

  it('chan mutation tu origin khac de chong CSRF', () => {
    expect(() => controller.login({ acceptedRisk: true }, 'https://evil.example')).toThrow(
      ForbiddenException,
    );
    expect(startQrLogin).not.toHaveBeenCalled();
  });

  it('bat dau QR khi da xac nhan va origin dung', () => {
    controller.login({ acceptedRisk: true }, 'https://operator.example.com');
    expect(startQrLogin).toHaveBeenCalledTimes(1);
  });

  it('validate allowlist toi da 10 group id', async () => {
    await expect(
      controller.allowGroups(
        { groupIds: Array.from({ length: 11 }, (_, index) => `group-${index}`) },
        'https://operator.example.com',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(setAllowedGroupIds).not.toHaveBeenCalled();
  });
});
