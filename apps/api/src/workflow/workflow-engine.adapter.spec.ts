import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DisabledWorkflowEngineAdapter } from './disabled-workflow-engine.adapter.js';
import {
  createWorkflowEngineAdapter,
  type WorkflowEngineCredentials,
} from './workflow-engine.adapter.js';
import { WorkflowEnginePort, engineWorkflowName } from './workflow-engine.port.js';

/**
 * Ban gia cua adapter Hatchet — chi GHI LAI cau hinh ma ham dung bo, khong noi mang.
 *
 * Cac bai san co trong tep nay chi dung `'none'`/`undefined` nen khong bao gio cham toi nhanh
 * Hatchet; ban gia o day khong lam chung doi hanh vi.
 */
const constructed: Record<string, unknown>[] = [];

vi.mock('./hatchet/hatchet-workflow-engine.adapter.js', () => ({
  HatchetWorkflowEngineAdapter: class {
    constructor(config: Record<string, unknown>) {
      constructed.push(config);
    }
  },
}));

describe('engineWorkflowName — luat dat ten do GATE A xac lap', () => {
  it('ghep khoa va phien ban bang dau CHAM', () => {
    expect(engineWorkflowName('integration-handoff', 'v1')).toBe('integration-handoff.v1');
  });

  it('tu choi dau HAI CHAM — engine tu choi dang ky, va no tu choi luc DEPLOY chu khong luc review', () => {
    expect(() => engineWorkflowName('integration:handoff', 'v1')).toThrow(TypeError);
  });

  it('tu choi ky tu ngoai bo hop le cua Hatchet', () => {
    expect(() => engineWorkflowName('integration handoff', 'v1')).toThrow(TypeError);
    expect(() => engineWorkflowName('integration/handoff', 'v1')).toThrow(TypeError);
  });

  it('doi phien ban dang vN — `v1`, khong phai `1` hay `latest`', () => {
    expect(() => engineWorkflowName('integration-handoff', '1')).toThrow(TypeError);
    expect(() => engineWorkflowName('integration-handoff', 'latest')).toThrow(TypeError);
  });

  it('hai phien ban cua cung mot khoa ra hai ten khac nhau', () => {
    expect(engineWorkflowName('integration-handoff', 'v1')).not.toBe(
      engineWorkflowName('integration-handoff', 'v2'),
    );
  });
});

describe('createWorkflowEngineAdapter — chon hien thuc theo goi khach', () => {
  it('khach chua khai bao engine thi nhan ban VO HIEU HOA, khong doan nha cung cap', async () => {
    await expect(createWorkflowEngineAdapter(undefined)).resolves.toBeInstanceOf(
      DisabledWorkflowEngineAdapter,
    );
  });

  it('`none` cung ra ban vo hieu hoa', async () => {
    await expect(createWorkflowEngineAdapter('none')).resolves.toBeInstanceOf(
      DisabledWorkflowEngineAdapter,
    );
  });

  it('moi hien thuc deu la mot `WorkflowEnginePort` — nhan chi biet cong nay', async () => {
    await expect(createWorkflowEngineAdapter('none')).resolves.toBeInstanceOf(WorkflowEnginePort);
  });
});

/**
 * CAI HOP O GIUA khong duoc lam RUNG mot truong nao.
 *
 * ---------------------------------------------------------------------------
 * LOI DA XAY RA THAT (gd1-test, 25/08/2026):
 *
 * `workflow.module.ts` truyen `apiUrl`, `HatchetWorkflowEngineAdapter` biet doc `apiUrl`, ca hai
 * dau deu dung — va gia tri van khong bao gio toi noi, vi `createWorkflowEngineAdapter` dung lai
 * cau hinh TUNG TRUONG MOT va khong ai them `apiUrl` vao danh sach do.
 *
 * BA LY DO khong thu gi bat duoc no:
 *
 *   TypeScript  noi goi truyen bang spread co dieu kien (`...(x ? { apiUrl: x } : {})`), ma
 *               spread thi khong chiu kiem tra thuoc tinh thua -> khong co loi kieu.
 *   Bai kiem    bai cua adapter dung THANG constructor, nen no nhay qua dung cai hop bi hong.
 *   Runtime     `statusOf()` fail-open -> chi mot truong vang mat tren man hinh chan doan.
 *
 * Nen bai duoi day kiem CHINH CAI HOP, va kiem bang `toEqual` tren CA BO chu khong tung truong:
 * them mot truong moi vao `WorkflowEngineCredentials` roi quen noi day se lam DO ngay tai day.
 */
describe('createWorkflowEngineAdapter — cau hinh phai di QUA duoc, khong rung doc duong', () => {
  beforeEach(() => {
    constructed.length = 0;
  });

  it('MOI truong cua goi thong tin xac thuc deu toi duoc adapter', async () => {
    const credentials: Required<WorkflowEngineCredentials> = {
      token: 'test-token',
      hostPort: 'hatchet-engine:7070',
      tlsStrategy: 'none',
      apiUrl: 'http://hatchet-dashboard',
      dashboardBaseUrl: 'https://workflow-ultty-gd1-test.example.sslip.io',
      namespace: 'gd1',
    };

    await createWorkflowEngineAdapter('hatchet', credentials);

    // `toEqual` tren CA BO: mot truong bi bo quen trong ham se lam do ngay, khong can ai nho
    // them mot dong `expect` moi.
    expect(constructed).toHaveLength(1);
    expect(constructed[0]).toEqual(credentials);
  });

  it('truong khong khai thi VANG MAT, khong thanh chuoi rong', async () => {
    await createWorkflowEngineAdapter('hatchet', { token: 'test-token' });

    expect(constructed[0]).toEqual({ token: 'test-token' });
    // `api_url: ''` se de SDK lay goc rong thay vi rot ve duong suy-tu-token — tuc bien mot ban
    // trien khai dang chay binh thuong thanh hong.
    expect(constructed[0]).not.toHaveProperty('apiUrl');
  });
});

describe('DisabledWorkflowEngineAdapter — doc tra rong, GHI thi NEM', () => {
  const adapter = new DisabledWorkflowEngineAdapter();

  it('kich hoat workflow thi NEM, va loi chi dung file phai sua', async () => {
    await expect(
      adapter.trigger({
        workflowKey: 'integration-handoff',
        workflowVersion: 'v1',
        input: {},
        metadata: {},
      }),
    ).rejects.toThrow(/tenants\/<slug>\/tenant\.json/);
  });

  it('gui su kien thi NEM — do cung la mot lenh GHI', async () => {
    await expect(adapter.sendEvent('bat-ky', {})).rejects.toThrow();
  });

  it('huy run thi NEM', async () => {
    await expect(adapter.cancel('run-bat-ky')).rejects.toThrow();
  });

  it('doc mot run tra `null` thay vi nem — man hinh khong duoc vo vi khach chua bat engine', async () => {
    await expect(adapter.describeRun('run-bat-ky')).resolves.toBeNull();
  });

  it('dem run dang chay tra 0 — cong DRAIN cua thu tuc deploy van tra loi duoc', async () => {
    await expect(adapter.countInFlight('integration-handoff', 'v1')).resolves.toBe(0);
  });
});
