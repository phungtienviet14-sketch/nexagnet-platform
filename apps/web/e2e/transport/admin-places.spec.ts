import { expect, test, type Page } from '@playwright/test';
import { shoot } from './admin-accounts-server';
import { emptyPlacesMapPoint, lastRequest, servePlaces } from './admin-places-server';

/**
 * `#395` — "Địa điểm vận hành", BAN DO TRUOC, tren trinh duyet that.
 *
 * Tim kiem va tim nguoc TAT (khach khong bat nha cung cap ngoai): moi diem dat bang cach bam ban
 * do. Bo nay do: them bai xe bang ban do, bai thu hai thanh bai du phong, doi bai chinh khi con viec
 * dang mo (phai xac nhan danh sach), canh bao khi doi hinh hoc va khi tat, va man Tao don thay dia
 * diem moi ngay lan mo ke tiep — khong phai sau 5 phut.
 */

const horizontalOverflow = (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const nav = (page: Page) => page.getByRole('navigation', { name: 'Điều hướng vận hành vận tải' });

async function openPlaces(page: Page): Promise<void> {
  await page.goto('/?section=admin-places');
  await expect(page.getByRole('heading', { level: 1, name: 'Địa điểm vận hành' })).toBeVisible();
  await expect(page.getByTestId('tx-places-map')).toBeVisible({ timeout: 30_000 });
}

async function placeOnMap(page: Page): Promise<void> {
  await page.getByTestId('tx-places-map').click({ position: await emptyPlacesMapPoint(page) });
  await expect(page.getByTestId('place-point')).toContainText('Điểm đã đặt:');
}

test.describe('Địa điểm vận hành — bãi xe', () => {
  test('them bai xe bang cach bam ban do khi tim kiem tat; bai thu hai la bai du phong; doi bai chinh phai xac nhan viec dang mo', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const world = await servePlaces(page);
    await openPlaces(page);

    await expect(page.getByTestId('depot-summary')).toContainText(
      'Bãi xe Hà Nội — đang dùng để lập kế hoạch chặng rỗng và đóng vòng chạy',
    );
    // Ghim moi dia diem tren ban do — la NUT, doc duoc ten va loai.
    await expect(
      page.getByRole('button', { name: 'Địa điểm khách hàng: Nhà máy thép Đình Vũ' }),
    ).toBeVisible();
    await shoot(page, 'places-list-1440');

    await page.getByRole('button', { name: 'Thêm địa điểm' }).click();
    await expect(page.getByRole('heading', { name: 'Địa điểm mới' })).toBeFocused();
    await page.getByRole('radio', { name: /Bãi xe của công ty mình/ }).check();

    // Tim kiem TAT: noi ro, roi an o tim — ban do van dat diem duoc.
    await page.getByLabel('Tìm theo tên hoặc địa chỉ').fill('Bãi Hải Phòng');
    await page.getByRole('button', { name: 'Tìm', exact: true }).click();
    await expect(page.getByText(/Tìm kiếm địa điểm chưa được bật/)).toBeVisible();
    await expect(page.getByLabel('Tìm theo tên hoặc địa chỉ')).toHaveCount(0);

    await placeOnMap(page);
    await page.getByLabel('Tên địa điểm').fill('Bãi xe Hải Phòng');
    await page.getByLabel('Địa chỉ', { exact: true }).fill('Đường 5 mới, Hải An, Hải Phòng');
    await page.getByLabel('Bán kính (m)').fill('300');
    await shoot(page, 'places-editor-1440');
    await page.getByRole('button', { name: 'Thêm địa điểm', exact: true }).click();

    const created = lastRequest(world, 'POST', '/transport/places/admin')?.body;
    expect(created).toMatchObject({ kind: 'DEPOT', name: 'Bãi xe Hải Phòng', radiusMetres: 300 });
    expect(created).not.toHaveProperty('owner');
    expect(typeof (created?.point as { latitude: unknown }).latitude).toBe('number');
    // Da co bai dang dung: bai moi la bai DU PHONG, va man hinh noi dieu do.
    await expect(page.getByText(/Đã thêm Bãi xe Hải Phòng làm bãi dự phòng/)).toBeVisible();
    const detail = page.getByTestId('place-detail');
    await expect(detail.getByTestId('depot-planner')).toContainText('Bãi dự phòng');

    // Con vong xe / don dang dung bai cu: doi bai chinh phai XEM danh sach va xac nhan.
    world.openWork = {
      runs: [{ id: 'run-1', code: 'VX-0925-01' }],
      orders: [{ id: 'ord-1', code: 'DH-0925-07' }],
    };
    await detail.getByRole('button', { name: 'Đặt làm bãi chính' }).click();
    const primary = page.getByRole('dialog', { name: 'Đặt Bãi xe Hải Phòng làm bãi chính?' });
    await expect(primary).toContainText('Bãi xe Hà Nội chuyển thành bãi dự phòng');
    await primary.getByRole('button', { name: 'Đặt làm bãi chính' }).click();
    const openWork = page.getByRole('dialog', { name: 'Còn việc đang mở dùng bãi xe này' });
    await expect(openWork.getByTestId('open-work')).toContainText('VX-0925-01');
    await expect(openWork.getByTestId('open-work')).toContainText('DH-0925-07');
    await shoot(page, 'places-open-work-1440', false);
    await openWork.getByRole('button', { name: 'Tôi đã xem, vẫn đổi' }).click();

    expect(lastRequest(world, 'POST', /make-primary-depot$/)?.body).toEqual({
      acknowledgeOpenWork: true,
    });
    await expect(detail.getByTestId('depot-planner')).toContainText(
      'Đang dùng để lập kế hoạch chặng rỗng và đóng vòng chạy',
    );
    await detail.getByRole('button', { name: 'Lịch sử thay đổi' }).click();
    await expect(detail.getByTestId('place-history')).toContainText('Đặt làm bãi chính');
    await expect(detail.getByTestId('place-history')).toContainText('Thêm địa điểm');
  });

  test('doi hinh hoc va tat dia diem deu canh bao cham lai bang chung; tat can ly do', async ({
    page,
  }) => {
    const world = await servePlaces(page);
    await openPlaces(page);

    await page
      .getByRole('button', { name: /Kho Nhựa Tân Phú Hưng/ })
      .first()
      .click();
    const detail = page.getByTestId('place-detail');
    await expect(detail.getByRole('heading', { name: 'Kho Nhựa Tân Phú Hưng' })).toBeVisible();

    await detail.getByRole('button', { name: 'Sửa địa điểm' }).click();
    await expect(page.getByTestId('geometry-warning')).toHaveCount(0);
    await page.getByLabel('Bán kính (m)').fill('400');
    await expect(page.getByTestId('geometry-warning')).toContainText(
      'Các bằng chứng hiện trường tại điểm này sẽ được chấm lại theo vị trí mới.',
    );
    // Huy trinh sua: quay ve CHINH dia diem dang xem, khong luu gi.
    await page.getByRole('button', { name: 'Huỷ' }).click();
    expect(lastRequest(world, 'PATCH', /gf-tan-phu-hung$/)).toBeUndefined();
    await detail.getByRole('button', { name: 'Tắt địa điểm' }).click();
    const dialog = page.getByRole('dialog', { name: 'Tắt Kho Nhựa Tân Phú Hưng?' });
    await expect(dialog).toContainText('bằng chứng hiện trường đã chấm theo nó sẽ được chấm lại');
    await expect(dialog.getByTestId('deactivate-warning')).toContainText('cũng tắt theo');
    const confirm = dialog.getByRole('button', { name: 'Tắt địa điểm' });
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel('Lý do tắt (ghi vào lịch sử)').fill('Đối tác chuyển kho');
    await confirm.click();

    expect(
      lastRequest(world, 'POST', '/transport/places/admin/gf-tan-phu-hung/deactivate')?.body,
    ).toEqual({
      reason: 'Đối tác chuyển kho',
    });
    await expect(detail.getByRole('button', { name: 'Bật lại' })).toBeVisible();
    await expect(page.getByText(/Đã tắt Kho Nhựa Tân Phú Hưng/)).toBeVisible();
  });
});

test.describe('Điều hành có quyền vị trí nhưng KHÔNG có quyền khách hàng, đối tác', () => {
  test('dia diem cua don vi khac: khoa TEN va DIA CHI (nhu may chu), vi tri van sua duoc', async ({
    page,
  }) => {
    const world = await servePlaces(page, {
      me: {
        role: 'MANAGER',
        permissions: ['transport.geofence.read', 'transport.geofence.manage'],
      },
    });
    await openPlaces(page);

    await page
      .getByRole('button', { name: /Kho Nhựa Tân Phú Hưng/ })
      .first()
      .click();
    const detail = page.getByTestId('place-detail');
    await detail.getByRole('button', { name: 'Sửa địa điểm' }).click();

    const name = page.getByLabel('Tên địa điểm');
    const address = page.getByLabel('Địa chỉ', { exact: true });
    await expect(name).toHaveAttribute('readonly', '');
    await expect(address).toHaveAttribute('readonly', '');
    await expect(
      page.getByText('Đổi tên địa điểm của đơn vị khác cần quyền quản lý'),
    ).toBeVisible();
    await expect(
      page.getByText('Đổi địa chỉ địa điểm của đơn vị khác cần quyền quản lý'),
    ).toBeVisible();

    // Ban kinh (hang rao) chi can quyen vi tri — luu duoc, va lan luu KHONG mang ten/dia chi.
    await page.getByLabel('Bán kính (m)').fill('400');
    await page.getByRole('button', { name: 'Lưu thay đổi' }).click();
    await expect(page.getByText('Đã lưu Kho Nhựa Tân Phú Hưng.')).toBeVisible();
    expect(lastRequest(world, 'PATCH', /gf-tan-phu-hung$/)?.body).toEqual({ radiusMetres: 400 });
  });

  test('bai xe khong doi quyen khach hang: ten va dia chi sua duoc', async ({ page }) => {
    await servePlaces(page, {
      me: {
        role: 'MANAGER',
        permissions: ['transport.geofence.read', 'transport.geofence.manage'],
      },
    });
    await openPlaces(page);
    await page
      .getByRole('button', { name: /Bãi xe Hà Nội/ })
      .first()
      .click();
    await page.getByTestId('place-detail').getByRole('button', { name: 'Sửa địa điểm' }).click();
    await expect(page.getByLabel('Tên địa điểm')).not.toHaveAttribute('readonly', '');
    await expect(page.getByLabel('Địa chỉ', { exact: true })).not.toHaveAttribute('readonly', '');
  });
});

test.describe('Một nguồn cho Tạo đơn', () => {
  test('dia diem khach hang moi hien o Tao don ngay lan mo ke tiep', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const world = await servePlaces(page);

    await page.goto('/?section=movement');
    await page.getByRole('button', { name: 'Tạo đơn mới' }).click();
    await expect(page.getByTestId('tx-picker-map')).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByRole('button', { name: 'Chọn làm điểm lấy hàng: Kho Sơn Hà Bắc Ninh' }),
    ).toHaveCount(0);
    const readsBefore = world.knownReads;
    await page.getByRole('button', { name: 'Quay lại danh sách' }).click();

    // Di chuyen TRONG ung dung (khong tai lai trang): o nho cua trinh duyet van con.
    await nav(page).getByRole('link', { name: 'Địa điểm vận hành' }).click();
    await expect(page.getByTestId('tx-places-map')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Thêm địa điểm' }).click();
    await page.getByRole('radio', { name: /Kho \/ cửa hàng của một khách hàng/ }).check();
    await page
      .getByRole('combobox', { name: /^Khách hàng/ })
      .selectOption({ label: 'Công ty TNHH Sơn Hà' });
    await placeOnMap(page);
    await page.getByLabel('Tên địa điểm').fill('Kho Sơn Hà Bắc Ninh');
    await page.getByRole('button', { name: 'Thêm địa điểm', exact: true }).click();
    expect(lastRequest(world, 'POST', '/transport/places/admin')?.body).toMatchObject({
      kind: 'COUNTERPARTY_SITE',
      owner: { customerId: 'cus-son-ha' },
    });
    await expect(page.getByTestId('place-detail')).toContainText('Địa điểm khách hàng');

    await nav(page).getByRole('link', { name: 'Đơn hàng & vòng chạy' }).click();
    await page.getByRole('button', { name: 'Tạo đơn mới' }).click();
    await expect(
      page.getByRole('button', { name: 'Chọn làm điểm lấy hàng: Kho Sơn Hà Bắc Ninh' }),
    ).toBeVisible({ timeout: 30_000 });
    expect(world.knownReads).toBeGreaterThan(readsBefore);
    // Nhan loai CUNG voi man quan tri, va dong nguon noi TEN chu.
    await expect(page.getByRole('region', { name: 'Địa điểm khách hàng' })).toContainText(
      'Kho Sơn Hà Bắc Ninh',
    );
  });
});

test.describe('Địa điểm vận hành — điện thoại', () => {
  test('390px: danh sach, nut xem ban do, trinh sua co ban do o tren; khong tran ngang', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await servePlaces(page);
    await page.goto('/?section=admin-places');
    await expect(page.getByRole('heading', { level: 1, name: 'Địa điểm vận hành' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Bãi xe Hà Nội/ }).first()).toBeVisible();
    await expect(page.getByTestId('tx-places-map')).toBeHidden();
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await shoot(page, 'places-list-390');

    await page.getByRole('button', { name: 'Xem bản đồ' }).click();
    await expect(page.getByTestId('tx-places-map')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Xem danh sách' }).click();

    await page.getByRole('button', { name: 'Thêm địa điểm' }).click();
    await page.getByRole('radio', { name: /Bãi xe của công ty mình/ }).check();
    await expect(page.getByTestId('tx-places-map')).toBeVisible({ timeout: 30_000 });
    await placeOnMap(page);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
    await shoot(page, 'places-editor-390');
  });
});
