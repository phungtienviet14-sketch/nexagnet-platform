import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { BusinessDate } from '../business-date.js';
import type {
  EInvoiceProvenance,
  ParsedInvoice,
  ParsedInvoiceLine,
} from './fuel-einvoice-parse.js';
import { parseInvoiceIssuedAt } from './fuel-einvoice-parse.js';
import {
  CONFIDENCE_SCALE,
  FuelReceiptExtractionPort,
  type ExtractionConfidence,
  type FuelReceiptExtractionResult,
  type FuelReceiptImage,
} from './fuel-receipt-extraction.js';
import { guardReceiptImage } from './fuel-receipt-image.js';

/**
 * DOC ANH QUA MOT DIEM CUOI TUONG THICH OPENAI — mot adapter, nhieu nha cung cap (C3).
 *
 * ===========================================================================
 * KHONG MOT TEN NHA CUNG CAP NAO TRONG TEP NAY
 *
 * Do la ca thiet ke, va no do duoc: bo test dung tep nay chay voi mot may chu `node:http` dung tam
 * trong chinh bai test. Neu mot ngay nao do co ai viet `if (provider === '...')` vao day, bai do
 * van xanh — nhung `HTTP-14` doc ma nguon va se do.
 *
 * Cai cho phep mot adapter phuc vu ca ba duong la mot su that ve THI TRUONG, khong phai mot phong
 * doan: khuon `POST /chat/completions` voi `content` la mot MANG khoi (`text` + `image_url`) la thu
 * ma ca ba deu noi —
 *
 *   - mot mo hinh TU DUNG (PaddleOCR-VL sau vLLM / PaddleX serving) o trong mang cua khach;
 *   - mot diem cuoi dam may cua nha cung cap A;
 *   - mot diem cuoi dam may cua nha cung cap B.
 *
 * Chuyen giua ba duong do la doi `baseUrl` + `model`, khong doi mot dong ma nao. Do la dieu kien
 * de mot khach co du lieu nhay cam van dung duoc tinh nang nay: `baseUrl` tro vao chinh mang cua ho
 * thi KHONG MOT BYTE ANH NAO roi khoi mang do.
 *
 * ===========================================================================
 * SAI SO NHAN 1000 KHONG QUA DUOC — VA KHONG PHAI NHO TEP NAY
 *
 * Cho de sai nhat khi cho may doc mot to phieu la DAU PHAN CACH: tren giay, `1.500` la mot nghin
 * nam tram. Tep nay yeu cau mo hinh tra ve SO NGUYEN da nhan thang (mililit, mili-dong, dong) de
 * xoa han su mo ho o mat giao tiep.
 *
 * Nhung loi hua do khong duoc tin. Thu THAT SU chan mot sai so nhan 1000 la phep kiem so hoc cua
 * C4: `so lit x don gia ~ thanh tien`, dung sai MOT DONG. Mot con so lech thang bac khong the vua
 * dong thoi ca ba o, nen no lo ra thanh `ARITHMETIC_MISMATCH` truoc mat nguoi doi soat. Tep nay
 * lam cho loi it xay ra; C4 lam cho loi khong di xa duoc.
 */

/** Nguoi goi tu quyet dung o dau; tep nay khong biet cai ten nao ca. */
export interface ReceiptExtractionEndpoint {
  /** VD `http://paddleocr-vl.noi-bo:8080/v1` hoac mot diem cuoi dam may. */
  readonly baseUrl: string;
  readonly model: string;
  /** Bo trong cho mot mo hinh tu dung khong doi xac thuc. */
  readonly apiKey?: string;
  readonly timeoutMs: number;
}

/**
 * Loi nhac. Ep MOT khuon JSON, va noi thang ba dieu ma mot mo hinh hay tu y lam khac.
 *
 * Viet bang tieng Viet KHONG DAU co chu dich: phieu do dau o Viet Nam in ca co dau lan khong dau,
 * va mot loi nhac khong dau khong "keo" mo hinh ve mot kieu chinh ta nao khi no chep lai ten tram.
 */
const PROMPT = [
  'Ban dang doc mot HOA DON / PHIEU BAN LE XANG DAU o Viet Nam.',
  'Tra ve DUY NHAT mot doi tuong JSON, khong giai thich, khong rao dau.',
  '',
  'Khuon:',
  '{"sellerTaxCode":"","invoiceSymbol":"","invoiceNo":"","issuedAt":"","sellerName":"",',
  ' "plateHintRaw":null,"odometerHintKm":null,',
  ' "lines":[{"itemName":"","unit":"","litersMilli":0,"unitPriceMilli":0,"amountVnd":0}],',
  ' "confidence":{"sellerTaxCode":0,"invoiceSymbol":0,"invoiceNo":0,"issuedAt":0,',
  '   "line.1.litersMilli":0,"line.1.unitPriceMilli":0,"line.1.amountVnd":0}}',
  '',
  'BA QUY TAC:',
  '1. MOI so la SO NGUYEN. `litersMilli` = so lit x 1000. `unitPriceMilli` = don gia moi lit x 1000.',
  '   `amountVnd` = thanh tien tinh bang DONG. Khong dau phay, khong dau cham, khong don vi.',
  '2. O NAO KHONG DOC RO thi de `null`. TUYET DOI khong doan, khong tinh bu tu cac o khac.',
  '3. `confidence` la so nguyen 0..1000 cho tung khoa o tren — 1000 la doc ro tung ky tu.',
].join('\n');

const lineSchema = z.object({
  itemName: z.string().nullish(),
  unit: z.string().nullish(),
  litersMilli: z.number().int().nonnegative().nullish(),
  unitPriceMilli: z.number().int().nonnegative().nullish(),
  amountVnd: z.number().int().nullish(),
});

/**
 * KHUON TRA VE, kiem bang zod truoc khi mot gia tri nao duoc dung.
 *
 * `sellerTaxCode`/`invoiceSymbol`/`invoiceNo` la `string` KHONG rong: ba manh nay la khoa chong
 * nhap trung (`INV-C2-DUP`), va mot ung vien thieu chung khong chan duoc gi. Mot buc anh khong doc
 * ra duoc chung phai tu choi CO TEN, chu khong duoc nhap voi ba o rong.
 */
const replySchema = z.object({
  sellerTaxCode: z.string().min(1),
  invoiceSymbol: z.string().min(1),
  invoiceNo: z.string().min(1),
  issuedAt: z.string().nullish(),
  sellerName: z.string().nullish(),
  plateHintRaw: z.string().nullish(),
  odometerHintKm: z.number().int().nonnegative().nullish(),
  lines: z.array(lineSchema).min(1),
  confidence: z.record(z.string(), z.number().int().min(0).max(CONFIDENCE_SCALE)).nullish(),
});

type ExtractionReply = z.infer<typeof replySchema>;

const nullable = <T>(value: T | null | undefined): T | null => value ?? null;

/**
 * Ten lop goi KHUON DAY (`chat/completions`), khong goi mot cong ty nao — va do khong phai chuyen
 * chu nghia: `HTTP-14` doc ma nguon da bo chu thich va do neu mot ten nha cung cap xuat hien.
 * Mot lop mang ten mot cong ty se lam nguoi doc sau nay tuong day la adapter CUA cong ty do, roi
 * viet them mot lop thu hai cho cong ty thu hai — dung dieu ma ca thiet ke nay ton tai de tranh.
 */
@Injectable()
export class ChatCompletionsReceiptExtractor extends FuelReceiptExtractionPort {
  constructor(private readonly endpoint: ReceiptExtractionEndpoint) {
    super();
  }

  async extract(image: FuelReceiptImage): Promise<FuelReceiptExtractionResult> {
    const guard = guardReceiptImage(image);
    if (!guard.ok) return { ok: false, reason: guard.reason };

    const text = await this.ask(image, guard.mediaType);
    if (text === null) return { ok: false, reason: 'EXTRACTION_UNAVAILABLE' };

    const reply = this.readReply(text);
    if (reply === null) return { ok: false, reason: 'EXTRACTION_MALFORMED_OUTPUT' };

    return {
      ok: true,
      invoice: toParsedInvoice(reply),
      confidence: toConfidence(reply),
      model: this.endpoint.model,
    };
  }

  /**
   * MOT lan goi, KHONG thu lai.
   *
   * Thu lai o day se nhan doi chi phi cua mot lan hong that su, va no khong can thiet: chung tu bi
   * tu choi VAN duoc ghi kem ly do, nen nguoi truc thay ngay va bam nhap lai. `receivedAt` cua lan
   * dau van la moc that.
   */
  private async ask(image: FuelReceiptImage, mediaType: string): Promise<string | null> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.endpoint.apiKey) headers.authorization = `Bearer ${this.endpoint.apiKey}`;

    try {
      const response = await fetch(`${this.endpoint.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(this.endpoint.timeoutMs),
        body: JSON.stringify({
          model: this.endpoint.model,
          temperature: 0,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: PROMPT },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mediaType};base64,${image.content.toString('base64')}`,
                  },
                },
              ],
            },
          ],
        }),
      });
      if (!response.ok) return null;
      const body: unknown = await response.json();
      return readMessageText(body);
    } catch {
      // Mang hong, qua han, dich vu tu choi — ba thu do la MOT dieu voi nguoi truc: khong doc duoc
      // luc nay, thu lai sau. Tach chung ra thanh ba ma khac nhau se cho mot bang chon ma khong ai
      // hanh dong khac nhau tren tung dong.
      return null;
    }
  }

  private readReply(text: string): ExtractionReply | null {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return null;
    }
    const parsed = replySchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }
}

/** Rut phan chu cua mot cau tra loi kieu OpenAI ma khong tin mot tang nao cua no. */
function readMessageText(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as { message?: unknown }).message;
  if (typeof message !== 'object' || message === null) return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === 'string' && content.length > 0 ? content : null;
}

/**
 * `provenance` cua duong anh ghi `path` la KHOA TRONG CAU TRA LOI cua mo hinh, khong phai mot duong
 * dan XML — vi day la noi that su ma gia tri duoc doc ra. Ghi mot duong dan XML gia o day se lam
 * nguoi kiem di tim mot the khong ton tai tren mot buc anh.
 */
const provenanceOf = (key: string, value: unknown): EInvoiceProvenance => ({
  [key]: { path: key, raw: value === null || value === undefined ? '' : String(value) },
});

function toParsedInvoice(reply: ExtractionReply): ParsedInvoice {
  const issued = parseInvoiceIssuedAt(reply.issuedAt ?? '');
  const lines: ParsedInvoiceLine[] = reply.lines.map((line, index) => {
    const lineNumber = index + 1;
    return {
      lineNumber,
      itemName: nullable(line.itemName),
      unit: nullable(line.unit),
      litersUnits: nullable(line.litersMilli),
      unitPriceUnits: nullable(line.unitPriceMilli),
      amount: nullable(line.amountVnd),
      taxRateRaw: null,
      provenance: {
        ...provenanceOf(`line.${lineNumber}.litersMilli`, line.litersMilli),
        ...provenanceOf(`line.${lineNumber}.unitPriceMilli`, line.unitPriceMilli),
        ...provenanceOf(`line.${lineNumber}.amountVnd`, line.amountVnd),
      },
    };
  });

  return {
    template: null,
    symbol: reply.invoiceSymbol,
    number: reply.invoiceNo,
    issuedDate: issued.date as BusinessDate | null,
    issuedTimeRaw: issued.time,
    currencyCode: 'VND',
    sellerName: nullable(reply.sellerName),
    sellerTaxCode: reply.sellerTaxCode,
    sellerAddress: null,
    buyerName: null,
    buyerTaxCode: null,
    lines,
    // Bien so doc tu MOT BUC ANH van la mot GOI Y, y het bien so doc tu mot truong mo rong cua hoa
    // don dien tu — nen no di dung con duong cu (`extensions`), khong mo mot duong rieng.
    extensions: reply.plateHintRaw ? { BienSoXe: reply.plateHintRaw } : {},
    provenance: {
      ...provenanceOf('sellerTaxCode', reply.sellerTaxCode),
      ...provenanceOf('invoiceSymbol', reply.invoiceSymbol),
      ...provenanceOf('invoiceNo', reply.invoiceNo),
      ...provenanceOf('issuedAt', reply.issuedAt),
    },
  };
}

/**
 * Mo hinh KHONG bao muc tin cho mot o thi o do co muc tin `0`, khong phai `CONFIDENCE_SCALE`.
 *
 * Day la cho de viet nguoc nhat trong ca tep, va viet nguoc thi hong theo huong nguy hiem: mot mo
 * hinh im lang se duoc coi la chac chan tuyet doi, va moi phat hien "muc tin thap" cua C4 tat het
 * cung mot luc ma khong ai thay gi doi.
 */
function toConfidence(reply: ExtractionReply): ExtractionConfidence {
  return { ...(reply.confidence ?? {}) };
}
