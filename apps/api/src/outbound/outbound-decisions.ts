import { OUTBOUND_AUTHORITY_REASON_LABELS, type OutboundAuthorityReason } from '@netviet/shared';
import { defineDecisionVocabulary } from '../observability/decision-vocabulary.js';

/**
 * TU VUNG QUYET DINH CUA RANH GIOI OUTBOUND — thuoc `outbound`, dung cho MOI khach.
 *
 * Hai diem quyet dinh, va chung KHONG duoc gop lam mot:
 *
 *   · `outbound.authority`  — luc SOAN. Cau hoi: "ban nhap nay co du tham quyen de tro thanh mot
 *                             tin gui duoc khong?". Tra loi mot lan, roi ghim vao trace.
 *   · `outbound.send_guard` — luc GUI. Cau hoi: "cai sap ra khoi he thong co mang quyet dinh do
 *                             khong?". Day la cho DUY NHAT ma ca duong tu dong lan nut "Duyệt &
 *                             gửi" cua Sale cung di qua.
 *
 * Tach ra vi hai cau hoi hong theo hai kieu khac han nhau: cau thu nhat hong = he thong da soan
 * mot thu khong duoc phep noi; cau thu hai hong = mot ban ghi khong co quyet dinh nao van duoc
 * ai do bam gui. Gop lai thi mot su co bat ky cung chi hien ra mot ma duy nhat, va nguoi truc
 * khong biet phai sua ben soan hay ben gui.
 *
 * BO MA dung chung `OUTBOUND_AUTHORITY_REASONS` cua `@netviet/shared`: verdict di theo trace ra
 * toi console, nen mot bo ma thu hai o day se lam hai mat phang noi hai thu tieng.
 */
export const OUTBOUND_DECISIONS = defineDecisionVocabulary({
  owner: 'outbound',
  points: ['outbound.authority', 'outbound.send_guard'],
  labels: OUTBOUND_AUTHORITY_REASON_LABELS satisfies Record<OutboundAuthorityReason, string>,
});
