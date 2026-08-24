import { defineDecisionVocabulary } from '../observability/decision-vocabulary.js';

/**
 * TU VUNG QUYET DINH CUA KENH — thuoc `messaging`.
 *
 * CHOT CHAN duy nhat cua moi duong gui ra. Truoc day buoc `outbound.send_confirmation` chi do
 * duoc thanh/bai TONG THE: mot lan gui hong vi Zalo tra 429 va mot lan hong vi chua dang nhap
 * trong giong het nhau tren trace, ma hai chuyen do can hai hanh dong sua khac han.
 */
export const CHANNEL_SEND_REASONS = [
  'SENT',
  /** Ben goi khong noi gui kenh nao — tu choi doan, khong gui bua. */
  'REPLY_CHANNEL_MISSING',
  /** Kenh khong ho tro loai noi dung (vd anh tren kenh chi co text). */
  'CAPABILITY_UNSUPPORTED',
  /** Adapter nem loi — chi tiet nam o `detail.errorName`, khong o van ban tin. */
  'ADAPTER_FAILED',
] as const;
export type ChannelSendReason = (typeof CHANNEL_SEND_REASONS)[number];

export const CHANNEL_DECISIONS = defineDecisionVocabulary({
  owner: 'messaging',
  points: ['channel.send'],
  labels: {
    SENT: 'Đã gửi ra kênh',
    REPLY_CHANNEL_MISSING: 'Thiếu replyChannel — từ chối đoán kênh gửi',
    CAPABILITY_UNSUPPORTED: 'Kênh không hỗ trợ loại nội dung này',
    ADAPTER_FAILED: 'Adapter kênh trả về lỗi',
  } satisfies Record<ChannelSendReason, string>,
});
