/**
 * PoC A — SAFE OUTPUTS CO TAI SU DUNG DOC LAP DUOC KHONG?
 *
 * Cau hoi §5.5 cua hop dong task, va la tieu chi nghiem thu #8. Cau tra loi do duoc o day la
 * `PARTIAL`, va bai kiem nay ghi lai CA HAI nua cua chu "partial":
 *
 *   nua DUOC   — nam ca 5 tep `.cjs` cua tang Safe Outputs trong mot tien trinh Node TRAN: khong
 *                trinh bien dich Go, khong workflow, khong bi mat, khong mang, khong phu thuoc npm.
 *   nua KHONG  — nap duoc khong co nghia la bao ve duoc. Luat xac thuc KHONG nam trong ma nguon;
 *                chung den tu bien moi truong `GH_AW_VALIDATION_CONFIG`, va khi bien do THIEU hay
 *                HONG thi `validateItem()` FAIL-OPEN: tra `isValid: true` va chuyen tiep nguyen
 *                ven truong do tac nhan dat vao.
 *
 * Nua thu hai moi la ket qua co gia tri: no la ly do mot ban hybrid van phai tu viet lop fail-closed,
 * vi bat bien cua Nexagent la fail-closed con mac dinh cua gh-aw o day la fail-open.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { ADAPTER_GAPS, GH_AW_TYPES, toSafeOutputItems } from '../src/v0-to-safe-output.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name) => JSON.parse(readFileSync(join(here, '..', 'fixtures', name), 'utf8'));

const standalone = fixture('standalone-probe.json');
const states = fixture('validation-config-states.json');

test('ca 5 tep cua tang Safe Outputs nap duoc trong mot tien trinh Node tran', () => {
  // `auditedSha` la sieu du lieu cua chinh fixture, khong phai mot tep duoc thu nap.
  const probes = Object.entries(standalone).filter(([name]) => name.endsWith('.cjs'));
  const failed = probes.filter(([, probe]) => probe.loaded !== true).map(([name]) => name);
  assert.deepEqual(failed, [], 'moi tep phai nap duoc khong can trinh bien dich Go hay npm');
  assert.equal(probes.length, 5);
});

test('bo xac thuc that su lam viec khi duoc cap cau hinh', () => {
  // Truong khong khai bao bi loai khoi item da chuan hoa => bo loc truong dang chay that.
  assert.equal(states.validConfig.isValid, true);
  assert.equal(
    states.validConfig.undeclaredFieldSurvived,
    false,
    'co cau hinh thi truong khong khai bao phai bi loai',
  );
});

test('THIEU cau hinh => FAIL-OPEN: truong do tac nhan dat vao di tiep nguyen ven', () => {
  assert.equal(states.noConfig.isValid, true);
  assert.equal(
    states.noConfig.undeclaredFieldSurvived,
    true,
    'khong cau hinh thi gh-aw KHONG chan gi — day la ly do hybrid phai tu boc fail-closed',
  );
});

test('cau hinh HONG => van FAIL-OPEN, khong fail-closed', () => {
  // gh-aw ghi mot dong `CRITICAL` roi VAN chay tiep voi cau hinh rong. Mot cau hinh an ninh hong
  // ma khong lam dung tien trinh la dung chieu nguoc voi bat bien cua Orchestrator V0.
  assert.equal(states.corruptConfig.isValid, true);
  assert.equal(states.corruptConfig.undeclaredFieldSurvived, true);
});

test('bo chuyen doi V0 -> item gh-aw: phan chuyen doi duoc', () => {
  const { items } = toSafeOutputItems({
    action: 'POST_REVIEW_REQUEST',
    body: 'REVIEW_REQUEST\nPR=194',
    labels: { add: ['autopilot:reviewing'], remove: ['autopilot:ci', 'autopilot:reviewing'] },
    idempotencyKey: 'review-request:194:abc',
  });

  assert.deepEqual(items, [
    { type: GH_AW_TYPES.ADD_COMMENT, body: 'REVIEW_REQUEST\nPR=194' },
    // `autopilot:reviewing` nam ca o `remove` lan `add` nen KHONG bi go — giong `reconcileLabels`.
    { type: GH_AW_TYPES.REMOVE_LABELS, labels: ['autopilot:ci'] },
    { type: GH_AW_TYPES.ADD_LABELS, labels: ['autopilot:reviewing'] },
  ]);
});

test('bo chuyen doi V0 -> item gh-aw: BA thu khong co cho de dat', () => {
  const { gaps } = toSafeOutputItems({
    action: 'POST_REVIEW_REQUEST',
    body: 'REVIEW_REQUEST\nPR=194',
    labels: { add: ['autopilot:reviewing'], remove: ['autopilot:ci'] },
    idempotencyKey: 'review-request:194:abc',
  });

  assert.deepEqual(
    [...gaps].sort(),
    [
      ADAPTER_GAPS.ABSENT_LABEL_IS_SUCCESS_NOT_EXPRESSIBLE,
      ADAPTER_GAPS.IDEMPOTENCY_KEY_HAS_NO_CARRIER,
      ADAPTER_GAPS.LABEL_RECONCILE_ORDER_NOT_EXPRESSIBLE,
    ].sort(),
  );
});

test('khoa idempotency la khoang trong ke ca khi khong dong toi nhan', () => {
  const { gaps } = toSafeOutputItems({
    action: 'POST_CI_FAIL',
    body: 'CI_FAIL',
    labels: { add: [], remove: [] },
    idempotencyKey: 'ci-fail:194:abc:987',
  });
  assert.deepEqual(gaps, [ADAPTER_GAPS.IDEMPOTENCY_KEY_HAS_NO_CARRIER]);
});
