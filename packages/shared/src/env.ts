import { z } from 'zod';

// Credential MAC DINH cho AdminJS o local. Khai bao thanh hang so de loadEnv co the CHAN
// dung lai chinh chung o production (khong doan chuoi, khong lap lai literal o hai noi).
const DEV_ADMIN_PASSWORD = 'netviet-admin';
const DEV_ADMIN_COOKIE_SECRET = 'netviet-admin-dev-cookie-secret-doi-o-production';
// Do dai toi thieu cho credential AdminJS o production (panel /admin sua duoc gia + map nhom).
const MIN_ADMIN_PASSWORD_LENGTH = 16;
const MIN_ADMIN_COOKIE_SECRET_LENGTH = 32;

/**
 * Schema bien moi truong dung chung cho toan he thong.
 * Nguyen tac (CLAUDE.md - Luu y bao mat): khong hardcode secret,
 * validate ngay khi khoi dong, fail fast voi thong bao ro rang.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z
    .string()
    .url()
    .default('postgresql://netviet:netviet_local@localhost:5432/netviet'),
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  // Lop luu tru don/tin: memory (in-memory, MAC DINH — demo/CI khong can DB) | prisma (Postgres).
  // Tach RIENG khoi DATABASE_URL (vi .env da co URL cho docker) -> bat Prisma phai CHU DONG dat = prisma.
  PERSISTENCE: z.enum(['memory', 'prisma']).default('memory'),
  // Khoa xac thuc API (header `x-api-key`). BO TRONG -> guard MO (demo/CI/HF chay nhu cu).
  // DAT GIA TRI -> MOI route deu can key, tru route gan @Public (vd /health).
  // NODE_ENV=production BAT BUOC co (xem superRefine ben duoi): API nay co /broadcast gui tin
  // Zalo THAT toi nhieu nhom + /knowledge lo bang gia — khong duoc phoi ra Internet khi khong khoa.
  // Luu y: app web goi API tu TRINH DUYET (NEXT_PUBLIC_API_URL) nen KHONG dat key vao bien
  // NEXT_PUBLIC_* (se lo cho moi nguoi). Production: cho web goi qua proxy phia server, hoac cho
  // toi khi co dang nhap nguoi dung that (quyet dinh D5).
  API_KEY: z.string().min(16, 'API_KEY qua ngan — dung chuoi ngau nhien >= 16 ky tu').optional(),
  // CONG TAC XAC THUC TOAN HE THONG (mot bien duy nhat, de bat lai):
  //   api-key = MAC DINH. Guard toan cuc theo header `x-api-key` khi API_KEY co gia tri,
  //             kiem Origin cho mutation, CORS bo theo CORS_ORIGIN, AdminJS doi dang nhap.
  //   none    = TAT TOAN BO xac thuc cua ung dung: khong x-api-key, khong kiem Origin,
  //             CORS mo, AdminJS khong doi dang nhap. Caddy cung bo Basic Auth (xem Caddyfile).
  // `none` la QUYET DINH VAN HANH cho VM dev/demo (yeu cau nguoi dung 04/08/2026) — doi lai
  // he thong luon truy cap duoc khong can mat khau. CHI dung khi nhom/du lieu la TEST, khong PII
  // that: bat ky ai biet URL deu doc duoc bang gia/don va goi duoc /broadcast (gui tin Zalo THAT).
  // Truoc khi chay du lieu khach: dat lai AUTH_MODE=api-key + API_KEY va bat lai Basic Auth.
  AUTH_MODE: z.enum(['api-key', 'none']).default('api-key'),
  // De trong duoc o local; cac module dung den (parser, bot) tu kiem tra khi bat.
  ANTHROPIC_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  // Flowise chi la adapter parser noi bo. Khi PARSER_MODE=flowise, ca ba bien duoi BAT BUOC
  // co; loadEnv fail-fast de production khong am tham roi ve MockParser.
  FLOWISE_BASE_URL: z.string().url().optional(),
  FLOWISE_FLOW_ID: z.string().min(1).optional(),
  FLOWISE_API_KEY: z.string().min(1).optional(),
  FLOWISE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  ZALO_BOT_TOKEN: z.string().optional(),
  ZALO_BOT_WEBHOOK_SECRET: z.string().optional(),
  // Che do parser: mock | claude | deepseek truc tiep | flowise (Agentflow V2 noi bo).
  PARSER_MODE: z.enum(['mock', 'claude', 'deepseek', 'flowise']).default('mock'),
  // KENH ZALO — nguon su that DUY NHAT chon kenh doc/gui tin:
  //   mock  = offline (demo qua /demo/simulate) — mac dinh, khong can dang nhap Zalo.
  //   bot   = Zalo Bot Platform chinh thuc (can ZALO_BOT_TOKEN) — CHI nhan tin @mention.
  //   zca   = thu vien ngoai zca-js (userbot tai khoan ca nhan) — doc MOI tin nhom, khong can tag.
  // Luu y: zca vi pham ToS Zalo, co the bi khoa tai khoan -> dung TAI KHOAN PHU + can van ban
  // chap nhan rui ro cua khach (xem CLAUDE.md muc "Kenh Zalo").
  CHANNEL_MODE: z.enum(['mock', 'bot', 'zca', 'hybrid']).default('mock'),
  // Bat/tat worker doc tin Zalo Bot (Bot Platform). GIU cho tuong thich nguoc: neu CHANNEL_MODE
  // khong dat nhung BOT_MODE=on thi loadEnv suy ra CHANNEL_MODE='bot'. Mac dinh off.
  BOT_MODE: z.enum(['on', 'off']).default('off'),
  // Duong dan file luu PHIEN dang nhap zca-js (cookie + imei + userAgent) sau khi quet QR lan dau,
  // de cac lan sau tu dang nhap lai khong can quet. Cred = session token -> bao mat nhu secret,
  // KHONG commit (da gitignore thu muc secrets/).
  ZALO_CRED_PATH: z.string().default('./secrets/zalo-cred.json'),
  // Allowlist nhom duoc phep dua vao LLM. File nay duoc cap nhat tu trang van hanh Zalo;
  // mac dinh rong = nghe socket nhung KHONG xu ly bat ky nhom nao.
  ZALO_ALLOWED_GROUPS_PATH: z.string().default('./secrets/zalo-allowed-groups.json'),
  // Origin HTTPS cua trang operator. Dung de chong CSRF cho cac mutation QR/allowlist.
  ZALO_OPERATOR_ORIGIN: z.string().url().optional(),
  // Nghe ca tin do CHINH tai khoan zca gui (message.isSelf). Mac dinh off de tranh vong lap
  // (bot gui xac nhan -> lai doc chinh no) + giam nhieu.
  ZALO_SELF_LISTEN: z.enum(['on', 'off']).default('off'),
  // Auto-ack: bot tu nhan "da ghi nhan" khi intent=Khac (LLM khong hieu). Mac dinh off
  // (GD1: AI khong tu tra loi nhom) — chi bat khi khach dong y cho bot nhan tin.
  AUTO_ACK: z.enum(['on', 'off']).default('off'),
  // Auto-send (GD2): AI TU CHOT + gui xac nhan don vao nhom, KHONG can Sale duyet — CHI khi
  // Giam sat khong phat hien rui ro (riskLevel='none'); co van de -> giu Sale duyet. Mac dinh
  // off theo GD1 (CLAUDE.md: AI khong tu gui khi CHUA co van ban dong y cua khach).
  AUTO_SEND: z.enum(['on', 'off']).default('off'),
  // Ten bot de boc @mention khoi noi dung tin. KHONG co mac dinh (Dot B1): ten bot la cua tung
  // khach, de mac dinh o day nghia la nhan dung chung mang san ten bot cua MOT khach. Nguon that
  // su la goi khach (`persona.mentionName`); bien nay chi con la duong GHI DE theo moi truong
  // chay — xem apps/api/src/channels/bot-name.ts.
  BOT_NAME: z.string().min(1).optional(),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  // Broadcast (KH2): gian cach giua 2 lan gui de tranh vuot rate-limit Zalo (chua cong bo).
  BROADCAST_THROTTLE_MS: z.coerce.number().int().nonnegative().default(1500),
  // Tran so nhom moi lan gui — chan blast nham vao qua nhieu nhom.
  BROADCAST_MAX_TARGETS: z.coerce.number().int().positive().default(50),
  // Streaming 6 agent qua SSE. on -> frontend dung /events real-time; off -> quay ve polling (luoi an toan demo).
  STREAM_MODE: z.enum(['on', 'off']).default('on'),
  // Gian nhe giua cac buoc rules (tuc thi) cho de nhin. Router van co do tre THAT (LLM). 0 = thuan real.
  STREAM_STEP_DELAY_MS: z.coerce.number().int().nonnegative().default(280),
  // --- Admin panel "Nguon su that" (AdminJS, mount tai /admin) ---
  // Bat/tat panel quan tri nguon su that (Dealer/Group/Product/Price/Glossary/Override).
  // CHI mount khi ADMIN_UI=on VA PERSISTENCE=prisma (AdminJS can Postgres). Mac dinh off ->
  // demo/CI/che do memory KHONG dung toi AdminJS (khong nap thu vien ESM nang o boot).
  // --- Kho luu ANH (Dot A' Task 2) ---
  // Zalo XOA object anh phia server sau <=35 ngay (do that 11/08/2026: HEAD link cua 07/07 -> 404,
  // URL khong co chu ky/`expires` nen khong phai pre-signed). DB chi luu link = 35 ngay nua mat.
  //   none  = MAC DINH: khong tai anh ve (demo/CI offline, khong can bucket).
  //   local = ghi xuong dia — CHI cho dev.
  //   s3    = chuan S3. GCS hom nay (XML API + khoa HMAC), OVHcloud sau nay, MinIO khi dev.
  //           KHONG dung @google-cloud/storage de khong khoa chat vao Google (chot 11/08/2026).
  MEDIA_STORE: z.enum(['none', 'local', 's3']).default('none'),
  MEDIA_BUCKET: z.string().min(1).optional(),
  MEDIA_ENDPOINT: z.string().url().optional(),
  MEDIA_REGION: z.string().default('auto'),
  MEDIA_ACCESS_KEY_ID: z.string().min(1).optional(),
  MEDIA_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  MEDIA_LOCAL_DIR: z.string().default('./tmp/media'),
  // Tran byte cho mot anh. Vuot -> huy tai giua chung, ghi mediaError, tin VAN o trong DB.
  MEDIA_MAX_BYTES: z.coerce.number().int().positive().default(15_000_000),
  MEDIA_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  // So luot tai song song (p-limit) — chan bao tai khi nhieu nhom cung gui anh.
  MEDIA_CONCURRENCY: z.coerce.number().int().positive().default(3),
  // Ten mien duoc phep tai anh, CSV. URL anh den TU TIN NHAN = du lieu ben ngoai, nen day la cong
  // chan SSRF: khong de server bi sai di goi dia chi noi bo / metadata may chu dam may.
  // De RONG = chan het (fail closed), khong phai "cho phep tat ca".
  MEDIA_ALLOWED_HOSTS: z.string().default('zdn.vn'),
  ADMIN_UI: z.enum(['on', 'off']).default('off'),
  // Thong tin dang nhap panel. Mac dinh la GIA TRI DEV (khop nguyen tac env.ts: co default de chay
  // local); BAT BUOC dat lai o production (dat ADMIN_PASSWORD/ADMIN_COOKIE_SECRET manh qua env).
  ADMIN_EMAIL: z.string().default('admin@netviet.local'),
  ADMIN_PASSWORD: z.string().default(DEV_ADMIN_PASSWORD),
  // Secret ky cookie phien AdminJS. Default dev — production PHAI thay bang chuoi ngau nhien dai.
  ADMIN_COOKIE_SECRET: z.string().default(DEV_ADMIN_COOKIE_SECRET),
});

export type AppEnv = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Bien moi truong khong hop le:\n- ${issues.join('\n- ')}`);
    this.name = 'EnvValidationError';
  }
}

export function loadEnv(source: Record<string, string | undefined> = process.env): AppEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new EnvValidationError(issues);
  }
  const data = result.data;
  // Production BAT BUOC co API_KEY. API nay co POST /broadcast (gui tin Zalo THAT toi nhieu nhom
  // khach) va GET /knowledge (bang gia + map nhom -> dai ly) — phoi ra Internet ma khong khoa la
  // su co bao mat, khong phai thieu sot nho. Fail fast luc khoi dong (CLAUDE.md - Luu y bao mat).
  // AUTH_MODE=none = da CHU DONG chon chay khong xac thuc (VM dev/demo). Van la mot lua chon
  // TUONG MINH, greppable — khac han "quen dat API_KEY", nen fail-fast duoi day duoc mien.
  const authDisabled = data.AUTH_MODE === 'none';
  if (data.NODE_ENV === 'production' && !data.API_KEY && !authDisabled) {
    throw new EnvValidationError([
      'API_KEY: BAT BUOC khi NODE_ENV=production (API co /broadcast gui tin Zalo that + /knowledge lo bang gia). Moi truong dev/demo khong can khoa thi dat AUTH_MODE=none',
    ]);
  }
  if (data.PARSER_MODE === 'flowise') {
    const missingFlowiseVariables = [
      !data.FLOWISE_BASE_URL ? 'FLOWISE_BASE_URL: BAT BUOC khi PARSER_MODE=flowise' : null,
      !data.FLOWISE_FLOW_ID ? 'FLOWISE_FLOW_ID: BAT BUOC khi PARSER_MODE=flowise' : null,
      !data.FLOWISE_API_KEY ? 'FLOWISE_API_KEY: BAT BUOC khi PARSER_MODE=flowise' : null,
    ].filter((issue): issue is string => issue !== null);
    if (missingFlowiseVariables.length > 0) {
      throw new EnvValidationError(missingFlowiseVariables);
    }
  }
  // MEDIA_STORE=s3 ma thieu cau hinh -> FAIL FAST. Neu am tham quay ve "khong luu" thi anh moi
  // ngay bi vut ma khong ai biet, va khong hoi to duoc (Zalo xoa object sau <=35 ngay).
  if (data.MEDIA_STORE === 's3') {
    const missingMediaVariables = [
      !data.MEDIA_BUCKET ? 'MEDIA_BUCKET: BAT BUOC khi MEDIA_STORE=s3' : null,
      !data.MEDIA_ENDPOINT ? 'MEDIA_ENDPOINT: BAT BUOC khi MEDIA_STORE=s3' : null,
      !data.MEDIA_ACCESS_KEY_ID ? 'MEDIA_ACCESS_KEY_ID: BAT BUOC khi MEDIA_STORE=s3' : null,
      !data.MEDIA_SECRET_ACCESS_KEY ? 'MEDIA_SECRET_ACCESS_KEY: BAT BUOC khi MEDIA_STORE=s3' : null,
    ].filter((issue): issue is string => issue !== null);
    if (missingMediaVariables.length > 0) {
      throw new EnvValidationError(missingMediaVariables);
    }
  }
  if (data.CHANNEL_MODE === 'hybrid' && !data.ZALO_BOT_TOKEN) {
    throw new EnvValidationError([
      'ZALO_BOT_TOKEN: BAT BUOC khi CHANNEL_MODE=hybrid de xac dinh Bot va tranh xu ly trung',
    ]);
  }
  if (
    data.NODE_ENV === 'production' &&
    (data.CHANNEL_MODE === 'zca' || data.CHANNEL_MODE === 'hybrid')
  ) {
    const operatorUrl = data.ZALO_OPERATOR_ORIGIN ? new URL(data.ZALO_OPERATOR_ORIGIN) : null;
    if (!operatorUrl || operatorUrl.protocol !== 'https:') {
      throw new EnvValidationError([
        'ZALO_OPERATOR_ORIGIN: BAT BUOC va phai dung HTTPS khi production + CHANNEL_MODE=zca|hybrid',
      ]);
    }
  }
  // Panel /admin sua duoc bang gia, map nhom -> dai ly va chinh sach. Bat o production bang
  // credential dev (hoac chuoi ngan) = giao quyen ghi nguon su that cho bat ky ai doc repo.
  if (data.NODE_ENV === 'production' && data.ADMIN_UI === 'on' && !authDisabled) {
    const weakAdminCredentials = [
      data.ADMIN_PASSWORD === DEV_ADMIN_PASSWORD
        ? 'ADMIN_PASSWORD: dang dung gia tri MAC DINH dev — bat buoc doi khi ADMIN_UI=on o production'
        : null,
      data.ADMIN_PASSWORD.length < MIN_ADMIN_PASSWORD_LENGTH
        ? `ADMIN_PASSWORD: qua ngan — can >= ${MIN_ADMIN_PASSWORD_LENGTH} ky tu khi ADMIN_UI=on o production`
        : null,
      data.ADMIN_COOKIE_SECRET === DEV_ADMIN_COOKIE_SECRET
        ? 'ADMIN_COOKIE_SECRET: dang dung gia tri MAC DINH dev — bat buoc doi khi ADMIN_UI=on o production'
        : null,
      data.ADMIN_COOKIE_SECRET.length < MIN_ADMIN_COOKIE_SECRET_LENGTH
        ? `ADMIN_COOKIE_SECRET: qua ngan — can >= ${MIN_ADMIN_COOKIE_SECRET_LENGTH} ky tu khi ADMIN_UI=on o production`
        : null,
    ].filter((issue): issue is string => issue !== null);
    if (weakAdminCredentials.length > 0) {
      throw new EnvValidationError(weakAdminCredentials);
    }
  }
  // Tuong thich nguoc: cau hinh cu chi co BOT_MODE=on (chua biet CHANNEL_MODE) -> coi la kenh 'bot'.
  if (source.CHANNEL_MODE === undefined && data.BOT_MODE === 'on' && data.CHANNEL_MODE === 'mock') {
    return { ...data, CHANNEL_MODE: 'bot' };
  }
  return data;
}
