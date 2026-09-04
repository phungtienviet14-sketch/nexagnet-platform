/**
 * DO QUYEN CUA `GITHUB_TOKEN` — bang cach GOI THAT, khong bang cach doc khoi `permissions:`.
 *
 * VI SAO TEP NAY TON TAI
 *
 * Blocker B1 cua PR #167: khoi `permissions:` cua workflow la mot DANH SACH DONG. Khai mot khoi
 * `permissions` tuong minh thi moi quyen KHONG duoc ke ra deu bang `none`. `main.mjs` goi
 * `/commits/{sha}/check-runs` (can `checks: read`) va `/actions/runs` (can `actions: read`) — hai
 * quyen truoc day khong duoc ke. Hau qua: lan chay THAT sau khi merge se hong TRUOC khi sinh ra
 * duoc bang chung CI, va khong mot cong nao trong PR bat duoc dieu do.
 *
 * Va no khong bat duoc vi mot ly do co cau: `issue_comment` va `check_suite` nam trong nhom su
 * kien "chi kich hoat neu tep workflow co tren NHANH MAC DINH". Doi `permissions:` trong mot PR
 * khong co hieu luc cho den khi merge. Nen mot cai sai o khoi do la thu chi lo ra o san xuat.
 *
 * `pull_request` thi KHAC: no KHONG nam trong nhom do — no chay ban workflow CUA CHINH PR
 * (`GITHUB_REF` = `refs/pull/N/merge`), voi khoi `permissions:` cua chinh PR do. Do la ly do tep
 * nay chay o trigger `pull_request`: day la cho DUY NHAT trong repo nay kiem duoc mot thay doi
 * quyen TRUOC khi thay doi ay len `main`.
 *
 * NO DO CAI GI
 *
 * Dung NAM loi goi ma `main.mjs` thuc su goi (`permissions.mjs`), khong phai mot tap con "dai
 * dien". Mot loi goi hong => job DO, kem status va ten quyen phai them.
 *
 * NO KHONG DO CAI GI
 *
 * Khong khang dinh "co mot lan chay CI o HEAD nay", khong khang dinh "co BUILD_READY". Nhung thu
 * do phu thuoc thoi diem va se lam bai kiem mong manh. No chi khang dinh: GOI DUOC, va tra ve
 * DUNG HINH DANG. Do dung la thu `permissions:` quyet dinh.
 */
import { api } from './github.mjs';
import { probesFor } from './permissions.mjs';

/** @param {Record<string, unknown>} entry */
const log = (entry) => console.log(JSON.stringify(entry));

const SHA40 = /^[0-9a-f]{40}$/;

async function run() {
  const env = process.env;
  const token = env.GITHUB_TOKEN;
  const repo = env.GITHUB_REPOSITORY;
  const pr = Number(env.AUTOPILOT_PREFLIGHT_PR);
  const headSha = String(env.AUTOPILOT_PREFLIGHT_HEAD_SHA ?? '');

  if (!token || !repo || !Number.isInteger(pr) || !SHA40.test(headSha)) {
    log({
      preflight: 'abort',
      reason: 'PREFLIGHT_INPUT_INVALID',
      missing: [
        !token ? 'GITHUB_TOKEN' : null,
        !repo ? 'GITHUB_REPOSITORY' : null,
        !Number.isInteger(pr) ? 'AUTOPILOT_PREFLIGHT_PR' : null,
        !SHA40.test(headSha) ? 'AUTOPILOT_PREFLIGHT_HEAD_SHA' : null,
      ].filter(Boolean),
    });
    process.exitCode = 1;
    return;
  }

  const probes = probesFor({ repo, pr, headSha });
  /** @type {string[]} */
  const denied = [];
  for (const probe of probes) {
    const result = await api(token, probe.path);
    const shapeOk = result.ok && probe.shapeOk(result.body);
    log({
      preflight: 'probe',
      name: probe.name,
      grant: probe.grant,
      path: probe.path,
      status: result.status,
      shapeOk,
      expectedShape: probe.shape,
    });
    if (!shapeOk) denied.push(`${probe.name} (${probe.grant}) -> HTTP ${result.status}`);
  }

  if (denied.length > 0) {
    log({
      preflight: 'abort',
      reason: 'TOKEN_PERMISSIONS_INSUFFICIENT',
      denied,
      fix: 'them dung cac quyen tren vao khoi `permissions:` cua .github/workflows/autopilot-orchestrator.yml',
    });
    process.exitCode = 1;
    return;
  }

  log({ preflight: 'ok', repo, pr, headSha, probes: probes.length });
}

await run();
