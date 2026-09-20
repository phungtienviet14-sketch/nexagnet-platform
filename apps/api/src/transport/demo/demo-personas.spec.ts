import { describe, expect, it } from 'vitest';
import { DEMO_STAFF_PERSONAS } from './demo-seed.js';

describe('Lane W — synthetic owner personas', () => {
  it('seeds separate accounting and director/admin identities idempotently', () => {
    expect(DEMO_STAFF_PERSONAS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ login: 'ke-toan', role: 'ACCOUNTING' }),
        expect.objectContaining({ login: 'giam-doc', role: 'ADMIN' }),
      ]),
    );
    expect(new Set(DEMO_STAFF_PERSONAS.map((persona) => persona.login)).size).toBe(
      DEMO_STAFF_PERSONAS.length,
    );
  });
});
