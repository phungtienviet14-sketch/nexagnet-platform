import { describe, expect, it } from 'vitest';
import { zaloStateLabel } from './zalo';

describe('zaloStateLabel', () => {
  it('hien thi huong dan quet QR ro rang', () => {
    expect(zaloStateLabel('qr_ready')).toContain('Quét QR');
  });

  it('khong mo ta ready thanh mock', () => {
    expect(zaloStateLabel('ready')).toContain('Đã kết nối');
    expect(zaloStateLabel('ready').toLowerCase()).not.toContain('mock');
  });
});
