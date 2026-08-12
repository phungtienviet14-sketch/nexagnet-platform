import type { ConversationContext, ParseResult } from '@netviet/shared';
import type { GlossaryEntry, Product } from '../knowledge/domain.js';

/**
 * Tang 3 — lop parser. Interface de thay doi bo phan tich (Mock tat dinh cho demo
 * offline / Claude that) ma khong dung toi pipeline. LLM chi trich xuat, khong tinh tien.
 */
export interface ParserInput {
  /** Noi dung tin (co the la caption anh, co the chua @mention) */
  text: string;
  /** photo_url neu la tin anh — Claude doc bang vision */
  imageUrl?: string;
  products: Product[];
  glossary: GlossaryEntry[];
  /** Ten dai ly suy ra tu nhom (neu co) */
  dealerNameRaw?: string;
  /** Ten bot de boc @mention khoi noi dung */
  botName?: string;
  /** Quote + mot cua so lich su da duoc gioi han va resolve tu kho tin nhan. */
  context?: ConversationContext;
}

export interface OrderParser {
  readonly name: string;
  parse(input: ParserInput): Promise<ParseResult>;
}
