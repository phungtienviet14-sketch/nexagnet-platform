/**
 * CLI kich hoat — dong vai NEXAGNET goi sang engine.
 *
 * Diem quan trong nhat: sinh `traceparent` W3C DUNG KHUON ma
 * `apps/api/src/observability/trace-context.ts` dang sinh, roi dinh vao `additionalMetadata`.
 * Neu chuoi nay di duoc toi tan diem cuoi HTTP thi coi nhu da noi duoc
 * Zalo -> Order -> workflow run -> task -> he ngoai.
 *
 * Dung:
 *   pnpm trigger -- --mode=ok
 *   pnpm trigger -- --mode=fail_then_ok --failTimes=2
 *   pnpm trigger -- --mode=rate_limited
 *   pnpm trigger -- --invalid            (payload hong -> chung minh run LOI)
 *   pnpm trigger -- --approve=<runId>    (gui su kien duyet)
 *   pnpm trigger -- --cancel=<runId>
 *   pnpm trigger -- --replay=<runId>
 */
import { randomBytes } from 'node:crypto';
import { hatchet } from './hatchet-client.js';
import { automationProof, APPROVAL_EVENT } from './workflow.js';

/** Y het `newTraceId()` cua Nexagnet: 16 byte hex. */
const newTraceId = () => randomBytes(16).toString('hex');
/** Y het `newSpanId()`: 8 byte hex. */
const newSpanId = () => randomBytes(8).toString('hex');
/** Y het `toTraceparent()`: `01` cuoi = sampled. */
const toTraceparent = (traceId: string, spanId: string) => '00-' + traceId + '-' + spanId + '-01';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith('--' + name));
  if (!hit) return undefined;
  const [, value] = hit.split('=');
  return value ?? 'true';
}

async function main() {
  const approve = arg('approve');
  if (approve) {
    await hatchet.events.push(APPROVAL_EVENT, { runId: approve, approvedBy: 'operator-poc' });
    console.log('da day su kien duyet cho ' + approve);
    return;
  }

  const cancel = arg('cancel');
  if (cancel) {
    await hatchet.runs.cancel({ ids: [cancel] });
    console.log('da huy ' + cancel);
    return;
  }

  const replay = arg('replay');
  if (replay) {
    await hatchet.runs.replay({ ids: [replay] });
    console.log('da replay ' + replay);
    return;
  }

  const traceId = arg('traceId') ?? newTraceId();
  const traceparent = toTraceparent(traceId, newSpanId());
  const orderRef = arg('orderRef') ?? 'PROOF-' + Date.now();
  const invalid = arg('invalid') === 'true';

  const input = invalid
    ? // Thieu `customer` va `totalQuantity` sai kieu -> validate phai NEM, va khong retry.
      ({ tenant: 'tenant-alpha', orderRef, totalQuantity: -1 } as never)
    : {
        tenant: arg('tenant') ?? 'tenant-alpha',
        orderRef,
        customer: {
          name: 'Nguoi Dat Thu Nghiem',
          phone: '0900000123',
          address: '12 Duong Thu Nghiem, Quan Test',
        },
        totalQuantity: Number(arg('qty') ?? 12),
        endpointMode: (arg('mode') ?? 'ok') as 'ok',
        failTimes: Number(arg('failTimes') ?? 2),
        approvalTimeout: arg('approvalTimeout') ?? '30s',
      };

  console.log('traceId (Nexagnet)  = ' + traceId);
  console.log('traceparent gui di  = ' + traceparent);

  const ref = await automationProof.runNoWait(input, {
    additionalMetadata: {
      traceparent,
      // Nhung neo nghiep vu de operator TIM DUOC run tren dashboard.
      'nexagnet.traceId': traceId,
      'nexagnet.orderRef': orderRef,
      'nexagnet.tenant': String((input as { tenant?: string }).tenant ?? 'tenant-alpha'),
    },
  });

  const runId = await ref.runId;
  console.log('workflow run id     = ' + runId);
  console.log('dashboard           = http://localhost:8744/tenants/707d0855-80ab-4e1f-a156-f1c4546cbf52/runs/' + runId);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
