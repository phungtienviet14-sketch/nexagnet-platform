import { expect, test } from '@playwright/test';
import { mockLifecycle, type LifecycleState } from './lifecycle-server';

/**
 * CHUOI NGHIEP VU CUA #196 §3, chay tren trinh duyet that voi mot may chu gia CO TRANG THAI.
 *
 * ==============================================================================================
 * BAI NAY KIEM DIEU GI, VA KHONG KIEM DIEU GI
 *
 * KIEM: rang cac LENH noi tiep nhau duoc. Lap mot chuyen thi chuyen do phan cong duoc; phan cong
 * xong thi lai xe nhin thay no; lai xe nop phieu dau thi ke toan mo ra xac thuc duoc; ke toan tu
 * choi thi lai xe doc duoc ly do va nop lai duoc.
 *
 * KHONG KIEM: rang may chu THAT tinh dung. Do la viec cua bo integration o `apps/api`. O day may
 * chu la gia — cai duy nhat duoc chung minh la BE MAT co du duong di, va no gui dung hop dong.
 *
 * ==============================================================================================
 * MOI BAI DEU KHANG DINH CA HAI PHIA
 *
 * Chi kiem chu tren man hinh la chua du: mot man hinh co the ve ra ket qua lac quan ma khong gui
 * gi ca. Nen moi buoc ghi deu kem mot khang dinh doc tu `state` — tuc tu PHIA MAY CHU — rang ban
 * ghi that su da doi.
 */

/**
 * DOI VAI DANG DANG NHAP.
 *
 * Chi doi mot bien, KHONG dieu huong: moi cho goi deu `page.goto(...)` ngay sau do, va mot lan
 * `goto` la mot lan tai tai lieu moi — tuc `/auth/me` duoc hoi lai voi vai moi. Ban truoc con
 * `goto('/')` roi `reload()` o day, tuc BA lan tai cho mot lan doi vai; nhan len bon lan doi vai
 * trong mot bai la tam chuc giay lang phi, va do la ly do bai nay het gio khi chay cung ca bo
 * chu khong phai khi chay mot minh.
 */
const asRole = (state: LifecycleState, role: LifecycleState['role']): void => {
  state.role = role;
};

test.describe('chuoi nghiep vu — lap chuyen den khi giao xong', () => {
  test('lap chuyen tu trinh duyet, phan cong xe va lai xe, roi lai xe chay het chuyen', async ({
    page,
  }) => {
    page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 400));
    });
    const state = await mockLifecycle(page, 'ADMIN');
    await page.goto('/?section=trips');

    /* --- 1. LAP CHUYEN --- */
    await page.getByRole('button', { name: 'Lập chuyến' }).click();
    const form = page.getByRole('form', { name: 'Lập chuyến mới' });
    await form.getByLabel('Mã chuyến').fill('VT-DEMO-001');
    await form.getByLabel('Điểm đi').fill('Hà Nội');
    await form.getByLabel('Điểm đến').fill('Hải Phòng');
    await form.getByLabel('Ngày chạy').fill('2026-09-04');
    await form.getByRole('button', { name: 'Lập chuyến' }).click();

    // Phia MAY CHU: chuyen that su duoc ghi.
    await expect.poll(() => state.trips.size).toBe(1);
    const trip = [...state.trips.values()][0]!;
    expect(trip.code).toBe('VT-DEMO-001');
    expect(trip.status).toBe('PLANNED');

    // Phia MAN HINH: bang chuyen doc ra chuyen vua lap.
    await expect(page.locator('#tx-main')).toContainText('VT-DEMO-001');

    /* --- 2. PHAN CONG XE + LAI XE --- */
    /*
     * KHONG phai bam vao dong nao: lap chuyen xong thi man hinh MO LUON chi tiet cua chuyen vua
     * lap (`onDone` goi `onSelect(code)`). Do la hanh vi dung — nguoi vua lap chuyen thi viec ke
     * tiep cua ho la phan cong xe, khong phai di tim lai dong minh vua tao.
     */
    const assign = page.getByRole('form', { name: 'Phân công xe và lái xe' });
    await expect(assign).toBeVisible();
    await assign.getByLabel('Xe', { exact: true }).selectOption({ label: '29H-123.45' });
    await assign.getByLabel('Lái xe', { exact: true }).selectOption({ label: 'Trần Văn Bình' });
    await assign.getByRole('button', { name: 'Phân công' }).click();

    /*
     * CA HAI KHOA phai co mat trong than yeu cau. May chu gia tra 400 khi thieu mot khoa, dung nhu
     * `.strict()` cua may chu that — nen mot man hinh chi gui khoa vua doi se lam bai nay DO.
     */
    await expect
      .poll(() => state.assignments.get(trip.id))
      .toEqual({ vehicleId: 'veh-1', driverId: 'drv-1' });

    /* --- 3. LAI XE: bat dau chuyen roi giao --- */
    asRole(state, 'SALE');
    await page.goto('/?surface=driver&screen=trip');

    await expect(page.locator('body')).toContainText('VT-DEMO-001');
    await page.getByRole('button', { name: 'Bắt đầu chuyến' }).click();
    await expect.poll(() => state.trips.get(trip.id)?.status).toBe('IN_TRANSIT');

    await page.getByRole('button', { name: 'Đã giao' }).click();
    await expect.poll(() => state.trips.get(trip.id)?.status).toBe('DELIVERED');
  });
});

test.describe('chuoi nghiep vu — bang ke cay xang', () => {
  test('xem truoc dem duoc dong bi loai, va chi sau do moi nhap that', async ({ page }) => {
    const state = await mockLifecycle(page, 'ACCOUNTING');
    await page.goto('/?section=fuel');

    const panel = page.getByRole('region', { name: 'Nhập bảng kê cây xăng' });
    await panel.getByLabel('Cây xăng').selectOption({ label: 'Petrolimex Cầu Giấy' });
    await panel.getByLabel('Từ ngày').fill('2026-09-01');
    await panel.getByLabel('Đến ngày').fill('2026-09-30');
    await panel.getByLabel('Tệp bảng kê').setInputFiles({
      name: 'bang-ke.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('bien_so,ngay,so_lit,so_tien\n29H-123.45,2026-09-04,60,1320000\n'),
    });

    /*
     * NUT NHAP PHAI KHOA TRUOC KHI XEM TRUOC.
     *
     * Nhap bang ke GHI THAT va tao luon mot ky doi soat. Neu nut do bam duoc ngay, mot tep sai cot
     * se de lai mot ky rac ma nguoi ta phai di don — nen day la mot tinh chat, khong phai mot chi
     * tiet giao dien.
     */
    await expect(panel.getByRole('button', { name: 'Nhập bảng kê' })).toBeDisabled();

    await panel.getByRole('button', { name: 'Xem trước' }).click();
    await expect(panel).toContainText('Không nhận ra biển số');
    expect(state.reconciliations.size, 'xem truoc KHONG duoc ghi gi').toBe(0);

    await panel.getByRole('button', { name: 'Nhập bảng kê' }).click();
    await expect.poll(() => state.reconciliations.size).toBe(1);
    await expect(panel).toContainText('mở kỳ đối soát');
  });
});

test.describe('chuoi nghiep vu — bao duong va giay to', () => {
  test('mo lenh sua chua roi hoan tat, va dang ky mot giay to', async ({ page }) => {
    const state = await mockLifecycle(page, 'ADMIN');
    await page.goto('/?section=maintenance');

    const openForm = page.getByRole('form', { name: 'Mở lệnh sửa chữa' });
    await openForm.getByLabel('Xe', { exact: true }).selectOption({ label: '29H-123.45' });
    await openForm.getByLabel('Nội dung').fill('Thay dầu máy và lọc gió');
    await openForm.getByLabel('Ngày mở').fill('2026-09-04');
    await openForm.getByLabel('Km lúc mở').fill('120450');
    await openForm.getByRole('button', { name: 'Mở lệnh sửa chữa' }).click();

    await expect.poll(() => state.workOrders.size).toBe(1);
    const order = [...state.workOrders.values()][0]!;
    expect(order.status).toBe('OPEN');

    await page.getByLabel('Ngày hoàn tất').fill('2026-09-05');
    await page.getByLabel('Km', { exact: true }).fill('120600');
    await page.getByLabel('Chi phí (đồng)').fill('2400000');
    await page.getByRole('button', { name: 'Hoàn tất' }).first().click();
    await page.getByRole('button', { name: 'Hoàn tất', exact: true }).last().click();

    await expect.poll(() => state.workOrders.get(order.id)?.status).toBe('COMPLETED');
    expect(state.workOrders.get(order.id)?.costAmount).toBe(2_400_000);

    const docForm = page.getByRole('form', { name: 'Đăng ký giấy tờ' });
    await docForm.getByLabel('Hiệu lực từ').fill('2026-09-01');
    await docForm.getByLabel('Đến').fill('2027-09-01');
    await docForm.getByRole('button', { name: 'Đăng ký giấy tờ' }).click();
    await expect.poll(() => state.complianceDocuments.length).toBe(1);
  });
});

test.describe('chuoi nghiep vu — luong', () => {
  // Chuoi day du: mo ky -> chay -> duyet -> tra -> phat phieu bu. Nhieu lan tai trang.
  test.setTimeout(120_000);
  test('mo ky, chay tinh luong, duyet, tra, roi phat phieu bu GIU NGUYEN phieu goc', async ({
    page,
  }) => {
    const state = await mockLifecycle(page, 'ADMIN');
    await page.goto('/?section=payroll');

    /* --- MO KY --- */
    const periodForm = page.getByRole('form', { name: 'Mở kỳ lương' });
    await periodForm.getByLabel('Tên kỳ').fill('Tháng 9/2026');
    await periodForm.getByLabel('Từ ngày').fill('2026-09-01');
    await periodForm.getByLabel('Đến ngày').fill('2026-09-30');
    await periodForm.getByRole('button', { name: 'Mở kỳ lương' }).click();
    await expect.poll(() => state.payrollPeriods.size).toBe(1);

    /* --- CHAY --- */
    await page
      .getByRole('row', { name: /Tháng 9\/2026/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Chạy tính lương' }).click();
    await page.getByRole('button', { name: 'Chạy tính lương', exact: true }).last().click();
    await expect.poll(() => state.payrollRuns.size).toBe(1);
    await expect.poll(() => state.payslips.size).toBe(1);

    const slip = [...state.payslips.values()][0]!;
    expect(slip.status).toBe('DRAFT');

    /*
     * MO LAN CHAY ra thi bang phieu moi ve. Danh sach phieu la cua MOT lan chay, khong phai
     * cua ca ky — nen phai chon lan chay truoc, giong het thao tac that.
     */
    await page.getByRole('button', { name: 'Xem phiếu' }).first().click();
    await expect(page.getByRole('region', { name: 'Phiếu lương của lần chạy' })).toBeVisible();

    /* --- DUYET roi CHI TRA --- */
    await page.getByRole('button', { name: 'Duyệt', exact: true }).first().click();
    await page.getByRole('button', { name: 'Duyệt', exact: true }).last().click();
    await expect.poll(() => state.payslips.get(slip.id)?.status).toBe('APPROVED');

    await page.getByRole('button', { name: 'Chi trả' }).first().click();
    await page.getByRole('button', { name: 'Đã trả' }).click();
    await expect.poll(() => state.payslips.get(slip.id)?.status).toBe('PAID');

    /* --- PHAT PHIEU BU: `INV-20` — phieu goc GIU NGUYEN --- */
    await page
      .getByRole('row', { name: /Trần Văn Bình/ })
      .first()
      .click();
    await expect(page.getByRole('heading', { name: 'Sửa phiếu đã chốt' })).toBeVisible();
    await page.getByLabel('Lý do', { exact: true }).fill('Bù công tác phí tháng 9.');
    await page.getByRole('button', { name: 'Phát phiếu', exact: true }).first().click();
    await page.getByRole('button', { name: 'Phát phiếu', exact: true }).last().click();

    await expect.poll(() => state.payslips.size).toBe(2);

    /*
     * DAY LA CA DIEM CUA `INV-20`, va no duoc kiem o PHIA MAY CHU chu khong phai tren man hinh:
     * phieu GOC khong bi sua mot chut nao — van `PAID`, van khong tro ve phieu nao — va phieu moi
     * la mot ban ghi RIENG tro nguoc lai phieu goc kem ly do.
     */
    expect(state.payslips.get(slip.id)?.status).toBe('PAID');
    expect(state.payslips.get(slip.id)?.correctsId).toBeNull();
    const issued = [...state.payslips.values()].find((row) => row.correctsId === slip.id);
    expect(issued?.correctionReason).toBe('Bù công tác phí tháng 9.');
    expect(issued?.status).toBe('DRAFT');
  });
});

test.describe('chuoi nghiep vu — vong doi phieu do dau di qua HAI VAI', () => {
  // Bon lan doi vai, moi lan mot lan tai trang tren `next dev`. Han mac dinh 30s du khi chay mot
  // minh nhung khong du khi ca bo cung bien dich — va mot bai chi xanh luc chay rieng la mot bai
  // se do vao dung luc khong ai muon.
  test.setTimeout(120_000);
  test('lai xe nop phieu kem anh, ke toan tu choi kem ly do, lai xe nop lai, ke toan xac thuc', async ({
    page,
  }) => {
    const state = await mockLifecycle(page, 'ADMIN');

    // Diem xuat phat: mot chuyen da lap va da phan cong. Hai buoc do da duoc bai tren kiem rieng.
    await page.goto('/?section=trips');
    await page.getByRole('button', { name: 'Lập chuyến' }).click();
    const form = page.getByRole('form', { name: 'Lập chuyến mới' });
    await form.getByLabel('Mã chuyến').fill('VT-DEMO-002');
    await form.getByLabel('Điểm đi').fill('Hà Nội');
    await form.getByLabel('Điểm đến').fill('Nam Định');
    await form.getByRole('button', { name: 'Lập chuyến' }).click();
    await expect.poll(() => state.trips.size).toBe(1);
    const trip = [...state.trips.values()][0]!;

    const assign = page.getByRole('form', { name: 'Phân công xe và lái xe' });
    await expect(assign).toBeVisible();
    await assign.getByLabel('Xe', { exact: true }).selectOption({ label: '29H-123.45' });
    await assign.getByLabel('Lái xe', { exact: true }).selectOption({ label: 'Trần Văn Bình' });
    await assign.getByRole('button', { name: 'Phân công' }).click();
    await expect.poll(() => state.assignments.size).toBe(1);

    /* --- LAI XE nop phieu do dau --- */
    asRole(state, 'SALE');
    await page.goto('/?surface=driver&screen=fuel');

    const slipForm = page.getByRole('region', { name: 'Ghi phiếu đổ nhiên liệu' });
    /*
     * DOI FORM SAN SANG, khong doi mot khoang thoi gian.
     *
     * Khoi `Ghi phiếu đổ nhiên liệu` ve ra NGAY, nhung o trong no la mot cau "chua co chuyen nao
     * dang mo" cho den khi truy van chuyen cua chinh minh trả ve. Bam vao do som mot nhip thi
     * khong phai loi cua san pham — nhung no lam bai test chop chop, nen cho moc la CAI NUT, thu
     * chi ton tai khi da co chuyen.
     */
    await expect(slipForm.getByRole('button', { name: 'Gửi phiếu' })).toBeVisible();
    await slipForm.getByLabel('Cây xăng').selectOption({ label: 'Petrolimex Cầu Giấy' });
    await slipForm.getByLabel('Số lít').fill('60');
    await slipForm.getByLabel('Số tiền (đồng)').fill('1320000');
    await slipForm.getByLabel('Số km trên đồng hồ').fill('120450');
    await slipForm.getByRole('button', { name: 'Gửi phiếu' }).click();

    await expect.poll(() => state.fuelEntries.size).toBe(1);
    const entry = [...state.fuelEntries.values()][0]!;
    expect(entry.verificationStatus).toBe('DECLARED');
    /*
     * `vehicleId` den tu CHUYEN cua chinh minh, khong phai mot o nhap.
     *
     * Day la ly do `DriverTripView` phai mang `vehicleId`: lai xe chi doc duoc BIEN SO, ma
     * `POST /me/fuel/slips` doi ma xe. Neu be mat lai xe khong hoc duoc ma do tu dau, o nhap phieu
     * khong the ton tai.
     */
    expect(entry.vehicleId).toBe('veh-1');

    /* --- KE TOAN tu choi kem LY DO --- */
    asRole(state, 'ACCOUNTING');
    await page.goto(`/?section=trips&selected=${trip.code}`);

    await page
      .getByRole('row', { name: /Petrolimex/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Từ chối' }).click();
    await page.getByLabel('Lý do từ chối').fill('Ảnh phiếu mờ, không đọc được số lít.');
    await page.getByRole('button', { name: 'Từ chối', exact: true }).last().click();

    await expect.poll(() => state.fuelEntries.get(entry.id)?.verificationStatus).toBe('REJECTED');
    expect(state.fuelEntries.get(entry.id)?.reviewNote).toBe(
      'Ảnh phiếu mờ, không đọc được số lít.',
    );

    /* --- LAI XE doc duoc NGUYEN VAN ly do, va nop lai duoc --- */
    asRole(state, 'SALE');
    await page.goto('/?surface=driver&screen=fuel');
    await expect(page.locator('body')).toContainText('Ảnh phiếu mờ, không đọc được số lít.');

    await page.getByRole('button', { name: 'Nộp lại phiếu' }).first().click();
    await expect.poll(() => state.fuelEntries.get(entry.id)?.verificationStatus).toBe('DECLARED');

    /* --- KE TOAN xac thuc --- */
    asRole(state, 'ACCOUNTING');
    await page.goto(`/?section=trips&selected=${trip.code}`);
    await page
      .getByRole('row', { name: /Petrolimex/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Xác thực' }).click();
    await page.getByRole('button', { name: 'Xác thực', exact: true }).last().click();

    await expect.poll(() => state.fuelEntries.get(entry.id)?.verificationStatus).toBe('VERIFIED');
  });
});
