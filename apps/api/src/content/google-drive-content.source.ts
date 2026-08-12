import { ServiceUnavailableException } from '@nestjs/common';
import type { ContentImportManifest } from '@netviet/shared';
import { ContentSourcePort } from './content-source.port.js';

/** Seam production tương lai; cố ý không khóa domain vào một Drive SDK/credential. */
export class GoogleDriveContentSource extends ContentSourcePort {
  readonly name = 'google_drive';

  async load(_input: unknown): Promise<ContentImportManifest> {
    throw new ServiceUnavailableException(
      'Google Drive runtime connector chưa được cấu hình; hãy xuất inventory thành manifest để import.',
    );
  }
}
