#!/usr/bin/env node
/**
 * SINH BO ANH PHIEU DO DAU TONG HOP — de do mot bo doc anh ma khong dung mot byte du lieu khach nao.
 *
 * ===========================================================================
 * VI SAO TONG HOP, VA VI SAO DIEU DO KHONG PHAI MOT SU THOA HIEP
 *
 * Mot bo do bang anh THAT cua khach doi hai thu ma Lane C khong co: su dong y bang van ban cua
 * khach cho viec gui anh sang mot dich vu thu ba, va mot cho luu tru cho chinh nhung buc anh do
 * trong repo. Ca hai deu la quyet dinh cua NGUOI, khong phai cua mot lane.
 *
 * Nhung cai ma mot bo do CAN — su that goc chinh xac tung ky tu — thi bo tong hop lai manh hon bo
 * that: o day ta BIET dap an, vi ta viet ra no truoc khi ve. Voi mot buc anh that, "su that goc"
 * la mot nguoi go tay, va nguoi do cung sai.
 *
 * ===========================================================================
 * CAI GI DUOC LAM KHO LEN MOT CACH CO CHU DICH
 *
 * Mot bo do ma moi buc anh deu sac net se cho ra mot con so dep va vo dung. Bo nay co Y dua vao:
 *
 *   · dau tieng Viet o ten cua hang (bo doc hay nuot dau, va "Hoa" vs "Hoà" la hai cua hang khac);
 *   · dau PHAN CACH NGHIN kieu Viet Nam (`1.437.500`) — cho ma mot bo doc de doc thanh `1,4375`;
 *   · so lit co PHAN THAP PHAN (`62,50`) ngay canh mot so tien khong co;
 *   · mot dong KHONG PHAI NHIEN LIEU tren cung to phieu;
 *   · mot phieu KHONG ghi bien so — truong hop pho bien nhat theo ND 123/2020 Dieu 10;
 *   · giay hoi nghieng va mo, nhu anh chup bang dien thoai trong cay xang.
 *
 * Cach dung:
 *   node tools/fuel-extraction-bench/make-dataset.mjs <thu-muc-ra>
 */

import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const OUT_DIR = resolve(process.argv[2] ?? 'fuel-bench-dataset');

/** Dinh dang so kieu Viet Nam: dau cham phan cach nghin, dau phay thap phan. */
const vnd = (value) => value.toLocaleString('vi-VN');
const litres = (milli) => (milli / 1000).toLocaleString('vi-VN', { minimumFractionDigits: 2 });

/**
 * BAY PHIEU, moi cai lam kho theo mot huong khac nhau.
 *
 * Con so o day la SU THAT GOC — bo cham diem so voi chinh chung, nen chung phai dung ve so hoc:
 * `litersMilli x unitPriceMilli / 1e6 = amountVnd`, sai so toi da mot dong.
 */
const RECEIPTS = [
  {
    id: 'r01-chuan',
    note: 'phieu chuan, sac net',
    sellerName: 'CÔNG TY XĂNG DẦU KHU VỰC I — CỬA HÀNG SỐ 5',
    sellerTaxCode: '0100107370',
    invoiceSymbol: 'C26TAA',
    invoiceNo: '00012345',
    issuedAt: '2026-09-01T08:30:00',
    plateHintRaw: '29C-123.45',
    skew: 0,
    blur: 0,
    lines: [
      {
        itemName: 'Dầu DO 0,05S-II',
        unit: 'Lít',
        litersMilli: 62_500,
        unitPriceMilli: 23_000_000,
        amountVnd: 1_437_500,
      },
    ],
  },
  {
    id: 'r02-khong-bien-so',
    note: 'KHONG ghi bien so — truong hop pho bien nhat',
    sellerName: 'CỬA HÀNG XĂNG DẦU HOÀ BÌNH',
    sellerTaxCode: '5400102345',
    invoiceSymbol: 'C26TYY',
    invoiceNo: '00000078',
    issuedAt: '2026-09-02T17:05:00',
    plateHintRaw: null,
    skew: -1.5,
    blur: 0.3,
    lines: [
      {
        itemName: 'Xăng RON 95-III',
        unit: 'Lít',
        litersMilli: 40_000,
        unitPriceMilli: 21_500_000,
        amountVnd: 860_000,
      },
    ],
  },
  {
    id: 'r03-hai-dong',
    note: 'hai dong, mot dong KHONG phai nhien lieu',
    sellerName: 'CỬA HÀNG XĂNG DẦU SỐ 12 — CHI NHÁNH THÁI NGUYÊN',
    sellerTaxCode: '4600234567',
    invoiceSymbol: 'C26TAB',
    invoiceNo: '00003311',
    issuedAt: '2026-09-03T06:12:00',
    plateHintRaw: '20A-678.90',
    skew: 2.2,
    blur: 0.6,
    lines: [
      {
        itemName: 'Dầu DO 0,001S-V',
        unit: 'Lít',
        litersMilli: 118_400,
        unitPriceMilli: 24_150_000,
        amountVnd: 2_859_360,
      },
      {
        itemName: 'Nước suối chai 500ml',
        unit: 'Chai',
        litersMilli: null,
        unitPriceMilli: null,
        amountVnd: 10_000,
      },
    ],
  },
  {
    id: 'r04-so-lon',
    note: 'so tien lon, nhieu dau phan cach nghin',
    sellerName: 'TỔNG KHO XĂNG DẦU ĐỨC GIANG',
    sellerTaxCode: '0101777888',
    invoiceSymbol: 'C26TAC',
    invoiceNo: '00098765',
    issuedAt: '2026-09-04T22:47:00',
    plateHintRaw: '29H-001.22',
    skew: -0.8,
    blur: 0.2,
    lines: [
      {
        itemName: 'Dầu DO 0,05S-II',
        unit: 'Lít',
        litersMilli: 640_000,
        unitPriceMilli: 23_050_000,
        amountVnd: 14_752_000,
      },
    ],
  },
  {
    id: 'r05-mo',
    note: 'anh mo va nghieng manh — bien so kho doc',
    sellerName: 'CỬA HÀNG XĂNG DẦU CẦU GIẤY',
    sellerTaxCode: '0102345678',
    invoiceSymbol: 'C26TAD',
    invoiceNo: '00000456',
    issuedAt: '2026-09-05T13:20:00',
    plateHintRaw: '30F-888.88',
    skew: 4.5,
    blur: 1.4,
    lines: [
      {
        itemName: 'Xăng E5 RON 92-II',
        unit: 'Lít',
        litersMilli: 35_200,
        unitPriceMilli: 20_800_000,
        amountVnd: 732_160,
      },
    ],
  },
  {
    id: 'r06-le-thap-phan',
    note: 'so lit co ba chu so thap phan',
    sellerName: 'CỬA HÀNG XĂNG DẦU MỸ ĐÌNH',
    sellerTaxCode: '0103456789',
    invoiceSymbol: 'C26TAE',
    invoiceNo: '00007001',
    issuedAt: '2026-09-06T05:58:00',
    plateHintRaw: '29C-555.66',
    skew: 1.1,
    blur: 0.4,
    lines: [
      {
        itemName: 'Dầu DO 0,05S-II',
        unit: 'Lít',
        litersMilli: 47_826,
        unitPriceMilli: 23_000_000,
        amountVnd: 1_099_998,
      },
    ],
  },
  {
    id: 'r07-ten-dai',
    note: 'ten nguoi ban rat dai, xuong dong',
    sellerName: 'CÔNG TY CỔ PHẦN THƯƠNG MẠI VÀ DỊCH VỤ XĂNG DẦU ĐÔNG BẮC — CỬA HÀNG BÁN LẺ SỐ 27',
    sellerTaxCode: '5700345678',
    invoiceSymbol: 'C26TAF',
    invoiceNo: '00000009',
    issuedAt: '2026-09-07T09:41:00',
    plateHintRaw: '14A-112.23',
    skew: -2.6,
    blur: 0.8,
    lines: [
      {
        itemName: 'Dầu DO 0,001S-V',
        unit: 'Lít',
        litersMilli: 90_000,
        unitPriceMilli: 24_150_000,
        amountVnd: 2_173_500,
      },
    ],
  },
];

function html(receipt) {
  const rows = receipt.lines
    .map(
      (line, index) => `
      <tr>
        <td class="c">${index + 1}</td>
        <td>${line.itemName}</td>
        <td class="c">${line.unit}</td>
        <td class="r">${line.litersMilli === null ? '1' : litres(line.litersMilli)}</td>
        <td class="r">${line.unitPriceMilli === null ? vnd(line.amountVnd) : vnd(line.unitPriceMilli / 1000)}</td>
        <td class="r">${vnd(line.amountVnd)}</td>
      </tr>`,
    )
    .join('');
  const total = receipt.lines.reduce((sum, line) => sum + line.amountVnd, 0);
  const [date, time] = receipt.issuedAt.split('T');
  const [year, month, day] = date.split('-');

  return `<!doctype html><meta charset="utf-8"><style>
    @page { margin: 0 }
    body { margin: 0; background: #6b6b66; width: 760px; height: 1040px;
           display: grid; place-items: center; font-family: "Times New Roman", serif }
    .paper { width: 620px; padding: 34px 40px; background: #fdfcf7; color: #14120e;
             box-shadow: 0 14px 40px rgba(0,0,0,.45);
             transform: rotate(${receipt.skew}deg); filter: blur(${receipt.blur}px) contrast(1.06) }
    h1 { font-size: 17px; text-align: center; margin: 0 0 4px; letter-spacing: .3px }
    .sub { text-align: center; font-size: 12px; margin: 0 0 14px; color: #3a352c }
    .seller { font-size: 13px; line-height: 1.45; margin-bottom: 12px }
    .meta { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 12px }
    table { width: 100%; border-collapse: collapse; font-size: 12px }
    th, td { border: 1px solid #14120e; padding: 5px 6px }
    th { background: #efece1; font-weight: 700 }
    .c { text-align: center } .r { text-align: right }
    .total { margin-top: 12px; font-size: 14px; text-align: right; font-weight: 700 }
    .foot { margin-top: 22px; font-size: 11px; color: #3a352c; line-height: 1.5 }
  </style>
  <div class="paper">
    <h1>HOÁ ĐƠN GIÁ TRỊ GIA TĂNG</h1>
    <p class="sub">Ngày ${day} tháng ${month} năm ${year} &nbsp;·&nbsp; ${time}</p>
    <div class="meta">
      <span>Mẫu số: 1/001</span>
      <span>Ký hiệu: <b>${receipt.invoiceSymbol}</b></span>
      <span>Số: <b>${receipt.invoiceNo}</b></span>
    </div>
    <div class="seller">
      <div><b>Đơn vị bán hàng:</b> ${receipt.sellerName}</div>
      <div><b>Mã số thuế:</b> ${receipt.sellerTaxCode}</div>
      <div><b>Người mua hàng:</b> Khách lẻ không lấy hoá đơn</div>
      ${receipt.plateHintRaw ? `<div><b>Biển số xe:</b> ${receipt.plateHintRaw}</div>` : ''}
    </div>
    <table>
      <tr><th>STT</th><th>Tên hàng hoá, dịch vụ</th><th>ĐVT</th><th>Số lượng</th><th>Đơn giá</th><th>Thành tiền</th></tr>
      ${rows}
    </table>
    <div class="total">Tổng cộng tiền thanh toán: ${vnd(total)} đ</div>
    <div class="foot">
      Hoá đơn điện tử khởi tạo theo Nghị định 70/2025/NĐ-CP.<br>
      <b>DỮ LIỆU TỔNG HỢP — KHÔNG PHẢI HOÁ ĐƠN THẬT.</b> Sinh cho bộ đo Lane C, Issue #236.
    </div>
  </div>`;
}

async function main() {
  // Playwright thuoc `apps/web`, khong thuoc `tools/`. Giai tu THU MUC DANG DUNG chu khong tu vi
  // tri cua tep nay, de lenh chay duoc tu `apps/web` ma khong phai them mot phu thuoc thu hai vao
  // goc kho — mot bo do chay tay khong dang lam nang anh production.
  const requireFromCwd = createRequire(join(process.cwd(), 'noop.mjs'));
  const playwright = await import(pathToFileURL(requireFromCwd.resolve('@playwright/test')).href);
  // Goi nay xuat kieu CJS, nen tuy phien ban `chromium` nam o goc hoac duoi `default`.
  const chromium = playwright.chromium ?? playwright.default?.chromium;
  if (!chromium) throw new Error('Khong tim thay `chromium` trong @playwright/test');
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 760, height: 1040 } });

  for (const receipt of RECEIPTS) {
    await page.setContent(html(receipt));
    await page.screenshot({ path: join(OUT_DIR, `${receipt.id}.png`), type: 'png' });
    process.stdout.write(`ve ${receipt.id}.png — ${receipt.note}\n`);
  }
  await browser.close();

  // SU THAT GOC di kem bo anh, khong nam trong bo cham diem: bo cham diem doc tep nay, nen ai cung
  // kiem lai duoc mot con so ma khong phai chay lai mo hinh.
  await writeFile(
    join(OUT_DIR, 'ground-truth.json'),
    `${JSON.stringify({ generatedFor: 'issue-236-lane-c', receipts: RECEIPTS }, null, 2)}\n`,
    'utf8',
  );
  process.stdout.write(`\n${RECEIPTS.length} phieu + ground-truth.json -> ${OUT_DIR}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
