import { describe, expect, it } from 'vitest';
import { engineWorkflowName } from './workflow-engine.port.js';
import { INTEGRATION_HANDOFF_KEY, SALES_HANDOFF_FOLLOWUP_KEY } from './workflow-registry.js';
import {
  WORKFLOW_WORKER_TEMPLATE_ENV,
  WORKFLOW_WORKER_VERSION_ENV,
  resolveWorkerRegistration,
} from './worker-registration.js';

/**
 * BAT BIEN SO MOT cua Gate A: MOT BAN TRIEN KHAI WORKER DANG KY DUNG MOT PHIEN BAN.
 *
 * Ca file nay ton tai de bat bien do hong o LUC TEST chu khong phai luc deploy. Do la bai hoc
 * dat nhat cua phien truoc: mau `<key>:v1` chi lo ra khi worker khoi dong tren engine that
 * (`Hatchet names must match the regex ^[a-zA-Z0-9\.\-_]+$`) — tuc la lo ra luc deploy.
 *
 * Phan phan giai phien ban la logic THUAN, khong can engine. Tach no ra khoi service Nest de
 * kiem duoc bang bon dong, va de moi che do hong deu co mot bai test goi ten no.
 */
const env = (value?: string): NodeJS.ProcessEnv =>
  value === undefined ? {} : { [WORKFLOW_WORKER_VERSION_ENV]: value };

describe('resolveWorkerRegistration', () => {
  it('NEM khi thieu bien phien ban, va noi ro TEN bien phai dat', () => {
    // Mot worker khong biet minh mang phien ban nao la mot worker khong duoc phep chay: no se
    // doan, va doan sai o day nghia la run cu bi cuop mat.
    expect(() => resolveWorkerRegistration(env())).toThrow(/WORKFLOW_WORKER_VERSION/);
  });

  it('NEM khi bien phien ban rong hoac chi co khoang trang', () => {
    // `environment:` cua compose de dang render ra mot chuoi rong. Chuoi rong KHONG duoc coi la
    // "chua dat" mot cach im lang roi lui ve mac dinh nao do.
    expect(() => resolveWorkerRegistration(env(''))).toThrow(/WORKFLOW_WORKER_VERSION/);
    expect(() => resolveWorkerRegistration(env('   '))).toThrow(/WORKFLOW_WORKER_VERSION/);
  });

  it('NEM voi phien ban ban dang chay KHONG mang — trieu chung deploy nguoc phien ban', () => {
    // `workflow-registry.ts` da co ma nay. Kiem o day de chac rang worker DUNG no, chu khong
    // tu dang ky mot ten ma khong ai biet chay bang gi.
    expect(() => resolveWorkerRegistration(env('v9'))).toThrow(/WORKFLOW_VERSION_UNKNOWN/);
  });

  it("NEM voi 'latest' — mot ten tro toi ban moi nhat pha chinh viec ghim phien ban", () => {
    expect(() => resolveWorkerRegistration(env('latest'))).toThrow(/WORKFLOW_VERSION_INVALID/);
  });

  it('NEM voi danh sach nhieu phien ban — mot container KHONG duoc phuc vu hai phien ban', () => {
    // Day la cach nguoi ta se thu "tiet kiem mot container". Neu lot, worker do se nhan viec cua
    // ca `.v1` lan `.v2` va bang chung Gate A khong con y nghia gi.
    expect(() => resolveWorkerRegistration(env('v1,v2'))).toThrow();
    expect(() => resolveWorkerRegistration(env('v1 v2'))).toThrow();
  });

  it('tra ve ten engine LAY TU engineWorkflowName, khong phai noi chuoi noi tuyen', () => {
    const registration = resolveWorkerRegistration(env('v1'));

    expect(registration.workflowKey).toBe(INTEGRATION_HANDOFF_KEY);
    expect(registration.workflowVersion).toBe('v1');
    // Khang dinh BANG chinh ham chuan — neu ai do doi dau phan cach o mot noi thi test nay do,
    // thay vi hai noi lech nhau am tham.
    expect(registration.engineName).toBe(engineWorkflowName(INTEGRATION_HANDOFF_KEY, 'v1'));
    expect(registration.engineName).toBe('integration-handoff.v1');
  });

  it('ten worker hop le voi bo ky tu cua engine va khong chua dau hai cham', () => {
    const registration = resolveWorkerRegistration(env('v1'));

    expect(registration.workerName).toMatch(/^[a-zA-Z0-9._-]+$/);
    expect(registration.workerName).not.toContain(':');
    // Ten phai NOI RA phien ban: khi nhin danh sach worker tren dashboard, "cai nao dang phuc vu
    // phien ban nao" phai doc duoc ngay, khong phai suy ra.
    expect(registration.workerName).toContain('v1');
  });
});

/**
 * CHIEU THU HAI: container nay phuc vu KHUON nao.
 *
 * Cho toi 25/08/2026 chieu nay chua bao gio duoc dat tuong minh o dau ca — `compose.yaml` chi
 * dat phien ban, va `resolveWorkerRegistration` roi ve mac dinh `integration-handoff`. Khi mot
 * khuon THU HAI (`sales-handoff-followup.v1`) len main, hau qua la:
 *
 *   · worker duy nhat cua stack van dang ky `integration-handoff.v1`;
 *   · khong tien trinh nao dang ky `sales-handoff-followup.v1`;
 *   · va KHONG CO gi bao dong — container xanh, healthcheck 200, dashboard co worker.
 *
 * Moi run cua khuon moi chi nam trong hang doi. Vinh vien.
 *
 * Nen bien nay duoc do o CA HAI dau: o day (bien -> dang ky) va o
 * `deploy/netviet/workflow-isolation.contract.test.mjs` (compose -> bien).
 */
const withTemplate = (template: string, version = 'v1'): NodeJS.ProcessEnv => ({
  [WORKFLOW_WORKER_VERSION_ENV]: version,
  [WORKFLOW_WORKER_TEMPLATE_ENV]: template,
});

describe('resolveWorkerRegistration — KHUON den tu bien moi truong', () => {
  it('khong khai khuon -> mac dinh `integration-handoff` (giu container dang chay song)', () => {
    // Mac dinh nay PHAI giu: container worker tren gd1-test duoc deploy truoc khi bien nay ton
    // tai. Bat buoc no se lam container do CHET o lan deploy ke tiep.
    expect(resolveWorkerRegistration(env('v1')).workflowKey).toBe(INTEGRATION_HANDOFF_KEY);
  });

  it('`WORKFLOW_WORKER_TEMPLATE=sales-handoff-followup` -> dang ky DUNG khuon do', () => {
    const registration = resolveWorkerRegistration(withTemplate(SALES_HANDOFF_FOLLOWUP_KEY));

    expect(registration.workflowKey).toBe(SALES_HANDOFF_FOLLOWUP_KEY);
    expect(registration.workflowVersion).toBe('v1');
    expect(registration.engineName).toBe(engineWorkflowName(SALES_HANDOFF_FOLLOWUP_KEY, 'v1'));
    expect(registration.engineName).toBe('sales-handoff-followup.v1');
  });

  it('hai khuon -> HAI ten engine khac nhau, tuc hai tien trinh khong cuop viec cua nhau', () => {
    // Day la ly do "mot khuon = mot container" doc duoc thanh mot khang dinh: engine dinh tuyen
    // theo ten, nen hai ten khac nhau la dieu kien de hai worker song song ma khong dam nhau.
    const integration = resolveWorkerRegistration(withTemplate(INTEGRATION_HANDOFF_KEY));
    const salesHandoff = resolveWorkerRegistration(withTemplate(SALES_HANDOFF_FOLLOWUP_KEY));

    expect(integration.engineName).not.toBe(salesHandoff.engineName);
    // Ten TIEN TRINH cung phai khac — hai worker trung ten tren dashboard thi khong ai biet
    // cai nao dang DRAIN.
    expect(integration.workerName).not.toBe(salesHandoff.workerName);
    expect(salesHandoff.workerName).toContain(SALES_HANDOFF_FOLLOWUP_KEY);
  });

  it('NEM voi khuon khong co trong ban dang chay — bat mot bien go nham NGAY', () => {
    // Che do hong ma khang dinh nay chan: worker dang ky mot ten khong ai goi, roi nam im cho
    // toi luc co nguoi hoi "sao run cua toi khong chay".
    expect(() => resolveWorkerRegistration(withTemplate('khuon-go-nham'))).toThrow(
      /khuon-go-nham/,
    );
  });

  it('khuon rong / chi khoang trang -> ve mac dinh, khong dang ky mot ten rong', () => {
    // `environment:` cua compose de dang render ra chuoi rong khi mot bien chua duoc dat.
    expect(resolveWorkerRegistration(withTemplate('')).workflowKey).toBe(INTEGRATION_HANDOFF_KEY);
    expect(resolveWorkerRegistration(withTemplate('   ')).workflowKey).toBe(
      INTEGRATION_HANDOFF_KEY,
    );
  });
});
