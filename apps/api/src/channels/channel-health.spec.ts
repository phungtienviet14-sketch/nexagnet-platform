import { describe, expect, it } from 'vitest';
import { ChannelHealthService, deriveListenerPhase } from './channel-health.js';
import { nextReconnectDelayMs, shouldReconnectAfterClose } from './listener-reconnect.js';

const T0 = new Date('2026-08-28T00:00:00.000Z');
const at = (seconds: number): Date => new Date(T0.getTime() + seconds * 1000);

function observation(overrides: Partial<Parameters<typeof deriveListenerPhase>[0]> = {}) {
  return {
    enabled: true,
    authenticated: true,
    socketOpen: true,
    reconnectPending: false,
    everConnected: true,
    lastInboundAgeSeconds: 10,
    idleThresholdSeconds: 3_600,
    ...overrides,
  };
}

describe('deriveListenerPhase — bay muc, khong phai bay ten cho mot thu', () => {
  it('kenh khong duoc bat -> disabled', () => {
    expect(deriveListenerPhase(observation({ enabled: false }))).toBe('disabled');
  });

  it('cau hinh co kenh nhung chua tung dang nhap -> configured', () => {
    expect(
      deriveListenerPhase(
        observation({ authenticated: false, socketOpen: false, everConnected: false }),
      ),
    ).toBe('configured');
  });

  it('DA dang nhap ma socket CHUA tung mo -> authenticated, KHONG phai connected', () => {
    // `login()` thanh cong khong co nghia la phia NHAN da nghe duoc. Do dung la khe ho §7.1:
    // log bao "dang nhap thanh cong" va nguoi doc ket luan nham la kenh dang chay.
    expect(deriveListenerPhase(observation({ socketOpen: false, everConnected: false }))).toBe(
      'authenticated',
    );
  });

  it('socket mo VA vua co tin -> connected', () => {
    expect(deriveListenerPhase(observation({ lastInboundAgeSeconds: 30 }))).toBe('connected');
  });

  describe('HAI TRANG THAI TRUOC DAY KHONG PHAN BIET DUOC (§7.1)', () => {
    it('socket mo, lau khong ai nhan -> connected_but_idle', () => {
      expect(deriveListenerPhase(observation({ lastInboundAgeSeconds: 44 * 3600 }))).toBe(
        'connected_but_idle',
      );
    });

    it('socket DA DONG, khong lan thu nao dang cho -> disconnected', () => {
      // Day la trang thai that cua 44 gio. Truoc ban nay, no khong the doc ra tu ben ngoai.
      expect(
        deriveListenerPhase(observation({ socketOpen: false, lastInboundAgeSeconds: 44 * 3600 })),
      ).toBe('disconnected');
    });

    it('hai trang thai tren KHAC NHAU du cung mot do tuoi tin cuoi', () => {
      const idleAge = 44 * 3600;
      expect(deriveListenerPhase(observation({ lastInboundAgeSeconds: idleAge }))).not.toBe(
        deriveListenerPhase(observation({ socketOpen: false, lastInboundAgeSeconds: idleAge })),
      );
    });
  });

  it('socket dong nhung DA hen mot lan thu lai -> reconnecting, khong phai disconnected', () => {
    expect(deriveListenerPhase(observation({ socketOpen: false, reconnectPending: true }))).toBe(
      'reconnecting',
    );
  });

  it('socket vua mo lai ma chua co tin nao -> connected_but_idle, khong noi qua hieu biet', () => {
    expect(deriveListenerPhase(observation({ lastInboundAgeSeconds: null }))).toBe(
      'connected_but_idle',
    );
  });
});

describe('ChannelHealthService', () => {
  it('phoi bay du cac chieu ma cong ra doi hoi', () => {
    const health = new ChannelHealthService();
    health.setEnabled(true);
    health.markAuthenticated();
    health.markConnected(at(0));
    health.recordInbound('zca_listener', at(5));

    const snapshot = health.snapshot(at(65));

    expect(snapshot.listener).toMatchObject({
      phase: 'connected',
      socketOpen: true,
      connectedAt: at(0).toISOString(),
      lastDisconnectedAt: null,
      lastReconnectAt: null,
      reconnectCount: 0,
    });
    expect(snapshot.inbound).toEqual([
      {
        channel: 'zca_listener',
        lastInboundAt: at(5).toISOString(),
        lastInboundAgeSeconds: 60,
        inboundCount: 1,
      },
    ]);
    expect(snapshot.observedSince).toBeTruthy();
  });

  it('giu ma dong cua socket — `1000` phai doc duoc, vi chinh no la thu da bi bo qua', () => {
    const health = new ChannelHealthService();
    health.setEnabled(true);
    health.markConnected(at(0));
    health.markClosed(1000, 'NORMAL_CLOSURE', at(10));

    expect(health.snapshot(at(20)).listener).toMatchObject({
      phase: 'disconnected',
      socketOpen: false,
      lastCloseCode: 1000,
      lastCloseReason: 'NORMAL_CLOSURE',
      lastDisconnectedAt: at(10).toISOString(),
    });
  });

  it('dem lan NOI LAI, khong dem lan mo dau tien', () => {
    const health = new ChannelHealthService();
    health.setEnabled(true);
    health.markConnected(at(0));
    expect(health.snapshot(at(1)).listener.reconnectCount).toBe(0);

    health.markClosed(1000, 'NORMAL_CLOSURE', at(10));
    health.markReconnectScheduled();
    expect(health.snapshot(at(11)).listener.phase).toBe('reconnecting');

    health.markConnected(at(12));
    expect(health.snapshot(at(13)).listener).toMatchObject({
      phase: 'connected_but_idle',
      reconnectCount: 1,
      lastReconnectAt: at(12).toISOString(),
    });
  });

  it('theo doi TUNG kenh rieng — mot kenh song khong che duoc mot kenh chet', () => {
    const health = new ChannelHealthService();
    health.setEnabled(true);
    health.markConnected(at(0));
    // Dung tinh huong cua §7.1: dan tay van co tin moi, con kenh doc that thi khong.
    health.recordInbound('copilot_paste', at(100));

    const snapshot = health.snapshot(at(200));

    expect(snapshot.inbound.map((entry) => entry.channel)).toEqual(['copilot_paste']);
    // Kenh DOC CHINH van chua co tin nao -> phase phai noi ra dieu do.
    expect(snapshot.listener.phase).toBe('connected_but_idle');
  });

  it('khong nem khi chua duoc cau hinh gi', () => {
    expect(() => new ChannelHealthService().snapshot()).not.toThrow();
    expect(new ChannelHealthService().snapshot().listener.phase).toBe('disabled');
  });
});

describe('chinh sach noi lai', () => {
  it('loi cua listener cung phai dan toi mot lan noi lai, khong dung han', () => {
    // Mot lan dut MANG roi vao nhanh `error` chu khong phai nhanh `closed`. Ban truoc dung han o
    // do, tuc kenh doc chet im lang — dung hinh dang §7.1, chi khac cua vao.
    const health = new ChannelHealthService();
    health.setEnabled(true);
    health.markConnected(at(0));
    health.markClosed(null, 'listener error: socket hang up', at(5));
    expect(health.snapshot(at(6)).listener.phase).toBe('disconnected');

    health.markReconnectScheduled();
    expect(health.snapshot(at(7)).listener.phase).toBe('reconnecting');
  });

  it('NORMAL_CLOSURE (1000) VAN phai noi lai — day la ca su co', () => {
    expect(shouldReconnectAfterClose(1000)).toBe(true);
    expect(shouldReconnectAfterClose(1006)).toBe(true);
    expect(shouldReconnectAfterClose(null)).toBe(true);
  });

  it('khoang cho tang gap doi', () => {
    const noJitter = () => 0.5;
    expect(nextReconnectDelayMs({ attempt: 1, random: noJitter })).toBe(2_000);
    expect(nextReconnectDelayMs({ attempt: 2, random: noJitter })).toBe(4_000);
    expect(nextReconnectDelayMs({ attempt: 3, random: noJitter })).toBe(8_000);
  });

  it('CO TRAN — khoang cho khong bao gio vuot 5 phut, ke ca sau ca ngan lan thu', () => {
    for (const attempt of [10, 100, 5_000, 1_000_000]) {
      const delay = nextReconnectDelayMs({ attempt, random: () => 0.999 });
      expect(Number.isFinite(delay)).toBe(true);
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThanOrEqual(360_000);
    }
  });

  it('co nhieu ngau nhien, va khong bao gio ngan hon khoang co so', () => {
    expect(nextReconnectDelayMs({ attempt: 5, random: () => 0 })).toBeLessThan(
      nextReconnectDelayMs({ attempt: 5, random: () => 0.999 }),
    );
    expect(nextReconnectDelayMs({ attempt: 1, random: () => 0 })).toBeGreaterThanOrEqual(2_000);
  });
});
