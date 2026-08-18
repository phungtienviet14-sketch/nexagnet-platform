import { describe, expect, it, vi } from 'vitest';
import { InMemoryMessagesRepository } from './messages.repository.js';
import { OutboundRecorder } from './outbound-recorder.js';

describe('OutboundRecorder', () => {
  it('luu tin da gui voi direction=outbound va senderRole=bot', async () => {
    const repository = new InMemoryMessagesRepository();
    const recorder = new OutboundRecorder(repository);

    await recorder.record({
      chatId: 'group-1',
      text: 'Da xac nhan don 10 ghe Felix a nhe',
      receipt: { externalMessageId: '99887766' },
    });

    const [row] = repository.list();
    expect(row).toMatchObject({
      externalChatId: 'group-1',
      externalMessageId: '99887766',
      source: 'system_outbound',
      direction: 'outbound',
      senderRole: 'bot',
      text: 'Da xac nhan don 10 ghe Felix a nhe',
    });
  });

  it('kenh khong tra ve id thi van luu duoc, khong bo mat tin', async () => {
    const repository = new InMemoryMessagesRepository();
    const recorder = new OutboundRecorder(repository);

    await recorder.record({ chatId: 'group-1', text: 'xin chao', receipt: {} });

    const [row] = repository.list();
    expect(row?.externalMessageId).toMatch(/^out:/);
    expect(row?.direction).toBe('outbound');
  });

  it('senderRole truyen vao duoc ton trong (Sale gui tay khac bot tu gui)', async () => {
    const repository = new InMemoryMessagesRepository();
    const recorder = new OutboundRecorder(repository);

    await recorder.record({
      chatId: 'group-1',
      text: 'Em kiem tra lai giup anh nhe',
      receipt: {},
      senderRole: 'sale',
    });

    expect(repository.list()[0]?.senderRole).toBe('sale');
  });

  it('luu that bai KHONG duoc lam vo luong gui (fail-safe)', async () => {
    const repository = new InMemoryMessagesRepository();
    vi.spyOn(repository, 'save').mockRejectedValue(new Error('DB sap'));
    const recorder = new OutboundRecorder(repository);

    await expect(
      recorder.record({ chatId: 'group-1', text: 'xin chao', receipt: {} }),
    ).resolves.toBeUndefined();
  });

  it('khong co repository (PERSISTENCE=memory chua cau hinh) thi bo qua im lang', async () => {
    const recorder = new OutboundRecorder(undefined);

    await expect(
      recorder.record({ chatId: 'group-1', text: 'xin chao', receipt: {} }),
    ).resolves.toBeUndefined();
  });

  it('tin rong khong duoc tao dong rac trong DB', async () => {
    const repository = new InMemoryMessagesRepository();
    const recorder = new OutboundRecorder(repository);

    await recorder.record({ chatId: 'group-1', text: '   ', receipt: {} });

    expect(repository.list()).toHaveLength(0);
  });
});
