import { tenantBranding } from '@netviet/tenant';

/**
 * Icon app SINH LUC CHAY tu goi khach, thay cho file tinh `public/icon.svg` (chu "U" tren mau cua
 * Ultty nam san trong repo va di theo image). Giu nguyen URL cu `/icon.svg` de manifest khong doi.
 *
 * `force-dynamic`: xem chu thich dai trong `app/layout.tsx`.
 */
export const dynamic = 'force-dynamic';

const SIZE = 192;
/** Cang nhieu ky tu thi co chu cang nho, de monogram khong tran ra ngoai o vuong. */
const FONT_SIZE_BY_LENGTH: Record<number, number> = { 1: 96, 2: 72, 3: 52 };
const FONT_SIZE_FALLBACK = 52;

/** Monogram di vao noi dung XML -> thoat ky tu, du zod da chan do dai 1-3. */
function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function GET(): Response {
  const { monogram, themeColor, backgroundColor } = tenantBranding();
  const fontSize = FONT_SIZE_BY_LENGTH[monogram.length] ?? FONT_SIZE_FALLBACK;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">
  <rect width="${SIZE}" height="${SIZE}" rx="42" fill="${themeColor}" />
  <text x="96" y="126" font-family="Georgia, serif" font-size="${fontSize}" font-weight="700"
    fill="${backgroundColor}" text-anchor="middle">${escapeXml(monogram)}</text>
</svg>
`;
  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      // Doi khach = doi icon. Cache trung gian se phuc vu icon cua khach truoc cho khach sau.
      'cache-control': 'no-store',
    },
  });
}
