import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type Route } from '@playwright/test';
import { MANAGER_HAS_NO_TRANSPORT_SCOPE } from '../../experiences/transport-operations/transport-actions';

/**
 * `#314` — BE MAT ETC tren TRINH DUYET THAT, API gia CO TRANG THAI.
 *
 * May chu Next la that (goi `transport-preview`), API ETC la mot bo mock giu trang thai: mot lan
 * quyet / noi xe / khai tai khoan doi du lieu that su, nen lan doc sau thay ket qua moi. Moi bai
 * con doc CHINH THAN YEU CAU di tren duong mang — mot nut bam duoc chua chung minh no gui dung dieu.
 *
 * Bo mock KHONG dung dau gach cheo nguoc nao: cong cu ghi tep cua lane nay tung giai ma mot chuoi
 * thoat thanh ky tu that. Cac duong dan duoc so bang chuoi va `new RegExp('...')`.
 */

type Role = 'SALE' | 'ACCOUNTING' | 'MANAGER' | 'ADMIN';

const ON_DATE = '2026-09-16';

const json = async (route: Route, body: unknown, status = 200): Promise<void> => {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
};

const vehicle = (id: string, registrationPlate: string) => ({
  id,
  registrationPlate,
  vehicleClass: 'Xe tải 5 tấn',
  allowedPayloadKg: 5000,
  currentOdoKm: 120_000,
  status: 'IDLE',
  operationalControl: 'INTERNAL_OPERATED',
  ownershipRegisterComplete: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
});

const VEHICLES = [vehicle('veh-1', '15C-556.33'), vehicle('veh-2', '30E-111.22')];

const PROVIDERS = {
  readiness: [
    {
      provider: 'VETC',
      statementReady: true,
      blockedReason: null,
      apiStatus: 'NOT_PUBLICLY_PROVEN',
    },
    {
      provider: 'EPASS',
      statementReady: false,
      blockedReason: 'BLOCKED_SAMPLE_REQUIRED',
      apiStatus: 'NOT_PUBLICLY_PROVEN',
    },
    {
      provider: 'OTHER',
      statementReady: false,
      blockedReason: 'BLOCKED_SAMPLE_REQUIRED',
      apiStatus: 'NOT_PUBLICLY_PROVEN',
    },
  ],
  api: ['VETC', 'EPASS', 'OTHER'].map((provider) => ({
    provider,
    status: 'NOT_PUBLICLY_PROVEN',
    requestPath: 'NĐ 119/2024 Điều 26 khoản 2',
  })),
};

const IMPORTS = [
  {
    id: 'imp-1',
    provider: 'VETC',
    sourceKind: 'MANUAL',
    sourceLabel: 'VETC tháng 9',
    sourceDigest: 'a1b2c3d4e5f6a7b8',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-15',
    rowCount: 4,
    acceptedCount: 4,
    rejectedCount: 0,
    importedAt: '2026-09-05T05:00:00.000Z',
    importedBy: 'ke-toan',
  },
];

interface MockCandidate {
  id: string;
  importId: string;
  provider: string;
  rowNumber: number;
  parseStatus: 'ACCEPTED' | 'REJECTED';
  rejectReason: string | null;
  accountNoRaw: string;
  accountId: string | null;
  kind: string;
  vehiclePlateRaw: string;
  vehicleId: string | null;
  passedAt: string | null;
  businessDate: string;
  signedAmount: number;
  currencyCode: string;
  stationLabel: string | null;
  providerRef: string | null;
  fingerprint: string | null;
  matchState: string;
  reviewState: string;
  duplicateOfCandidateId: string | null;
  rawValues: Record<string, string>;
  createdAt: string;
}

const candidate = (over: Partial<MockCandidate>): MockCandidate => ({
  id: 'cand-x',
  importId: 'imp-1',
  provider: 'VETC',
  rowNumber: 1,
  parseStatus: 'ACCEPTED',
  rejectReason: null,
  accountNoRaw: 'TK-001',
  accountId: 'acc-1',
  kind: 'TOLL_PASS',
  vehiclePlateRaw: '15C-556.33',
  vehicleId: 'veh-1',
  passedAt: '2026-09-02T03:00:00.000Z',
  businessDate: '2026-09-02',
  signedAmount: -52_000,
  currencyCode: 'VND',
  stationLabel: 'Trạm Pháp Vân',
  providerRef: null,
  fingerprint: 'fp-khac',
  matchState: 'MATCHED',
  reviewState: 'PENDING',
  duplicateOfCandidateId: null,
  rawValues: {},
  createdAt: '2026-09-05T05:00:00.000Z',
  ...over,
});

interface MockLink {
  id: string;
  accountId: string;
  vehicleId: string;
  providerVehicleRef: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  provenance: string;
  createdAt: string;
  createdBy: string;
}

interface MockAccount {
  id: string;
  provider: string;
  accountNo: string;
  holderName: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly search: URLSearchParams;
  readonly body: unknown;
}

interface TollMock {
  readonly requests: RecordedRequest[];
  readonly candidates: MockCandidate[];
  readonly links: MockLink[];
  readonly accounts: MockAccount[];
}

const effectiveOn = (link: MockLink): boolean =>
  link.effectiveFrom <= ON_DATE && (link.effectiveTo === null || ON_DATE <= link.effectiveTo);

const TOLL_PREFIX = '/transport/toll';

const matchPath = (path: string, pattern: string): string | null => {
  const found = new RegExp(pattern).exec(path);
  return found === null ? null : (found[1] ?? '');
};

/**
 * Mot bao cao gia ban theo DUNG luat cua may chu (`toll-spend-report.ts`): trung truoc, roi trang
 * thai khop xe; chi `MATCHED` co xe moi vao bang theo xe. Bo mock khong can gom theo ngay — mot
 * nhom cho moi dong la du, va cac so tien o day deu nho.
 */
const buildReport = (rows: readonly MockCandidate[], search: URLSearchParams) => {
  const from = search.get('from') ?? '2026-09-01';
  const to = search.get('to') ?? ON_DATE;
  const provider = search.get('provider');
  const inWindow = rows.filter(
    (row) =>
      row.parseStatus === 'ACCEPTED' &&
      row.businessDate >= from &&
      row.businessDate <= to &&
      (provider === null || row.provider === provider),
  );
  const amount = (list: readonly MockCandidate[]) => ({
    rowCount: list.length,
    amount: list.reduce((sum, row) => sum + row.signedAmount, 0),
  });
  const split = (list: readonly MockCandidate[]) => ({
    confirmed: amount(list.filter((row) => row.reviewState === 'CONFIRMED')),
    open: amount(list.filter((row) => row.reviewState !== 'CONFIRMED')),
  });
  const isDuplicate = (row: MockCandidate) =>
    row.duplicateOfCandidateId !== null || row.matchState === 'DUPLICATE_CANDIDATE';
  const attributed = inWindow.filter(
    (row) => !isDuplicate(row) && row.matchState === 'MATCHED' && row.vehicleId !== null,
  );
  const unattributed = inWindow.filter(
    (row) => !isDuplicate(row) && !(row.matchState === 'MATCHED' && row.vehicleId !== null),
  );
  const duplicates = inWindow.filter(isDuplicate);
  const plateOf = (id: string) =>
    VEHICLES.find((entry) => entry.id === id)?.registrationPlate ?? null;
  const vehicleIds = [...new Set(attributed.map((row) => row.vehicleId ?? ''))].sort();
  const reasons = ['ACCOUNT_UNRESOLVED', 'VEHICLE_UNRESOLVED', 'AMBIGUOUS', 'ACCOUNT_LEVEL'];
  const reasonOf = (row: MockCandidate) =>
    row.matchState === 'MATCHED' ? 'ACCOUNT_LEVEL' : row.matchState;

  return {
    from,
    to,
    provider,
    generatedOn: ON_DATE,
    vehicles: vehicleIds.map((vehicleId) => ({
      vehicleId,
      registrationPlate: plateOf(vehicleId),
      month: from.slice(0, 7),
      kind: 'TOLL_PASS',
      currencyCode: 'VND',
      ...split(attributed.filter((row) => row.vehicleId === vehicleId)),
    })),
    unattributed: reasons
      .map((reason) => ({ reason, rows: unattributed.filter((row) => reasonOf(row) === reason) }))
      .filter((entry) => entry.rows.length > 0)
      .map((entry) => ({
        reason: entry.reason,
        month: from.slice(0, 7),
        kind: 'TOLL_PASS',
        currencyCode: 'VND',
        ...split(entry.rows),
      })),
    duplicates: [
      { state: 'SUSPECTED', rows: duplicates.filter((row) => row.duplicateOfCandidateId === null) },
      { state: 'DECLARED', rows: duplicates.filter((row) => row.duplicateOfCandidateId !== null) },
    ]
      .filter((entry) => entry.rows.length > 0)
      .map((entry) => ({
        state: entry.state,
        month: from.slice(0, 7),
        kind: 'TOLL_PASS',
        currencyCode: 'VND',
        total: amount(entry.rows),
      })),
    totals:
      inWindow.length === 0
        ? []
        : [
            {
              currencyCode: 'VND',
              kind: 'TOLL_PASS',
              attributed: split(attributed),
              unattributed: split(unattributed),
              excludedDuplicates: amount(duplicates),
            },
          ],
  };
};

async function mockToll(
  page: Page,
  role: Role,
  options: { readonly notMounted?: boolean } = {},
): Promise<TollMock> {
  const accounts: MockAccount[] = [
    {
      id: 'acc-1',
      provider: 'VETC',
      accountNo: 'TK-001',
      holderName: 'Công ty Vận tải Mẫu',
      active: true,
      createdAt: '2026-01-01T01:00:00.000Z',
      updatedAt: '2026-01-01T01:00:00.000Z',
    },
  ];
  const links: MockLink[] = [
    {
      id: 'link-1',
      accountId: 'acc-1',
      vehicleId: 'veh-1',
      providerVehicleRef: null,
      effectiveFrom: '2026-01-01',
      effectiveTo: null,
      provenance: 'MANUAL',
      createdAt: '2026-01-01T02:00:00.000Z',
      createdBy: 'ke-toan',
    },
  ];
  const candidates: MockCandidate[] = [
    candidate({ id: 'cand-1', rowNumber: 1 }),
    candidate({
      id: 'cand-2',
      rowNumber: 2,
      vehiclePlateRaw: '29H-000.00',
      vehicleId: null,
      matchState: 'AMBIGUOUS',
      signedAmount: -40_000,
    }),
    candidate({
      id: 'cand-3',
      rowNumber: 3,
      fingerprint: 'fp-trung',
      matchState: 'DUPLICATE_CANDIDATE',
      signedAmount: -35_000,
    }),
    candidate({
      id: 'cand-4',
      rowNumber: 4,
      fingerprint: 'fp-trung',
      reviewState: 'CONFIRMED',
      signedAmount: -35_000,
    }),
  ];
  const decisions: Record<string, unknown>[] = [];
  const requests: RecordedRequest[] = [];

  await page.route('**/auth/config', (route) => json(route, { mode: 'session' }));
  await page.route('**/auth/csrf', (route) => json(route, { csrfToken: 'e2e-csrf' }));
  await page.route('**/auth/me', (route) =>
    json(route, {
      user: { id: 'u-1', username: 'e2e', name: `Người dùng ${role}`, role },
      roles: [role],
    }),
  );
  // Luoi an toan: moi duong van tai KHONG khai o duoi tra 404 JSON thay vi roi vao trang cua Next.
  await page.route('**/transport/**', (route) =>
    json(route, { message: 'Không có trong bộ mock' }, 404),
  );
  await page.route('**/transport/vehicles', (route) => json(route, VEHICLES));
  /*
   * Vai khong co pham vi van hanh (`MANAGER`) roi vao be mat "Xe toi co co phan", va may chu THAT tra
   * `403` cho moi nguoi khong phai ben huu quan — cung ly do bo mock o `transport-operations.spec.ts`
   * khai hai duong nay. Thieu chung, luoi 404 o tren se ve ra mot loi khong co that.
   */
  await page.route('**/transport/me/vehicles', (route) =>
    json(route, { message: 'Tài khoản này không có quyền xem xe đã yêu cầu' }, 403),
  );
  await page.route('**/transport/me/vehicles/activity*', (route) =>
    json(route, { message: 'Tài khoản này không có quyền xem xe đã yêu cầu' }, 403),
  );

  await page.route(`**${TOLL_PREFIX}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const raw = request.postData();
    const body: unknown = raw === null || raw === '' ? null : JSON.parse(raw);
    const path = url.pathname.slice(url.pathname.indexOf(TOLL_PREFIX) + TOLL_PREFIX.length);
    const method = request.method();
    requests.push({ method, path, search: url.searchParams, body });

    if (options.notMounted === true) {
      // Khach KHONG bat `transport-toll`: route khong duoc gan, Caddy roi ve trang HTML cua Next.
      return route.fulfill({
        status: 404,
        contentType: 'text/html',
        body: '<!doctype html><h1>404</h1>',
      });
    }

    const listing = (list: readonly MockLink[]) => ({
      onDate: ON_DATE,
      links: list.map((link) => ({ ...link, effective: effectiveOn(link) })),
    });

    if (method === 'GET' && path === '/providers') return json(route, PROVIDERS);
    if (method === 'GET' && path === '/accounts') return json(route, accounts);
    if (method === 'GET' && path === '/imports') return json(route, IMPORTS);
    if (method === 'GET' && path === '/accounts/link-counts') {
      return json(
        route,
        accounts.map((account) => ({
          accountId: account.id,
          effectiveLinkCount: links.filter(
            (link) => link.accountId === account.id && effectiveOn(link),
          ).length,
          onDate: ON_DATE,
        })),
      );
    }
    if (method === 'POST' && path === '/accounts') {
      const input = body as { provider: string; accountNo: string; holderName: string | null };
      if (
        accounts.some(
          (entry) => entry.provider === input.provider && entry.accountNo === input.accountNo,
        )
      ) {
        return json(
          route,
          { message: `Tai khoan ${input.accountNo} cua ${input.provider} da duoc khai` },
          409,
        );
      }
      const created = {
        id: `acc-${String(accounts.length + 1)}`,
        ...input,
        active: true,
        createdAt: '2026-09-16T03:00:00.000Z',
        updatedAt: '2026-09-16T03:00:00.000Z',
      };
      accounts.push(created);
      return json(route, created);
    }

    const accountLinksId = matchPath(path, '^/accounts/([^/]+)/links$');
    if (accountLinksId !== null && method === 'GET') {
      return json(route, listing(links.filter((link) => link.accountId === accountLinksId)));
    }
    if (accountLinksId !== null && method === 'POST') {
      const input = body as {
        vehicleId: string;
        providerVehicleRef: string | null;
        effectiveFrom: string;
        effectiveTo: string | null;
      };
      const account = accounts.find((entry) => entry.id === accountLinksId);
      if (account === undefined || !account.active) {
        return json(route, { message: 'Tai khoan khong con hieu luc' }, 400);
      }
      const overlapping = links.some(
        (link) =>
          link.vehicleId === input.vehicleId &&
          !(link.effectiveTo !== null && input.effectiveFrom > link.effectiveTo) &&
          !(input.effectiveTo !== null && link.effectiveFrom > input.effectiveTo),
      );
      if (overlapping) {
        return json(
          route,
          {
            message:
              'Xe da nhan chi tra tu mot tai khoan khac trong khoang ngay nay (TOLL_VEHICLE_ALREADY_LINKED)',
          },
          409,
        );
      }
      const created = {
        id: `link-${String(links.length + 1)}`,
        accountId: accountLinksId,
        ...input,
        provenance: 'MANUAL',
        createdAt: '2026-09-16T03:00:00.000Z',
        createdBy: 'ke-toan',
      };
      links.push(created);
      return json(route, created);
    }
    const accountId = matchPath(path, '^/accounts/([^/]+)$');
    if (accountId !== null && method === 'PATCH') {
      const account = accounts.find((entry) => entry.id === accountId);
      if (account === undefined) return json(route, { message: 'Khong tim thay tai khoan' }, 404);
      account.active = (body as { active: boolean }).active;
      return json(route, account);
    }
    const linkId = matchPath(path, '^/links/([^/]+)$');
    if (linkId !== null && method === 'PATCH') {
      const link = links.find((entry) => entry.id === linkId);
      if (link === undefined) return json(route, { message: 'Khong tim thay doan noi' }, 404);
      link.effectiveTo = (body as { effectiveTo: string }).effectiveTo;
      return json(route, link);
    }
    const vehicleId = matchPath(path, '^/vehicles/([^/]+)/links$');
    if (vehicleId !== null && method === 'GET') {
      return json(route, listing(links.filter((link) => link.vehicleId === vehicleId)));
    }

    if (method === 'GET' && path === '/candidates') {
      const search = url.searchParams;
      const filtered = candidates.filter(
        (row) =>
          (search.get('matchState') === null || row.matchState === search.get('matchState')) &&
          (search.get('reviewState') === null || row.reviewState === search.get('reviewState')) &&
          (search.get('importId') === null || row.importId === search.get('importId')) &&
          (search.get('provider') === null || row.provider === search.get('provider')),
      );
      return json(route, { items: filtered, total: filtered.length, limit: 20, offset: 0 });
    }
    const peersOf = matchPath(path, '^/candidates/([^/]+)/duplicate-peers$');
    if (peersOf !== null) {
      const current = candidates.find((row) => row.id === peersOf);
      if (current === undefined) return json(route, { message: 'Khong tim thay dong' }, 404);
      const peers = candidates.filter(
        (row) =>
          row.id !== current.id &&
          row.fingerprint !== null &&
          row.fingerprint === current.fingerprint,
      );
      return json(route, {
        candidateId: current.id,
        fingerprintAvailable: current.fingerprint !== null,
        peers: peers.map((row) => ({ candidate: row, importLabel: 'VETC tháng 9' })),
        truncated: false,
      });
    }
    const reviewOf = matchPath(path, '^/candidates/([^/]+)/review$');
    if (reviewOf !== null && method === 'POST') {
      const row = candidates.find((entry) => entry.id === reviewOf);
      if (row === undefined) return json(route, { message: 'Khong tim thay dong' }, 404);
      const input = body as {
        action: string;
        vehicleId: string | null;
        duplicateOfCandidateId: string | null;
        note: string | null;
      };
      const before = { vehicleId: row.vehicleId, matchState: row.matchState };
      if (input.action === 'RESOLVE_VEHICLE') {
        Object.assign(row, {
          vehicleId: input.vehicleId,
          matchState: 'MATCHED',
          reviewState: 'PENDING',
          duplicateOfCandidateId: null,
        });
      } else if (input.action === 'FLAG_DUPLICATE') {
        Object.assign(row, {
          matchState: 'DUPLICATE_CANDIDATE',
          reviewState: 'CONFIRMED',
          duplicateOfCandidateId: input.duplicateOfCandidateId,
        });
      } else if (input.action === 'CLEAR_DUPLICATE') {
        const resolved = row.vehicleId !== null || row.kind !== 'TOLL_PASS';
        Object.assign(row, {
          matchState: resolved ? 'MATCHED' : 'VEHICLE_UNRESOLVED',
          reviewState: 'CONFIRMED',
          duplicateOfCandidateId: null,
        });
      } else if (input.action === 'REOPEN') {
        Object.assign(row, { reviewState: 'REOPENED', duplicateOfCandidateId: null });
      } else {
        Object.assign(row, { reviewState: 'CONFIRMED', duplicateOfCandidateId: null });
      }
      decisions.push({
        id: `dec-${String(decisions.length + 1)}`,
        candidateId: row.id,
        action: input.action,
        actor: 'ke-toan',
        at: `2026-09-16T03:0${String(decisions.length)}:00.000Z`,
        reason: `TOLL_REVIEW_${input.action}`,
        note: input.note,
        previousVehicleId: before.vehicleId,
        nextVehicleId: row.vehicleId,
        previousMatchState: before.matchState,
        nextMatchState: row.matchState,
        duplicateOfCandidateId: row.duplicateOfCandidateId,
      });
      return json(route, row);
    }
    const detailOf = matchPath(path, '^/candidates/([^/]+)$');
    if (detailOf !== null && method === 'GET') {
      const row = candidates.find((entry) => entry.id === detailOf);
      if (row === undefined) return json(route, { message: 'Khong tim thay dong' }, 404);
      return json(route, {
        candidate: row,
        decisions: decisions.filter((entry) => entry.candidateId === row.id),
      });
    }
    if (method === 'GET' && path === '/reports/spend') {
      return json(route, buildReport(candidates, url.searchParams));
    }
    return json(route, { message: `Không có trong bộ mock: ${method} ${path}` }, 404);
  });

  return { requests, candidates, links, accounts };
}

const openToll = async (page: Page, tab?: string): Promise<void> => {
  await page.goto('/?section=toll');
  await expect(page.getByRole('heading', { level: 1, name: 'Phí đường bộ (ETC)' })).toBeVisible();
  if (tab !== undefined) await page.getByRole('tab', { name: tab }).click();
};

const lastRequest = (
  mock: TollMock,
  method: string,
  pathStart: string,
): RecordedRequest | undefined =>
  [...mock.requests]
    .reverse()
    .find((entry) => entry.method === method && entry.path.startsWith(pathStart));

test.describe('ETC — tai khoan giao thong va so xe nhan chi tra (#314 G7)', () => {
  test('ke toan khai tai khoan, thay so xe, bi tu choi doan chong nhau NGUYEN VAN, roi dong doan', async ({
    page,
  }) => {
    const mock = await mockToll(page, 'ACCOUNTING');
    await openToll(page, 'Tài khoản & sổ xe');

    await page.getByRole('button', { name: 'Mở biểu khai tài khoản' }).click();
    await page.getByLabel('Nhà cung cấp của tài khoản').selectOption('EPASS');
    await page.getByLabel('Số tài khoản', { exact: true }).fill('  EP-MOI ');
    await page.getByRole('button', { name: 'Khai tài khoản', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã khai tài khoản ePass EP-MOI' }),
    ).toBeVisible();
    expect(lastRequest(mock, 'POST', '/accounts')?.body).toEqual({
      provider: 'EPASS',
      accountNo: 'EP-MOI',
      holderName: null,
    });

    await page.getByRole('button', { name: 'Xem sổ xe của tài khoản VETC TK-001' }).click();
    const linkTable = page.getByRole('table', {
      name: /Các đoạn thời gian một xe nhận chi trả từ tài khoản VETC TK-001/,
    });
    await expect(linkTable.getByRole('rowheader', { name: '15C-556.33' })).toBeVisible();
    await expect(linkTable).toContainText('Đang hiệu lực');

    // Noi lai CHINH chiec xe dang nhan chi tra: may chu tu choi, man hinh noi NGUYEN VAN.
    const form = page.getByRole('form', { name: 'Nối xe vào tài khoản' });
    await expect(form.getByLabel('Xe nối vào tài khoản')).toHaveValue('');
    await form.getByLabel('Xe nối vào tài khoản').selectOption({ label: '15C-556.33' });
    await expect(
      form.getByRole('table', { name: 'Các đoạn nhận chi trả hiện có của xe đã chọn' }),
    ).toContainText('VETC TK-001');
    await form.getByLabel('Hiệu lực từ ngày').fill('2026-09-20');
    await form.getByRole('button', { name: 'Nối xe' }).click();
    await expect(form.getByRole('alert')).toContainText('TOLL_VEHICLE_ALREADY_LINKED');
    expect(mock.links).toHaveLength(1);

    await page.getByRole('button', { name: 'Đóng đoạn của xe 15C-556.33' }).click();
    const closeForm = page.getByRole('form', { name: 'Đóng đoạn nối xe' });
    await closeForm.getByLabel('Ngày kết thúc').fill('2026-08-31');
    await closeForm.getByRole('button', { name: 'Đóng đoạn' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'đến hết ngày 31/08/2026' }),
    ).toBeVisible();
    expect(lastRequest(mock, 'PATCH', '/links/')?.body).toEqual({ effectiveTo: '2026-08-31' });
    await expect(linkTable).toContainText('Đã đóng');
  });

  test('ngung dung tai khoan: hop xac nhan noi DUNG dieu no lam, va noi xe bi khoa kem ly do', async ({
    page,
  }) => {
    const mock = await mockToll(page, 'ADMIN');
    await openToll(page, 'Tài khoản & sổ xe');

    await page.getByRole('button', { name: 'Xem sổ xe của tài khoản VETC TK-001' }).click();
    await page.getByRole('button', { name: 'Ngừng dùng tài khoản' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('không nối thêm được xe');
    await expect(dialog).toContainText('vẫn giữ nguyên');
    await dialog.getByRole('button', { name: 'Ngừng dùng' }).click();

    /*
     * Doi KET QUA tren man hinh truoc, roi moi doc than yeu cau da ghi. Doc ngay sau cu bam la mot
     * cuoc dua voi duong mang: tren may CI cham hon, lenh `PATCH` chua kip toi bo mock.
     */
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã ngừng dùng tài khoản VETC TK-001' }),
    ).toBeVisible();
    await expect(
      page.getByText('Tài khoản đã ngừng dùng — dùng lại tài khoản trước khi nối xe.'),
    ).toBeVisible();
    expect(lastRequest(mock, 'PATCH', '/accounts/acc-1')?.body).toEqual({ active: false });
    await expect(page.getByRole('form', { name: 'Nối xe vào tài khoản' })).toHaveCount(0);
  });

  test('lich su theo xe: mot xe qua moi tai khoan, tinh theo ngay cua he thong', async ({
    page,
  }) => {
    await mockToll(page, 'ACCOUNTING');
    await openToll(page, 'Tài khoản & sổ xe');
    await page.getByLabel('Xe cần xem lịch sử nhận chi trả').selectOption({ label: '15C-556.33' });
    const table = page.getByRole('table', {
      name: 'Các đoạn thời gian xe đã chọn nhận chi trả, qua mọi tài khoản',
    });
    await expect(table.getByRole('rowheader', { name: 'VETC TK-001' })).toBeVisible();
    await expect(
      page.getByText('Tình trạng tính theo ngày 16/09/2026 của hệ thống.').first(),
    ).toBeVisible();
  });
});

test.describe('ETC — hang cho: khong chon xe giup, quyet trung co kiem toan (#314 G8)', () => {
  test('dong NHIEU XE CUNG KHOP: o chon xe trong, nut khoa, chi gui khi NGUOI chon', async ({
    page,
  }) => {
    const mock = await mockToll(page, 'ACCOUNTING');
    await openToll(page);

    await page.getByLabel('Lọc hàng chờ theo khớp xe').selectOption('AMBIGUOUS');
    await expect
      .poll(() => lastRequest(mock, 'GET', '/candidates')?.search.get('matchState'))
      .toBe('AMBIGUOUS');

    const select = page.getByLabel(/Chọn xe cho dòng 2/);
    await expect(select).toHaveValue('');
    const assign = page.getByRole('button', { name: /Chỉ định xe đã chọn cho dòng 2/ });
    await expect(assign).toBeDisabled();
    expect(mock.requests.filter((entry) => entry.method === 'POST')).toHaveLength(0);

    await select.selectOption({ label: '30E-111.22' });
    await assign.click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Chỉ định xe cho dòng này' }),
    ).toBeVisible();
    expect(lastRequest(mock, 'POST', '/candidates/cand-2/review')?.body).toEqual({
      action: 'RESOLVE_VEHICLE',
      vehicleId: 'veh-2',
      duplicateOfCandidateId: null,
      note: null,
    });
  });

  test('dong NGHI TRUNG khong co nut xac nhan; ghi trung phai chon dong goc va qua hop xac nhan', async ({
    page,
  }) => {
    const mock = await mockToll(page, 'ACCOUNTING');
    await openToll(page);

    await expect(page.getByRole('button', { name: /Quyết trùng cho dòng 3/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Xác nhận dòng 3/ })).toHaveCount(0);
    await page.getByRole('button', { name: /Quyết trùng cho dòng 3/ }).click();

    const panel = page.getByRole('group', { name: 'Quyết trùng cho dòng 3' });
    const flag = panel.getByRole('button', { name: 'Ghi là trùng với dòng gốc đã chọn' });
    await expect(flag).toBeDisabled();
    await panel
      .getByRole('radio', { name: /Chọn dòng 4 của nguồn VETC tháng 9 làm dòng gốc/ })
      .check();
    await panel.getByLabel('Ghi chú cho lịch sử (không bắt buộc)').fill('cùng một lượt qua trạm');
    await flag.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Dòng 3 sẽ được ghi là TRÙNG với dòng 4');
    await expect(dialog).toContainText('không được tính vào chi phí nào');
    await dialog.getByRole('button', { name: 'Ghi là trùng' }).click();

    await expect(
      page.getByRole('status').filter({ hasText: 'Đã ghi dòng 3 là trùng' }),
    ).toBeVisible();
    expect(lastRequest(mock, 'POST', '/candidates/cand-3/review')?.body).toEqual({
      action: 'FLAG_DUPLICATE',
      vehicleId: null,
      duplicateOfCandidateId: 'cand-4',
      note: 'cùng một lượt qua trạm',
    });
    await expect(page.getByRole('list', { name: 'Lịch sử quyết định của dòng 3' })).toContainText(
      'Đã ghi là trùng',
    );
    await expect(panel).toContainText('Mở lại dòng để quyết lại');
  });

  test('bo nghi trung: hop xac nhan noi dong se duoc tinh cho xe nao', async ({ page }) => {
    const mock = await mockToll(page, 'ADMIN');
    await openToll(page);
    await page.getByRole('button', { name: /Quyết trùng cho dòng 3/ }).click();
    const panel = page.getByRole('group', { name: 'Quyết trùng cho dòng 3' });
    await panel.getByRole('button', { name: 'Bỏ nghi trùng — đây là hai sự kiện thật' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('của xe 15C-556.33');
    await dialog.getByRole('button', { name: 'Bỏ nghi trùng' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Đã bỏ nghi trùng cho dòng 3' }),
    ).toBeVisible();
    expect(lastRequest(mock, 'POST', '/candidates/cand-3/review')?.body).toMatchObject({
      action: 'CLEAR_DUPLICATE',
      duplicateOfCandidateId: null,
    });
  });
});

test.describe('ETC — nap bang ke va chi phi theo xe (#314 G9)', () => {
  test('tep VETC dung duoc khi CHUA co API; ePass chua co bo cot thi khoa tep nhung nhap tay van mo', async ({
    page,
  }) => {
    await mockToll(page, 'ACCOUNTING');
    await openToll(page, 'Nạp bảng kê');

    const readiness = page.getByRole('table', { name: 'Độ sẵn sàng của từng nhà cung cấp ETC' });
    await expect(readiness.getByRole('row', { name: /VETC/ })).toContainText(
      'Chưa có tài liệu API công khai',
    );
    await expect(readiness.getByRole('row', { name: /VETC/ })).toContainText('Đọc được bảng kê');
    await expect(page.locator('#tx-main')).not.toContainText(/đang kết nối|sắp có/i);

    await page.getByRole('button', { name: 'Mở biểu nhập' }).click();
    await page.getByLabel('Nguồn', { exact: true }).selectOption('STATEMENT_FILE');
    await expect(page.getByLabel('Tệp bảng kê')).toBeEnabled();
    await page.getByLabel('Nhà cung cấp', { exact: true }).selectOption('EPASS');
    await expect(page.getByLabel('Tệp bảng kê')).toBeDisabled();
    await expect(page.getByText('Chưa đọc được bảng kê của nhà cung cấp này')).toBeVisible();
    await page.getByLabel('Nguồn', { exact: true }).selectOption('MANUAL');
    await expect(page.getByRole('heading', { name: 'Các dòng nhập tay' })).toBeVisible();
  });

  test('lich su nap: nap xong KHONG phai da doi soat, va mo hang cho dung cac dong cua lan nap', async ({
    page,
  }) => {
    const mock = await mockToll(page, 'ACCOUNTING');
    await openToll(page, 'Nạp bảng kê');

    await expect(
      page.getByText('chưa phải đã đối soát, càng không phải đã thanh toán'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Xem các dòng của lần nạp VETC tháng 9' }).click();
    await expect(page.getByRole('tab', { name: 'Hàng chờ đối soát' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(
      page.getByRole('status').filter({ hasText: 'Đang xem các dòng của lần nạp «VETC tháng 9»' }),
    ).toBeVisible();
    await expect
      .poll(() => lastRequest(mock, 'GET', '/candidates')?.search.get('importId'))
      .toBe('imp-1');
  });

  test('chi phi theo xe: ky cua may chu, dong chua ro KHONG chia cho xe, khong noi da tra, tai CSV, mo hang cho', async ({
    page,
  }) => {
    const mock = await mockToll(page, 'ACCOUNTING');
    await openToll(page, 'Chi phí theo xe');

    // Lan hoi dau KHONG mang ky: may chu tu chon thang nghiep vu cua no.
    await expect.poll(() => lastRequest(mock, 'GET', '/reports/spend')?.search.toString()).toBe('');
    await expect(page.getByLabel('Từ ngày')).toHaveValue('2026-09-01');
    await expect(page.getByLabel('Đến ngày')).toHaveValue(ON_DATE);

    const main = page.locator('#tx-main');
    await expect(main).toContainText('không có nghĩa là đã thanh toán hay đã hạch toán');
    await expect(main).toContainText('báo cáo chỉ gồm các dòng đã nạp từ tệp hoặc nhập tay');
    await expect(page.getByText('Đã thanh toán', { exact: true })).toHaveCount(0);

    const byVehicle = page.getByRole('table', { name: 'Phí đường bộ theo xe và tháng' });
    await expect(byVehicle.getByRole('rowheader', { name: '15C-556.33' })).toBeVisible();
    const unattributed = page.getByRole('table', { name: /Phí đường bộ chưa gắn được vào một xe/ });
    await expect(unattributed).toContainText('Nhiều xe cùng khớp — chờ người chọn');
    await expect(unattributed).not.toContainText('15C-556.33');
    await expect(
      page.getByRole('table', { name: 'Dòng trùng và nghi trùng trong kỳ' }),
    ).toContainText('Nghi trùng — chờ người quyết');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Tải CSV' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`chi-phi-etc-theo-xe-2026-09-01_${ON_DATE}.csv`);
    const content = await readFile(await download.path(), 'utf8');
    expect(content).toContain('Theo xe;15C-556.33;;2026-09;Lượt qua trạm;VND;');
    expect(content).not.toContain('Theo xe;29H-000.00');

    await page.getByLabel('Từ ngày').fill('2026-08-01');
    await page.getByRole('button', { name: 'Xem báo cáo' }).click();
    await expect
      .poll(() => lastRequest(mock, 'GET', '/reports/spend')?.search.get('from'))
      .toBe('2026-08-01');

    await page.getByRole('button', { name: /Mở hàng chờ: Nhiều xe cùng khớp/ }).click();
    await expect(page.getByLabel('Lọc hàng chờ theo khớp xe')).toHaveValue('AMBIGUOUS');
    await expect
      .poll(() => lastRequest(mock, 'GET', '/candidates')?.search.get('matchState'))
      .toBe('AMBIGUOUS');
  });
});

test.describe('ETC — ranh gioi vai va khach (#314)', () => {
  for (const role of ['SALE', 'MANAGER'] as const) {
    test(`${role} khong mo duoc man ETC va khong ban mot yeu cau ETC nao`, async ({ page }) => {
      const mock = await mockToll(page, role);
      await page.goto('/?section=toll');
      const alert = page.locator('#tx-main').getByRole('alert');
      await expect(alert).toContainText(
        role === 'SALE' ? 'Vai Lái xe' : MANAGER_HAS_NO_TRANSPORT_SCOPE,
      );
      await expect(page.getByRole('tab', { name: 'Chi phí theo xe' })).toHaveCount(0);
      expect(mock.requests).toHaveLength(0);
    });
  }

  test('khach KHONG bat ETC o may chu: man hinh noi that nghiep vu chua bat, khong hien so 0 gia', async ({
    page,
  }) => {
    await mockToll(page, 'ACCOUNTING', { notMounted: true });
    await openToll(page);
    const main = page.locator('#tx-main');
    await expect(main.getByRole('alert').first()).toContainText(
      'Nghiệp vụ vận tải chưa được bật cho doanh nghiệp này.',
    );
    await expect(page.getByRole('region', { name: 'Tóm tắt phí đường bộ' })).not.toContainText(
      '0/',
    );
  });
});
