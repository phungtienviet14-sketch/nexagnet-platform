import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { TransportDomainError } from '../../transport.errors.js';
import { ingestTelematicsObservationSchema } from '../proof.schemas.js';
import { InMemoryTrackingRepository } from '../tracking.repository.js';
import {
  TransportProofCoreFacts,
  type ProofDriverFacts,
  type ProofTripFacts,
  type ProofVehicleFacts,
  type ProofRunFacts,
} from '../transport-proof-facts.port.js';
import { TelematicsIngressService } from './telematics-ingress.service.js';
import {
  UnconfiguredVehicleTelematicsAdapter,
  VehicleTelematicsPort,
  type TelematicsAvailability,
  type TelematicsFix,
  type TelematicsQuery,
} from './vehicle-telematics.port.js';

/**
 * `#297 T4/T9/T10` — CUA NHAP cua nguon vi tri thu hai.
 *
 * ============================================================================================
 * CAU HOI MA BO BAI NAY TRA LOI
 * ============================================================================================
 *
 * `location-health.spec.ts` khoa PHEP CHAM sau nghia. `location-health.service.spec.ts` khoa cach
 * lap dau vao cho phep cham do. Ca hai deu gia dinh rang mot ban `TELEMATICS` DA nam trong so bang
 * chung — va tren `main` truoc lane nay, khong mot duong nao ghi duoc mot ban nhu vay.
 *
 * Bo nay khoa chinh cai duong do: ai duoc ghi, khi nao he thong tu choi, va dieu gi xay ra khi cung
 * mot su kien den hai lan.
 *
 * ============================================================================================
 * BAI QUAN TRONG NHAT CUA TEP LA BAI DAU TIEN
 * ============================================================================================
 *
 * Mot he thong CHUA duoc cam vao nha cung cap nao ma van nhan "vi tri tu phan cung tren xe" thi cai
 * no dang nhan khong phai vi tri tu phan cung — do la mot toa do bat ky do mot nguoi co quyen van
 * hanh go vao, mang nhan cua mot nguon ma ai cung tin la doc lap. Va cai sai do khong bao gio tu lo
 * ra: man hinh se hien dung mot mau xanh, dung mot chu "GPS tren xe", cho mot thiet bi chua bao gio
 * ton tai.
 */

const NOW = new Date('2026-09-18T02:00:00Z');
const HAIPHONG = { latitude: 20.8449, longitude: 106.6881 };
const HANOI = { latitude: 21.0285, longitude: 105.8542 };
const VEHICLE = 'vehicle-1';
/** DANH TINH cua dau noi — thu duy nhat duoc phep di vao khoa chan phat lai. */
const CONNECTOR = 'dau-noi-kiem-thu';
/** TEN DE DOC. Co y dat KHAC `CONNECTOR` de mot bai vo tinh lan hai cai se do. */
const PROVIDER_NAME = 'Ten hien thi cua dau noi kiem thu';

const agedBy = (seconds: number): Date => new Date(NOW.getTime() - seconds * 1000);

/**
 * Doi xe gia — CHI biet mot chiec xe, va do la co y.
 *
 * `vehicle-2` khong ton tai o day, nen moi bai hoi ve no dang hoi dung cau *"chuyen gi xay ra khi
 * mot dau noi gui len mot ma xe khong tro toi dau"*.
 */
class FakeCoreFacts extends TransportProofCoreFacts {
  constructor(private readonly known: ReadonlySet<string> = new Set([VEHICLE])) {
    super();
  }

  async findDriverByAuthUserId(): Promise<ProofDriverFacts | null> {
    return null;
  }

  async findTrip(): Promise<ProofTripFacts | null> {
    return null;
  }

  async wasDriverEverAssignedToTrip(): Promise<boolean> {
    return false;
  }

  async activeVehicleForTrip(): Promise<string | null> {
    return null;
  }

  async findVehicle(vehicleId: string): Promise<ProofVehicleFacts | null> {
    return this.known.has(vehicleId) ? { id: vehicleId, registrationPlate: '29H-123.45' } : null;
  }

  /**
   * Bo bai nay khong di qua duong phien theo VONG CHAY (`#327`), nen ban gia tra "khong tim thay"
   * / "chua tung duoc phan cong". Fail-closed la mac dinh dung cho mot ban gia: neu mot duong moi
   * lang le bat dau goi hai ham nay, no se bi TU CHOI chu khong duoc cho qua bang mot cau tra loi
   * bia ra.
   */
  async findRun(): Promise<ProofRunFacts | null> {
    return null;
  }

  async wasDriverEverAssignedToRun(): Promise<boolean> {
    return false;
  }
}

/**
 * ADAPTER KIEM THU TAT DINH — khong mot dong nao cua mot hang that.
 *
 * `#297` T4 cho phep dung mot adapter gia CHO KIEM THU va cho bang chung tong hop, va cam dung mot
 * hang co that: *"Use a deterministic fake adapter only for tests/runtime synthetic proof until B
 * supplies actual device/vendor/API/export documentation."* Ten `dau-noi-kiem-thu` duoc chon de
 * khong ai doc nham no thanh mot nha cung cap thuong mai.
 */
class TestTelematicsAdapter extends VehicleTelematicsPort {
  constructor(
    private readonly enrolled: ReadonlySet<string> = new Set([VEHICLE]),
    /** Danh tinh do CAU HINH cap — o day la doi so cua adapter, khong phai truong cua than yeu cau. */
    private readonly connectorId: string = CONNECTOR,
    /** Ten de doc. Tach thanh doi so rieng de mot bai doi duoc no MA KHONG doi danh tinh. */
    private readonly providerName: string = PROVIDER_NAME,
  ) {
    super();
  }

  describe(): TelematicsAvailability {
    return { available: true, connectorId: this.connectorId, providerName: this.providerName };
  }

  describeVehicle(vehicleId: string): TelematicsAvailability {
    return this.enrolled.has(vehicleId)
      ? { available: true, connectorId: this.connectorId, providerName: this.providerName }
      : { available: false, reason: 'VEHICLE_NOT_ENROLLED' };
  }

  async fetch(_query: TelematicsQuery): Promise<readonly TelematicsFix[]> {
    return [];
  }
}

/** Nha cung cap dang hong — hoi gi cung nem. Mot adapter that goi ra mang de tra loi. */
class OutageTelematicsAdapter extends VehicleTelematicsPort {
  describe(): TelematicsAvailability {
    throw new Error('nha cung cap khong tra loi');
  }

  describeVehicle(): TelematicsAvailability {
    throw new Error('nha cung cap khong tra loi');
  }

  async fetch(): Promise<readonly TelematicsFix[]> {
    throw new Error('nha cung cap khong tra loi');
  }
}

let repository: InMemoryTrackingRepository;
let eventSeq = 0;

const serviceWith = (
  telematics: VehicleTelematicsPort,
  fleet?: ReadonlySet<string>,
): TelematicsIngressService =>
  new TelematicsIngressService(
    repository,
    telematics,
    new FakeCoreFacts(fleet),
    { timeZone: 'Asia/Ho_Chi_Minh' },
    undefined,
    () => NOW,
  );

const service = (): TelematicsIngressService => serviceWith(new TestTelematicsAdapter());

const fix = (over: Partial<Parameters<TelematicsIngressService['ingest']>[0]> = {}) => {
  eventSeq += 1;
  return {
    // MAC DINH la `null`: may chu tu biet minh dang cam vao dau noi nao. Mot bai muon noi ve loi
    // khang dinh cua nguoi goi phai NOI RA dieu do.
    declaredConnectorId: null as string | null,
    externalEventId: `evt-${eventSeq}`,
    vehicleId: VEHICLE,
    latitude: HAIPHONG.latitude,
    longitude: HAIPHONG.longitude,
    accuracyMetres: 12,
    speedMetresPerSecond: null,
    bearingDegrees: null,
    recordedAt: agedBy(60),
    ...over,
  };
};

const reasonOf = async (run: Promise<unknown>): Promise<string> => {
  try {
    await run;
  } catch (error) {
    return error instanceof TransportDomainError ? error.reason : `KHONG PHAI LOI MIEN: ${error}`;
  }
  return 'KHONG BI TU CHOI';
};

beforeEach(() => {
  repository = new InMemoryTrackingRepository();
  eventSeq = 0;
});

describe('T10.9 — chua khai nha cung cap thi CUA DONG', () => {
  it('adapter MAC DINH tu choi, va KHONG ghi mot hang nao', async () => {
    const ingress = serviceWith(new UnconfiguredVehicleTelematicsAdapter());

    expect(await reasonOf(ingress.ingest(fix()))).toBe('TELEMATICS_PROVIDER_NOT_CONFIGURED');
    // Phan quan trong hon ca ma loi: so bang chung khong duoc dong den.
    expect(await repository.latestObservationForVehicle(VEHICLE)).toBeNull();
  });

  it('mot khach chua khai gi van doc duoc — tu choi chi nam o duong GHI', async () => {
    // `UnconfiguredVehicleTelematicsAdapter` la hien thuc MAC DINH cua moi khach hom nay. Neu viec
    // chua khai lam hong duong doc thi moi khach van tai deu mat phep cham suc khoe vi tri.
    expect(new UnconfiguredVehicleTelematicsAdapter().describe()).toEqual({
      available: false,
      reason: 'NO_PROVIDER_CONFIGURED',
    });
  });
});

describe('T10.10 — nha cung cap hong KHONG lam sap cua nhap', () => {
  it('`describe()` NEM -> tu choi co ma, khong phai mot loi 500', async () => {
    const reason = await reasonOf(serviceWith(new OutageTelematicsAdapter()).ingest(fix()));

    // Huong fail-safe o duong GHI nguoc voi duong DOC (`LocationHealthService`), va do la co y:
    // nghi ngo o mot duong doc thi im lang, nghi ngo o mot duong ghi thi dong cua.
    expect(reason).toBe('TELEMATICS_PROVIDER_NOT_CONFIGURED');
    expect(await repository.latestObservationForVehicle(VEHICLE)).toBeNull();
  });
});

describe('CHIEC XE, khong phai khach — hai muc khac nhau', () => {
  it('khach DA ky nhung xe CHUA gan thiet bi -> tu choi', async () => {
    const ingress = serviceWith(new TestTelematicsAdapter(new Set(['vehicle-9'])));

    expect(await reasonOf(ingress.ingest(fix()))).toBe('TELEMATICS_VEHICLE_NOT_ENROLLED');
  });

  it('ma xe khong tro toi chiec xe nao -> tu choi, KHONG doan theo bien so', async () => {
    // `#297` T4: *"stable vehicle mapping, not nearest-plate guessing"*. Mot ma go nham ma duoc ghi
    // se sinh ra mot chuoi vi tri cho mot chiec xe khong ton tai, va no chi lo ra khi co nguoi mo
    // bang len tim.
    const ingress = serviceWith(new TestTelematicsAdapter(new Set([VEHICLE, 'vehicle-2'])));

    expect(await reasonOf(ingress.ingest(fix({ vehicleId: 'vehicle-2' })))).toBe(
      'TELEMATICS_VEHICLE_NOT_FOUND',
    );
  });

  it('NAM cong, NAM ma ly do — khong gop thanh mot `boolean`', async () => {
    // Nguoi dang cam dau noi phai biet minh can sua CAU HINH, sua HO SO XE, hay sua THAN YEU CAU.
    const reasons = new Set([
      await reasonOf(serviceWith(new UnconfiguredVehicleTelematicsAdapter()).ingest(fix())),
      await reasonOf(service().ingest(fix({ declaredConnectorId: 'dau-noi-khac' }))),
      await reasonOf(serviceWith(new TestTelematicsAdapter(new Set())).ingest(fix())),
      await reasonOf(
        serviceWith(new TestTelematicsAdapter(new Set([VEHICLE, 'vehicle-2']))).ingest(
          fix({ vehicleId: 'vehicle-2' }),
        ),
      ),
      await reasonOf(service().ingest(fix({ latitude: 0, longitude: 0 }))),
    ]);

    // So sanh CHINH BO MA chu khong chi dem: neu mot cong bi go, lan goi do se THANH CONG va tra
    // ve `KHONG BI TU CHOI` — mot chuoi moi, van du nam phan tu, va phep dem se xanh nguyen.
    expect(reasons).toEqual(
      new Set([
        'TELEMATICS_PROVIDER_NOT_CONFIGURED',
        'TELEMATICS_CONNECTOR_MISMATCH',
        'TELEMATICS_VEHICLE_NOT_ENROLLED',
        'TELEMATICS_VEHICLE_NOT_FOUND',
        'COORDINATE_REJECTED',
      ]),
    );
  });
});

describe('ban duoc nhan — hinh dang cua hang bang chung', () => {
  it('ghi mot ban `TELEMATICS` gan THANG vao xe, khong vao phien nao', async () => {
    const observation = await service().ingest(fix());

    expect(observation.source).toBe('TELEMATICS');
    expect(observation.vehicleId).toBe(VEHICLE);
    // Dung MOT chu the. Mot hop GSHT bao vi tri luc 2 gio sang khong thuoc ca cua ai, va ep no vao
    // mot phien se buoc phai bia ra mot lai xe khong co that.
    expect(observation.sessionId).toBeNull();
  });

  it('T10.13 — dong ho cua NHA CUNG CAP khong bao gio thanh dong ho may chu', async () => {
    const observation = await service().ingest(fix({ recordedAt: agedBy(900) }));

    expect(observation.capturedAt).toEqual(agedBy(900));
    expect(observation.receivedAt).toEqual(NOW);
    // Do lech duoc GHI, khong duoc dung de tu choi: mot hop chinh sai gio van phai ghi duoc.
    expect(observation.clockSkewSeconds).toBe(-900);
  });

  it('mot hop lech gio HANG GIO van duoc ghi — lech la mot phep do, khong phai mot phan quyet', async () => {
    const observation = await service().ingest(fix({ recordedAt: agedBy(4 * 3_600) }));

    expect(observation.id).toBeTruthy();
    expect(observation.clockSkewSeconds).toBe(-4 * 3_600);
  });

  it('`mockLocationReported` la `null`, khong phai `false`', async () => {
    // `Location.isMock` la khai niem cua Android. Mot hop GSHT khong tra loi cau do, va `false` se
    // la mot cau tra loi BIA — no noi "thiet bi da kiem va bao khong gia lap".
    expect((await service().ingest(fix())).mockLocationReported).toBeNull();
  });

  it('toa do (0,0) bi chan o day y nhu o duong dien thoai', async () => {
    expect(await reasonOf(service().ingest(fix({ latitude: 0, longitude: 0 })))).toBe(
      'COORDINATE_REJECTED',
    );
  });

  it('ma su kien cua nha cung cap duoc GIU NGUYEN VAN de doi soat nguoc', async () => {
    const observation = await service().ingest(fix({ externalEventId: 'BA-GPS/2026/000123' }));

    expect(observation.clientEventId).toBe('BA-GPS/2026/000123');
  });
});

describe('T10.11 / T10.12 — phat lai va dung lai ma su kien', () => {
  it('T10.11 — gui lai DUNG noi dung cu -> tra ban cu, khong ghi hang thu hai', async () => {
    const ingress = service();
    const first = await ingress.ingest(fix({ externalEventId: 'evt-lap' }));
    const second = await ingress.ingest(fix({ externalEventId: 'evt-lap' }));

    expect(second.id).toBe(first.id);
    // Mot mang chap chon gui lai ca lo khong duoc lam chiec xe co hai vi tri cho mot khoanh khac.
    expect(await repository.findTelematicsIngress(CONNECTOR, 'evt-lap')).toMatchObject({
      observationId: first.id,
    });
  });

  it('T10.12 — CUNG ma su kien, KHAC toa do -> TU CHOI, khong lang le tra ban cu', async () => {
    const ingress = service();
    await ingress.ingest(fix({ externalEventId: 'evt-lap' }));

    const reason = await reasonOf(
      ingress.ingest(
        fix({
          externalEventId: 'evt-lap',
          latitude: HANOI.latitude,
          longitude: HANOI.longitude,
        }),
      ),
    );

    // Neu tra ban cu thi ban dinh vi MOI bien mat khong dau vet — va neu day la mot lan sua lich su
    // co chu y thi no vua thanh cong ma khong ai thay gi.
    expect(reason).toBe('TELEMATICS_EVENT_ID_REUSED');
  });

  it('CUNG ma su kien, KHAC moc thoi gian -> TU CHOI', async () => {
    const ingress = service();
    await ingress.ingest(fix({ externalEventId: 'evt-lap' }));

    expect(
      await reasonOf(ingress.ingest(fix({ externalEventId: 'evt-lap', recordedAt: agedBy(30) }))),
    ).toBe('TELEMATICS_EVENT_ID_REUSED');
  });

  it('CUNG ma su kien, KHAC chiec xe -> TU CHOI, ke ca khi xe kia CO THAT va DA dang ky', async () => {
    // Duong tan cong cu the: mot lan nhap hop le cho xe A duoc gui lai voi ma xe B. Neu khoa chan
    // phat lai chi so toa do va moc thoi gian thi lan thu hai se duoc coi la "gui lai" va bi nuot —
    // chiec xe B mat mot ban ghi ma khong ai biet.
    //
    // Ca HAI chiec xe o day deu co that va deu da dang ky thiet bi, nen ba cong dau deu cho di qua.
    // Do la co y: neu de xe B khong ton tai thi bai nay xanh nho cong thu ba, va phep so `vehicleId`
    // trong `resolveReplay` se khong bao gio duoc chay — mot bai kiem xanh khong chung minh gi.
    const fleet = new Set([VEHICLE, 'vehicle-2']);
    const ingress = serviceWith(new TestTelematicsAdapter(fleet), fleet);
    await ingress.ingest(fix({ externalEventId: 'evt-lap' }));

    expect(
      await reasonOf(ingress.ingest(fix({ externalEventId: 'evt-lap', vehicleId: 'vehicle-2' }))),
    ).toBe('TELEMATICS_EVENT_ID_REUSED');
  });

  it('xe khong ton tai van bi chan o cong THU BA, truoc khi toi phep chan phat lai', async () => {
    // Doi chung cua bai tren: hai ma ly do khac nhau cho hai tinh huong khac nhau, de nguoi dang
    // cam dau noi biet minh phai sua HO SO XE hay sua chinh than yeu cau.
    const ingress = serviceWith(new TestTelematicsAdapter(new Set([VEHICLE, 'vehicle-2'])));
    await ingress.ingest(fix({ externalEventId: 'evt-lap' }));

    expect(
      await reasonOf(ingress.ingest(fix({ externalEventId: 'evt-lap', vehicleId: 'vehicle-2' }))),
    ).toBe('TELEMATICS_VEHICLE_NOT_FOUND');
  });

  it('HAI dau noi duoc phep dung TRUNG mot ma su kien — qua HAI CAU HINH, khong qua hai than yeu cau', async () => {
    // Khoa la CAP `(connectorId, externalEventId)`. Neu chi khoa ma su kien thi dau noi thu hai se
    // bi chan boi nhung ma do dau noi thu nhat tinh co dung truoc — mot loi khong ai lan ra duoc.
    //
    // DUONG DI toi hai danh tinh moi la cho bai nay khac han ban truoc no. Truoc, hai danh tinh den
    // tu hai gia tri trong THAN YEU CAU, va chinh bai nay dang khoa cai lo hong lai thanh hanh vi
    // mong doi. Gio chung den tu HAI ADAPTER da cau hinh: mot nguoi van hanh khong doi duoc dau noi
    // bang cach go mot chuoi khac, ho phai duoc cam vao mot dau noi khac that.
    const a = serviceWith(new TestTelematicsAdapter(new Set([VEHICLE]), 'dau-noi-a'));
    const b = serviceWith(new TestTelematicsAdapter(new Set([VEHICLE]), 'dau-noi-b'));

    const first = await a.ingest(fix({ externalEventId: '1' }));
    const second = await b.ingest(fix({ externalEventId: '1' }));

    expect(second.id).not.toBe(first.id);
    // Va moi hang nam duoi DUNG danh tinh cua dau noi da ghi no.
    expect(await repository.findTelematicsIngress('dau-noi-a', '1')).toMatchObject({
      observationId: first.id,
    });
    expect(await repository.findTelematicsIngress('dau-noi-b', '1')).toMatchObject({
      observationId: second.id,
    });
  });
});

/**
 * DOI KHANG — DANH TINH NGUON KHONG DUOC DEN TU THAN YEU CAU.
 *
 * ============================================================================================
 * BO BAI NAY RA DOI TU MOT LO HONG CO THAT, KHONG TU MOT GIA DINH
 * ============================================================================================
 *
 * Ban dau cua nhap nhan `providerId` tu than yeu cau, roi dung CHINH gia tri do lam nua dau cua
 * khoa chan phat lai. Hau qua khong phai ly thuyet: mot nguoi co quyen van hanh gui lai dung mot
 * `externalEventId` duoi hai chuoi khac nhau se tao ra HAI hang bang chung cho CUNG mot su kien
 * thuong nguon — va phep chan phat lai, thu duy nhat giu cho so nay khong bi bom len, khong thay
 * gi ca. Te hon: no khong lam hong cai gi ca, nen khong mot bai kiem hanh vi nao do.
 *
 * Bo bai cu VAN XANH voi lo hong do, va mot bai trong so do con khoa chinh no lai thanh hanh vi
 * mong doi ("HAI nha cung cap duoc phep dung TRUNG mot ma su kien"). Do la ly do bo nay hoi cau
 * hoi NGUOC LAI: khong phai *"he thong lam duoc gi"* ma *"nguoi goi co doi duoc thu khong thuoc ve
 * ho khong"*.
 *
 * Moi bai o day deu phai DO neu ai do tra `command.declaredConnectorId` ve lai duong ghi.
 */
describe('doi khang — danh tinh dau noi den tu CAU HINH, khong tu than yeu cau', () => {
  it('khai LECH -> tu choi, va khong mot hang nao duoc ghi', async () => {
    const reason = await reasonOf(
      service().ingest(fix({ externalEventId: 'evt-lech', declaredConnectorId: 'dau-noi-bia' })),
    );

    expect(reason).toBe('TELEMATICS_CONNECTOR_MISMATCH');
    // "Tu choi TRUOC khi ghi" khong phai mot cau noi ve thu tu dong lenh — ba phep do duoi day la
    // cach duy nhat phan biet no voi "ghi xong roi bao loi".
    expect(await repository.latestObservationForVehicle(VEHICLE)).toBeNull();
    expect(await repository.findTelematicsIngress('dau-noi-bia', 'evt-lech')).toBeNull();
    expect(await repository.findTelematicsIngress(CONNECTOR, 'evt-lech')).toBeNull();
  });

  it('danh tinh GHI XUONG la danh tinh cua CAU HINH', async () => {
    const observation = await service().ingest(fix({ externalEventId: 'evt-cauhinh' }));

    expect(await repository.findTelematicsIngress(CONNECTOR, 'evt-cauhinh')).toMatchObject({
      observationId: observation.id,
    });
    // Va KHONG nam duoi ten hien thi: hai thu do phai la hai thu.
    expect(await repository.findTelematicsIngress(PROVIDER_NAME, 'evt-cauhinh')).toBeNull();
  });

  it('khai DUNG cung khong doi duoc gi — no la loi khang dinh, khong phai mot lua chon', async () => {
    const ingress = service();
    const first = await ingress.ingest(
      fix({ externalEventId: 'evt-khop', declaredConnectorId: CONNECTOR }),
    );
    // Lan hai KHONG khai gi. Neu truong do co du phan luong danh tinh, hai lan nay se nam o hai
    // danh tinh khac nhau va lan hai se ghi them mot hang.
    const second = await ingress.ingest(fix({ externalEventId: 'evt-khop' }));

    expect(second.id).toBe(first.id);
  });

  it('DOI TEN HIEN THI khong doi danh tinh — mot lan doi ten khong mo lai lich su', async () => {
    // Duong tan cong cu the neu hai thu bi tron: sua ten hien thi cua nha cung cap trong cau hinh,
    // va MOI ma su kien cu bong nhien "chua tung thay" — ca lich su nhap lai duoc mot lan nua.
    const truoc = serviceWith(new TestTelematicsAdapter(new Set([VEHICLE]), CONNECTOR, 'Ten cu'));
    const sau = serviceWith(new TestTelematicsAdapter(new Set([VEHICLE]), CONNECTOR, 'Ten moi'));

    const first = await truoc.ingest(fix({ externalEventId: 'evt-doiten' }));
    const second = await sau.ingest(fix({ externalEventId: 'evt-doiten' }));

    expect(second.id).toBe(first.id);
  });
});

/**
 * KHONG mot truong nao cua than yeu cau di vong duoc qua phep chan phat lai.
 *
 * Bai duoi day quet HET be mat: moi bien the dang "gan giong" danh tinh that. Viet thanh mot vong
 * lap chu khong thanh N bai la co y — them mot cach go moi thi chi phai them MOT dong vao bang, va
 * bai se noi ngay cach do co mo duong hay khong.
 */
describe('doi khang — mot ma su kien, mot hang, du nguoi goi go gi', () => {
  it('moi bien the cua than yeu cau deu bi chan, va ban dinh vi DAU TIEN khong he doi', async () => {
    const ingress = service();
    const goc = await ingress.ingest(fix({ externalEventId: 'evt-doikhang' }));

    // `HANOI` o khap noi de neu mot dong nao LOT qua, no se ghi mot toa do KHAC HAN — tuc cho hong
    // se nhin thay duoc, khong phai mot ban trung lap im lang.
    const buoc: ReadonlyArray<readonly [string, string]> = [
      ['mot chuoi bat ky', 'dau-noi-cua-toi'],
      ['khac hoa', CONNECTOR.toUpperCase()],
      ['them khoang trang', ` ${CONNECTOR} `],
      ['gan giong, lech mot ky tu', `${CONNECTOR}1`],
      ['dung TEN HIEN THI lam danh tinh', PROVIDER_NAME],
    ];

    for (const [nhan, khai] of buoc) {
      const reason = await reasonOf(
        ingress.ingest(
          fix({
            externalEventId: 'evt-doikhang',
            declaredConnectorId: khai,
            latitude: HANOI.latitude,
            longitude: HANOI.longitude,
          }),
        ),
      );
      expect(reason, nhan).toBe('TELEMATICS_CONNECTOR_MISMATCH');
      // Va khong mot danh tinh MOI nao duoc sinh ra tu chuoi vua go.
      expect(await repository.findTelematicsIngress(khai, 'evt-doikhang'), nhan).toBeNull();
    }

    const latest = await repository.latestObservationForVehicle(VEHICLE);
    expect(latest?.id).toBe(goc.id);
    expect(latest?.point).toEqual(HAIPHONG);
    expect(await repository.findTelematicsIngress(CONNECTOR, 'evt-doikhang')).toMatchObject({
      observationId: goc.id,
    });
  });
});

/**
 * KHONG mot he xac thuc thu hai, va KHONG mot bang chung thiet bi duoc bia ra.
 *
 * `REAL_DEVICE_PROOF = NOT_PROVEN` la mot khang dinh ve THE GIOI, va cach no hong khong phai ai do
 * viet ra mot dong "da xac minh phan cung" — ma la mot truong nghe co ve vo hai (`deviceToken`,
 * `attestation`) len duoc lieu do cong khai, roi sau vai thang co nguoi doc no thanh mot bao dam.
 *
 * Nen hai bai duoi day doc CAU TRUC chu khong doc y dinh.
 */
describe('T9/T4 — khong xac thuc rieng cua hang, khong bang chung thiet bi bia ra', () => {
  it('lieu do cong khai chi mang phep do — khong khoa, khong ve, khong `providerId` cu', () => {
    expect(Object.keys(ingestTelematicsObservationSchema.shape).sort()).toEqual([
      'accuracyMetres',
      'bearingDegrees',
      'connectorId',
      'externalEventId',
      'latitude',
      'longitude',
      'recordedAt',
      'speedMetresPerSecond',
      'vehicleId',
    ]);
  });

  it('truong `providerId` cu KHONG lang le quay lai duoc — `.strict()` bat no keu len', () => {
    // Neu mot ban vi dai hay mot may khach cu con gui `providerId`, no phai nhan `400` on ao. Bo
    // qua im lang thi may khach do van tin rang no dang chon nguon, va khac biet giua dieu no tuong
    // va dieu he thong lam chi lo ra khi co nguoi doi soat hai ben.
    const parsed = ingestTelematicsObservationSchema.safeParse({
      providerId: 'dau-noi-cua-toi',
      externalEventId: 'evt-cu',
      vehicleId: VEHICLE,
      latitude: HAIPHONG.latitude,
      longitude: HAIPHONG.longitude,
      recordedAt: NOW.toISOString(),
    });

    expect(parsed.success).toBe(false);
  });

  it('duong GHI khong nhap mot goi cua hang nao, va khong tu goi ra mang', () => {
    // Mot dau noi that song o TANG ADAPTER. Neu mot `import` cua hang hay mot loi goi mang xuat
    // hien o hai tep nay, thi bien gioi da bi dich — va lan sau mot hang doi giao thuc, chinh
    // duong ghi bang chung phai sua theo.
    for (const ten of ['telematics-ingress.service.ts', 'telematics-ingress.controller.ts']) {
      const nguon = readFileSync(fileURLToPath(new URL(ten, import.meta.url)), 'utf8');
      // Bo CHU THICH truoc khi quet. Hai tep nay GIAI THICH rat ky vi sao chung khong goi
      // `fetch()`, nen quet ca chu thich thi chinh cau giai thich do lam bai do — va cach de nhat
      // de lam bai xanh lai se la xoa loi giai thich di.
      const ma = nguon.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      for (const khop of ma.matchAll(/^import[^']*'([^']+)'/gm)) {
        const goi = khop[1] ?? '';
        expect(goi.startsWith('.') || goi === '@nestjs/common', `${ten} -> ${goi}`).toBe(true);
      }
      expect(ma, ten).not.toMatch(/\bfetch\s*\(|\baxios\b|node:https?\b/);
      // Khong mot he xac thuc thu hai (`#242` E3): dau noi chay duoi phien co quyen van hanh.
      expect(ma, ten).not.toMatch(/apiKey|api_key|Bearer|clientSecret|accessToken|deviceToken/i);
    }
  });
});

/**
 * `#297` T9 — KHONG mot duong nao tu mot khoang im lang, hay tu mot ban dinh vi, toi mot khoan tien.
 */
describe('T9 — cua nhap khong dong toi mot dong tien nao', () => {
  it('phu thuoc cua dich vu dung o SAU thu, va khong thu nao la so sach', () => {
    // Doc theo CAU TRUC chu khong theo y dinh: mot dich vu khong duoc tiem kho cong no, bang luong
    // hay quy lai xe thi khong co duong nao di toi mot khoan tru — ke ca khi co nguoi muon viet.
    expect(TelematicsIngressService.length).toBe(6);
  });

  it('mot ban duoc ghi KHONG gan vao ho so lai xe nao', async () => {
    const observation = await service().ingest(fix());

    // Ban tu phan cung khong thuoc phien cua ai, nen khong co duong nao tu no den mot con nguoi —
    // va vi vay khong co duong nao den mot khoan phu cap, mot lan tru luong hay mot nhan gian lan.
    expect(observation.sessionId).toBeNull();
    expect(await repository.listRiskFlagsForSession('')).toEqual([]);
  });
});
