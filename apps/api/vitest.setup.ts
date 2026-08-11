import 'reflect-metadata';

/**
 * Goi khach cho test API. Loader (`@netviet/tenant`) CO Y khong co gia tri mac dinh — quen dat
 * TENANT tren stack cua khach B ma lang le nap du lieu khach A la su co ro ri du lieu. Bo test
 * API khang dinh tren du lieu that cua goi `ultty` (gia Felix, dai ly meta-hn...), nen chot o day.
 * `??=` de van chay duoc bo test tren goi khac: TENANT=<slug> pnpm --filter @netviet/api test.
 */
process.env.TENANT ??= 'ultty';
