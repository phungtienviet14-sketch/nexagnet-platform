import { loadEnv, type AppEnv } from '@netviet/shared';

/** Doc env nen tang ma khong ep credential cua capability khong duoc compose. */
export function loadFoundationEnv(): AppEnv {
  return loadEnv(process.env, { parser: false, channel: false });
}
