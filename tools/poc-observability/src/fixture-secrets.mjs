/**
 * BI MAT GIA CUA POC — GHEP LUC CHAY, khong viet thang thanh chuoi trong nguon.
 *
 * Ba gia tri duoi day duoc cai vao moi truong cua tien trinh do, roi `grep-secrets.mjs` doi
 * chung xuat hien DUNG 0 LAN trong moi byte da roi khoi tien trinh. Nen chung BAT BUOC phai
 * mang dung hinh dang cua khoa that (`sk-...`, `sk-ant-...`): doi thanh mot chuoi vo hai thi
 * phep quet khong con quet gi.
 *
 * Nhung mot chuoi hinh dang khoa nam nguyen ven trong nguon lai lam bo quet bi mat truoc commit
 * cua repo CHAN commit — va no dung khi chan, vi no khong the biet cai nao gia. Ghep luc chay
 * giu duoc ca hai: khong khuon `sk-...` nao nam trong file, con hai script van dung CHUNG MOT
 * gia tri. Day la ly do chung o day chu khong duoc chep hai ban: hai ban lech nhau thi phep
 * quet di tim mot chuoi ma khong ai cai vao dau ca, va no se BAO XANH mai mai.
 */
const SK = 'sk-';

export const FIXTURE_FLOWISE_KEY = `${SK}POCFIXTUREaaaabbbbccccddddeeee1111`;
export const FIXTURE_ANTHROPIC_KEY = `${SK}ant-api03-POCFIXTUREzzzzyyyyxxxxwwwwvvvv2222`;
export const FIXTURE_DEEPSEEK_KEY = `${SK}POCFIXTUREdeadbeefdeadbeefdeadbeef33`;
export const FIXTURE_ZALO_BOT_TOKEN = 'POCFIXTURE-zalo-bot-token-4444';

/** Chi chu-so va `-` moi an toan de nhet thang vao mot `RegExp`. */
const SAFE_IN_REGEX = /^[A-Za-z0-9-]+$/;

/**
 * Doi mot gia tri co dinh o tren thanh mot `RegExp` toan cuc.
 *
 * Nem thay vi escape: gia tri o day do CHINH file nay dat ra, nen mot ky tu dac biet lot vao la
 * mot loi lap trinh can sua tai cho, khong phai mot dau vao can lam sach.
 */
export function literalPattern(value) {
  if (!SAFE_IN_REGEX.test(value)) {
    throw new Error(`Gia tri fixture co ky tu dac biet cua RegExp: ${value.length} ky tu`);
  }
  return new RegExp(value, 'g');
}
