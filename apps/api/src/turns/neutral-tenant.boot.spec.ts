import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const fixtureDir = resolve(apiDir, '../../packages/tenant/src/__tests__/fixtures/neutral-turn');

/**
 * KHACH KHONG BAN GI van phai boot duoc VA co du duong xu ly hoi thoai.
 *
 * Day la bai kiem tra o muc TIEN TRINH THAT, khong phai o muc bang so huu: `buildAppComposition`
 * co the dung ma Nest van khong resolve duoc (mot provider cua turn-processing lo tay giu mot
 * dependency cua sales-order la boot no ngay). Chi mot tien trinh boot that moi bat duoc chuyen do.
 */
describe('neutral tenant process boot contract', () => {
  it('boot Nest that voi turn-processing ma KHONG co don, gia hay ERP', () => {
    const script = `
      import { NestFactory } from '@nestjs/core';
      const { AppModule } = await import('./src/app.module.ts');
      const { PipelineService } = await import('./src/pipeline/pipeline.service.ts');
      const { AgentOrchestrator } = await import('./src/agents/agent-orchestrator.service.ts');
      const { TurnRecordsRepository } = await import('./src/turns/turn-records.repository.ts');
      const { TurnReplyService } = await import('./src/turns/turn-reply.service.ts');
      const { ConversationsService } = await import('./src/conversations/conversations.service.ts');
      const { MessagesRepository } = await import('./src/messages/messages.repository.ts');
      const { ORDER_PARSER } = await import('./src/pipeline/parser.tokens.ts');
      const { OrdersService } = await import('./src/orders/orders.service.ts');
      const { OrdersRepository } = await import('./src/orders/orders.repository.ts');
      const { OrderCommandAdapter } = await import('./src/orders/order-command.adapter.ts');
      const { ErpPort } = await import('./src/erp/erp.port.ts');
      const { CampaignService } = await import('./src/campaigns/campaign.service.ts');
      const context = await NestFactory.createApplicationContext(await AppModule.forRoot(), { logger: ['error'] });
      const has = (token) => { try { context.get(token, { strict: false }); return true; } catch { return false; } };
      const proof = {
        pipeline: has(PipelineService),
        orchestrator: has(AgentOrchestrator),
        turnRecords: has(TurnRecordsRepository),
        turnReply: has(TurnReplyService),
        conversations: has(ConversationsService),
        messages: has(MessagesRepository),
        parser: has(ORDER_PARSER),
        ordersService: has(OrdersService),
        ordersRepository: has(OrdersRepository),
        orderCommands: has(OrderCommandAdapter),
        erp: has(ErpPort),
        campaign: has(CampaignService),
      };
      await context.close();
      process.stdout.write(JSON.stringify(proof));
    `;
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;
    delete env.FLOWISE_API_KEY;
    delete env.FLOWISE_BASE_URL;
    delete env.FLOWISE_FLOW_ID;
    delete env.ZALO_BOT_TOKEN;
    delete env.TENANT;
    env.TENANT_DIR = fixtureDir;
    env.PERSISTENCE = 'memory';
    env.PARSER_MODE = 'deepseek';
    // Khoa GIA — parser duoc DUNG NEN nhung khong goi ra ngoai trong bai nay.
    env.DEEPSEEK_API_KEY = 'sk-test-khong-goi-that';
    env.CHANNEL_MODE = 'mock';
    env.NODE_ENV = 'test';

    const child = spawnSync(
      process.execPath,
      ['--import', '@swc-node/register/esm-register', '--input-type=module', '--eval', script],
      { cwd: apiDir, env, encoding: 'utf8', timeout: 60_000 },
    );

    expect(child.status, `${child.stderr}\n${child.stdout}`).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual({
      // Co duong xu ly luot day du…
      pipeline: true,
      orchestrator: true,
      turnRecords: true,
      turnReply: true,
      conversations: true,
      messages: true,
      parser: true,
      // …va TUYET DOI khong co gi cua ban hang.
      ordersService: false,
      ordersRepository: false,
      orderCommands: false,
      erp: false,
      campaign: false,
    });
  }, 70_000);
});
