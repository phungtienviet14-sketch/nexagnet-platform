import { loadEnv, type ReplyChannel } from '@netviet/shared';

/**
 * Don/luot CU chua co `replyChannel` chi duoc suy ra khi runtime KHONG phai hybrid.
 *
 * O che do `hybrid` co hai kenh cung song, nen doan la doan sai mot nua so lan — tra `undefined`
 * de ben goi tu choi gui, thay vi ban vao nham kenh.
 */
export function legacyReplyChannel(): ReplyChannel | undefined {
  const mode = loadEnv().CHANNEL_MODE;
  return mode === 'hybrid' ? undefined : mode;
}
