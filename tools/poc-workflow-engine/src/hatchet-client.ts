/**
 * Client Hatchet dung chung cho worker + trigger.
 * Doc cau hinh tu `.env` cua POC (khong dung `.env` cua repo — POC phai tach biet).
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { HatchetClient } from '@hatchet-dev/typescript-sdk';

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '..', '.env'), quiet: true });

export const hatchet = HatchetClient.init();

/** Cong cua diem cuoi HTTP co kiem soat. */
export const PROOF_ENDPOINT = `http://localhost:${process.env.POCWF_ENDPOINT_PORT ?? 8745}`;
