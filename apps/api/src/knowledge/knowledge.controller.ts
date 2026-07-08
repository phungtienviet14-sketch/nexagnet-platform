import { Controller, Get } from '@nestjs/common';
import type {
  GlossaryView,
  GroupMapView,
  KnowledgeProductView,
  KnowledgeSummary,
} from '@ultty/shared';
import { KnowledgeService } from './knowledge.service.js';

/**
 * Cong doc KHO TRI THUC (tang 6) cho cot "Nguon su that" tren console.
 * Read-only — chung minh AI bi rang buoc trong tu dien dong (SKU/gia/glossary/nhom).
 * Khong nhan input, khong lo PII khach.
 */
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

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
