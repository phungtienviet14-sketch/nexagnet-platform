import { describe, expect, it } from 'vitest';
import {
  WORKFLOW_CATALOG,
  describeWorkflow,
  describeWorkflowStep,
} from './workflow-catalog.js';
import {
  INTEGRATION_HANDOFF_KEY,
  SALES_HANDOFF_FOLLOWUP_KEY,
  workflowTemplate,
} from './workflow-registry.js';

/**
 * DANH BA metadata NGUOI-DOC cua khuon workflow.
 *
 * Bai kiem o day giu DUNG MOT bat bien khong the giu bang review: viec dat mot cai ten tieng
 * Viet KHONG duoc dong thoi doi cai khoa ma engine dinh tuyen. Hai thu do song canh nhau trong
 * cung mot ban ghi, va do la ly do de mot nguoi sua ten hien thi rat de tien tay sua luon khoa.
 */
describe('workflow-catalog — khoa may KHONG doi', () => {
  it('giu nguyen khoa may cua sales-handoff-followup', () => {
    const described = describeWorkflow(SALES_HANDOFF_FOLLOWUP_KEY);
    expect(described.key).toBe('sales-handoff-followup');
    expect(described.known).toBe(true);
  });

  it('giu nguyen khoa may cua integration-handoff', () => {
    expect(describeWorkflow(INTEGRATION_HANDOFF_KEY).key).toBe('integration-handoff');
  });

  it('khoa buoc giu nguyen tieng Anh, chi NHAN la tieng Viet', () => {
    const step = describeWorkflowStep(SALES_HANDOFF_FOLLOWUP_KEY, 'recheck-mark');
    expect(step.key).toBe('recheck-mark');
    expect(step.label).toBe('Kiểm tra lại và đánh dấu nhắc');
  });
});

describe('workflow-catalog — ten hien thi tieng Viet', () => {
  it('sales-handoff-followup co ten nghiep vu doc len la hieu', () => {
    const described = describeWorkflow(SALES_HANDOFF_FOLLOWUP_KEY);
    expect(described.displayName).toBe('Nhắc Sale sau bàn giao');
    expect(described.description).toContain('bàn giao');
  });

  it('cac buoc theo DUNG thu tu chay, khong phai thu tu bang chu cai', () => {
    expect(describeWorkflow(SALES_HANDOFF_FOLLOWUP_KEY).steps.map((s) => s.key)).toEqual([
      'load-state',
      'wait',
      'recheck-mark',
    ]);
  });

  it('moi buoc deu co nhan VA mo ta — nhan mot minh khong tra loi duoc "no dang lam gi"', () => {
    for (const [key, template] of Object.entries(WORKFLOW_CATALOG)) {
      for (const step of template.steps) {
        expect(step.label.length, `${key}/${step.key} thieu nhan`).toBeGreaterThan(0);
        expect(step.description.length, `${key}/${step.key} thieu mo ta`).toBeGreaterThan(0);
      }
    }
  });
});

/**
 * FALLBACK AN TOAN. Mot khuon chua co metadata phai hien duoc KHOA KY THUAT chu khong duoc
 * bien mat, va tuyet doi khong duoc bia ra mot cai ten tieng Viet nghe hop ly.
 */
describe('workflow-catalog — khuon chua khai metadata', () => {
  it('lay chinh khoa may lam ten hien thi, va danh dau la CHUA BIET', () => {
    const described = describeWorkflow('khuon-chua-ton-tai');
    expect(described.key).toBe('khuon-chua-ton-tai');
    expect(described.displayName).toBe('khuon-chua-ton-tai');
    expect(described.known).toBe(false);
    expect(described.steps).toEqual([]);
  });

  it('KHONG bia mo ta cho khuon chua biet', () => {
    expect(describeWorkflow('khuon-chua-ton-tai').description).toBe('');
  });

  it('buoc chua khai metadata van hien khoa ky thuat lam nhan', () => {
    const step = describeWorkflowStep(SALES_HANDOFF_FOLLOWUP_KEY, 'buoc-la');
    expect(step.key).toBe('buoc-la');
    expect(step.label).toBe('buoc-la');
    expect(step.description).toBe('');
  });
});

/**
 * CONG cho khuon thu hai: mot khuon co trong ban dang chay ma khong co metadata nguoi-doc se
 * hien ra console duoi dang mot chuoi may — dung dieu ca phien nay sinh ra de tranh. Bai nay do
 * ngay khi co nguoi them khuon moi vao `workflow-registry.ts` ma quen danh ba.
 */
describe('workflow-catalog — phu het khuon dang chay', () => {
  it('moi khuon trong danh ba khuon deu co metadata nguoi-doc', () => {
    for (const key of [INTEGRATION_HANDOFF_KEY, SALES_HANDOFF_FOLLOWUP_KEY]) {
      // `workflowTemplate` nem neu khoa khong ton tai — nen vong nay cung khang dinh luon rang
      // hai hang so tren van la khuon THAT.
      expect(workflowTemplate(key).key).toBe(key);
      expect(describeWorkflow(key).known, `khuon '${key}' thieu metadata nguoi-doc`).toBe(true);
    }
  });
});

/**
 * DA KHACH: danh ba nay la NEN TANG. Mot khach khong duoc phep doi ten nghiep vu cua mot khuon
 * dung chung, vi ten do mo ta CO CHE cua khuon chu khong mo ta san pham cua khach.
 */
describe('workflow-catalog — trung tinh voi khach', () => {
  it('khong nhac ten khach nao trong metadata', () => {
    const text = JSON.stringify(WORKFLOW_CATALOG).toLowerCase();
    for (const slug of ['ultty', 'amico', 'netviet', 'wata']) {
      expect(text, `metadata nhac ten khach '${slug}'`).not.toContain(slug);
    }
  });

  it('khong nhac tu vung rieng cua mot nganh hang', () => {
    const text = JSON.stringify(WORKFLOW_CATALOG).toLowerCase();
    for (const word of ['kiotviet', 'zalo', 'sku', 'đại lý']) {
      expect(text, `metadata nhac tu vung rieng '${word}'`).not.toContain(word);
    }
  });
});
