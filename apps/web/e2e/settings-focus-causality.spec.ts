import { expect, test, type Page, type Route } from '@playwright/test';
import { groups, mockSettingsSurfaces, summary } from './fixtures/settings-mocks';

/**
 * `/settings` — AI GAY RA lan chuyen tieu diem nay (#154).
 *
 * `settings-focus.spec.ts` khoa CACH BAY (mot khoi viec, mot nut chinh, khong tran ngang). Bo nay
 * khoa mot thu khac va kho thay hon: DIEU KIEN duoc phep doi tieu diem ban phim.
 *
 *  A. du lieu nen ve (nap lai dinh ky, hoac mot NGUOI KHAC vua sua) -> cap nhat su that hien thi,
 *     va TUYET DOI khong duoc dong vao o nhap ma nguoi van hanh dang dung;
 *  B. thao tac cua chinh nguoi van hanh -> duoc phep, va phai dua su chu y sang dung viec ke tiep;
 *  C. hop xac nhan so huu tron vong doi tieu diem cua no: mo -> nut an toan, cho -> khong bao gio
 *     roi ve `<body>`, dong -> ve dung nut da mo no.
 *
 * Bo nay chay tren dung `mockSettingsSurfaces` cua #146 nen the gioi van tinh; thu duy nhat bien
 * thien la thoi diem may chu doi cau tra loi, va tung bai tu cam co do.
 */

test.describe.configure({ timeout: 120_000 });

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

async function openSettings(page: Page, section: string): Promise<void> {
  await page.goto(`/settings?section=${section}`);
  await page.getByRole('heading', { level: 1, name: /Thiết lập/ }).waitFor();
}

/** Ai dang giu tieu diem — doc ra duoc trong bao cao khi bai do, khong chi `true`/`false`. */
async function activeElement(page: Page): Promise<string> {
  return page.evaluate(() => {
    const node = document.activeElement;
    if (!node || node === document.body) return 'BODY';
    const label = node.getAttribute('aria-label') ?? (node.textContent ?? '').trim();
    return `${node.tagName}[${label.slice(0, 48)}]`;
  });
}

/**
 * Cung the gioi cua `settings-mocks`, nhung nhom `zca-group-2` DA co dai ly.
 *
 * Day la hinh dang cua su that sau khi mot NGUOI KHAC (hoac mot tien trinh nen) gan dai ly: viec
 * dang lam cua muc chuyen tu `map-group:zca-group-2` sang `sync-members:zca-group-2`.
 */
const summaryAfterOtherActorMapped = {
  ...summary,
  groups: groups.map((group) =>
    group.zcaChatId === 'zca-group-2'
      ? { ...group, status: 'mapped', dealerId: 'dealer-1', dealerName: 'Dai ly Meta HN' }
      : group,
  ),
};

test.describe('A · Dữ liệu nền đổi thì cập nhật sự thật, không đụng vào tiêu điểm', () => {
  test('dealers-groups: nạp lại nền đổi việc đang làm nhưng ô đang chọn vẫn giữ tiêu điểm', async ({
    page,
  }) => {
    // `refetchInterval` cua `settings-summary` la 15 giay — day CHINH LA co che gay loi, nen bai
    // nay doi dung no thay vi gia lap mot su kien khac cho nhanh.
    let mappedByOtherActor = false;
    await mockSettingsSurfaces(page, { role: 'ADMIN' });
    await page.route('**/settings/summary', (route) =>
      json(route, mappedByOtherActor ? summaryAfterOtherActorMapped : summary),
    );

    await openSettings(page, 'dealers-groups');
    await expect(
      page.getByRole('heading', { name: /Chọn đại lý cho nhóm/, level: 3 }),
    ).toBeVisible();

    // Nguoi van hanh DA cham vao trang (dung dieu kien lam co `hasInteracted` cu bat len vinh vien)
    // va dang dung mot o chon trong bang tra cuu.
    await page.getByText('Tất cả nhóm đang nghe').click();
    const rowSelect = page.getByRole('combobox', { name: 'Đại lý cho nhóm Dai ly Meta HN' });
    await rowSelect.focus();
    await expect(rowSelect).toBeFocused();

    // Mot actor khac gan dai ly cho nhom con lai. Lan nap lai nen ke tiep mang su that moi ve.
    mappedByOtherActor = true;

    // Su that hien thi PHAI doi...
    await expect(
      page.getByRole('heading', { name: /Đồng bộ thành viên nhóm/, level: 3 }),
    ).toBeVisible({ timeout: 45_000 });
    // ...nhung tieu diem thi khong duoc nhuc nhich.
    await expect(rowSelect).toBeFocused();
    expect(await activeElement(page), 'nạp lại nền đã cướp tiêu điểm').toContain(
      'Đại lý cho nhóm Dai ly Meta HN',
    );
  });
});

test.describe('B · Thao tác của người vận hành thì được phép chuyển tiêu điểm', () => {
  test('dealers-groups: gán đại lý xong thì tiêu điểm sang đúng việc kế tiếp', async ({ page }) => {
    let mapped = false;
    await mockSettingsSurfaces(page, { role: 'ADMIN' });
    await page.route('**/settings/summary', (route) =>
      json(route, mapped ? summaryAfterOtherActorMapped : summary),
    );
    await page.route('**/settings/groups/*/mapping', (route) => {
      mapped = true;
      return json(route, { chatId: 'zca-group-2', dealerId: 'dealer-1', status: 'mapped' });
    });

    await openSettings(page, 'dealers-groups');
    await page.getByRole('combobox', { name: /Đại lý phụ trách nhóm/ }).selectOption('dealer-1');

    const next = page.getByRole('heading', { name: /Đồng bộ thành viên nhóm/, level: 3 });
    await expect(next).toBeVisible();
    await expect(next).toBeFocused();
  });
});

test.describe('C · Hộp xác nhận giữ tiêu điểm suốt vòng đời của nó', () => {
  test('automation: đang chờ máy chủ thì tiêu điểm vẫn nằm trong hộp, xong thì về khối việc', async ({
    page,
  }) => {
    await mockSettingsSurfaces(page, { role: 'ADMIN' });
    // Giu mutation o trang thai `pending` du lau de do duoc tieu diem trong luc cho.
    await page.route('**/settings/automation/auto-send', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      await json(route, { autoSend: 'on' });
    });

    await openSettings(page, 'automation');
    await page.getByRole('button', { name: 'Bật tự gửi', exact: true }).click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByRole('button', { name: 'Để sau' })).toBeFocused();
    await page.keyboard.press('Tab');
    const confirm = dialog.getByRole('button', { name: 'Bật tự gửi', exact: true });
    await expect(confirm).toBeFocused();
    await page.keyboard.press('Enter');

    // Dung nut vua bam van giu tieu diem trong luc cho: no bi khoa bang `aria-disabled`, khong bang
    // `disabled` — dat `disabled` len no la cach chac chan nhat de nem tieu diem ve `<body>`.
    const busy = dialog.getByRole('button', { name: 'Đang thực hiện…' });
    await expect(busy).toBeFocused();
    expect(await activeElement(page), 'tiêu điểm rơi ra khỏi hộp trong lúc chờ').not.toBe('BODY');

    await expect(dialog).toHaveCount(0);
    expect(await activeElement(page), 'xong việc mà tiêu điểm rơi về BODY').not.toBe('BODY');
    await expect(
      page.getByRole('heading', { name: 'Tắt tự gửi xác nhận', level: 3 }),
    ).toBeFocused();
  });

  test('automation: Escape trả tiêu điểm về đúng công tắc đã mở hộp', async ({ page }) => {
    await mockSettingsSurfaces(page, { role: 'ADMIN' });
    await openSettings(page, 'automation');

    const toggle = page.getByRole('button', { name: 'Bật tự gửi', exact: true });
    await toggle.click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(toggle).toBeFocused();
  });

  test('campaigns: huỷ hộp “Duyệt nội dung” thì tiêu điểm về đúng nút Duyệt', async ({ page }) => {
    await mockSettingsSurfaces(page, { role: 'ADMIN' });
    await openSettings(page, 'campaigns');

    await page.getByRole('button', { name: 'Duyệt nội dung' }).click();
    const work = page.locator('[data-settings-work]');
    const approveTrigger = work.getByRole('button', { name: 'Duyệt nội dung' });
    await expect(approveTrigger).toBeVisible();

    await approveTrigger.click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Để sau' }).click();

    await expect(dialog).toHaveCount(0);
    await expect(approveTrigger).toBeFocused();
  });

  test('campaigns: huỷ hộp “Hủy chiến dịch” thì tiêu điểm về đúng nút Hủy', async ({ page }) => {
    await mockSettingsSurfaces(page, { role: 'ADMIN' });
    await openSettings(page, 'campaigns');

    await page.getByRole('button', { name: 'Duyệt nội dung' }).click();
    const work = page.locator('[data-settings-work]');
    const cancelTrigger = work.getByRole('button', { name: 'Hủy chiến dịch' });
    await expect(cancelTrigger).toBeVisible();

    await cancelTrigger.click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(dialog).toHaveCount(0);
    await expect(cancelTrigger).toBeFocused();
  });

  test('users: huỷ hộp “Đặt lại mật khẩu” thì tiêu điểm về đúng nút đã mở nó', async ({ page }) => {
    await mockSettingsSurfaces(page, { role: 'ADMIN' });
    await openSettings(page, 'users');

    await page
      .locator('.settings-focus-queue li')
      .filter({ hasText: 'Nguyen Thu Phuong' })
      .getByRole('button', { name: 'Quản lý' })
      .click();

    const work = page.locator('[data-settings-work]');
    const resetTrigger = work.getByRole('button', { name: 'Đặt lại mật khẩu' });
    await resetTrigger.click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    // Mo hop KHONG duoc doc thanh mot lan chuyen viec: tieu diem thuoc ve nut an toan trong hop,
    // khong nhay sang tieu de khoi viec o phia sau.
    await expect(dialog.getByRole('button', { name: 'Để sau' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Để sau' }).click();

    await expect(dialog).toHaveCount(0);
    await expect(resetTrigger).toBeFocused();
  });

  test('users: huỷ hộp “Vô hiệu hóa” thì tiêu điểm về đúng nút đã mở nó', async ({ page }) => {
    await mockSettingsSurfaces(page, { role: 'ADMIN' });
    await openSettings(page, 'users');

    await page
      .locator('.settings-focus-queue li')
      .filter({ hasText: 'Nguyen Thu Phuong' })
      .getByRole('button', { name: 'Quản lý' })
      .click();

    const work = page.locator('[data-settings-work]');
    const disableTrigger = work.getByRole('button', { name: 'Vô hiệu hóa tài khoản' });
    await disableTrigger.click();

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');

    await expect(dialog).toHaveCount(0);
    await expect(disableTrigger).toBeFocused();
  });
});
