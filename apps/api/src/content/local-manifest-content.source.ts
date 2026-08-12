import { BadRequestException, Injectable } from '@nestjs/common';
import { contentImportManifestSchema, type ContentImportManifest } from '@netviet/shared';
import { ContentSourcePort } from './content-source.port.js';

@Injectable()
export class LocalManifestContentSource extends ContentSourcePort {
  readonly name = 'local_manifest';

  async load(input: unknown): Promise<ContentImportManifest> {
    const parsed = contentImportManifestSchema.safeParse(input);
    if (!parsed.success) {
      const errors = parsed.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`,
      );
      throw new BadRequestException(`Manifest nội dung không hợp lệ: ${errors.join('; ')}`);
    }
    return parsed.data;
  }
}
