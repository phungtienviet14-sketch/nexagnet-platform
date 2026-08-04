import { describe, expect, it } from 'vitest';
import { broadcastRequestSchema, MAX_BROADCAST_TEXT } from '../broadcast.js';

describe('broadcastRequestSchema', () => {
  it('chap nhan yeu cau toi thieu (chi text) — dryRun mac dinh false, gui tat ca nhom', () => {
    const parsed = broadcastRequestSchema.parse({ text: 'Khuyến mãi tháng 7: giảm 10%' });
    expect(parsed.dryRun).toBe(false);
    expect(parsed.groupChatIds).toBeUndefined();
  });

  it('cat khoang trang thua va giu tap nhom da chon', () => {
    const parsed = broadcastRequestSchema.parse({
      text: '  Sale sốc  ',
      groupChatIds: ['zgr-a', 'zgr-b'],
      dryRun: true,
    });
    expect(parsed.text).toBe('Sale sốc');
    expect(parsed.groupChatIds).toEqual(['zgr-a', 'zgr-b']);
    expect(parsed.dryRun).toBe(true);
  });

  it('loai text rong', () => {
    expect(() => broadcastRequestSchema.parse({ text: '   ' })).toThrow();
  });

  it('loai text vuot gioi han Zalo', () => {
    const tooLong = 'a'.repeat(MAX_BROADCAST_TEXT + 1);
    expect(() => broadcastRequestSchema.parse({ text: tooLong })).toThrow();
  });
});
