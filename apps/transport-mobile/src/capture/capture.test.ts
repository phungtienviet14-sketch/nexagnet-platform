import { describe, expect, it } from 'vitest';
import { CaptureBridge } from './capture-bridge';
import { captureModeOf, fileSizeProblem, hasKnownSize, isPdf, resizeTarget } from './normalize';

describe('resizeTarget — canh dai toi da 2000px, giu ti le, khong phong to', () => {
  it('anh ngang lon -> theo chieu rong', () => {
    expect(resizeTarget(4032, 3024)).toEqual({ width: 2000 });
  });
  it('anh doc lon -> theo chieu cao', () => {
    expect(resizeTarget(3024, 4032)).toEqual({ height: 2000 });
  });
  it('anh da nho -> khong doi kich thuoc', () => {
    expect(resizeTarget(1600, 1200)).toBeNull();
  });
  it('kich thuoc khong biet -> null, lop goi phai doc anh truoc', () => {
    expect(resizeTarget(0, 0)).toBeNull();
    expect(hasKnownSize(0, 100)).toBe(false);
    expect(hasKnownSize(10, 100)).toBe(true);
  });
});

describe('isPdf / fileSizeProblem', () => {
  it('nhan PDF theo loai hoac duoi ten', () => {
    expect(isPdf('application/pdf', null)).toBe(true);
    expect(isPdf(null, 'phieu-can.PDF')).toBe(true);
    expect(isPdf('image/jpeg', 'a.jpg')).toBe(false);
  });
  it('qua 15 MB hoac rong bi chan truoc khi xep hang', () => {
    expect(fileSizeProblem(16_000_000)).toContain('15 MB');
    expect(fileSizeProblem(0)).toContain('rỗng');
    expect(fileSizeProblem(500_000)).toBeNull();
    expect(fileSizeProblem(undefined)).toBeNull();
  });
});

describe('captureModeOf — noi that nguon anh', () => {
  it('chi may anh trong ung dung moi la LIVE_CAMERA', () => {
    expect(captureModeOf('IN_APP_CAMERA')).toBe('LIVE_CAMERA');
    expect(captureModeOf('LIBRARY')).toBe('GALLERY');
    expect(captureModeOf('FILE')).toBe('UNKNOWN');
    expect(captureModeOf('BROWSER_CAPTURE')).toBe('UNKNOWN');
  });
});

describe('CaptureBridge', () => {
  it('giao anh cho dung yeu cau dang treo', async () => {
    const bridge = new CaptureBridge();
    const waiting = bridge.awaitCapture();
    expect(bridge.hasPending()).toBe(true);
    bridge.deliverCapture({ uri: 'file:///a.jpg', width: 10, height: 10 });
    await expect(waiting).resolves.toEqual({ uri: 'file:///a.jpg', width: 10, height: 10 });
    expect(bridge.hasPending()).toBe(false);
  });

  it('yeu cau moi huy yeu cau cu bang null — anh khong roi vao nham lan bam', async () => {
    const bridge = new CaptureBridge();
    const first = bridge.awaitCapture();
    const second = bridge.awaitCapture();
    bridge.deliverCapture({ uri: 'x', width: 1, height: 1 });
    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toMatchObject({ uri: 'x' });
  });

  it('giao lan hai la vo hai', async () => {
    const bridge = new CaptureBridge();
    const waiting = bridge.awaitCapture();
    bridge.deliverCapture(null);
    bridge.deliverCapture({ uri: 'y', width: 1, height: 1 });
    await expect(waiting).resolves.toBeNull();
  });
});
