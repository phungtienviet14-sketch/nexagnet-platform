import 'reflect-metadata';

/**
 * Goi khach cho test API. Loader (`@netviet/tenant`) CO Y khong co gia tri mac dinh — quen dat
 * TENANT tren stack cua khach B ma lang le nap du lieu khach A la su co ro ri du lieu. Bo test
 * API khang dinh tren du lieu that cua goi `ultty` (gia Felix, dai ly meta-hn...), nen chot o day.
 * `??=` de van chay duoc bo test tren goi khac: TENANT=<slug> pnpm --filter @netviet/api test.
 */
process.env.TENANT ??= 'ultty';
// Chot thang de bo test khong phu thuoc dong ho that. Phai KHOP `pricePeriod.validMonth` cua goi
// khach, va ky do phai co `note` neu thang khong trung van ban goc (xem tenant.schema.ts). Ban
// hien tai: ky 2026-08 lay nguyen bieu gia "Thong bao gia thang 07.2026" — khach xac nhan
// 18/08/2026 thang 8 khong co thong bao moi. Runtime KHONG dat bien nay nen van fail closed.
process.env.PRICE_CURRENT_MONTH ??= '2026-08';

// PARSER_MODE khong con gia tri `mock` (18/08/2026) va mac dinh la `deepseek`, von doi khoa.
// Bo test KHONG goi API that — noi nao can parser tat dinh thi tu dung `FakeParser` trong
// `src/pipeline/__tests__/`. Khoa gia o day chi de `loadEnv()` qua cua.
process.env.DEEPSEEK_API_KEY ??= 'sk-test-khong-goi-that';
