import { describe, expect, it } from 'vitest';
import { WORKFLOW_VERSION_SEPARATOR, engineWorkflowName } from './workflow-engine.port.js';
import { INTEGRATION_HANDOFF_KEY, workflowTemplate } from './workflow-registry.js';

/**
 * HOP DONG TEN WORKFLOW — bo ky tu nay la cua ENGINE, khong phai so thich cua ta.
 *
 * ---------------------------------------------------------------------------
 * Hatchet tu choi dang ky voi thong bao:
 *
 *   validation failed on field 'CreateWorkflowVersionOpts.Name':
 *   Hatchet names must match the regex ^[a-zA-Z0-9\.\-_]+$
 *
 * Va no tu choi luc WORKER KHOI DONG — tuc la luc DEPLOY, khong phai luc review. Mau `<key>:v1`
 * ma gan nhu moi ban thiet ke hay viet KHONG dang ky duoc, va dieu do chi lo ra khi da len VM.
 *
 * Bai nay keo cai chet do ve som nhat co the: mot cau `expect` chay trong vai mili giay.
 */

/** Sao nguyen tu thong bao loi cua engine. Doi mot ky tu o day la doi HOP DONG voi engine. */
const HATCHET_NAME_CHARSET = /^[a-zA-Z0-9._-]+$/;

describe('hop dong ten workflow voi engine', () => {
  it('dau phan cach la DAU CHAM — khong phai hai cham', () => {
    expect(WORKFLOW_VERSION_SEPARATOR).toBe('.');
    expect(engineWorkflowName('integration-handoff', 'v1')).toBe('integration-handoff.v1');
  });

  it('MOI phien ban co trong danh ba deu sinh ra ten HOP LE — quet ca bang, khong go tay tung cai', () => {
    // Quet BANG chu khong liet ke: them `v3` vao `workflow-registry.ts` ma dat ten sai se lam
    // bai nay do NGAY, chu khong do luc worker khoi dong tren VM.
    const template = workflowTemplate(INTEGRATION_HANDOFF_KEY);
    const versions = Object.keys(template.versions);
    expect(versions.length).toBeGreaterThan(0);

    for (const version of versions) {
      const name = engineWorkflowName(template.key, version);
      expect(name, `ten '${name}' khong khop bo ky tu cua engine`).toMatch(HATCHET_NAME_CHARSET);
      // Va no phai mang phien ban — do la chinh co che ghim cua Gate A.
      expect(name.endsWith(`${WORKFLOW_VERSION_SEPARATOR}${version}`)).toBe(true);
    }
  });

  it('dau HAI CHAM bi NEM — day la mau sai ma tai lieu hay viet', () => {
    expect(() => engineWorkflowName('integration:handoff', 'v1')).toThrow(/WORKFLOW_KEY_INVALID/);
  });

  it("'latest' bi NEM — mot ten tro toi 'ban moi nhat' pha chinh viec ghim phien ban", () => {
    expect(() => engineWorkflowName('integration-handoff', 'latest')).toThrow(
      /WORKFLOW_VERSION_INVALID/,
    );
  });

  it.each(['v0', 'V1', 'v1,v2', 'v1 v2', '1', 'v', ''])(
    "phien ban sai khuon '%s' bi NEM",
    (version) => {
      expect(() => engineWorkflowName('integration-handoff', version)).toThrow(
        /WORKFLOW_VERSION_INVALID/,
      );
    },
  );

  it.each(['co khoang trang', 'dau/gach-cheo', 'ngoac(don)', 'dau@cong'])(
    "khoa sai khuon '%s' bi NEM",
    (key) => {
      expect(() => engineWorkflowName(key, 'v1')).toThrow(/WORKFLOW_KEY_INVALID/);
    },
  );
});
