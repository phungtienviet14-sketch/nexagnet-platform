import type {
  Dealer,
  DealerPriceOverride,
  GlossaryEntry,
  GroupMap,
  KnowledgeSnapshot,
  PriceRow,
  Product,
} from './domain.js';

/**
 * NGUON SU THAT THAT (U Ultty) — trich tu ho so khao sat khach (07/2026):
 * - Danh muc + gia: "Thong bao gia thang 7.2026" (19 SP chinh) + "Ten va ma san pham".
 * - Glossary: "Viet tat_" (cum-cau that dai ly hay nhan).
 * Gia dai ly/CTV TRA = cot "Don gia CTV" (wholesale). Cac muc khac de bao gia tham chieu.
 *
 * CON THIEU (Phase 0): danh sach day du dai ly/CTV + map nhom Zalo -> dai ly + Zalo group id
 * (lay tu export KiotViet theo kenh ban). Tam giu 3 nhom mau (chi nhanh that HN/TN/OCP).
 */

const products: Product[] = [
  { sku: 'ELNI', name: 'Quạt tích điện dáng đứng U ULTTY model ELNI', aliases: ['elni', 'quat elni', 'quat tich dien', 'quat dung tich dien'], unit: 'Chiếc', description: 'Quạt tích điện dáng đứng, pin sạc, phù hợp mất điện/ngoài trời.' },
  { sku: 'HERCULES', name: 'Máy hút ẩm và lọc không khí U Ultty Hercules', aliases: ['hercules', 'may hut am hercules', 'hut am loc khi'], unit: 'Chiếc', description: 'Máy hút ẩm kèm lọc không khí, công suất lớn cho phòng rộng.' },
  { sku: 'V08', name: 'Máy hút bụi và lau nhà cầm tay Ultty V08', aliases: ['v08', 'may hut bui v08', 'hut bui lau nha cam tay'], unit: 'Chiếc', description: 'Máy hút bụi + lau nhà cầm tay không dây, lực hút mạnh.' },
  { sku: 'SCW18', name: 'Máy lau nhà hút bụi thông minh ULTTY SCW18', aliases: ['scw18', 'scw 18', 'may lau nha scw', 'lau nha thong minh'], unit: 'Chiếc', description: 'Máy lau nhà hút bụi thông minh, tự làm sạch con lăn.' },
  { sku: 'SKJ-CR022', name: 'Quạt lọc không khí bù ẩm Ultty SKJ-CR022', aliases: ['cr022', 'skj cr022', 'quat loc bu am', 'quat cr022'], unit: 'Chiếc', description: 'Quạt lọc không khí kèm bù ẩm, màng lọc HEPA H13.' },
  { sku: 'BB-GREY', name: 'Quạt lọc không khí và khử khuẩn Ultty BB GREY', aliases: ['bb grey', 'bb gray', 'quat bb grey', 'bb xam'], unit: 'Chiếc', description: 'Quạt lọc không khí khử khuẩn, thiết kế chân máy BB, màu Grey.' },
  { sku: 'BB-ROSE', name: 'Quạt lọc không khí và khử khuẩn Ultty BB ROSE CHAMPAGNE', aliases: ['bb rose', 'bb champagne', 'bb rose champagne', 'bb hong'], unit: 'Chiếc', description: 'Quạt lọc không khí khử khuẩn BB, màu Rose Champagne.' },
  { sku: 'SKJ-CR018HM', name: 'Quạt tháp sưởi ấm và làm mát Ultty SKJ-CR018HM', aliases: ['cr018', 'cr018hm', 'thap suoi', 'quat thap suoi'], unit: 'Chiếc', description: 'Tháp 2 trong 1: sưởi ấm mùa đông + làm mát, kèm bù ẩm.' },
  { sku: 'MKL', name: 'Máy bắt muỗi và côn trùng Ultty MKL', aliases: ['mkl', 'may bat muoi', 'bat muoi', 'bat con trung'], unit: 'Chiếc', description: 'Máy bắt muỗi & côn trùng bằng đèn UV + hút, an toàn trong nhà.' },
  { sku: 'CLAGE-CEX9', name: 'Máy làm nước nóng trực tiếp CLAGE CEX9 Plus', aliases: ['clage', 'cex9', 'may nuoc nong', 'nuoc nong truc tiep'], unit: 'Chiếc', description: 'Máy làm nóng nước trực tiếp CLAGE (Đức), không bình chứa.' },
  { sku: 'SKJ-CRS01', name: 'Bình điện phân phun sương diệt khuẩn ULTTY SKJ-CRS01', aliases: ['crs01', 'phun suong', 'binh dien phan', 'diet khuan'], unit: 'Chiếc', description: 'Bình điện phân tạo dung dịch diệt khuẩn, phun sương khử khuẩn.' },
  { sku: 'B23', name: 'Máy bù ẩm ULTTY B23', aliases: ['b23', 'may bu am b23', 'tao am b23', 'bu am mini'], unit: 'Chiếc', description: 'Máy tạo ẩm/bù ẩm mini để bàn, dung tích nhỏ.' },
  { sku: 'PRINCESS-12L', name: 'Nồi chiên không dầu đa năng Princess – 12L', aliases: ['noi chien', 'princess 12l', 'noi chien khong dau', 'noi chien princess'], unit: 'Chiếc', description: 'Nồi chiên không dầu đa năng 12L, khoang lớn, nhiều chế độ.' },
  { sku: 'PRINCESS-EASYFILL', name: 'Máy ép chậm Princess Easy Fill', aliases: ['may ep cham', 'ep cham', 'easy fill', 'princess ep', 'may ep'], unit: 'Chiếc', description: 'Máy ép chậm Princess Easy Fill, miệng nạp lớn, ít bã.' },
  { sku: 'AROMA', name: 'Máy khuếch tán tinh dầu U ULTTY AROMA', aliases: ['aroma', 'khuech tan', 'tinh dau', 'may tinh dau'], unit: 'Chiếc', description: 'Máy khuếch tán tinh dầu Aroma, tạo hương + ẩm nhẹ.' },
  { sku: 'WFX', name: 'Máy rửa và khử khuẩn thực phẩm cầm tay WFX', aliases: ['wfx', 'may rua thuc pham', 'rua khu khuan', 'rua thuc pham'], unit: 'Chiếc', description: 'Máy rửa & khử khuẩn thực phẩm cầm tay, loại bỏ hóa chất/vi khuẩn.' },
  { sku: 'COMBO-WFX-PF360', name: 'COMBO Máy rửa khử khuẩn thực phẩm WFX + Chậu rổ quay rau PF360', aliases: ['combo wfx', 'wfx pf360', 'combo rua rau', 'pf360'], unit: 'Bộ', description: 'Combo máy rửa WFX + chậu rổ quay rau thông minh PF360.' },
  { sku: 'ELNA', name: 'Quạt cầm tay tích điện mini U ULTTY model ELNA', aliases: ['elna', 'quat cam tay', 'quat mini', 'quat cam tay mini'], unit: 'Chiếc', description: 'Quạt cầm tay tích điện mini, nhỏ gọn mang theo.' },
  { sku: 'FELIX', name: 'Ghế nâng an toàn trẻ em EUS Felix (màu xám)', aliases: ['felix', 'ghe felix', 'ghe nang', 'ghe tre em', 'ghe an toan'], unit: 'Chiếc', description: 'Ghế nâng an toàn cho trẻ em EUS Felix, đạt chuẩn an toàn.' },
];

// Bang gia thang 7.2026 (Niem yet | Ban le | Ban le toi thieu | Don gia CTV=wholesale).
const prices: PriceRow[] = [
  { sku: 'ELNI', wholesale: 2_150_000, minRetailPrice: 3_100_000, retailPrice: 3_850_000, listPrice: 4_150_000 },
  { sku: 'HERCULES', wholesale: 5_150_000, minRetailPrice: 6_750_000, retailPrice: 7_500_000, listPrice: 9_000_000 },
  { sku: 'V08', wholesale: 4_900_000, minRetailPrice: 6_000_000, retailPrice: 7_500_000, listPrice: 9_500_000 },
  { sku: 'SCW18', wholesale: 5_950_000, minRetailPrice: 7_000_000, retailPrice: 7_500_000, listPrice: 8_000_000 },
  { sku: 'SKJ-CR022', wholesale: 6_900_000, minRetailPrice: 8_500_000, retailPrice: 10_000_000, listPrice: 12_000_000 },
  { sku: 'BB-GREY', wholesale: 6_250_000, minRetailPrice: 7_500_000, retailPrice: 8_000_000, listPrice: 10_000_000 },
  { sku: 'BB-ROSE', wholesale: 6_250_000, minRetailPrice: 7_600_000, retailPrice: 8_000_000, listPrice: 10_000_000 },
  { sku: 'SKJ-CR018HM', wholesale: 4_150_000, minRetailPrice: 5_150_000, retailPrice: 5_850_000, listPrice: 6_500_000 },
  { sku: 'MKL', wholesale: 750_000, minRetailPrice: 1_200_000, retailPrice: 1_500_000, listPrice: 2_350_000 },
  { sku: 'CLAGE-CEX9', wholesale: 6_600_000, minRetailPrice: 8_000_000, retailPrice: 9_000_000, listPrice: 10_000_000 },
  { sku: 'SKJ-CRS01', wholesale: 1_850_000, minRetailPrice: 2_500_000, retailPrice: 4_500_000, listPrice: 6_000_000 },
  { sku: 'B23', wholesale: 450_000, minRetailPrice: 600_000, retailPrice: 750_000, listPrice: 1_500_000 },
  { sku: 'PRINCESS-12L', wholesale: 2_650_000, minRetailPrice: 3_500_000, retailPrice: 4_000_000, listPrice: 4_500_000 },
  { sku: 'PRINCESS-EASYFILL', wholesale: 2_750_000, minRetailPrice: 3_500_000, retailPrice: 4_150_000, listPrice: 4_500_000 },
  { sku: 'AROMA', wholesale: 850_000, minRetailPrice: 1_250_000, retailPrice: 1_350_000, listPrice: 1_500_000 },
  { sku: 'WFX', wholesale: 1_750_000, minRetailPrice: 2_350_000, retailPrice: 2_750_000, listPrice: 3_500_000 },
  { sku: 'COMBO-WFX-PF360', wholesale: 1_950_000, minRetailPrice: 3_000_000, retailPrice: 2_750_000, listPrice: 3_500_000 },
  { sku: 'ELNA', wholesale: 450_000, minRetailPrice: 750_000, retailPrice: 850_000, listPrice: 1_250_000 },
  { sku: 'FELIX', wholesale: 1_250_000, minRetailPrice: 1_750_000, retailPrice: 2_000_000, listPrice: 2_500_000 },
];

// Deal rieng theo dealer+sku — chua co so lieu tu khach (Phase 0). De rong: moi dai ly tra gia si chung.
const priceOverrides: DealerPriceOverride[] = [];

// TAM giu 3 dai ly/nhom mau (chi nhanh that HN/TN/OCP tu khao sat) — cho danh sach day du Phase 0.
const dealers: Dealer[] = [
  { id: 'meta-hn', name: 'Meta HN', aliases: ['meta hn', 'meta'], tier: 'dai_ly', defaultPolicy: 'cong_no_30' },
  { id: 'dl-thai-nguyen', name: 'Đại lý Thái Nguyên', aliases: ['dai ly tn', 'tn'], tier: 'dai_ly', defaultPolicy: 'cong_no_45' },
  { id: 'ctv-ocean-park', name: 'CTV Ocean Park', aliases: ['ocean park', 'ocp'], tier: 'ctv', defaultPolicy: 'thanh_toan_ngay' },
];

// Map nhom -> dai ly theo chatId (ID NHOM, KHONG phai TEN nhom).
// - Kenh zca (CHANNEL_MODE=zca): chatId = threadId cua zca; nhan tin 1 lan trong nhom roi xem log
//   API "📌 Nhom ... chatId=..." -> copy vao day. (chat_id zgr-... la cua Bot Platform, KHAC zca.)
// - Kenh bot (CHANNEL_MODE=bot): lay chat_id bang `pnpm poc:groups`.
const groups: GroupMap[] = [
  { chatId: '2046408360852539532', dealerId: 'meta-hn', branch: 'HN', name: 'Nhóm đại lý Meta HN' },
  { chatId: '736861033200222675', dealerId: 'dl-thai-nguyen', branch: 'TN', name: 'Nhóm đại lý Thái Nguyên' },
];

// Glossary THAT (Viet tat_): viet tat + cum-cau dai ly hay nhan (giai ma + few-shot cho parser).
const glossary: GlossaryEntry[] = [
  { term: 'TN', meaning: 'Thái Nguyên' },
  { term: 'OCP', meaning: 'Ocean Park' },
  { term: 'ocp1', meaning: 'Ocean Park 1' },
  { term: 'c', meaning: 'chị' },
  { term: 'a', meaning: 'anh' },
  { term: 'e', meaning: 'em' },
  { term: 'b', meaning: 'bạn' },
  { term: 'm', meaning: 'mình' },
  { term: 't', meaning: 'tiền' },
  { term: 'k', meaning: 'không (sau chữ) / nghìn (sau số)' },
  { term: 'dc', meaning: 'được' },
  { term: 'ck', meaning: 'chuyển khoản' },
  { term: 'bn', meaning: 'bao nhiêu' },
  { term: 'ib', meaning: 'inbox (nhắn tin)' },
  { term: 'cs', meaning: 'công suất' },
  { term: 'w', meaning: 'watt' },
  { term: 'ntn', meaning: 'như thế nào' },
  { term: 'rep', meaning: 'trả lời' },
  { term: 'fix', meaning: 'giảm giá' },
  { term: 'sll', meaning: 'số lượng lớn' },
  { term: 'cod', meaning: 'thu hộ khi giao (COD)' },
  { term: 'pm25', meaning: 'bụi mịn PM2.5' },
  { term: 'gui ve TN cho c', meaning: 'Gửi về Thái Nguyên cho chị' },
  { term: 'gui ocp1 nhe', meaning: 'Gửi Ocean Park 1 nhé' },
];

export const SEED: KnowledgeSnapshot = { products, prices, priceOverrides, dealers, groups, glossary };
