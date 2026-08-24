import 'reflect-metadata';
import '../../config/load-dotenv.js';

/**
 * TIEN TRINH NEXAGNET CUA BAI KIEM TUONG QUAN — mo mot LUOT NGHIEP VU that roi giao viec cho
 * engine, va song du lau de dispatcher lam viec do.
 *
 * ---------------------------------------------------------------------------
 * VI SAO PHAI LA MOT TIEN TRINH RIENG chu khong phai `bootAppContext()` ngay trong bai kiem:
 *
 * Runtime OTel chi vao duoc bang `node --import` (xem dau `otel-runtime.ts`:
 * `instrumentation-http` VA LAI `node:http`, va trong ESM moi `import` cua mot file duoc danh
 * gia truoc dong lenh dau tien cua file do). Tien trinh cua vitest da nap xong `node:http` tu
 * lau truoc khi bai kiem dau tien chay — nen mot ung dung boot BEN TRONG vitest se khong bao gio
 * co span HTTP/Prisma that. Bang chung "mot trace di xuyen ba tien trinh" ma lay tu mot tien
 * trinh khong duoc do dung cach thi khong phai bang chung.
 *
 * Tach ra con lam ro mot dieu thu hai: `api` va `worker` la HAI tien trinh khong dung chung bo
 * nho nao. Neu chung gap nhau tren mot `traceId` thi do la vi soi day W3C di duoc qua engine,
 * khong phai vi chung tinh co o chung mot dong.
 *
 * ---------------------------------------------------------------------------
 * GIAO TIEP VOI CHA — mot dong stdout `CHILD <operationKey> <traceId>`, giong khuon cua
 * `crash-window-child.ts`, roi CHO mot dong stdin de tat.
 *
 * VI SAO CHO STDIN chu khong phai SIGTERM: preload OTel dat `process.once('SIGTERM')` de day
 * not hang doi span. Dang ky mot lang nghe SIGTERM se BO hanh vi tat mac dinh cua Node, nen
 * "gui SIGTERM roi doi thoat" tro thanh mot phep do phu thuoc vao thu tu cua hai lang nghe. Mot
 * dong tren stdin thi khong co su mo ho do.
 *
 * KHONG `process.exit()` truoc khi `shutdownOtel()` tra ve: `BatchSpanProcessor` giu span trong
 * hang toi 2 giay, va lo cuoi cung — dung lo mang buoc cuoi cua luot — se bien mat cung tien
 * trinh. Do la che do hong te nhat cho mot bai kiem quan sat: no do MOT CACH NGAU NHIEN.
 */

import { bootAppContext } from './workflow-it.harness.js';

interface TelemetryLike {
  runTurn<T>(anchors: Record<string, string>, fn: () => T): T;
  step<T>(name: string, fn: () => Promise<T>): Promise<T>;
  traceId(): string | undefined;
}

function argValue(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

async function main(): Promise<void> {
  const entityId = argValue('--entity', `WI-evidence-${Date.now()}`);
  const chatId = argValue('--chat', 'IT-trace-correlation');

  const app = await bootAppContext(process.env);
  const { TelemetryService } = await import('../../observability/telemetry.service.js');
  const telemetry = app.context.get(TelemetryService as never, {
    strict: false,
  }) as TelemetryLike;

  // MOT LUOT NGHIEP VU THAT: `runTurn` la cong vao duy nhat sinh `traceId`, va `step` la thu ma
  // `PipelineService` dung o moi buoc. Goi `handoff()` tran (nhu cac bai IT khac lam) se cho mot
  // luot KHONG co trace — dung ra la `traceId: "no-trace"` trong log — va luc do khong con gi de
  // chung minh ve tuong quan.
  const { operationKey, traceId } = await telemetry.runTurn(
    { chatId, messageId: entityId },
    async () => {
      const result = await telemetry.step('handoff.enqueue', () =>
        app.handoff.handoff({
          workflowKey: 'integration-handoff',
          operation: 'sync',
          entityType: 'work-item',
          entityId,
        }),
      );
      return { operationKey: result.operationKey ?? '', traceId: telemetry.traceId() ?? '' };
    },
  );

  process.stdout.write(`CHILD ${operationKey} ${traceId}\n`);

  await new Promise<void>((done) => {
    process.stdin.once('data', () => done());
    process.stdin.resume();
  });

  await app.context.close();
  const { shutdownOtel } = await import('../../observability/otel/otel-runtime.js');
  await shutdownOtel();
  process.exit(0);
}

await main();
