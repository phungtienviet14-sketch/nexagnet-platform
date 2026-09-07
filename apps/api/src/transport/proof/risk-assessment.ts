import { assessContinuity } from '../geo/continuity.js';
import type { GeoPoint } from '../geo/geo-point.js';
import { isWithinRoadNetworkBoundingBox } from '../geo/geo-point.js';
import { gradeAccuracy } from '../geo/location-quality.js';
import type { TransportProofPolicy } from './tracking-policy.js';
import type { DeviceIntegrityVerdict, ProofRiskCode, ProofRiskSeverity } from './tracking.types.js';

/**
 * CHAM RUI RO cho MOT ban dinh vi — thuan ham, tat dinh, khong doc DB va khong doc dong ho.
 *
 * Dau ra la mot danh sach ma. No KHONG bao gio chan mot chuyen, khong sinh mot khoan no, khong tru
 * mot dong luong (#232 D-02). No chi tra loi mot cau: *phep do nay co tu giai thich duoc khong?*
 *
 * ============================================================================================
 * VI SAO CHI HAI MUC, VA VI SAO HAU HET LA `INFO`
 * ============================================================================================
 *
 * Mot ca chay sinh ra hang nghin ban dinh vi. Neu moi ban tin hieu kem deu thanh `REVIEW` thi den
 * cuoi tuan dau tien danh sach can xem se dai hon so gio lam viec cua nguoi xem — va ho se tat no.
 * Luc do ca tang chong gian lan bang khong, ke ca khi tung phep kiem deu dung.
 *
 * Nen quy uoc o day la: `REVIEW` danh cho thu **hiem VA co nghia**; `INFO` cho thu **thuong xuyen,
 * chi co nghia khi cong don**. Mot ngan ban `ACCURACY_POOR` khong dang mot dong danh sach, nhung
 * "88% ban dinh vi cua chuyen nay o hang POOR" thi dang — va do la viec cua `TrackingSummaryView`,
 * khong phai cua tung co mot.
 */

export interface RiskAssessmentInput {
  readonly point: GeoPoint;
  readonly accuracyMetres: number | null;
  /** Dong ho may khach. */
  readonly capturedAt: Date;
  /** Dong ho may chu — su that. */
  readonly receivedAt: Date;
  readonly mockLocationReported: boolean | null;
  readonly deviceIntegrity: DeviceIntegrityVerdict;
  /** Ban dinh vi lien truoc CUNG PHIEN. `null` o ban dau tien. */
  readonly previous: {
    readonly point: GeoPoint;
    readonly accuracyMetres: number | null;
    readonly capturedAt: Date;
  } | null;
}

export interface RiskFinding {
  readonly code: ProofRiskCode;
  readonly severity: ProofRiskSeverity;
  readonly detail: Readonly<Record<string, unknown>>;
}

export function clockSkewSeconds(capturedAt: Date, receivedAt: Date): number {
  return Math.round((capturedAt.getTime() - receivedAt.getTime()) / 1000);
}

export function assessObservationRisk(
  input: RiskAssessmentInput,
  policy: TransportProofPolicy,
): readonly RiskFinding[] {
  const findings: RiskFinding[] = [];

  /* --- do chinh xac ----------------------------------------------------- */
  const grade = gradeAccuracy(input.accuracyMetres, policy.accuracy);
  if (grade === 'POOR') {
    findings.push({
      code: 'ACCURACY_POOR',
      severity: 'INFO',
      detail: {
        accuracyMetres: input.accuracyMetres,
        coarseMaxMetres: policy.accuracy.coarseMaxMetres,
      },
    });
  }
  if (grade === 'UNKNOWN') {
    findings.push({
      code: 'ACCURACY_UNKNOWN',
      severity: 'INFO',
      detail: { accuracyMetres: input.accuracyMetres },
    });
  }

  /* --- tin hieu tu thiet bi --------------------------------------------- */
  //
  // `REVIEW`: mot thiet bi TU BAO rang ban dinh vi den tu nha cung cap gia lap la chuyen hiem va
  // co nghia. Nhung phai doc no cho dung: `Location.isMock()` chi bat duoc duong gia lap DA DANG
  // KY qua Developer Options. Cac module LSPosed dang phat hanh cong khai ep chinh ham nay tra
  // `false`. Nen mot ban dinh vi KHONG co co nay khong chung minh dieu gi ca — chi mot ban CO co
  // moi noi duoc mot dieu.
  if (input.mockLocationReported === true) {
    findings.push({ code: 'MOCK_LOCATION_REPORTED', severity: 'REVIEW', detail: {} });
  }
  // `INFO`: rat nhieu may that khong qua duoc kiem toan ven vi nhung ly do vo hai (khong co Play
  // Services, ban web, ban cai tay noi bo). Bien no thanh `REVIEW` la tao ra mot danh sach dai
  // toan nguoi lam dung.
  if (input.deviceIntegrity === 'UNVERIFIED') {
    findings.push({
      code: 'DEVICE_INTEGRITY_UNVERIFIED',
      severity: 'INFO',
      detail: { verdict: input.deviceIntegrity },
    });
  }

  /* --- thoi gian --------------------------------------------------------- */
  const skew = clockSkewSeconds(input.capturedAt, input.receivedAt);
  if (Math.abs(skew) > policy.maxClockSkewSeconds) {
    // `INFO`, khong `REVIEW`, va khong tu choi: voi mot hang doi ngoai tuyen, do lech lon gan nhu
    // luon co nghia "may vua offline bon tieng". Tu choi se lam mat dung doan duong khong co song.
    findings.push({
      code: 'CLOCK_SKEW_EXCEEDED',
      severity: 'INFO',
      detail: { clockSkewSeconds: skew, maxClockSkewSeconds: policy.maxClockSkewSeconds },
    });
  }

  /* --- lien tuc chuyen dong ---------------------------------------------- */
  const continuity = assessContinuity(
    input.previous === null
      ? null
      : {
          point: input.previous.point,
          accuracyMetres: input.previous.accuracyMetres,
          atSeconds: input.previous.capturedAt.getTime() / 1000,
        },
    {
      point: input.point,
      accuracyMetres: input.accuracyMetres,
      atSeconds: input.capturedAt.getTime() / 1000,
    },
    policy.continuity,
  );

  for (const code of continuity.codes) {
    if (code === 'CONTINUOUS' || code === 'FIRST_OBSERVATION') continue;
    findings.push({
      code,
      // `IMPLAUSIBLE_SPEED` la `REVIEW` vi no da SONG SOT qua phep tru sai so cua ca hai ban dinh
      // vi — tuc phan dich chuyen con lai la phan hinh hoc khong giai thich duoc bang nhieu tin
      // hieu. Hai ma con lai thuong chi la mat song, nen chung la `INFO`.
      severity: code === 'IMPLAUSIBLE_SPEED' ? 'REVIEW' : 'INFO',
      detail: {
        rawDistanceMetres: round(continuity.rawDistanceMetres),
        effectiveDistanceMetres: round(continuity.effectiveDistanceMetres),
        elapsedSeconds: continuity.elapsedSeconds,
        speedMetresPerSecond:
          continuity.speedMetresPerSecond === null ? null : round(continuity.speedMetresPerSecond),
      },
    });
  }

  /* --- khung hoat dong --------------------------------------------------- */
  if (!isWithinRoadNetworkBoundingBox(input.point)) {
    findings.push({
      code: 'OUTSIDE_OPERATING_AREA',
      severity: 'REVIEW',
      detail: { latitude: input.point.latitude, longitude: input.point.longitude },
    });
  }

  return findings;
}

export function highestSeverity(findings: readonly RiskFinding[]): ProofRiskSeverity | null {
  if (findings.some((finding) => finding.severity === 'REVIEW')) return 'REVIEW';
  return findings.length > 0 ? 'INFO' : null;
}

/** Ba chu so thap phan la du cho met va m/s; giu nguyen se do mot chuoi rac vao `detail`. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
