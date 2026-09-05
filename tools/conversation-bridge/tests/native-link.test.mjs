/**
 * §12 "Native link" — mo lai duoc duong ong, co chan, va khong bao gio quay tit.
 *
 * Tat ca chay tren mot dong ho GIA va mot bo hen gio GIA. Khong bai nao goi `setTimeout` that: mot
 * bai kiem lui-theo-cap-so-nhan ma cho doi that se ton 61 giay va van khong chung minh duoc lich
 * hen nao da duoc dat.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HEALTHY_AFTER_MS,
  LINK_STATES,
  LINK_TRIGGERS,
  RECONNECT_BASE_MS,
  RECONNECT_MAX_ATTEMPTS,
  RECONNECT_MAX_MS,
  backoffDelayMs,
  createNativeLink,
} from '../extension/shared/native-link.js';
import { helloFrame } from '../extension/shared/ipc.js';

/**
 * Mot the gioi gia: dong ho tien bang tay, lich hen chay khi ta bao chay, va `connectNative` lam
 * dung thu ta dat truoc — ke ca "tra ve mot port roi dut ngay", tuc la host chua duoc dang ky.
 *
 * @param {{ hosts?: Array<'up' | 'down'> }} [options]
 */
function world({ hosts = [] } = {}) {
  let clock = 0;
  /** @type {Array<{ id: number, fn: () => void, at: number, delay: number }>} */
  let timers = [];
  let nextTimerId = 1;
  /** @type {Array<any>} */
  const ports = [];
  /** @type {Array<any>} */
  const statuses = [];
  /** @type {unknown[]} */
  const posted = [];
  let connectCalls = 0;
  /** @type {Array<'up' | 'down'>} */
  const script = [...hosts];

  const makePort = () => {
    /** @type {Array<() => void>} */
    const disconnectListeners = [];
    /** @type {Array<(message: unknown) => void>} */
    const messageListeners = [];
    const port = {
      alive: true,
      onDisconnect: { addListener: (/** @type {() => void} */ l) => disconnectListeners.push(l) },
      onMessage: {
        addListener: (/** @type {(m: unknown) => void} */ l) => messageListeners.push(l),
      },
      postMessage: (/** @type {unknown} */ m) => {
        if (!port.alive) throw new Error('port da dong');
        posted.push(m);
      },
      /** Chrome dut ong: host chet, hoac host chua bao gio ton tai. */
      drop() {
        if (!port.alive) return;
        port.alive = false;
        for (const listener of [...disconnectListeners]) listener();
      },
    };
    ports.push(port);
    return port;
  };

  const link = createNativeLink({
    connectNative: () => {
      connectCalls += 1;
      const port = makePort();
      // `down` = host chua duoc dang ky. Chrome van tra ve mot Port roi dut gan nhu tuc thi; o day
      // ta dut NGAY sau khi `createNativeLink` gan xong bo lang nghe, tuc la o lan `drop()` dau.
      if (script.shift() === 'down') port.dropWhenReady = true;
      return port;
    },
    setTimer: (fn, delay) => {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.push({ id, fn, at: clock + delay, delay });
      return id;
    },
    clearTimer: (handle) => {
      timers = timers.filter((timer) => timer.id !== handle);
    },
    now: () => clock,
    onOpen: (port) => {
      port.postMessage(helloFrame());
      // Host chua dang ky: Chrome dut ong ngay sau khi ta vua gui khung dau tien.
      if (/** @type {any} */ (port).dropWhenReady) /** @type {any} */ (port).drop();
    },
    onStatus: (status) => statuses.push(status),
  });

  return {
    link,
    ports,
    statuses,
    posted,
    pending: () => timers.map((timer) => timer.delay),
    timerCount: () => timers.length,
    connectCalls: () => connectCalls,
    /** @param {number} ms */
    advance(ms) {
      clock += ms;
      const due = timers.filter((timer) => timer.at <= clock);
      timers = timers.filter((timer) => timer.at > clock);
      for (const timer of due) timer.fn();
    },
    /** Dut ong hien tai, dung nhu Chrome lam khi tien trinh host chet. */
    dropCurrent() {
      ports[ports.length - 1].drop();
    },
  };
}

test('25. lui theo cap so nhan CO TRAN, khong bao gio vuot nguong', () => {
  assert.equal(backoffDelayMs(1), RECONNECT_BASE_MS);
  assert.equal(backoffDelayMs(2), RECONNECT_BASE_MS * 2);
  assert.equal(backoffDelayMs(3), RECONNECT_BASE_MS * 4);
  for (const failures of [6, 7, 20, 1000, Number.MAX_SAFE_INTEGER]) {
    assert.equal(backoffDelayMs(failures), RECONNECT_MAX_MS, `failures=${failures}`);
  }
  // Dau vao rac khong duoc de ra mot lich hen 0ms — do dung la mot vong quay tit.
  for (const bad of [0, -1, 1.5, Number.NaN, /** @type {any} */ ('2')]) {
    assert.equal(backoffDelayMs(bad), RECONNECT_BASE_MS, String(bad));
  }
});

test('26. TINH HUONG A — host chua dang ky luc nap tien ich, roi duoc dang ky sau', () => {
  const w = world({ hosts: ['down', 'down', 'up'] });
  w.link.open(LINK_TRIGGERS.WORKER_WAKE);

  // Chrome da dut ong ngay: host chua co. Mot lich hen, dung mot cai.
  assert.equal(w.connectCalls(), 1);
  assert.equal(w.link.status().state, LINK_STATES.BACKING_OFF);
  assert.deepEqual(w.pending(), [RECONNECT_BASE_MS]);

  w.advance(RECONNECT_BASE_MS);
  assert.equal(w.connectCalls(), 2, 'lich hen phai that su mo lai');
  assert.deepEqual(w.pending(), [RECONNECT_BASE_MS * 2], 'lan hong thu hai thi doi lau gap doi');

  // Nguoi van hanh dang ky host xong. Lan mo ke tiep thanh cong — KHONG can sua ma nguon, khong
  // can nap lai tien ich, khong can khoi dong lai Chrome.
  w.advance(RECONNECT_BASE_MS * 2);
  assert.equal(w.link.status().state, LINK_STATES.CONNECTED);
  assert.equal(w.link.isConnected(), true);
  assert.equal(w.timerCount(), 0, 'da noi duoc thi khong con lich hen nao treo lai');
  assert.equal(w.posted.length, 3, 'moi lan mo deu chao mot lan');
  assert.deepEqual(w.posted[2], helloFrame());
});

test('26b. TINH HUONG A — nut "ket noi lai" cua nguoi khong phai doi het thoi gian lui', () => {
  const w = world({ hosts: ['down', 'up'] });
  w.link.open(LINK_TRIGGERS.WORKER_WAKE);
  assert.equal(w.timerCount(), 1);

  const status = w.link.open(LINK_TRIGGERS.MANUAL);
  assert.equal(status.state, LINK_STATES.CONNECTED);
  assert.equal(w.connectCalls(), 2);
  assert.equal(w.timerCount(), 0, 'cu cham cua nguoi phai HUY lich hen dang cho, khong de lai');
  assert.equal(status.failures, 0, 'va dat lai ngan sach');
});

test('27. TINH HUONG B — host dang chay roi chet: mo lai, va ngan sach ve dau', () => {
  const w = world({ hosts: ['up', 'up'] });
  w.link.open(LINK_TRIGGERS.STARTUP);
  assert.equal(w.link.status().state, LINK_STATES.CONNECTED);

  // Chay tot mot luc lau roi moi chet.
  w.advance(HEALTHY_AFTER_MS * 12);
  w.dropCurrent();
  assert.deepEqual(
    w.pending(),
    [RECONNECT_BASE_MS],
    'mot ket noi DA CHAY that su thi lan mo lai bat dau tu day, khong tu tran',
  );
  assert.equal(w.link.status().failures, 1);

  w.advance(RECONNECT_BASE_MS);
  assert.equal(w.link.status().state, LINK_STATES.CONNECTED);
  assert.equal(w.connectCalls(), 2);
});

test('28. HONG LIEN TIEP KHONG QUAY TIT — co tran, roi dung han va doi mot con nguoi', () => {
  const w = world({ hosts: Array.from({ length: 40 }, () => /** @type {'down'} */ ('down')) });
  w.link.open(LINK_TRIGGERS.WORKER_WAKE);

  /** @type {number[]} */
  const delays = [...w.pending()];
  for (let attempt = 1; attempt < RECONNECT_MAX_ATTEMPTS; attempt += 1) {
    w.advance(RECONNECT_MAX_MS);
    delays.push(...w.pending());
  }
  assert.deepEqual(delays, [1_000, 2_000, 4_000, 8_000, 16_000, 30_000]);

  // Lan mo thu 7 cung hong: het ngan sach.
  w.advance(RECONNECT_MAX_MS);
  assert.equal(w.link.status().state, LINK_STATES.GAVE_UP);
  assert.equal(w.timerCount(), 0, 'GAVE_UP khong duoc de lai lich hen nao');
  assert.equal(w.connectCalls(), RECONNECT_MAX_ATTEMPTS + 1);

  const callsWhenGaveUp = w.connectCalls();
  // Moi duong TU DONG phai la khong-lam-gi tu day tro di, ke ca khi thoi gian troi qua rat lau.
  for (const trigger of [
    LINK_TRIGGERS.WORKER_WAKE,
    LINK_TRIGGERS.STARTUP,
    LINK_TRIGGERS.INSTALLED,
    LINK_TRIGGERS.RETRY,
  ]) {
    w.link.open(trigger);
  }
  w.advance(RECONNECT_MAX_MS * 100);
  assert.equal(w.connectCalls(), callsWhenGaveUp, 'khong mot lan mo tu dong nao sau khi dung han');

  // Va duong ra la MOT CU CHAM CUA NGUOI.
  w.link.open(LINK_TRIGGERS.MANUAL);
  assert.equal(w.connectCalls(), callsWhenGaveUp + 1);
});

test('29. goi `open` chong nhau KHONG de ra hai port', () => {
  const w = world({ hosts: ['up'] });
  for (let i = 0; i < 25; i += 1) w.link.open(LINK_TRIGGERS.WORKER_WAKE);
  assert.equal(w.connectCalls(), 1, 'da noi roi thi moi lan goi them la khong-lam-gi');
  assert.equal(w.ports.length, 1);

  // Va trong luc DANG CHO lui, cung khong duoc mo them.
  const cold = world({ hosts: ['down', 'down'] });
  cold.link.open(LINK_TRIGGERS.WORKER_WAKE);
  assert.equal(cold.timerCount(), 1);
  for (let i = 0; i < 25; i += 1) cold.link.open(LINK_TRIGGERS.WORKER_WAKE);
  assert.equal(cold.timerCount(), 1, 'dung MOT lich hen, du bao nhieu lan goi');
  assert.equal(cold.connectCalls(), 1, 'va khong mo them port nao trong luc cho');
});

test('29b. mot port CU dut sau khi da thay port khac -> khong dat lich hen thu hai', () => {
  const w = world({ hosts: ['up', 'up'] });
  w.link.open(LINK_TRIGGERS.STARTUP);
  const first = w.ports[0];

  w.advance(HEALTHY_AFTER_MS * 2);
  first.drop();
  w.advance(RECONNECT_BASE_MS);
  assert.equal(w.link.status().state, LINK_STATES.CONNECTED);
  assert.equal(w.ports.length, 2);

  // Su kien muon cua port dau tien. No khong duoc dong toi trang thai cua port dang chay.
  first.alive = true;
  first.drop();
  assert.equal(w.link.status().state, LINK_STATES.CONNECTED);
  assert.equal(w.link.isConnected(), true);
  assert.equal(w.timerCount(), 0, 'su kien muon khong duoc de ra mot lich hen nao');
});

test('30. `connectNative` NEM -> doi xu nhu mot lan mo hong, khong lam do service worker', () => {
  /** @type {number[]} */
  const scheduled = [];
  const link = createNativeLink({
    connectNative: () => {
      throw new Error('ten host sai dang');
    },
    setTimer: (_fn, delay) => {
      scheduled.push(delay);
      return scheduled.length;
    },
    clearTimer: () => {},
    now: () => 0,
  });
  assert.doesNotThrow(() => link.open(LINK_TRIGGERS.STARTUP));
  assert.equal(link.status().state, LINK_STATES.BACKING_OFF);
  assert.deepEqual(scheduled, [RECONNECT_BASE_MS]);
  assert.equal(link.isConnected(), false);
});

test('31. `send` khi khong co duong ong tra `false` — khong hang doi, khong thu lai ngam', () => {
  const w = world({ hosts: ['up'] });
  assert.equal(w.link.send(helloFrame()), false, 'chua mo thi khong gui duoc');
  w.link.open(LINK_TRIGGERS.WORKER_WAKE);
  assert.equal(w.link.send(helloFrame()), true);
  const postedWhileUp = w.posted.length;
  w.dropCurrent();
  assert.equal(w.link.send(helloFrame()), false, 'dut roi thi cung khong gui duoc');
  assert.equal(w.posted.length, postedWhileUp, 'khong khung nao bi giu lai de gui sau');
});
