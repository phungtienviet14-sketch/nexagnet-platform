import { describe, expect, it } from 'vitest';
import { engineWorkflowName } from './workflow-engine.port.js';
import { INTEGRATION_HANDOFF_KEY } from './workflow-registry.js';
import { WORKFLOW_WORKER_VERSION_ENV, resolveWorkerRegistration } from './worker-registration.js';

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
