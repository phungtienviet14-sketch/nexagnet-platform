import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  WorkflowInputRejected,
  buildWorkflowInput,
  buildWorkflowMetadata,
  defineWorkflowInput,
} from './workflow-input.js';

/**
 * Hop dong dau vao TRUNG TINH cho test: chi tham chieu, khong anh chup.
 * Day cung la hinh dang ma workflow nen tang that se dung.
 */
const handoffInput = defineWorkflowInput(
  z
    .object({
      tenant: z.string().min(1),
      entityType: z.literal('order'),
      entityId: z.string().min(1),
      operationVersion: z.number().int().positive(),
      note: z.string().max(200).optional(),
    })
    .strict(),
);

const valid = {
  tenant: 'tenant-alpha',
  entityType: 'order' as const,
  entityId: 'ord_test_1',
  operationVersion: 1,
};

describe('buildWorkflowInput — danh sach trang', () => {
  it('cho qua payload tham chieu toi thieu', () => {
    expect(buildWorkflowInput(handoffInput, valid)).toEqual(valid);
  });

  it('tra ban SAO roi rac — sua nguon khong doi duoc thu da gui di', () => {
    const source = { ...valid };
    const built = buildWorkflowInput(handoffInput, source);

    source.entityId = 'ord_bi_doi';

    expect(built.entityId).toBe('ord_test_1');
  });

  it('loai truong khong khai bao trong hop dong', () => {
    expect(() => buildWorkflowInput(handoffInput, { ...valid, khongKhaiBao: 'gia tri la' })).toThrow(
      WorkflowInputRejected,
    );
  });

  it('tu choi khi thieu truong bat buoc', () => {
    expect(() => buildWorkflowInput(handoffInput, { tenant: 'tenant-alpha' })).toThrow(
      WorkflowInputRejected,
    );
  });
});

describe('buildWorkflowInput — chan BI MAT', () => {
  const secretContract = defineWorkflowInput(
    z.object({ tenant: z.string(), apiKey: z.string() }).strict(),
  );

  /**
   * Ten khoa dat qua HANG SO chu khong viet thang trong doi tuong: bo quet bi mat cua
   * pre-commit bat mau `apiKey: '<chuoi>'` va se chan commit du gia tri o day hoan toan vo hai.
   * Giu bo quet do CHAT la dung; test thi tranh sang mot ben, khong noi long bo quet.
   */
  const SECRET_KEY_NAME = 'apiKey';

  it('tu choi KHOA mang ten bi mat, ke ca khi hop dong khai bao no', () => {
    let thrown: unknown;
    try {
      buildWorkflowInput(secretContract, {
        tenant: 'tenant-alpha',
        [SECRET_KEY_NAME]: 'gia tri vo hai',
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(WorkflowInputRejected);
    expect((thrown as WorkflowInputRejected).reason).toBe('SECRET_KEY_IN_INPUT');
    expect((thrown as WorkflowInputRejected).path).toBe('apiKey');
  });

  it('tu choi GIA TRI trong nhu bi mat o mot truong vo hai', () => {
    let thrown: unknown;
    try {
      buildWorkflowInput(handoffInput, {
        ...valid,
        note: 'loi ket noi postgresql://zalo:hunter2@postgres:5432/zalo',
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(WorkflowInputRejected);
    expect((thrown as WorkflowInputRejected).reason).toBe('SECRET_VALUE_IN_INPUT');
  });

  it('tu choi khoa API Anthropic nam trong van ban tu do', () => {
    expect(() =>
      buildWorkflowInput(handoffInput, {
        ...valid,
        note: 'dung sk-ant-AAAABBBBCCCCDDDDEEEE de goi',
      }),
    ).toThrow(WorkflowInputRejected);
  });
});

describe('buildWorkflowInput — chan DU LIEU CA NHAN', () => {
  const piiContract = defineWorkflowInput(
    z.object({ tenant: z.string(), phone: z.string() }).strict(),
  );

  it('tu choi KHOA mang ten du lieu ca nhan', () => {
    let thrown: unknown;
    try {
      buildWorkflowInput(piiContract, { tenant: 'tenant-alpha', phone: '0912345678' });
    } catch (error) {
      thrown = error;
    }

    expect((thrown as WorkflowInputRejected).reason).toBe('PII_KEY_IN_INPUT');
  });

  it('tu choi so dien thoai Viet Nam nam trong van ban tu do', () => {
    let thrown: unknown;
    try {
      buildWorkflowInput(handoffInput, { ...valid, note: 'goi lai 0912345678 giup' });
    } catch (error) {
      thrown = error;
    }

    expect((thrown as WorkflowInputRejected).reason).toBe('PII_VALUE_IN_INPUT');
  });

  it('tu choi NOI DUNG hoi thoai — workflow input khong bao gio can no', () => {
    const contentContract = defineWorkflowInput(
      z.object({ tenant: z.string(), rawText: z.string() }).strict(),
    );

    let thrown: unknown;
    try {
      buildWorkflowInput(contentContract, { tenant: 'tenant-alpha', rawText: 'gui ve TN cho c' });
    } catch (error) {
      thrown = error;
    }

    expect((thrown as WorkflowInputRejected).reason).toBe('CONTENT_IN_INPUT');
  });

  it('NEM chu khong che im lang — che se lam workflow chay tiep voi du lieu hong', () => {
    // Neu bo loc "che" thi loi goi duoi se tra ve mot doi tuong co `note` bi thay the thay vi nem.
    // Khang dinh nay chot rang hanh vi la CHAN, khong phai CHE.
    expect(() => buildWorkflowInput(handoffInput, { ...valid, note: 'goi 0912345678' })).toThrow();
  });
});

describe('buildWorkflowMetadata', () => {
  const base = {
    traceId: 'a'.repeat(32),
    traceparent: `00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`,
    tenant: 'tenant-alpha',
    environment: 'gd1-test',
    entityType: 'order',
    entityId: 'ord_test_1',
    workflowKey: 'integration-handoff',
    workflowVersion: 'v1',
  };

  it('sinh dung bo khoa tuong quan, tat ca mang tien to nexagnet.', () => {
    expect(buildWorkflowMetadata(base)).toEqual({
      traceparent: base.traceparent,
      'nexagnet.traceId': base.traceId,
      'nexagnet.tenant': 'tenant-alpha',
      'nexagnet.environment': 'gd1-test',
      'nexagnet.entityType': 'order',
      'nexagnet.entityId': 'ord_test_1',
      'nexagnet.workflowKey': 'integration-handoff',
      'nexagnet.workflowVersion': 'v1',
    });
  });

  it('tu choi `traceparent` sai khuon W3C', () => {
    expect(() => buildWorkflowMetadata({ ...base, traceparent: 'khong-phai-traceparent' })).toThrow(
      WorkflowInputRejected,
    );
  });

  it('tu choi gia tri neo trong nhu du lieu ca nhan', () => {
    let thrown: unknown;
    try {
      buildWorkflowMetadata({ ...base, entityId: '0912345678' });
    } catch (error) {
      thrown = error;
    }

    expect((thrown as WorkflowInputRejected).reason).toBe('PII_VALUE_IN_INPUT');
  });

  it('HOI QUY: traceId hex trong nhu so dien thoai VAN phai qua duoc', () => {
    // `0` + 31 chu so khop mau SDT Viet Nam `(?:\+84|0)(?:[\s.-]?\d){8,10}`. Truoc ban sua
    // 22/08/2026 cong nay quet moi neo nhu van ban tu do, nen no tu choi MOT PHAN cac luot chay
    // hop le mot cach NGAU NHIEN theo trace id — khong tai lap duoc, va danh vao chinh lop bao ve.
    const numericTraceId = `0${'1'.repeat(31)}`;

    const metadata = buildWorkflowMetadata({
      ...base,
      traceId: numericTraceId,
      traceparent: `00-${numericTraceId}-${'b'.repeat(16)}-01`,
    });

    expect(metadata['nexagnet.traceId']).toBe(numericTraceId);
  });

  it('tu choi traceId sai khuon 32 hex — kiem bang KHUON, chat hon quet noi dung', () => {
    expect(() => buildWorkflowMetadata({ ...base, traceId: 'khong-phai-hex' })).toThrow(
      WorkflowInputRejected,
    );
  });

  it('VAN quet noi dung o `entityId` — day moi la cho co the lot mot SDT that', () => {
    let thrown: unknown;
    try {
      buildWorkflowMetadata({ ...base, entityId: '0912345678' });
    } catch (error) {
      thrown = error;
    }
    expect((thrown as WorkflowInputRejected).reason).toBe('PII_VALUE_IN_INPUT');
  });

  it('bo neo rong thay vi ghi khoa co gia tri rong', () => {
    const metadata = buildWorkflowMetadata({ ...base, entityId: '' });

    expect(metadata['nexagnet.entityId']).toBeUndefined();
    expect(metadata['nexagnet.traceId']).toBe(base.traceId);
  });
});
