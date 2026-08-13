/**
 * Public API base shared by every browser client.
 *
 * An explicitly empty value means same-origin. When the variable is absent,
 * Node-side rendering and tests keep a deterministic local API endpoint while
 * browser code stays same-origin.
 */
export function publicApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL;
  if (configured !== undefined) {
    return configured.trim().replace(/\/+$/, '');
  }
  return typeof window === 'undefined' ? 'http://localhost:3001' : '';
}
