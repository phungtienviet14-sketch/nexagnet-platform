/**
 * Cong GitHub — kiem CHINH `gh.mjs`, khong qua ban gia.
 *
 * Moi bai o tang tren deu dung `fakeGh()`, tuc chung nhan than tra ve DA o dang cuoi cung. Nghia
 * la khong bai nao cham vao doan that su de vo: `--paginate --slurp` tra ve MANG CUA CAC TRANG, va
 * doan lam phang no. Neu ai do "don gian hoa" cho do, ca 148 bai kia van xanh.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { REASONS } from '../src/errors.mjs';
import { createGh } from '../src/gh.mjs';
import { fakeExec } from './helpers.mjs';

/** @param {Record<string, any>} result */
const gh = (result) => {
  const exec = fakeExec([{ result }]);
  return { client: createGh({ exec }), exec };
};

test('a single-page paginated read is flattened to a flat item list', async () => {
  const { client } = gh({ stdout: JSON.stringify([[{ number: 1 }, { number: 2 }]]) });
  const result = await client.api('/repos/acme/widgets/issues', { paginate: true });
  assert.equal(result.ok, true);
  assert.deepEqual(result.body, [{ number: 1 }, { number: 2 }]);
});

test('several pages are flattened into one list, in order', async () => {
  const pages = [[{ n: 1 }, { n: 2 }], [{ n: 3 }], [{ n: 4 }, { n: 5 }]];
  const { client } = gh({ stdout: JSON.stringify(pages) });
  const result = await client.api('/x', { paginate: true });
  assert.deepEqual(
    result.body.map((item) => item.n),
    [1, 2, 3, 4, 5],
  );
});

test('an empty paginated read flattens to an empty list, not to null', async () => {
  const { client } = gh({ stdout: JSON.stringify([[]]) });
  const result = await client.api('/x', { paginate: true });
  assert.deepEqual(result.body, []);
});

test('paginate is only requested when asked for', async () => {
  const { client, exec } = gh({ stdout: '{"number":1}' });
  await client.api('/repos/acme/widgets/issues/1');
  assert.deepEqual(exec.calls[0].args, [
    'api',
    '/repos/acme/widgets/issues/1',
    '-H',
    'Accept: application/vnd.github+json',
  ]);

  const paged = gh({ stdout: '[[]]' });
  await paged.client.api('/x', { paginate: true });
  assert.ok(paged.exec.calls[0].args.includes('--paginate'));
  assert.ok(paged.exec.calls[0].args.includes('--slurp'));
});

test('a non-zero gh exit is a typed refusal, not an empty result', async () => {
  const { client } = gh({ ok: false, code: 1, stdout: '' });
  const result = await client.api('/x');
  assert.equal(result.ok, false);
  assert.equal(result.reason, REASONS.GITHUB_CALL_FAILED);
});

test('unparseable output is a typed refusal, not an empty result', async () => {
  const { client } = gh({ stdout: 'not json at all' });
  const result = await client.api('/x');
  assert.equal(result.ok, false);
  assert.equal(result.reason, REASONS.GITHUB_BAD_RESPONSE);
});

test('empty output is a null body, which callers must reject themselves', async () => {
  const { client } = gh({ stdout: '   ' });
  const result = await client.api('/x');
  assert.equal(result.ok, true);
  assert.equal(result.body, null);
});

test('the gh command line never contains a subcommand that reads a credential', async () => {
  const { client, exec } = gh({ stdout: '{}' });
  await client.api('/x');
  await client.graphql('query{viewer{login}}', {});
  for (const call of exec.calls) {
    assert.equal(call.args.includes('auth'), false);
    assert.equal(call.args.join(' ').includes('token'), false);
  }
});

test('graphql variables are typed: numbers with -F, strings with -f', async () => {
  const { client, exec } = gh({ stdout: '{"data":{"ok":true}}' });
  await client.graphql('query($n:Int!,$s:String!){x}', { number: 256, owner: 'acme' });
  const args = exec.calls[0].args;
  assert.deepEqual(args.slice(0, 3), ['api', 'graphql', '-f']);
  assert.equal(args[args.indexOf('-F') + 1], 'number=256');
  assert.equal(args[args.indexOf('-f', 4) + 1], 'owner=acme');
});

test('a graphql 200 that carries errors is a refusal, not data', async () => {
  const { client } = gh({ stdout: '{"data":null,"errors":[{"message":"boom"}]}' });
  const result = await client.graphql('query{x}', {});
  assert.equal(result.ok, false);
  assert.equal(result.reason, REASONS.GITHUB_BAD_RESPONSE);
});

test('a graphql non-zero exit is a typed refusal', async () => {
  const { client } = gh({ ok: false, code: 1 });
  const result = await client.graphql('query{x}', {});
  assert.equal(result.ok, false);
  assert.equal(result.reason, REASONS.GITHUB_CALL_FAILED);
});
