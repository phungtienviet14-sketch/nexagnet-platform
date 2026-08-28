import { describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { buildGithubSourceUrl } from '@netviet/shared';
import { TURN_DECISIONS } from '../turns/turn-decisions.js';
import { RecentTracesSink } from './recent-traces.sink.js';
import { TelemetryService } from './telemetry.service.js';
import { TraceController } from './trace.controller.js';
import { buildTraceView } from './trace-view.builder.js';

/**
 * RUNTIME PROOF 4 CUA P2 — "mo mot trace CU thi van giu dung release SHA CU".
 *
 * ---------------------------------------------------------------------------
 * VI SAO BAI NAY TON TAI, va vi sao no khong phai mot bai "chong hoi quy":
 *
 * Hom nay duong doc KHONG CO khai niem "release ma trace nay duoc sinh ra duoi do". No hoi
 * tien trinh DANG CHAY xem minh la commit nao, roi gan cau tra loi do cho MOI trace. Trong
 * mot the gioi ma vong dem chet cung tien trinh, cau tra loi do tinh co la dung: moi trace
 * trong vong dem THAT SU thuoc release dang chay.
 *
 * P2 pha chinh gia dinh do. Ngay trace song qua mot lan restart hay mot lan deploy, "release
 * dang chay" tro thanh cau tra loi SAI cho mot trace cu — va no sai theo cach nguy hiem nhat:
 * permalink van bam duoc, van mo ra mot tep, chi la mot tep o commit KHAC. Mot lien ket sai
 * mot cach tu tin te hon han mot lien ket vang mat.
 *
 * ---------------------------------------------------------------------------
 * CACH MO HINH "TRACE SONG LAU HON TIEN TRINH" o muc unit:
 *
 * `RecentTracesSink` dong vai KHO — no duoc trao cho mot `TelemetryService` KHAC voi cai da
 * sinh ra trace. Do dung la hinh dang cua bai toan that: kho ben con, tien trinh thi khong.
 * Khong can ClickHouse de chung minh dieu nay sai; chi can hai tien trinh.
 */

/** Release da sinh ra trace. */
const RELEASE_OLD = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
/** Release dang chay khi nguoi ta MO trace do ra xem. */
const RELEASE_NEW = '9f8e7d6c5b4a9f8e7d6c5b4a9f8e7d6c5b4a9f8e';

const REPO = 'https://github.com/phungtienviet14-sketch/nexagnet-platform';

function processAt(gitSha: string, sink: RecentTracesSink): TelemetryService {
  const telemetry = new TelemetryService();
  telemetry.configure({
    release: { tenant: 'khach-test', environment: 'moi-truong-test', gitSha, source: 'manifest' },
    privacy: 'full',
    sinks: [sink],
  });
  return telemetry;
}

async function traceFromRelease(gitSha: string, store: RecentTracesSink): Promise<string> {
  const telemetry = processAt(gitSha, store);
  await telemetry.runTurn({ chatId: 'nhom-1', channel: 'zca_listener' }, async () => {
    telemetry.decision({
      vocabulary: TURN_DECISIONS,
      point: 'message.intake',
      outcome: 'denied',
      reason: 'GROUP_NOT_MAPPED',
    });
  });
  return store.list(1)[0]!.traceId;
}

describe('trace giu release cua CHINH NO', () => {
  it('ban ghi mang git SHA DAY DU, khong chi ban cat ngan de doc', async () => {
    const store = new RecentTracesSink();
    const traceId = await traceFromRelease(RELEASE_OLD, store);

    const record = store.get(traceId)!.records[0]!;

    // 12 ky tu la ban cho NGUOI doc tren mot dong chat hep — giu nguyen.
    expect(record.release).toBe(RELEASE_OLD.slice(0, 12));
    // 40 ky tu la ban cho MAY doc: `/blob/<sha>/…` cat ngan la mot duong dan 404.
    expect(record.releaseSha).toBe(RELEASE_OLD);
  });

  it('man hinh dung release CUA TRACE, khong dung release dang chay', async () => {
    const store = new RecentTracesSink();
    const traceId = await traceFromRelease(RELEASE_OLD, store);

    // Mot ban phat hanh moi da rollout. Kho van con, tien trinh thi la tien trinh khac.
    const view = buildTraceView(store.get(traceId)!);

    expect(view.sourceContext?.releaseSha).toBe(RELEASE_OLD);
  });

  it('permalink cua mot trace cu van tro dung blob cua release cu sau khi deploy', async () => {
    const store = new RecentTracesSink();
    const traceId = await traceFromRelease(RELEASE_OLD, store);

    // Tien trinh MOI: release khac, vong dem rieng cua no thi rong. Kho la cai duoc trao lai.
    const running = processAt(RELEASE_NEW, new RecentTracesSink());
    const controller = new TraceController(store, running);

    const view = controller.byTraceId(traceId);
    const node = view.nodes.find((candidate) => candidate.reason === 'GROUP_NOT_MAPPED')!;
    const url = buildGithubSourceUrl(view.sourceContext!, node.source!);

    expect(url).toBe(
      `${REPO}/blob/${RELEASE_OLD}/apps/api/src/pipeline/pipeline.service.ts#L${node.source!.line}`,
    );
    expect(url).not.toContain(RELEASE_NEW);
  });

  it('trace khong biet release cua no thi KHONG MUON release dang chay de gan bua', async () => {
    const store = new RecentTracesSink();
    // `gitSha: 'unknown'` = tien trinh sinh ra trace nay khong doc duoc manifest.
    await traceFromRelease('unknown', store);
    const traceId = store.list(1)[0]!.traceId;

    const running = processAt(RELEASE_NEW, new RecentTracesSink());
    const view = new TraceController(store, running).byTraceId(traceId);

    // KHONG BIET THI IM. Mot permalink tu tin ma sai te hon mot o trong co ghi chu.
    expect(view.sourceContext?.releaseSha).toBeUndefined();
  });
});
