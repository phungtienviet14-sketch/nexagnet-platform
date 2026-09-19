import type { OperationalDocumentType, RecordDocumentInput } from '../transport-types';
import { publicApiBase } from '../../../lib/api-base';

export interface UploadedFileDescriptor {
  readonly id: string;
  readonly safeFilename: string;
  readonly contentType: string;
  readonly byteSize: number;
  readonly status: string;
}

export const operationalFileContentUrl = (fileId: string): string =>
  `${publicApiBase()}/files/${encodeURIComponent(fileId)}/content`;

export function toOperationalDocumentInput(input: {
  readonly fileId: string;
  readonly runId: string;
  readonly legId?: string;
  readonly type: OperationalDocumentType;
  readonly clientEventId: string;
}): RecordDocumentInput {
  return {
    type: input.type,
    runId: input.runId,
    legId: input.legId,
    basis: 'DIGITAL_FILE',
    fileId: input.fileId,
    clientEventId: input.clientEventId,
  };
}
