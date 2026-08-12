import type { ContentImportManifest } from '@netviet/shared';

/** Port nguồn nội dung: domain không phụ thuộc Drive, filesystem hay object storage. */
export abstract class ContentSourcePort {
  abstract readonly name: string;
  abstract load(input: unknown): Promise<ContentImportManifest>;
}
