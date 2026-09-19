import { describe, expect, it } from 'vitest';
import { operationalFileContentUrl, toOperationalDocumentInput } from '../file-evidence';

describe('Lane W — file evidence', () => {
  it('binds the opaque uploaded file id to the operational document with a stable replay key', () => {
    expect(
      toOperationalDocumentInput({
        fileId: 'file-opaque-1',
        runId: 'run-1',
        legId: 'leg-1',
        type: 'PROOF_OF_DELIVERY',
        clientEventId: 'lane-w-stable-event',
      }),
    ).toEqual({
      fileId: 'file-opaque-1',
      runId: 'run-1',
      legId: 'leg-1',
      type: 'PROOF_OF_DELIVERY',
      basis: 'DIGITAL_FILE',
      externalNote: null,
      clientEventId: 'lane-w-stable-event',
    });
  });

  it('opens evidence through the authenticated opaque-id route only', () => {
    expect(operationalFileContentUrl('file-opaque-1')).toBe('/api/files/file-opaque-1/content');
    expect(operationalFileContentUrl('file-opaque-1')).not.toMatch(/bucket|storage|railway/i);
  });
});
