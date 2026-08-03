import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KnowledgeService } from '../knowledge/knowledge.service.js';
import type { OrdersRepository } from '../orders/orders.repository.js';
import type { PipelineService } from '../pipeline/pipeline.service.js';
import { RuntimeSettingsService } from '../runtime/runtime-settings.service.js';
import { DemoController } from './demo.controller.js';

describe('DemoController', () => {
  const processMessage = vi.fn(async () => ({ id: 'order-1' }));
  const groupViews = vi.fn(() => [
    {
      chatId: '2508572440887686813',
      groupName: 'Nhóm đại lý Meta HN',
      dealerName: 'Meta HN',
      branch: 'HN',
    },
  ]);
  const knowledgeGroups = vi.fn(() => [{ chatId: '2508572440887686813' }]);
  const findById = vi.fn();
  let controller: DemoController;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.API_KEY = 'x'.repeat(32);
    process.env.CORS_ORIGIN = 'https://demo.example.com';
    process.env.AUTO_SEND = 'off';
    process.env.CHANNEL_MODE = 'mock';
    process.env.PARSER_MODE = 'mock';
    vi.clearAllMocks();
    controller = new DemoController(
      { process: processMessage } as unknown as PipelineService,
      { groupViews, groups: knowledgeGroups } as unknown as KnowledgeService,
      { findById } as unknown as OrdersRepository,
      new RuntimeSettingsService(),
    );
  });

  it('khong phoi mutation AUTO_SEND tren namespace demo', () => {
    expect('setAutoSend' in controller).toBe(false);
  });

  it('tra config runtime, samples va danh sach nhom da map', () => {
    expect(controller.config()).toMatchObject({
      channelMode: 'mock',
      parserMode: 'mock',
      autoSend: 'off',
    });
    expect(controller.samples()).toHaveLength(4);
    expect(controller.groups()).toEqual([
      {
        chatId: '2508572440887686813',
        name: 'Nhóm đại lý Meta HN',
        dealerName: 'Meta HN',
        branch: 'HN',
      },
    ]);
  });

  it('validate tin gia lap va dua tin hop le vao pipeline', async () => {
    expect(() => controller.simulate({ text: '   ' })).toThrow(BadRequestException);

    await controller.simulate({ text: '10 ghe Felix' });
    expect(processMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        externalChatId: '2508572440887686813',
        text: '10 ghe Felix',
      }),
      expect.any(String),
    );
  });

  it('chan rerun don khong ton tai hoac da dong bo', async () => {
    findById.mockResolvedValueOnce(null);
    await expect(controller.rerun('missing')).rejects.toThrow(NotFoundException);

    findById.mockResolvedValueOnce({ status: 'synced' });
    await expect(controller.rerun('synced')).rejects.toThrow(BadRequestException);
  });

  it('rerun dung order id va khong tao ban tin tho moi', async () => {
    findById.mockResolvedValueOnce({
      status: 'pending_review',
      chatId: '3787434804745256898',
      replyChannel: 'bot',
      rawText: 'gui 10 ghe Felix',
    });

    await controller.rerun('order-2');
    expect(processMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        externalChatId: '3787434804745256898',
        source: 'bot_webhook',
        text: 'gui 10 ghe Felix',
      }),
      expect.any(String),
      { orderId: 'order-2', rerun: true },
    );
  });
});
