#!/usr/bin/env node
/**
 * DUNG "THE GIOI" CHO SMOKE MAESTRO cua ung dung di dong (#394) — tren API THAT, Postgres THAT.
 *
 *   SMOKE_API_URL=http://127.0.0.1:3001 SMOKE_PASSWORD=… node tools/mobile-smoke/prepare.mjs
 *
 * Dieu kien truoc (job `mobile-android-e2e` cua .github/workflows/mobile.yml lam dung thu tu nay):
 *   1. migrate + `node deploy/netviet/seed-transport-demo.mjs` voi `TENANT=transport-preview` va
 *      `TRANSPORT_DEMO_DRIVER_PASSWORD=$SMOKE_PASSWORD` — DUONG GIEO CHINH THUC cua stack xem truoc.
 *      No tao san ba vai can dang nhap, CUNG mot mat khau:
 *        giam-doc (ADMIN -> trai nghiem Giam doc), ke-toan (ACCOUNTING), lx.* (SALE -> Lai xe).
 *   2. API dang chay voi `AUTH_MODE=session`, `PERSISTENCE=prisma`.
 *
 * Script nay KHONG tao tai khoan va KHONG ghi thang vao DB. Moi thu no lam di qua HTTP bang CHINH
 * phien cua Giam doc — dung duong ma van phong dung (tao don co toa do -> lap ke hoach vao xe cua lai
 * xe -> cho chang dau lan banh). Nho vay neu smoke xanh, no xanh tren cung luat nghiep vu voi san
 * xuat, khong tren mot hang SQL viet tay ne luat.
 *
 * Ket qua: mot vong chay ACTIVE cua lai xe, chang dau dang chay, viec ke tiep la mot moc can vi tri
 * tai DIEM LAY HANG. In JSON ra stdout (+ `SMOKE_OUTPUT` neu dat) va, tren GitHub Actions, ghi cac
 * bien `MAESTRO_*` (khong co mat khau) vao `$GITHUB_ENV` cho buoc Maestro.
 *
 * Mat khau KHONG BAO GIO duoc in: no chi di vao than yeu cau dang nhap.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const API = (process.env.SMOKE_API_URL ?? 'http://127.0.0.1:3001').replace(/\/+$/, '');
const PASSWORD = process.env.SMOKE_PASSWORD ?? '';
const DIRECTOR = 'giam-doc';
const ACCOUNTANT = 'ke-toan';
const CLIENT_TAG = 'mobile-smoke/prepare';

/**
 * Hai dia diem mau DA CO hang rao trong ban gieo (`DEMO_SITE_MARKERS`, apps/api/src/transport/demo/
 * demo-places.ts) — nen moc tai diem lay hang duoc cham trong hang rao that, khong phai mot toa do
 * bia khong ai biet. Doi o do thi doi o day.
 */
const PICKUP = { label: 'Nhà máy thép Đình Vũ', latitude: 20.8264, longitude: 106.7752 };
const DELIVERY = { label: 'Kho Nhựa Tân Phú Hưng', latitude: 21.617, longitude: 105.817 };

function fail(message) {
  process.stderr.write(`[mobile-smoke/prepare] ${message}\n`);
  process.exit(1);
}

if (PASSWORD.length < 12) fail('Thieu SMOKE_PASSWORD (>= 12 ky tu, cung gia tri da gieo).');
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(API)) {
  // Script GHI du lieu (don, ke hoach, chang). Chi chay tren may chu cuc bo cua runner/may dev.
  fail(`Tu choi ghi vao ${API}: chi chay tren localhost/127.0.0.1.`);
}

async function request(method, path, { token = null, body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-nexagnet-client': CLIENT_TAG,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} -> ${response.status}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}

/** Dang nhap bang DUNG duong cua ung dung native: `/auth/native/session` -> Bearer. */
async function signIn(username) {
  const body = await request('POST', '/auth/native/session', {
    body: { username, password: PASSWORD },
  });
  if (typeof body?.sessionToken !== 'string') fail(`Khong nhan duoc phien cho ${username}.`);
  const me = await request('GET', '/auth/me', { token: body.sessionToken });
  return { token: body.sessionToken, role: me?.user?.role ?? body.user?.role };
}

async function waitForHealth() {
  const deadline = Date.now() + 60_000;
  let last = '';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${API}/health`);
      if (response.ok) return;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((done) => setTimeout(done, 1_000));
  }
  fail(`API khong len sau 60 giay (${last}).`);
}

const items = (body) => (Array.isArray(body) ? body : (body?.items ?? []));

const demoMonth = () =>
  JSON.parse(readFileSync(join(REPO, 'tenants/transport-preview/data/demo-month.json'), 'utf8'));

/** Lai xe mau theo login, KEM bien so xe dang gan — `null` khi khong co hoac chua gan xe. */
function driverByLogin(login) {
  const month = demoMonth();
  const driver = month.drivers.find((row) => row.login === login);
  const vehicle = driver?.vehicle ? month.vehicles.find((row) => row.ref === driver.vehicle) : null;
  return driver && vehicle
    ? { login: driver.login, name: driver.name, plate: vehicle.plate }
    : null;
}

function pickDriver() {
  const month = demoMonth();
  const wanted = process.env.SMOKE_DRIVER_LOGIN;
  const driver = month.drivers.find((row) =>
    wanted ? row.login === wanted : row.vehicle !== null && row.vehicle !== undefined,
  );
  if (!driver?.vehicle)
    fail(`Khong co lai xe mau nao gan xe (SMOKE_DRIVER_LOGIN=${wanted ?? ''}).`);
  const vehicle = month.vehicles.find((row) => row.ref === driver.vehicle);
  if (!vehicle) fail(`Xe ${driver.vehicle} cua ${driver.login} khong co trong demo-month.json.`);
  return { login: driver.login, name: driver.name, plate: vehicle.plate };
}

/** Ngay nghiep vu theo gio Viet Nam — cung quy uoc voi ban gieo (moc = hom nay theo mui gio khach). */
function businessToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

function exportForMaestro(result) {
  const env = {
    MAESTRO_SERVER_URL: process.env.SMOKE_APP_SERVER_URL ?? 'http://10.0.2.2:3001',
    MAESTRO_DRIVER_USERNAME: result.driver.login,
    MAESTRO_DIRECTOR_USERNAME: DIRECTOR,
    MAESTRO_ACCOUNTING_USERNAME: ACCOUNTANT,
    MAESTRO_PICKUP_LAT: String(PICKUP.latitude),
    MAESTRO_PICKUP_LNG: String(PICKUP.longitude),
    MAESTRO_DELIVERY_LAT: String(DELIVERY.latitude),
    MAESTRO_DELIVERY_LNG: String(DELIVERY.longitude),
    MAESTRO_RUN_CODE: result.run.runCode,
    MAESTRO_ORDER_CODE: result.order.code,
    // #398 — nhan chuyen truc tiep: hai lai xe KHONG co viec, va dia diem giao da biet.
    MAESTRO_INTAKE_DRIVER_USERNAME: result.intake.driver.login,
    MAESTRO_INTAKE_DRIVER_NAME: result.intake.driver.name,
    MAESTRO_REVIEW_DRIVER_USERNAME: result.intake.reviewDriver.login,
    MAESTRO_INTAKE_DESTINATION_PLACE_ID: result.intake.destination.placeId,
  };
  if (process.env.GITHUB_ENV) {
    appendFileSync(
      process.env.GITHUB_ENV,
      Object.entries(env)
        .map(([key, value]) => `${key}=${value}\n`)
        .join(''),
    );
  }
  return env;
}

async function main() {
  await waitForHealth();

  // 1. Ba vai deu dang nhap duoc — va dung vai. Sai vai o day = man hinh sai o Maestro.
  const office = await signIn(DIRECTOR);
  if (office.role !== 'ADMIN') fail(`${DIRECTOR} phai la ADMIN, thay ${office.role}.`);
  const accountant = await signIn(ACCOUNTANT);
  if (accountant.role !== 'ACCOUNTING')
    fail(`${ACCOUNTANT} phai la ACCOUNTING, thay ${accountant.role}.`);
  const pick = pickDriver();
  const driver = await signIn(pick.login);
  if (driver.role !== 'SALE') fail(`${pick.login} phai la SALE (lai xe), thay ${driver.role}.`);

  const before = await request('GET', '/transport/me/field-work', { token: driver.token });
  if (before.runs.length > 0) {
    fail(`${pick.login} da co vong chay mo — DB khong sach, hoac dat SMOKE_DRIVER_LOGIN khac.`);
  }

  // 2. Van phong tao don CO TOA DO roi lap ke hoach vao xe cua lai xe.
  const customers = items(await request('GET', '/transport/customers', { token: office.token }));
  const customer = customers.find((row) => row.name.includes('Thép Đông Á')) ?? customers[0];
  if (!customer) fail('Ban gieo khong co khach hang nao.');
  const code = `SMOKE-${process.env.GITHUB_RUN_ID ?? Date.now()}-${process.env.GITHUB_RUN_ATTEMPT ?? 1}`;
  const order = await request('POST', '/transport/orders', {
    token: office.token,
    body: {
      code,
      originLabel: PICKUP.label,
      originPoint: { latitude: PICKUP.latitude, longitude: PICKUP.longitude },
      destinationLabel: DELIVERY.label,
      destinationPoint: { latitude: DELIVERY.latitude, longitude: DELIVERY.longitude },
      businessDate: businessToday(),
      customerId: customer.id,
      freightAmount: 6_800_000,
      cargoDescription: 'Thép cuộn 20 tấn (smoke di động)',
    },
  });
  const vehicles = items(await request('GET', '/transport/vehicles', { token: office.token }));
  const vehicle = vehicles.find((row) => row.registrationPlate === pick.plate);
  if (!vehicle) fail(`Khong thay xe ${pick.plate} tren API.`);
  await request('POST', `/transport/planning/orders/${order.id}/plan`, {
    token: office.token,
    body: { vehicleId: vehicle.id, idempotencyKey: `mobile-smoke-${code}` },
  });

  // 3. Lai xe thay vong chay; chang dau lan banh => vong chay tu sang ACTIVE (movement.service).
  const planned = await request('GET', '/transport/me/field-work', { token: driver.token });
  const run = planned.runs.find((row) => row.legs.some((leg) => leg.orderCode === code));
  if (!run) fail(`Lai xe ${pick.login} khong thay vong chay cua don ${code}.`);
  const first = [...run.legs].sort((a, b) => a.sequence - b.sequence)[0];
  await request('POST', `/transport/runs/${run.runId}/legs/${first.legId}/transition`, {
    token: office.token,
    body: { to: 'IN_TRANSIT' },
  });
  const runRow = await request('GET', `/transport/runs/${run.runId}`, { token: office.token });
  const status = runRow?.status ?? runRow?.run?.status;
  if (status !== 'ACTIVE') fail(`Vong chay ${run.runCode} chua ACTIVE (dang ${status}).`);

  const work = await request('GET', '/transport/me/field-work', { token: driver.token });
  const active = work.runs.find((row) => row.runId === run.runId);
  const actions = active.legs.flatMap((leg) =>
    leg.nextActions.map((action) => ({ legId: leg.legId, legKind: leg.kind, ...action })),
  );
  if (!actions.some((action) => action.kind === 'CHECKPOINT')) {
    fail(`Vong chay ${run.runCode} khong co moc nao de bam: ${JSON.stringify(actions)}`);
  }

  const intake = await prepareDriverDirectIntake(pick.login);

  const result = {
    api: API,
    intake,
    driver: pick,
    director: DIRECTOR,
    accountant: ACCOUNTANT,
    order: { id: order.id, code },
    run: { runId: run.runId, runCode: run.runCode, status },
    pickup: PICKUP,
    delivery: DELIVERY,
    nextActions: actions.map(({ label, checkpointType, requiresLocation }) => ({
      label,
      checkpointType: checkpointType ?? null,
      requiresLocation,
    })),
  };
  result.maestroEnv = exportForMaestro(result);
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (process.env.SMOKE_OUTPUT) writeFileSync(process.env.SMOKE_OUTPUT, json);
  process.stdout.write(json);
}

/**
 * #398 — THE GIOI cho luong "tai xe nhan chuyen tai dia diem hien tai".
 *
 * Hai lai xe mau KHONG co viec nao (mot cho duong thuong -> don tu tao, mot cho "chua biet diem
 * giao" -> Can xu ly) va MOT dia diem giao da biet (hang rao cua ban gieo). Script CHI DOC o day:
 * khong tao vong chay, khong tao don — lan xac nhan phai den tu CHINH cai cham cua lai xe tren may.
 * De nghi dia diem (POST proposals) la duong CHI DOC cua #267, dung o day de chac chan kho lay hang
 * duoc nhan ra DUY NHAT truoc khi Maestro bam.
 */
async function prepareDriverDirectIntake(activeLogin) {
  const wanted = [
    process.env.SMOKE_INTAKE_DRIVER_LOGIN ?? 'lx.hung',
    process.env.SMOKE_REVIEW_DRIVER_LOGIN ?? 'lx.tuan',
  ];
  if (wanted.includes(activeLogin) || wanted[0] === wanted[1]) {
    fail(`Lai xe nhan chuyen truc tiep phai khac nhau va khac ${activeLogin}.`);
  }
  const drivers = [];
  for (const login of wanted) {
    const profile = driverByLogin(login);
    if (!profile) fail(`Lai xe mau ${login} khong co hoac chua gan xe.`);
    const session = await signIn(login);
    if (session.role !== 'SALE') fail(`${login} phai la SALE, thay ${session.role}.`);
    const work = await request('GET', '/transport/me/field-work', { token: session.token });
    if (work.runs.length > 0) fail(`${login} da co vong chay mo — DB khong sach.`);
    drivers.push({ ...profile, token: session.token });
  }
  const [driver, reviewDriver] = drivers;

  const proposal = await request('POST', '/transport/me/site-intake/proposals', {
    token: driver.token,
    body: { latitude: PICKUP.latitude, longitude: PICKUP.longitude, accuracyMetres: 10 },
  });
  if (proposal.outcome !== 'UNIQUE' || proposal.candidates[0]?.siteName !== PICKUP.label) {
    fail(`De nghi tai ${PICKUP.label} khong DUY NHAT: ${JSON.stringify(proposal).slice(0, 300)}`);
  }
  const known = await request('GET', '/transport/me/site-intake/destinations', {
    token: driver.token,
  });
  const place = (known.places ?? []).find((row) => row.name === DELIVERY.label);
  if (!place) fail(`Khong thay dia diem giao da biet "${DELIVERY.label}".`);

  const strip = ({ token: _token, ...rest }) => rest;
  return {
    driver: strip(driver),
    reviewDriver: strip(reviewDriver),
    pickupSite: proposal.candidates[0].siteName,
    destination: { placeId: place.id, name: place.name, detail: place.detail ?? null },
  };
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
