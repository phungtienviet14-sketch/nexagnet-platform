import { describe, expect, it } from 'vitest';
import { DisabledWorkflowEngineAdapter } from './disabled-workflow-engine.adapter.js';
import { createWorkflowEngineAdapter } from './workflow-engine.adapter.js';
import { WorkflowEnginePort, engineWorkflowName } from './workflow-engine.port.js';

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
