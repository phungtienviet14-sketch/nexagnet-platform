/**
 * DOI NHAN PHAI DOC DUOC KET QUA CUA CHINH NO — nua thu nhat cua blocker B5 (PR #167).
 *
 * Ban truoc goi `await api(...)` roi vut ket qua di. Mot `500` va mot `200` cho ra cung mot hanh
 * vi: di tiep, va khong dong log nao noi rang nhan da khong doi. Nua thu hai cua B5 — chay lai thi
 * hoa giai duoc — nam o `tests/recovery.test.mjs`, vi no phai di qua ca `main.mjs`.
 *
 * MOT NGOAI LE, VA CHI MOT: `DELETE .../labels/{ten}` tra `404` khi nhan von khong co tren PR. Ket
 * qua mong muon da dat, nen do la thanh cong. Bai cuoi cung o day khoa dieu do lai — de mot lan
 * "noi long cho de chay" khong am tham bien moi loi thanh thanh cong.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { LABEL_OUTCOMES, reconcileLabels } from '../src/labels.mjs';
import { ORCHESTRATOR_REASONS } from '../src/reasons.mjs';

/**
 * @param {(path: string, init?: RequestInit) => ({ ok: boolean, status: number, body: any })} handler
 */
function recorder(handler) {
  /** @type {Array<{ path: string, method: string, body: string | null }>} */
  const calls = [];
  /**
   * @param {string} path
   * @param {RequestInit} [init]
   */
  const request = async (path, init) => {
    calls.push({
      path,
      method: String(init?.method ?? 'GET'),
      body: typeof init?.body === 'string' ? init.body : null,
    });
    return handler(path, init);
  };
  return { request, calls };
}

const ok = () => ({ ok: true, status: 200, body: null });

test('go nhan dang co, roi gan nhan can co — dung mot loi goi POST cho ca bo', async () => {
  const { request, calls } = recorder(ok);
  const applied = await reconcileLabels(request, {
    add: ['autopilot:reviewing'],
    remove: ['autopilot:ci', 'autopilot:running'],
  });

  assert.equal(applied.ok, true);
  assert.deepEqual(applied.ok === true ? applied.value : [], [
    { label: 'autopilot:ci', outcome: LABEL_OUTCOMES.REMOVED },
    { label: 'autopilot:running', outcome: LABEL_OUTCOMES.REMOVED },
    { label: 'autopilot:reviewing', outcome: LABEL_OUTCOMES.ADDED },
  ]);
  assert.deepEqual(
    calls.map((call) => `${call.method} ${call.path}`),
    ['DELETE /labels/autopilot%3Aci', 'DELETE /labels/autopilot%3Arunning', 'POST /labels'],
  );
  assert.equal(calls[2].body, JSON.stringify({ labels: ['autopilot:reviewing'] }));
});

test('nhan vua nam trong `remove` vua trong `add` thi KHONG bi go — khong co loi goi thua', async () => {
  // Day la truong hop THUONG: `decide.mjs` go HET nhan trang thai roi gan lai dung mot cai. Neu go
  // ca cai sap gan thi PR co mot khoang khong mang nhan nao, va mot lan chay hong giua chung se de
  // lai dung khoang do.
  const { request, calls } = recorder(ok);
  const applied = await reconcileLabels(request, {
    add: ['autopilot:reviewing'],
    remove: ['autopilot:reviewing', 'autopilot:ci'],
  });

  assert.equal(applied.ok, true);
  assert.deepEqual(
    calls.map((call) => `${call.method} ${call.path}`),
    ['DELETE /labels/autopilot%3Aci', 'POST /labels'],
  );
});

test('B5: go mot nhan VON KHONG CO (`404`) la THANH CONG — day la ca idempotent tuong minh', async () => {
  const { request } = recorder((path) =>
    path.endsWith('autopilot%3Aci') ? { ok: false, status: 404, body: null } : ok(),
  );
  const applied = await reconcileLabels(request, {
    add: [],
    remove: ['autopilot:ci', 'autopilot:done'],
  });

  assert.equal(applied.ok, true);
  assert.deepEqual(
    applied.ok === true ? applied.value : [],
    [
      { label: 'autopilot:ci', outcome: LABEL_OUTCOMES.ALREADY_ABSENT },
      { label: 'autopilot:done', outcome: LABEL_OUTCOMES.REMOVED },
    ],
  );
});

test('B5: go nhan hong (khong phai 404) => BAO, khong nuot', async () => {
  const { request, calls } = recorder((path) =>
    path.endsWith('autopilot%3Aci') ? { ok: false, status: 403, body: null } : ok(),
  );
  const applied = await reconcileLabels(request, {
    add: ['autopilot:reviewing'],
    remove: ['autopilot:ci', 'autopilot:done'],
  });

  assert.equal(applied.ok, false);
  assert.equal(applied.ok === false ? applied.reason : null, ORCHESTRATOR_REASONS.LABEL_WRITE_FAILED);
  assert.equal(applied.ok === false ? applied.detail?.op : null, 'remove');
  assert.equal(applied.ok === false ? applied.detail?.label : null, 'autopilot:ci');
  assert.equal(applied.ok === false ? applied.detail?.status : null, 403);
  // Dung NGAY: khong go tiep, va khong gan nhan moi len mot PR ma minh vua that bai khi don.
  assert.deepEqual(calls.map((call) => call.path), ['/labels/autopilot%3Aci']);
});

test('B5: gan nhan hong => BAO, kem dung bo nhan da khong gan duoc', async () => {
  const { request } = recorder((path) =>
    path === '/labels' ? { ok: false, status: 500, body: null } : ok(),
  );
  const applied = await reconcileLabels(request, {
    add: ['autopilot:reviewing'],
    remove: ['autopilot:ci'],
  });

  assert.equal(applied.ok, false);
  assert.equal(applied.ok === false ? applied.reason : null, ORCHESTRATOR_REASONS.LABEL_WRITE_FAILED);
  assert.equal(applied.ok === false ? applied.detail?.op : null, 'add');
  assert.deepEqual(applied.ok === false ? applied.detail?.labels : null, ['autopilot:reviewing']);
  assert.equal(applied.ok === false ? applied.detail?.status : null, 500);
  // Bao ca phan DA lam duoc: nguoi truc can biet PR dang o trang thai nao, khong chi biet no hong.
  assert.deepEqual(
    applied.ok === false ? applied.detail?.applied : null,
    [{ label: 'autopilot:ci', outcome: LABEL_OUTCOMES.REMOVED }],
  );
});

test('khong co nhan nao de gan => khong goi POST', async () => {
  const { request, calls } = recorder(ok);
  const applied = await reconcileLabels(request, { add: [], remove: ['autopilot:ci'] });
  assert.equal(applied.ok, true);
  assert.deepEqual(calls.map((call) => call.method), ['DELETE']);
});

test('quyet dinh khong doi nhan nao => khong mot loi goi mang nao', async () => {
  const { request, calls } = recorder(ok);
  const applied = await reconcileLabels(request, { add: [], remove: [] });
  assert.equal(applied.ok, true);
  assert.deepEqual(applied.ok === true ? applied.value : null, []);
  assert.deepEqual(calls, []);
});

test('CHAY LAI tren mot PR da dung trang thai cho ra cung ket qua — khong tac dong them', async () => {
  // Lan hai: moi nhan can go deu da vang (`404`), nhan can gan thi da co (GitHub coi la khong-lam-gi
  // va tra `200`). Ket qua van la `ok`, va do la dinh nghia cua "chay lai duoc".
  const { request } = recorder((path) =>
    path.startsWith('/labels/') ? { ok: false, status: 404, body: null } : ok(),
  );
  const applied = await reconcileLabels(request, {
    add: ['autopilot:reviewing'],
    remove: ['autopilot:ci', 'autopilot:done'],
  });

  assert.equal(applied.ok, true);
  assert.deepEqual(
    applied.ok === true ? applied.value.map((entry) => entry.outcome) : [],
    [LABEL_OUTCOMES.ALREADY_ABSENT, LABEL_OUTCOMES.ALREADY_ABSENT, LABEL_OUTCOMES.ADDED],
  );
});
