import { INTENT_DEFINITIONS } from '@netviet/shared';
import { tenantPersona } from '../tenant/tenant.config.js';
import type { TenantConfig } from '../tenant/tenant.schema.js';
import type { ParserInput } from './order-parser.js';

/**
 * Prompt he thong DUNG CHUNG cho parser LLM (Claude + DeepSeek). Gom: vai tro,
 * dinh nghia 7 intent + few-shot, quy tac trich xuat, danh muc SKU + glossary,
 * va yeu cau dien confidence.intent. Muc tieu: phan loai DUNG ca 7 intent, on dinh.
 *
 * Cau mo dau (ten khach + nganh hang) den tu GOI KHACH `tenants/<slug>/tenant.json`, khong
 * hardcode trong nhan nua (Dot B1). Tham so `persona` de test truyen thang, khoi cham dia.
 */

export function buildSystemPrompt(
  input: ParserInput,
  persona: TenantConfig['persona'] = tenantPersona(),
): string {
  const intents = INTENT_DEFINITIONS.map(
    (d) => `- ${d.intent}: ${d.description}\n  Vi du: ${d.examples.map((e) => `"${e}"`).join(' | ')}`,
  ).join('\n');
  const skus = input.products
    .map((p) => `- ${p.name} (goi tat: ${p.aliases.join(', ')})`)
    .join('\n');
  const glossary = input.glossary.map((g) => `${g.term}=${g.meaning}`).join(', ');

  return [
    persona.parserIntro,
    'Dai ly nhan tin tieng Viet VIET TAT, KHONG DAU, cut lun. Nhiem vu: (1) phan loai intent, (2) neu dat_don thi trich xuat don THO.',
    'TUYET DOI KHONG tu tinh gia/ship/tong/VAT — chi ghi lai so KHACH viet (unitPriceRaw, totalRaw) neu co.',
    '',
    'BAY (7) LOAI Y DINH — chon DUNG mot loai sat nhat:',
    intents,
    '',
    'QUY TAC TRICH XUAT (chi dua "order" khi intent=dat_don):',
    '- items[]: skuRaw = ten SP nhu khach ghi (viet tat cung duoc), quantity = so nguyen duong.',
    '- orderType: TH2 khi co ten khach le KEM SDT (0 + 9 chu so) hoac dia chi giao; nguoc lai TH1.',
    '- noVat=true khi khach ghi "khong VAT"/"ko lay VAT". wantVat=true khi khach ghi "xuat VAT"/"co VAT"/"lay hoa don". Mac dinh ca hai false.',
    '- codCollect=true khi co "thu ho"/"COD". Neu TH2: dien customerName/customerPhone/customerAddress khi co.',
    '- CHI dien truong khach THUC SU ghi; khong biet thi BO QUA (dung dien 0 hay chuoi rong gia).',
    '',
    'confidence.intent = do tin cay phan loai (so tu 0 den 1). Neu tin mo ho / khong chac thuoc 6 loai dau -> intent=khac va confidence.intent thap.',
    '',
    'Tra ve DUY NHAT mot JSON (khong markdown, khong giai thich):',
    '- QUAN TRONG: truong "order" CHI xuat hien khi intent=dat_don. Cac intent khac TUYET DOI KHONG co "order".',
    '- Vi du intent=dat_don: {"intent":"dat_don","order":{"orderType":"TH1","items":[{"skuRaw":"ghe felix","quantity":10}],"noVat":true},"confidence":{"intent":0.95}}',
    '- Vi du intent=hoi_gia: {"intent":"hoi_gia","confidence":{"intent":0.9}}',
    '- Vi du intent=bao_hanh_khieu_nai: {"intent":"bao_hanh_khieu_nai","confidence":{"intent":0.9}}',
    '',
    input.dealerNameRaw ? `Nhom nay thuoc dai ly: ${input.dealerNameRaw}.` : '',
    `Danh muc SKU:\n${skus}`,
    `Tu dien viet tat: ${glossary}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Doc tien tat kieu Viet Nam ve so nguyen dong: "11tr5"->11.500.000, "1.150k"->1.150.000,
 * "890k"->890.000, "11500000"/"1.150.000"->giu nguyen. Khong doc duoc -> undefined.
 * (Cac truong nay chi de DOI CHIEU; rules engine moi tinh tien that.)
 */
export function coerceVnd(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const s = value.toLowerCase().replace(/\s|đ|d$/g, '').trim();
  const tr = s.match(/^([\d.]+)tr(\d*)$/);
  if (tr) {
    const whole = Number.parseFloat(tr[1]!.replace(/\./g, ''));
    const frac = tr[2] ? Number.parseInt(tr[2], 10) / 10 ** tr[2].length : 0;
    return Number.isFinite(whole) ? Math.round((whole + frac) * 1_000_000) : undefined;
  }
  const k = s.match(/^([\d.]+)k$/);
  if (k) {
    const n = Number.parseFloat(k[1]!.replace(/\./g, ''));
    return Number.isFinite(n) ? Math.round(n * 1000) : undefined;
  }
  const plain = Number.parseFloat(s.replace(/\./g, ''));
  return Number.isFinite(plain) ? plain : undefined;
}

function coerceItem(item: unknown): unknown {
  if (item === null || typeof item !== 'object') return item;
  const src = item as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(src)) {
    if (key === 'unitPriceRaw') {
      const n = coerceVnd(src[key]);
      if (n !== undefined) out[key] = n; // bo qua neu khong doc duoc (field tuy chon)
    } else if (key === 'quantity') {
      const n = coerceVnd(src[key]);
      out[key] = n !== undefined ? Math.round(n) : src[key];
    } else {
      out[key] = src[key];
    }
  }
  return out;
}

function coerceOrderNumbers(order: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(order)) {
    if (key === 'totalRaw' || key === 'shippingFeeRaw') {
      const n = coerceVnd(order[key]);
      if (n !== undefined) out[key] = n;
    } else if (key === 'items' && Array.isArray(order[key])) {
      out[key] = (order[key] as unknown[]).map(coerceItem);
    } else {
      out[key] = order[key];
    }
  }
  return out;
}

/**
 * Chuan hoa output tho tu LLM truoc khi validate schema (phong 2 loi thuong gap):
 * 1) LLM chen khoi "order" RONG cho ca intent KHONG phai don -> bo "order" khi intent != dat_don.
 * 2) LLM tra so tien dang CHUOI ("11tr5","1.150k") -> ep ve so; khong doc duoc thi bo field tuy chon.
 */
export function normalizeParserOutput(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object') return raw;
  const src = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(src)) {
    if (key === 'order') continue;
    out[key] = src[key];
  }
  if (src.intent === 'dat_don' && src.order && typeof src.order === 'object') {
    out.order = coerceOrderNumbers(src.order as Record<string, unknown>);
  }
  return out;
}

/** Bao dam co confidence.intent (parser LLM co the bo sot). success=true -> gia tri vua, that bai -> 0. */
export function ensureIntentConfidence(
  confidence: Record<string, number>,
  fallback: number,
): Record<string, number> {
  if (typeof confidence.intent === 'number') return confidence;
  return { ...confidence, intent: fallback };
}

/** Tach JSON tu output LLM (phong khi bi boc ```json ... ```). Nem neu khong parse duoc. */
export function parseJsonLoose(content: string): unknown {
  const cleaned = content.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  return JSON.parse(slice);
}
