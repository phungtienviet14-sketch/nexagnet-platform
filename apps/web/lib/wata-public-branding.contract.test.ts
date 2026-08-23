import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Wata public branding contract', () => {
  it('uses only NetViet branding in the customer-facing tenant pack and workforce header', () => {
    const tenantPath = resolve(process.cwd(), '../../tenants/wata/tenant.json');
    const tenant = JSON.parse(readFileSync(tenantPath, 'utf8')) as {
      readonly identity: { readonly displayName: string; readonly shortName: string };
      readonly branding: {
        readonly productName: string;
        readonly installName: string;
        readonly pageTitle: string;
        readonly pageDescription: string;
        readonly logoPath?: string;
      };
    };
    const publicBranding = JSON.stringify({
      identity: tenant.identity,
      branding: tenant.branding,
    });
    const headerPath = resolve(
      process.cwd(),
      'experiences/agent-workforce/views/components/TopNav.tsx',
    );
    const header = readFileSync(headerPath, 'utf8');
    const sharedFixturePaths = [
      resolve(process.cwd(), 'experiences/agent-workforce/fixtures/assistant.ts'),
      resolve(process.cwd(), 'experiences/agent-workforce/fixtures/documents.ts'),
      resolve(process.cwd(), 'experiences/agent-workforce/services/assistant-client.ts'),
    ] as const;
    const sharedExperienceCopy = [header, ...sharedFixturePaths.map((path) => readFileSync(path, 'utf8'))]
      .join('\n');

    expect(publicBranding).toContain('NetViet');
    expect(publicBranding).not.toMatch(/wata|watatech/i);
    expect(tenant.branding.logoPath).toBe('/netviet-logo.png');
    expect(header).toContain('branding.logoPath');
    expect(header).not.toMatch(/wata|watatech/i);
    expect(sharedExperienceCopy).not.toMatch(/netviet|wata|watatech/i);
  });
});
