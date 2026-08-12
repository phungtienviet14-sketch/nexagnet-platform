import { Controller, Get, Post } from '@nestjs/common';
import type {
  GlossaryView,
  GroupMapView,
  KnowledgeProductView,
  KnowledgeSummary,
} from '@netviet/shared';
import { KnowledgeService } from './knowledge.service.js';
import { Roles } from '../auth/roles.decorator.js';

/**
 * Cong doc KHO TRI THUC (tang 6) cho cot "Nguon su that" tren console.
 * Cac GET read-only — chung minh AI bi rang buoc trong tu dien dong (SKU/gia/glossary/nhom);
 * khong nhan input, khong lo PII khach.
 *
 * POST /reload: nap lai snapshot in-memory tu repo (goi sau khi CRUD nguon su that qua MCP tool /
 * AdminJS o TIEN TRINH KHAC). Khong body, khong PII — chi tri-ga doc lai DB; che do memory la no-op.
 */
@Roles('SALE', 'MANAGER', 'ACCOUNTING', 'ADMIN')
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Roles('MANAGER', 'ADMIN')
  @Post('reload')
  async reload(): Promise<{
    ok: true;
    products: number;
    dealers: number;
    groups: number;
    glossary: number;
  }> {
    await this.knowledge.reload();
    return {
      ok: true,
      products: this.knowledge.products().length,
      dealers: this.knowledge.dealers().length,
      groups: this.knowledge.groups().length,
      glossary: this.knowledge.glossary().length,
    };
  }

  @Get('summary')
  summary(): KnowledgeSummary {
    return this.knowledge.knowledgeSummary();
  }

  @Get('products')
  products(): KnowledgeProductView[] {
    return this.knowledge.productViews();
  }

  @Get('glossary')
  glossary(): GlossaryView[] {
    return this.knowledge.glossaryViews();
  }

  @Get('groups')
  groups(): GroupMapView[] {
    return this.knowledge.groupViews();
  }
}
