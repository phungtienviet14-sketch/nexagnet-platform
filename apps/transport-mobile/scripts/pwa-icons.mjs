#!/usr/bin/env node
/**
 * SINH ICON PWA tu MOT nguon: `public/icons/mark.svg`. Chay lai sau moi lan sua dau:
 *
 *   pnpm --filter @nexagnet/transport-mobile pwa:icons
 *
 * PNG duoc COMMIT (ban dung Docker va CI khong can chay buoc nay). Ba kieu, moi kieu mot ly do:
 *
 *   any       o vuong bo goc, goc trong suot — trinh duyet ve nguyen hinh (tab, danh sach ung dung).
 *   maskable  NEN DAY mau dieu huong, chu N thu vao — Android cat icon theo mat na cua hang may
 *             (tron, giot nuoc...); vung an toan la hinh tron 80% duong kinh, chu N phai nam trong do.
 *   apple     NEN DAY, khong trong suot — iOS to den phan trong suot roi tu bo goc.
 *
 * `favicon.ico` goi san PNG 16/32/48 (ICO chua PNG — moi trinh duyet doc duoc); co tep nay thi
 * `expo export` KHONG tu sinh favicon tu `web.favicon` cua app.config.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const ICONS = join(PUBLIC, 'icons');
const BRAND = '#0E5C63';

async function renderMark(svg, size) {
  return sharp(svg, { density: Math.max(72, Math.ceil((72 * size) / 512)) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function replaceOnce(source, from, to) {
  if (!source.includes(from)) throw new Error(`mark.svg doi cau truc — khong thay: ${from}`);
  return source.replace(from, to);
}

/**
 * Ban NEN DAY cua dau: bo bo goc (he dieu hanh tu cat), thu chu N quanh tam vung xanh cho vao vung
 * an toan, dai ho phach van doc mep duoi. Suy tu CHINH mark.svg — sua dau o mot noi.
 */
function fullBleedSvg(svg, { letterScale, bandTop }) {
  let source = svg.toString('utf8');
  source = replaceOnce(source, 'rx="112" ry="112"', 'rx="0" ry="0"');
  source = replaceOnce(
    source,
    '<rect y="448" width="512" height="64"',
    `<rect y="${bandTop}" width="512" height="${512 - bandTop}"`,
  );
  source = replaceOnce(
    source,
    '<path fill="#FFFFFF"',
    `<path transform="translate(256 228) scale(${letterScale}) translate(-256 -228)" fill="#FFFFFF"`,
  );
  return Buffer.from(source);
}

async function renderFullBleed(svg, size, options) {
  return sharp(await renderMark(fullBleedSvg(svg, options), size))
    .flatten({ background: BRAND })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** ICO chua PNG: tieu de 6 byte + 16 byte/muc + du lieu PNG noi tiep. */
function icoFromPngs(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = 6 + 16 * entries.length;
  const directory = entries.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...directory, ...entries.map(({ png }) => png)]);
}

async function main() {
  const svg = await readFile(join(ICONS, 'mark.svg'));
  const outputs = [
    ['icon-192.png', await renderMark(svg, 192)],
    ['icon-512.png', await renderMark(svg, 512)],
    // Mat na tron cat ~10% mep duoi: nang dai len de van thay mot "mat duong" o day.
    ['maskable-512.png', await renderFullBleed(svg, 512, { letterScale: 0.82, bandTop: 424 })],
    [
      'apple-touch-icon-180.png',
      await renderFullBleed(svg, 180, { letterScale: 0.92, bandTop: 448 }),
    ],
    ['favicon-48.png', await renderMark(svg, 48)],
  ];
  for (const [name, png] of outputs) await writeFile(join(ICONS, name), png);
  const favicons = await Promise.all(
    [16, 32, 48].map(async (size) => ({ size, png: await renderMark(svg, size) })),
  );
  await writeFile(join(PUBLIC, 'favicon.ico'), icoFromPngs(favicons));
  process.stdout.write(`Đã sinh ${outputs.length} PNG + favicon.ico vào ${PUBLIC}\n`);
}

await main();
