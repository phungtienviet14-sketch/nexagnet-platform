import { describe, expect, it, vi } from 'vitest';
import { MAX_SEEN, MessageGuard, processWithRetry } from './message-guard.js';

describe('MessageGuard — chong trung + chong chay song song', () => {
  it('tin moi -> claim duoc', () => {
    const guard = new MessageGuard();
    expect(guard.claim('a')).toBe(true);
  });

  it('tin DANG xu ly -> claim lan 2 bi tu choi (chong chay song song cung 1 tin)', () => {
    const guard = new MessageGuard();
    guard.claim('a');
    expect(guard.claim('a')).toBe(false);
  });

  it('tin da xu ly XONG -> khong claim lai duoc', () => {
    const guard = new MessageGuard();
    guard.claim('a');
    guard.complete('a');
    expect(guard.claim('a')).toBe(false);
  });

  it('tin THAT BAI (release) -> claim lai duoc de xu ly lai', () => {
    const guard = new MessageGuard();
    guard.claim('a');
    guard.release('a');
    expect(guard.claim('a')).toBe(true);
  });

  it('chan phinh bo nho: qua MAX_SEEN thi bo id cu nhat', () => {
    const guard = new MessageGuard();
    for (let i = 0; i <= MAX_SEEN; i++) {
      guard.claim(`id-${i}`);
      guard.complete(`id-${i}`);
    }
    // id-0 da bi day ra khoi bo nho -> claim lai duoc; id moi nhat thi khong.
    expect(guard.claim('id-0')).toBe(true);
    expect(guard.claim(`id-${MAX_SEEN}`)).toBe(false);
  });
});

describe('processWithRetry — thu lai khi loi tam thoi', () => {
  const noop = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };

  it('thanh cong ngay lan dau -> goi 1 lan, tra ket qua', async () => {
    const run = vi.fn(async () => 'ok');
    const result = await processWithRetry(run, 'msg-1', noop, 0);
    expect(result).toBe('ok');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('loi TAM THOI roi thanh cong -> thu lai va tra ket qua', async () => {
    const run = vi.fn(async () => 'ok');
    run.mockRejectedValueOnce(new Error('LLM timeout'));
    const result = await processWithRetry(run, 'msg-1', noop, 0);
    expect(result).toBe('ok');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('loi HET LUOT -> tra null (de ben goi KHONG danh dau da xu ly)', async () => {
    const run = vi.fn(async () => {
      throw new Error('LLM chet han');
    });
    const result = await processWithRetry(run, 'msg-1', noop, 0);
    expect(result).toBeNull();
    expect(run).toHaveBeenCalledTimes(3); // 1 goc + 2 lan thu lai
  });

  it('loi het luot -> log ERROR kem id tin de con lan ra xu ly lai', async () => {
    const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const run = vi.fn(async () => {
      throw new Error('boom');
    });
    await processWithRetry(run, 'msg-abc', logger, 0);
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error.mock.calls[0]![0]).toContain('msg-abc');
  });
});
