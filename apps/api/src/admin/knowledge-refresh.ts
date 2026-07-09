import { Logger } from '@nestjs/common';

/**
 * Cau noi (bootstrap seam) giua AdminJS va KnowledgeService.
 *
 * VAN DE: hook cua AdminJS (after-hook / custom action) la ham thuan, KHONG nam trong DI cua Nest,
 * lai o module con (/admin) nen khong inject truc tiep KnowledgeService (provider cua AppModule).
 * GIAI PHAP: main.ts sau khi boot lay dung instance KnowledgeService (app.get) va nap vao day;
 * hook goi refreshKnowledge() de nap lai snapshot in-memory ma pipeline dang doc.
 *
 * Neu chua nap (vd panel tat) -> refreshKnowledge() la no-op an toan.
 */
export interface KnowledgeReloader {
  reload(): Promise<void>;
}

const logger = new Logger('AdminKnowledgeRefresh');
let reloader: KnowledgeReloader | null = null;

/** Goi 1 lan luc boot (main.ts) khi bat panel. */
export function setKnowledgeReloader(instance: KnowledgeReloader): void {
  reloader = instance;
}

/** Nap lai nguon su that sau khi CRUD qua AdminJS. Nuot loi de KHONG lam hong response cua panel. */
export async function refreshKnowledge(): Promise<void> {
  if (!reloader) return;
  try {
    await reloader.reload();
    logger.log('Da nap lai nguon su that sau thay doi tren /admin.');
  } catch (error) {
    logger.warn(
      `Nap lai nguon su that that bai: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
