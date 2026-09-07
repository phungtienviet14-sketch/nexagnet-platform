/**
 * DO MOT BO DOC ANH PHIEU DO DAU tren bo du lieu tong hop (Lane C / C3, Issue #236).
 *
 * ===========================================================================
 * NO DUNG CHINH ADAPTER DANG CHAY, KHONG MOT BAN SAO
 *
 * Tep nay `import` thang `ChatCompletionsReceiptExtractor`. Do la co y: mot bo do goi API bang ma
 * cua rieng no se do MOT THU KHAC voi thu dang chay — loi nhac khac, kiem khuon khac — va con so
 * no cho ra se dep hon hoac xau hon thuc te ma khong ai biet la vi sao.
 *
 * ===========================================================================
 * CON SO QUAN TRONG NHAT KHONG PHAI DO CHINH XAC
 *
 * Ma la **SAI MA VAN CHAC**: so o vua doc SAI vua duoc bao muc tin TU SAN TRO LEN. Do la nhom duy
 * nhat di thang qua duong ra soat ma khong ai nhin lai — mot bo doc dat 92% chinh xac va 0 o "sai
 * ma van chac" AN TOAN HON mot bo dat 97% voi vai o nhu vay.
 *
 * Cach dung:
 *   FUEL_EXTRACTION_BASE_URL=http://mot-may-chu-noi-bo:8080/v1 \
 *   FUEL_EXTRACTION_MODEL=<ten-mo-hinh> \
 *   npx tsx tools/fuel-extraction-bench/run-bench.ts <thu-muc-bo-du-lieu>
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ChatCompletionsReceiptExtractor } from '../../apps/api/src/transport/fuel/fuel-receipt-extraction.http.js';
import { FIELD_CONFIDENCE_FLOOR } from '../../apps/api/src/transport/fuel/fuel-receipt-extraction.js';

interface TruthLine {
  readonly litersMilli: number | null;
  readonly unitPriceMilli: number | null;
  readonly amountVnd: number;
}
interface TruthReceipt {
  readonly id: string;
  readonly note: string;
  readonly sellerTaxCode: string;
  readonly invoiceSymbol: string;
  readonly invoiceNo: string;
  readonly plateHintRaw: string | null;
  readonly lines: readonly TruthLine[];
}

/** Mot o da cham: doc ra gi, dap an la gi, va may TIN den dau khi noi ra. */
interface Cell {
  readonly receipt: string;
  readonly field: string;
  readonly expected: string;
  readonly actual: string;
  readonly confidence: number | null;
}

const env = (name: string): string | undefined => process.env[name];

function requireEnv(name: string): string {
  const value = env(name);
  if (!value) {
    process.stderr.write(`Thieu ${name}. Xem khoi chu thich dau tep.\n`);
    process.exit(2);
  }
  return value;
}

const show = (value: unknown): string =>
  value === null || value === undefined ? '—' : String(value);

async function main(): Promise<void> {
  const dir = resolve(process.argv[2] ?? 'fuel-bench-dataset');
  const truth = JSON.parse(await readFile(join(dir, 'ground-truth.json'), 'utf8')) as {
    receipts: readonly TruthReceipt[];
  };
  const files = new Set(await readdir(dir));

  const extractor = new ChatCompletionsReceiptExtractor({
    baseUrl: requireEnv('FUEL_EXTRACTION_BASE_URL'),
    model: requireEnv('FUEL_EXTRACTION_MODEL'),
    apiKey: env('FUEL_EXTRACTION_API_KEY'),
    timeoutMs: Number(env('FUEL_EXTRACTION_TIMEOUT_MS') ?? 120_000),
  });

  const cells: Cell[] = [];
  const failures: string[] = [];

  for (const receipt of truth.receipts) {
    const name = `${receipt.id}.png`;
    if (!files.has(name)) {
      failures.push(`${receipt.id}: khong co tep anh`);
      continue;
    }

    const result = await extractor.extract({
      sourceRef: name,
      mediaType: 'image/png',
      content: await readFile(join(dir, name)),
    });

    if (!result.ok) {
      // Mot lan tu choi KHONG duoc tinh la mot o sai: no la mot ket cuc khac han, va gop hai thu do
      // lai se lam mot bo doc "khong bao gio tra loi" trong nhu mot bo doc chinh xac tuyet doi.
      failures.push(`${receipt.id}: ${result.reason}`);
      continue;
    }

    const line = result.invoice.lines[0];
    const first = receipt.lines[0];
    const check = (field: string, expected: unknown, actual: unknown, key: string): void => {
      cells.push({
        receipt: receipt.id,
        field,
        expected: show(expected),
        actual: show(actual),
        confidence: result.confidence[key] ?? null,
      });
    };

    check('sellerTaxCode', receipt.sellerTaxCode, result.invoice.sellerTaxCode, 'sellerTaxCode');
    check('invoiceSymbol', receipt.invoiceSymbol, result.invoice.symbol, 'invoiceSymbol');
    check('invoiceNo', receipt.invoiceNo, result.invoice.number, 'invoiceNo');
    check('litersMilli', first?.litersMilli, line?.litersUnits, 'line.1.litersMilli');
    check('unitPriceMilli', first?.unitPriceMilli, line?.unitPriceUnits, 'line.1.unitPriceMilli');
    check('amountVnd', first?.amountVnd, line?.amount, 'line.1.amountVnd');
    check(
      'plateHint',
      receipt.plateHintRaw,
      result.invoice.extensions.BienSoXe ?? null,
      'plateHintRaw',
    );
  }

  report(cells, failures);
}

function report(cells: readonly Cell[], failures: readonly string[]): void {
  const wrong = cells.filter((cell) => cell.expected !== cell.actual);
  const confidentlyWrong = wrong.filter(
    (cell) => cell.confidence !== null && cell.confidence >= FIELD_CONFIDENCE_FLOOR,
  );

  const byField = new Map<string, { total: number; ok: number }>();
  for (const cell of cells) {
    const entry = byField.get(cell.field) ?? { total: 0, ok: 0 };
    entry.total += 1;
    if (cell.expected === cell.actual) entry.ok += 1;
    byField.set(cell.field, entry);
  }

  const out: string[] = ['', 'DO CHINH XAC THEO TUNG TRUONG', ''];
  for (const [field, entry] of byField) {
    const pct = ((entry.ok / entry.total) * 100).toFixed(1);
    out.push(`  ${field.padEnd(16)} ${String(entry.ok).padStart(3)}/${entry.total}  ${pct}%`);
  }

  out.push('', `O sai:              ${wrong.length}/${cells.length}`);
  out.push(`Anh khong doc duoc: ${failures.length}`);
  for (const failure of failures) out.push(`  · ${failure}`);

  out.push(
    '',
    `SAI MA VAN CHAC (muc tin >= ${FIELD_CONFIDENCE_FLOOR}): ${confidentlyWrong.length}`,
  );
  for (const cell of confidentlyWrong) {
    out.push(
      `  · ${cell.receipt} ${cell.field}: doc "${cell.actual}", dap an "${cell.expected}", tin ${cell.confidence}`,
    );
  }
  out.push(
    '',
    'Con so cuoi la con so quan trong nhat: do la nhom DUY NHAT di qua duong ra soat ma',
    'khong ai nhin lai. Mot bo doc 92% voi 0 o nhu vay an toan hon mot bo doc 97% voi vai o.',
    '',
  );
  process.stdout.write(`${out.join('\n')}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
