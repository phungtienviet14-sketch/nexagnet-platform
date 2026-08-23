/**
 * WORKFLOW CHO SPIKE PHIEN BAN (GATE A) — tach rieng khoi `workflow.ts` co chu dich.
 *
 * `workflow.ts` la bang chung POC da ghi vao evidence; sua no la pha bang chung do. File nay
 * ton tai de tra loi DUNG MOT cau hoi:
 *
 *   "Mot run dang chay co the bi mot ban trien khai code MOI cuop mat khong?"
 *
 * Hai khac biet so voi `workflow.ts`:
 *
 *  1. TEN WORKFLOW la BIEN, khong phai hang so. Do la chinh bien doc lap cua thi nghiem:
 *     · `shared`    -> v1 va v2 dung CHUNG mot ten  -> ky vong TRON phien ban (RED)
 *     · `versioned` -> ten kem hau to `.v1` / `.v2` -> ky vong THUAN v1        (GREEN)
 *  2. MOI buoc deu dong dau `engineVersion` + `workerName`. `workflow.ts` chi dong dau o 2/5
 *     buoc, nen no khong the phan biet "buoc nao chay code nao" — ma do lai la toan bo cau hoi.
 *
 * KHONG dinh den nghiep vu that: khong ten khach, khong SKU, khong gia.
 */
import { z } from 'zod';
import { Or, SleepCondition, UserEventCondition } from '@hatchet-dev/typescript-sdk';
import { hatchet } from './hatchet-client.js';

/** Phien ban CODE ma tien trinh worker nay dang mang. */
export const VERSION = process.env.POCWF_VERSION === 'v2' ? 'v2' : 'v1';

/**
 * Chien luoc dat ten. Day la BIEN DOC LAP cua thi nghiem — doi mot bien moi truong, khong doi code.
 *
 * `shared`    = cach lam ngay tho (mot ten cho moi phien ban). POC da do duoc no TRON phien ban.
 * `versioned` = ten mang phien ban. Gia thuyet: run cu chi duoc phuc vu boi worker cung phien ban.
 */
export type SpikeStrategy = 'shared' | 'versioned';
export const STRATEGY: SpikeStrategy =
  process.env.POCWF_SPIKE_STRATEGY === 'versioned' ? 'versioned' : 'shared';

/** Ten khoa on dinh cua workflow — phan KHONG doi giua cac phien ban. */
export const SPIKE_KEY = 'version-spike';

/**
 * Ten dang ky voi engine. Day la CHOT chinh cua ca gate:
 * engine dinh tuyen viec theo TEN, va worker chi nhan viec cua ten no da dang ky.
 *
 * DAU PHAN CACH LA DAU CHAM, khong phai dau hai cham. Do khong phai so thich: engine tu choi
 * dang ky voi thong bao
 *   `validation failed on field 'CreateWorkflowVersionOpts.Name': Hatchet names must match the
 *    regex ^[a-zA-Z0-9\.\-_]+$`
 * Tuc la mau `<key>:v1` ma cac tai lieu thiet ke hay viet KHONG dung duoc voi Hatchet.
 * Bo ky tu hop le chi co: chu, so, `.`, `-`, `_`.
 */
export const VERSION_SEPARATOR = '.';

export function spikeWorkflowName(strategy: SpikeStrategy, version: string): string {
  return strategy === 'versioned' ? `${SPIKE_KEY}${VERSION_SEPARATOR}${version}` : SPIKE_KEY;
}

export const WORKFLOW_NAME = spikeWorkflowName(STRATEGY, VERSION);
export const APPROVAL_EVENT = 'version-spike:approved';
export const WORKER_NAME = `spike-worker-${STRATEGY}-${VERSION}`;

const SpikeInput = z.object({
  /** Khach fixture trung tinh. */
  tenant: z.string().min(1),
  /** Neo nghiep vu gia lap — chi de tim lai run tren dashboard. */
  ref: z.string().min(1),
  /** Bao lau thi bo cho duyet va di tiep (an toan khi spike bi bo do). */
  parkTimeout: z.string().default('300s'),
});

export type SpikeInput = z.input<typeof SpikeInput>;

/** Dau van tay CODE cua mot buoc — thu duy nhat spike can doc. */
type Stamp = { step: string; engineVersion: string; workerName: string; workflowName: string };

const stamp = (step: string): Stamp => ({
  step,
  engineVersion: VERSION,
  workerName: WORKER_NAME,
  workflowName: WORKFLOW_NAME,
});

export const spikeWorkflow = hatchet.workflow<SpikeInput>({
  name: WORKFLOW_NAME,
  description: `spike ghim phien ban (${STRATEGY}/${VERSION})`,
});

// ------------------------------------------------------------------ 1. begin
const begin = spikeWorkflow.task({
  name: 'begin',
  retries: 0,
  fn: (input, ctx) => {
    const parsed = SpikeInput.parse(input);
    ctx.logger.info(`begin ${parsed.ref} version=${VERSION} workflow=${WORKFLOW_NAME}`);
    return stamp('begin');
  },
});

// ------------------------------------------------------- 2. park (durable)
/**
 * Buoc DUNG LAI. Day la cua so ma mot ban deploy moi co the chen vao — chinh la tinh huong
 * nguy hiem ma gate nay phai loai tru.
 */
const park = spikeWorkflow.durableTask({
  name: 'park',
  parents: [begin],
  executionTimeout: '15m',
  fn: async (input, ctx) => {
    const timeout = SpikeInput.parse(input).parkTimeout;
    ctx.logger.info(`park toi da ${timeout} version=${VERSION}`);
    const resolved = await ctx.waitFor(
      Or(
        new SleepCondition(timeout as never, 'het-gio-park'),
        new UserEventCondition(APPROVAL_EVENT, '', 'nguoi-duyet'),
      ),
    );
    const keys = Object.keys(resolved ?? {});
    return { ...stamp('park'), resolvedBy: keys.join(',') || 'unknown' };
  },
});

// ----------------------------------------------------------------- 3. resume
const resume = spikeWorkflow.task({
  name: 'resume',
  parents: [park],
  retries: 0,
  fn: async (_input, ctx) => {
    const upstream = await ctx.parentOutput(park);
    ctx.logger.info(`resume version=${VERSION} (park chay ${upstream.engineVersion})`);
    return stamp('resume');
  },
});

// ----------------------------------------------------------------- 4. finish
spikeWorkflow.task({
  name: 'finish',
  parents: [resume],
  retries: 0,
  fn: async (_input, ctx) => {
    const upstream = await ctx.parentOutput(resume);
    return { ...stamp('finish'), previousStepVersion: upstream.engineVersion };
  },
});
