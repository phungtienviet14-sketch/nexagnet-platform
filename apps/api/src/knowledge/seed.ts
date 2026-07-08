import type { Dealer, GlossaryEntry, GroupMap, KnowledgeSnapshot, PriceRow, Product } from './domain.js';

/**
 * DU LIEU GIA LAP cho demo (thay cho nguon su that that cua khach).
 * SKU gia dung cao cap + gia 2 cap + dai ly + glossary viet tat.
 * Nhom "Meta HN" map dung chat_id nhom test that (zgr-...) tu PoC.
 */

const products: Product[] = [
  {
    sku: 'GHE-FELIX',
    name: 'Ghế massage Felix',
    aliases: ['felix', 'ghe felix', 'ghe massage'],
    unit: 'cái',
    description: 'Ghế massage toàn thân con lăn 4D, 12 chương trình, nhiệt hồng ngoại, bảo hành 2 năm.',
  },
  {
    sku: 'NCKD-5L',
    name: 'Nồi chiên không dầu 5L',
    aliases: ['noi chien', 'ncked', 'noi chien khong dau'],
    unit: 'cái',
    description: 'Dung tích 5L cho gia đình 3-5 người, 8 chế độ nấu, lồng chống dính, ít dầu 90%.',
  },
  {
    sku: 'ROBOT-HB',
    name: 'Robot hút bụi lau nhà',
    aliases: ['robot', 'robot hut bui', 'may hut bui robot'],
    unit: 'cái',
    description: 'Hút + lau 2 trong 1, lực hút 4000Pa, dẫn đường laser LDS, tự về sạc, điều khiển qua app.',
  },
  {
    sku: 'MAY-LOC-NUOC',
    name: 'Máy lọc nước RO',
    aliases: ['may loc nuoc', 'loc nuoc', 'may ro'],
    unit: 'cái',
    description: 'Công nghệ RO 9 cấp, bình áp 10L, vòi thông minh, đạt QCVN nước uống trực tiếp.',
  },
  { sku: 'MAY-LOC-KK', name: 'Máy lọc không khí', aliases: ['may loc khong khi', 'loc khong khi'], unit: 'cái' },
  { sku: 'BEP-TU-DOI', name: 'Bếp từ đôi', aliases: ['bep tu', 'bep tu doi'], unit: 'cái' },
  { sku: 'NCĐ-TU', name: 'Nồi cơm điện tử', aliases: ['noi com', 'noi com dien tu'], unit: 'cái' },
  { sku: 'AM-SIEU-TOC', name: 'Ấm siêu tốc', aliases: ['am sieu toc', 'am dun'], unit: 'cái' },
  { sku: 'MAY-EP-CHAM', name: 'Máy ép chậm', aliases: ['may ep cham', 'ep cham', 'may ep'], unit: 'cái' },
  { sku: 'QUAT-DIEU-HOA', name: 'Quạt điều hòa', aliases: ['quat dieu hoa', 'quat hoi nuoc'], unit: 'cái' },
  { sku: 'DEN-SUOI-NT', name: 'Đèn sưởi nhà tắm', aliases: ['den suoi', 'den suoi nha tam'], unit: 'cái' },
  { sku: 'BAN-LA-HOI', name: 'Bàn là hơi nước', aliases: ['ban la', 'ban ui', 'ban la hoi nuoc'], unit: 'cái' },
  { sku: 'MAY-XAY-DN', name: 'Máy xay đa năng', aliases: ['may xay', 'may xay da nang'], unit: 'cái' },
  { sku: 'CAY-LAU-NHA', name: 'Cây lau nhà xoay', aliases: ['cay lau nha', 'cay lau', 'lau nha'], unit: 'bộ' },
];

const prices: PriceRow[] = [
  { sku: 'GHE-FELIX', prices: { dai_ly: 1_150_000, ctv: 1_250_000 } },
  { sku: 'NCKD-5L', prices: { dai_ly: 890_000, ctv: 990_000 } },
  { sku: 'ROBOT-HB', prices: { dai_ly: 4_200_000, ctv: 4_500_000 } },
  { sku: 'MAY-LOC-NUOC', prices: { dai_ly: 3_500_000, ctv: 3_800_000 } },
  { sku: 'MAY-LOC-KK', prices: { dai_ly: 2_600_000, ctv: 2_850_000 } },
  { sku: 'BEP-TU-DOI', prices: { dai_ly: 1_950_000, ctv: 2_150_000 } },
  { sku: 'NCĐ-TU', prices: { dai_ly: 1_250_000, ctv: 1_390_000 } },
  { sku: 'AM-SIEU-TOC', prices: { dai_ly: 320_000, ctv: 380_000 } },
  { sku: 'MAY-EP-CHAM', prices: { dai_ly: 1_680_000, ctv: 1_850_000 } },
  { sku: 'QUAT-DIEU-HOA', prices: { dai_ly: 2_100_000, ctv: 2_350_000 } },
  { sku: 'DEN-SUOI-NT', prices: { dai_ly: 690_000, ctv: 790_000 } },
  { sku: 'BAN-LA-HOI', prices: { dai_ly: 540_000, ctv: 620_000 } },
  { sku: 'MAY-XAY-DN', prices: { dai_ly: 780_000, ctv: 880_000 } },
  { sku: 'CAY-LAU-NHA', prices: { dai_ly: 250_000, ctv: 300_000 } },
];

const dealers: Dealer[] = [
  { id: 'meta-hn', name: 'Meta HN', aliases: ['meta hn', 'meta'], tier: 'dai_ly', defaultPolicy: 'cong_no_30' },
  { id: 'dl-thai-nguyen', name: 'Đại lý Thái Nguyên', aliases: ['dai ly tn', 'tn'], tier: 'dai_ly', defaultPolicy: 'cong_no_45' },
  { id: 'ctv-ocean-park', name: 'CTV Ocean Park', aliases: ['ocean park', 'ocp'], tier: 'ctv', defaultPolicy: 'thanh_toan_ngay' },
];

// Nhom Zalo THAT (chat_id zgr-...) — map moi nhom ve 1 dai ly de demo nhieu nhom.
// Lay chat_id bang `pnpm poc:groups` (tag bot trong nhom -> in ra chat_id).
const groups: GroupMap[] = [
  {
    chatId: 'zgr-f8a7101d77709e2ec761',
    dealerId: 'meta-hn',
    branch: 'HN',
    name: 'Nhóm đại lý Meta HN',
  },
  {
    // Nhom Zalo that thu 2 (lay bang `pnpm poc:groups` / feed app 07/07).
    chatId: 'zgr-f51afbe59a8873d62a99',
    dealerId: 'dl-thai-nguyen',
    branch: 'TN',
    name: 'Nhóm đại lý Thái Nguyên',
  },
];

const glossary: GlossaryEntry[] = [
  { term: 'TN', meaning: 'Thái Nguyên' },
  { term: 'OCP', meaning: 'Ocean Park' },
  { term: 'c', meaning: 'chị' },
  { term: 'a', meaning: 'anh' },
  { term: 'ck', meaning: 'chuyển khoản' },
  { term: 'sll', meaning: 'số lượng lớn' },
  { term: 'k', meaning: 'nghìn' },
];

export const SEED: KnowledgeSnapshot = { products, prices, dealers, groups, glossary };
