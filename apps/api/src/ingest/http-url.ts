/**
 * Loc URL anh truoc khi dua vao `channelMessageSchema`.
 *
 * Ly do ton tai (khong phai tien ich chung chung): `imageUrl` trong schema la `z.string().url()`,
 * nen mot href/photo_url hong di thang vao se lam `safeParse` rot CA tin — ke ca tin co chu.
 * Ca hai kenh deu can cung mot cach loc: zca doc `content.href`, Bot Platform doc `photo_url`.
 */
export function toHttpUrl(href: unknown): string | undefined {
  if (typeof href !== 'string' || href.length === 0) return undefined;
  try {
    const url = new URL(href);
    return url.protocol === 'http:' || url.protocol === 'https:' ? href : undefined;
  } catch {
    return undefined;
  }
}
