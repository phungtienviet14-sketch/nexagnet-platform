/**
 * HAU KIEM TIEN: moi con so tien trong cau tra loi phai la con so mot CONG CU da tra ve trong
 * chinh luot do.
 *
 * Vi sao can, du prompt da cam: prompt la mot loi de nghi, khong phai mot rang buoc. Mot con gia
 * sai gui vao nhom 200 dai ly la mot cam ket sai voi khach that — chi phi cua no khong doi xung
 * voi chi phi cua viec bo mot ban soan va lui ve van ban tra bang.
 *
 * Nguyen tac so khop: CHUAN HOA VE CHU SO. "1.150.000d", "1150000", "1.150k" deu ve mot chuoi chu
 * so, roi so voi tap chu so lay tu ket qua cong cu. Nho vay LLM viet lai con so theo kieu nao cung
 * duoc, mien la dung con so do.
 */

/** Bat "1.150k", "2tr5", "1.150.000d", "2 trieu" — cach viet tien pho bien trong nhom Zalo. */
const MONEY_PATTERN = /(\d[\d.,]*)\s*(k|tr\d*|tri[eệ]u|vnd|ngh[iì]n|[dđ])(?![\p{L}\d])/giu;

/** So tran: duoi nguong nay thi khong phai gia ma la so luong, thang, kich thuoc… */
const MIN_MONEY_DIGITS = 3;

/** Con so tien LLM viet ra ma khong cong cu nao tra ve. Rong = sach. */
export function unverifiedAmounts(text: string, toolOutputs: readonly unknown[]): string[] {
  const allowed = allowedDigitStrings(toolOutputs);
  const found = new Set<string>();
  for (const match of text.matchAll(MONEY_PATTERN)) {
    const written = match[0];
    for (const candidate of canonicalForms(match[1] ?? '', match[2] ?? '')) {
      if (candidate.length < MIN_MONEY_DIGITS) continue;
      if (!allowed.has(candidate)) found.add(written.trim());
    }
  }
  return [...found];
}

/**
 * Mot cach viet ra NHIEU con so co the: "1.150k" co the la 1150 (chu so nhu viet) hoac 1150000
 * (da nhan 1000). Chap nhan neu BAT KY dang nao khop — chan bia, khong chan cach viet.
 */
function canonicalForms(digits: string, unit: string): string[] {
  const bare = digits.replace(/[.,\s]/g, '');
  if (!bare) return [];
  const scaled = scaleFor(unit);
  const forms = [bare];
  if (scaled) forms.push(String(Number(bare) * scaled));
  return forms.filter((form) => /^\d+$/.test(form));
}

function scaleFor(unit: string): number | null {
  const normalized = unit.toLowerCase();
  if (normalized.startsWith('k') || normalized.startsWith('ngh')) return 1_000;
  if (normalized.startsWith('tr')) return 1_000_000;
  return null;
}

/**
 * Moi chuoi chu so >= 3 ky tu xuat hien trong ket qua cong cu, KEM cac bien the co the viet lai:
 * `1150000` cung cho phep viet la `1150` (kieu "1.150k") va `1.15` thi khong.
 */
function allowedDigitStrings(toolOutputs: readonly unknown[]): Set<string> {
  const allowed = new Set<string>();
  const serialized = toolOutputs.map((output) => JSON.stringify(output ?? null)).join(' ');
  for (const match of serialized.matchAll(/\d[\d.,]*/g)) {
    const bare = match[0].replace(/[.,]/g, '');
    if (bare.length < MIN_MONEY_DIGITS) continue;
    allowed.add(bare);
    // Bien the rut gon ma nguoi Viet that su viet: 1150000 -> "1.150k" (1150), "1,15tr" (115).
    for (const zeros of [3, 6]) {
      if (bare.length > zeros && /^0+$/.test(bare.slice(-zeros))) allowed.add(bare.slice(0, -zeros));
    }
  }
  return allowed;
}
