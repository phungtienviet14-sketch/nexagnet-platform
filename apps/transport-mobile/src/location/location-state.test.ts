import { describe, expect, it } from 'vitest';
import { describeLocation, type LocationFacts } from './location-state';

const BASE: LocationFacts = {
  servicesEnabled: true,
  foreground: 'granted',
  foregroundCanAskAgain: true,
  background: 'undetermined',
  buildSupportsBackground: true,
  backgroundTaskRunning: false,
  platform: 'android',
};

describe('describeLocation — khong bao gio noi qua su that', () => {
  it('ban khong co bam nen: XAM trung tinh, noi ro "khong bat theo doi" la binh thuong', () => {
    const statement = describeLocation({ ...BASE, buildSupportsBackground: false });
    expect(statement.background.tone).toBe('neutral');
    expect(statement.background.detail).toMatch(/không phải lỗi/);
  });

  it('dang chay van KHONG hua lien tuc: luon kem gioi han cua he dieu hanh', () => {
    const android = describeLocation({
      ...BASE,
      background: 'granted',
      backgroundTaskRunning: true,
    });
    expect(android.background.title).toBe('Đã bật bám vị trí ca chạy');
    expect(android.background.detail).toMatch(/Buộc dừng/);
    const ios = describeLocation({
      ...BASE,
      platform: 'ios',
      background: 'granted',
      backgroundTaskRunning: true,
    });
    expect(ios.background.detail).toMatch(/vuốt tắt hẳn/);
  });

  it('mat quyen nen khong bao gio la do/canh bao — lai xe khong bi buoc toi', () => {
    for (const background of ['denied', 'undetermined'] as const) {
      const statement = describeLocation({ ...BASE, background });
      expect(statement.background.tone).toBe('neutral');
    }
  });

  it('vi tri tai thoi diem: dinh vi tat / bi tu choi han / chua hoi', () => {
    expect(describeLocation({ ...BASE, servicesEnabled: false }).pointInTime).toMatchObject({
      ok: false,
      tone: 'danger',
    });
    expect(
      describeLocation({ ...BASE, foreground: 'denied', foregroundCanAskAgain: false }).pointInTime
        .text,
    ).toMatch(/Cài đặt/);
    expect(describeLocation({ ...BASE, foreground: 'undetermined' }).pointInTime).toMatchObject({
      ok: false,
      tone: 'caution',
    });
  });
});
