import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DOCUMENT_REQUIREMENT_POLICY,
  anchorHintFor,
  evaluateDocumentRecord,
  evaluateDocumentWithdraw,
  missingDocumentTypes,
} from './document-lifecycle.js';
import { OPERATIONAL_DOCUMENT_TYPES } from './document.types.js';
import { RECEIPT_HANDOVER_PREDECESSOR, RECEIPT_HANDOVER_STATES } from './handover.types.js';

/**
 * DC-010 — luat cua chung tu van hanh, do o tang HAM THUAN.
 */

const record = (over: Partial<Parameters<typeof evaluateDocumentRecord>[0]> = {}) => ({
  runTerminal: false,
  basis: 'EXTERNAL_PHYSICAL' as const,
  hasFileId: false,
  externalNote: 'Bien nhan giay co chu ky',
  ...over,
});

describe('Ghi mot chung tu — DC-010', () => {
  it('ghi duoc theo duong chung tu giay', () => {
    expect(evaluateDocumentRecord(record())).toEqual({
      allowed: true,
      reason: 'DOCUMENT_RECORDED',
    });
  });

  it('ghi duoc theo duong ban so khi co ma tep', () => {
    expect(
      evaluateDocumentRecord(record({ basis: 'DIGITAL_FILE', hasFileId: true, externalNote: '' })),
    ).toEqual({ allowed: true, reason: 'DOCUMENT_RECORDED' });
  });

  /**
   * Mot hang khai `DIGITAL_FILE` ma khong co ma tep la mot chung tu ban so KHONG CO ban so nao —
   * va no van dem duoc trong moi phep dem "co bao nhieu chung tu".
   */
  it('khai ban so ma khong co ma tep thi bi tu choi', () => {
    expect(evaluateDocumentRecord(record({ basis: 'DIGITAL_FILE', hasFileId: false })).reason).toBe(
      'DOCUMENT_BASIS_MISMATCH',
    );
  });

  it('khai chung tu giay ma van cam mot ma tep thi bi tu choi', () => {
    expect(evaluateDocumentRecord(record({ hasFileId: true })).reason).toBe(
      'DOCUMENT_BASIS_MISMATCH',
    );
  });

  it('chung tu giay phai noi ro dang cam cai gi', () => {
    expect(evaluateDocumentRecord(record({ externalNote: '   ' })).reason).toBe(
      'DOCUMENT_EXTERNAL_NOTE_REQUIRED',
    );
  });

  it('khong ghi duoc tren mot vong chay da ket thuc', () => {
    expect(evaluateDocumentRecord(record({ runTerminal: true })).reason).toBe(
      'DOCUMENT_RUN_TERMINAL',
    );
  });

  it('bao vong chay da ket thuc truoc, khong bao can cu sai', () => {
    expect(
      evaluateDocumentRecord(record({ runTerminal: true, basis: 'DIGITAL_FILE' })).reason,
    ).toBe('DOCUMENT_RUN_TERMINAL');
  });
});

describe('Bia mo mot chung tu — DC-010', () => {
  it('bia mo duoc mot to con hieu luc chua ban giao', () => {
    expect(evaluateDocumentWithdraw({ status: 'ACTIVE', handedOver: false })).toEqual({
      allowed: true,
      reason: 'DOCUMENT_WITHDRAWN',
    });
  });

  /**
   * BIEN BAT BIEN — `#279` O2/O12 bai 7. Tu luc to giay roi khoi tay lai xe va van phong ghi la da
   * nhan, ban ghi so cua no khong con la mot ban nhap.
   */
  it('KHONG bia mo duoc mot to da ban giao ve van phong', () => {
    expect(evaluateDocumentWithdraw({ status: 'ACTIVE', handedOver: true })).toEqual({
      allowed: false,
      reason: 'DOCUMENT_HANDOVER_LOCKED',
    });
  });

  it('khong bia mo lai mot to da bia mo', () => {
    expect(evaluateDocumentWithdraw({ status: 'WITHDRAWN', handedOver: false }).reason).toBe(
      'DOCUMENT_ALREADY_WITHDRAWN',
    );
  });

  it('bao da bia mo truoc, khong bao khoa ban giao', () => {
    expect(evaluateDocumentWithdraw({ status: 'WITHDRAWN', handedOver: true }).reason).toBe(
      'DOCUMENT_ALREADY_WITHDRAWN',
    );
  });
});

describe('Canh bao thieu chung tu — DC-011', () => {
  /**
   * `#279` O3: *"Do not force every document for every customer/site."* Mac dinh ho so B chi doi
   * MOT loai — ba loai con lai phu thuoc vao tung nha may A, va ep chung se lam moi chang di qua
   * mot kho khong co can deu hien mot canh bao gia.
   */
  it('mac dinh ho so B chi doi mot loai', () => {
    expect(DEFAULT_DOCUMENT_REQUIREMENT_POLICY.requiredOnLoadedLeg).toEqual(['DELIVERY_RECEIPT']);
  });

  it('tra ve DANH SACH loai con thieu, khong mot `boolean`', () => {
    expect(missingDocumentTypes(DEFAULT_DOCUMENT_REQUIREMENT_POLICY, [])).toEqual([
      'DELIVERY_RECEIPT',
    ]);
    expect(
      missingDocumentTypes(DEFAULT_DOCUMENT_REQUIREMENT_POLICY, ['DELIVERY_RECEIPT']),
    ).toEqual([]);
  });

  it('chinh sach doi duoc theo khach, khong phai mot hang so cua nen tang', () => {
    const strict = { requiredOnLoadedLeg: ['WEIGH_TICKET', 'DELIVERY_RECEIPT'] } as const;
    expect(missingDocumentTypes(strict, ['DELIVERY_RECEIPT'])).toEqual(['WEIGH_TICKET']);
  });

  /** Goi y neo la de giao dien dat nut dung cho — no KHONG tham gia vao mot quyet dinh nao. */
  it('moi loai chung tu co goi y neo, va `OTHER` khong bi ep vao dau', () => {
    for (const type of OPERATIONAL_DOCUMENT_TYPES) {
      const hint = anchorHintFor(type);
      if (type === 'OTHER') expect(hint).toBeNull();
      else expect(hint?.length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('Thu tu ban giao bien nhan — DC-012', () => {
  /**
   * Mot chuoi ban giao nhay coc la mot chuoi khong doi chieu duoc voi thuc te: van phong khong the
   * gui di mot to giay ma chinh ho chua ghi la da nhan.
   */
  it('ba buoc noi tiep nhau, va buoc dau khong doi gi', () => {
    expect(RECEIPT_HANDOVER_PREDECESSOR.WITH_DRIVER).toBeNull();
    expect(RECEIPT_HANDOVER_PREDECESSOR.RETURNED_TO_OFFICE).toBe('WITH_DRIVER');
    expect(RECEIPT_HANDOVER_PREDECESSOR.SUBMITTED_FOR_CONFIRMATION).toBe('RETURNED_TO_OFFICE');
  });

  it('moi trang thai deu co mot muc trong bang thu tu — khong gia tri nao bi bo quen', () => {
    for (const state of RECEIPT_HANDOVER_STATES) {
      expect(Object.hasOwn(RECEIPT_HANDOVER_PREDECESSOR, state)).toBe(true);
    }
  });
});
