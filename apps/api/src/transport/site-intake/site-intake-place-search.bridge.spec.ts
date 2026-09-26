import { describe, expect, it } from 'vitest';
import type { GeoPoint } from '../geo/geo-point.js';
import { parseNominatimSearch } from '../places/nominatim.js';
import {
  TransportPlaceSearchPort,
  UnconfiguredPlaceSearchAdapter,
} from '../places/place-search.port.js';
import type {
  PlaceCandidate,
  PlaceLookupOutcome,
  PlaceSearchAvailability,
} from '../places/place-search.types.js';
import { TransportPlaceService } from '../places/place.service.js';
import { TransportDomainError } from '../transport.errors.js';
import { SiteIntakePlaceSearchBridge } from './site-intake-place-search.bridge.js';
import type { DestinationChoiceBody } from './site-intake.schemas.js';

/**
 * CAU NOI TIM DIA DIEM cua `#398` — `SiteIntakePlaceSearchBridge.choiceOf`.
 *
 * Bai nay chay `TransportPlaceService` THAT (#379) tren mot cong tim GIA do bai dieu khien: cau noi
 * doc ket qua qua DUNG duong ma controller dung, va cong gia ghi lai moi chuoi ma may chu that su
 * gui di tim. Hai dieu phai dung:
 *
 *   · `KNOWN_PLACE` chi mang `placeId` di tiep — nhan + toa do do `SiteIntakeCommercialService`
 *     doc tu hang rao dang hoat dong (`resolve()`), cau noi KHONG goi tim kiem;
 *   · `PLACE_SEARCH` bi may chu TIM LAI bang chuoi cua may khach, va chi mot ket qua CUNG nhan VA
 *     CUNG toa do (duoi mot met) moi thanh diem giao. Mot cap so bia — ke ca (0, 0) — khong qua.
 */

const KHO_B: PlaceCandidate = {
  label: 'Kho B Dinh Vu',
  address: 'Khu cong nghiep Dinh Vu, Hai Phong',
  point: { latitude: 20.8456, longitude: 106.7713 },
};
const KHO_C: PlaceCandidate = {
  label: 'Kho C Nam Dinh Vu',
  address: 'Nam Dinh Vu, Hai Phong',
  point: { latitude: 20.8231, longitude: 106.7902 },
};

type SearchOutcome = PlaceLookupOutcome<readonly PlaceCandidate[]>;

/** Cong tim GIA: tra dung ket cuc bai dat, va ghi lai moi chuoi may chu gui di tim. */
class ScriptedPlaceSearch extends TransportPlaceSearchPort {
  readonly providerId = 'scripted';
  readonly queries: string[] = [];

  constructor(private readonly outcome: SearchOutcome) {
    super();
  }

  describe(): PlaceSearchAvailability {
    return { available: true, providerId: this.providerId, attribution: 'test' };
  }

  async search(query: string): Promise<SearchOutcome> {
    this.queries.push(query);
    return this.outcome;
  }

  async reverse(): Promise<PlaceLookupOutcome<PlaceCandidate | null>> {
    return { status: 'OK', value: null, fromCache: false };
  }
}

const found = (...results: PlaceCandidate[]): SearchOutcome => ({
  status: 'OK',
  value: results,
  fromCache: false,
});

const bridgeOver = (port: TransportPlaceSearchPort): SiteIntakePlaceSearchBridge =>
  new SiteIntakePlaceSearchBridge(new TransportPlaceService(port));

const searchChoice = (
  label: string,
  point: GeoPoint,
  query = 'kho dinh vu',
): DestinationChoiceBody => ({
  kind: 'PLACE_SEARCH',
  query,
  label,
  latitude: point.latitude,
  longitude: point.longitude,
});

/** Nguyen loi mien — de khang dinh ca LOAI loi (-> ma HTTP) lan ma ly do. */
const domainErrorOf = async (work: Promise<unknown>): Promise<TransportDomainError> => {
  try {
    await work;
  } catch (error) {
    if (error instanceof TransportDomainError) return error;
    throw error;
  }
  throw new Error('khong nem loi nao ca');
};

describe('SiteIntakePlaceSearchBridge.choiceOf — #398', () => {
  describe('KNOWN_PLACE', () => {
    it('chi chuyen placeId di tiep, KHONG goi tim kiem: nhan + toa do do may chu doc tu hang rao', async () => {
      const port = new ScriptedPlaceSearch(found(KHO_B));

      const choice = await bridgeOver(port).choiceOf({ kind: 'KNOWN_PLACE', placeId: 'fence-9' });

      expect(choice).toEqual({ kind: 'KNOWN_PLACE', placeId: 'fence-9' });
      // Khong co truong nhan/toa do nao cua may khach di qua cau noi o nhanh nay.
      expect(Object.keys(choice).sort()).toEqual(['kind', 'placeId']);
      expect(port.queries).toEqual([]);
    });

    it('van chuyen tiep khi tim kiem dang TAT — dia diem da biet khong phu thuoc nha cung cap', async () => {
      const choice = await bridgeOver(new UnconfiguredPlaceSearchAdapter()).choiceOf({
        kind: 'KNOWN_PLACE',
        placeId: 'fence-9',
      });

      expect(choice).toEqual({ kind: 'KNOWN_PLACE', placeId: 'fence-9' });
    });
  });

  describe('PLACE_SEARCH — may chu tim LAI roi doi chieu', () => {
    it('cung nhan + cung toa do -> VERIFIED_SEARCH mang su that CUA MAY CHU, tim lai DUNG chuoi cua may khach', async () => {
      const port = new ScriptedPlaceSearch(found(KHO_C, KHO_B));

      const choice = await bridgeOver(port).choiceOf(
        searchChoice(KHO_B.label, KHO_B.point, 'kho b hai phong'),
      );

      expect(choice).toEqual({
        kind: 'VERIFIED_SEARCH',
        destination: {
          label: KHO_B.label,
          point: KHO_B.point,
          source: 'PLACE_SEARCH',
          ref: null,
        },
      });
      expect(port.queries).toEqual(['kho b hai phong']);
    });

    it('lech duoi mot met (lam tron o may khach) -> van khop, nhung toa do ghi la toa do CUA MAY CHU', async () => {
      const port = new ScriptedPlaceSearch(found(KHO_B));
      // 1e-6 do vi do ~ 0,11 m.
      const rounded = {
        latitude: KHO_B.point.latitude + 1e-6,
        longitude: KHO_B.point.longitude - 1e-6,
      };

      const choice = await bridgeOver(port).choiceOf(searchChoice(KHO_B.label, rounded));

      expect(choice.kind).toBe('VERIFIED_SEARCH');
      if (choice.kind !== 'VERIFIED_SEARCH') throw new Error('khong khop');
      expect(choice.destination.point).toEqual(KHO_B.point);
      expect(choice.destination.point).not.toEqual(rounded);
    });

    it.each([
      [
        'toa do bia (~1 km) du nhan dung',
        KHO_B.label,
        { latitude: KHO_B.point.latitude + 0.01, longitude: KHO_B.point.longitude },
      ],
      [
        'toa do lech ~2 m du nhan dung',
        KHO_B.label,
        { latitude: KHO_B.point.latitude + 2e-5, longitude: KHO_B.point.longitude },
      ],
      ['nhan bia du toa do dung', 'Kho cua toi', KHO_B.point],
      ['nhan cua mot ket qua, toa do cua ket qua kia', KHO_B.label, KHO_C.point],
      ['nhan chi khac hoa thuong', KHO_B.label.toUpperCase(), KHO_B.point],
    ] as const)('%s -> SITE_INTAKE_DESTINATION_UNVERIFIED (400)', async (_label, label, point) => {
      const port = new ScriptedPlaceSearch(found(KHO_B, KHO_C));

      const error = await domainErrorOf(bridgeOver(port).choiceOf(searchChoice(label, point)));

      expect(error.reason).toBe('SITE_INTAKE_DESTINATION_UNVERIFIED');
      expect(error.kind).toBe('INVALID');
      expect(port.queries).toHaveLength(1);
    });

    it('tim lai khong ra ket qua nao -> UNVERIFIED, khong roi ve toa do cua may khach', async () => {
      const port = new ScriptedPlaceSearch(found());

      const error = await domainErrorOf(
        bridgeOver(port).choiceOf(searchChoice(KHO_B.label, KHO_B.point)),
      );

      expect(error.reason).toBe('SITE_INTAKE_DESTINATION_UNVERIFIED');
    });

    it('ket qua cua MOT chuoi tim khac khong mang sang duoc: may chu chi tim bang chuoi gui kem', async () => {
      // Chuoi "kho c" chi ra Kho C; may khach gui kem nhan + toa do cua Kho B (lay tu lan tim truoc).
      const port = new ScriptedPlaceSearch(found(KHO_C));

      const error = await domainErrorOf(
        bridgeOver(port).choiceOf(searchChoice(KHO_B.label, KHO_B.point, 'kho c')),
      );

      expect(error.reason).toBe('SITE_INTAKE_DESTINATION_UNVERIFIED');
      expect(port.queries).toEqual(['kho c']);
    });
  });

  describe('PLACE_SEARCH — tim kiem khong dung duoc', () => {
    it('nha cung cap chua bat (DISABLED) -> SITE_INTAKE_DESTINATION_SEARCH_UNAVAILABLE (409)', async () => {
      const error = await domainErrorOf(
        bridgeOver(new UnconfiguredPlaceSearchAdapter()).choiceOf(
          searchChoice(KHO_B.label, KHO_B.point),
        ),
      );

      expect(error.reason).toBe('SITE_INTAKE_DESTINATION_SEARCH_UNAVAILABLE');
      expect(error.kind).toBe('CONFLICT');
    });

    it.each([
      ['DISABLED', 'PROVIDER_NOT_APPROVED_FOR_CUSTOMER_DATA'],
      ['BUSY', 'PROVIDER_BUSY'],
      ['UNAVAILABLE', 'PROVIDER_RATE_LIMITED'],
      ['UNAVAILABLE', 'PROVIDER_UNAVAILABLE'],
    ] as const)(
      'tim kiem %s (%s) -> SEARCH_UNAVAILABLE, KHONG tin nhan + toa do may khach gui kem',
      async (status, reason) => {
        const port = new ScriptedPlaceSearch({ status, reason });

        const error = await domainErrorOf(
          bridgeOver(port).choiceOf(searchChoice(KHO_B.label, KHO_B.point)),
        );

        expect(error.reason).toBe('SITE_INTAKE_DESTINATION_SEARCH_UNAVAILABLE');
        expect(port.queries).toHaveLength(1);
      },
    );
  });

  describe('(0, 0) — "Null Island" khong bao gio thanh diem giao', () => {
    it('may khach gui (0, 0) kem nhan cua mot ket qua that -> UNVERIFIED', async () => {
      const port = new ScriptedPlaceSearch(found(KHO_B));

      const error = await domainErrorOf(
        bridgeOver(port).choiceOf(searchChoice(KHO_B.label, { latitude: 0, longitude: 0 })),
      );

      expect(error.reason).toBe('SITE_INTAKE_DESTINATION_UNVERIFIED');
    });

    it('nha cung cap tra mot dong (0, 0) -> tang parse #379 bo dong do, (0, 0) gui len van bi tu choi', async () => {
      // Than phan hoi THO cua Nominatim — dong thu hai la mot toa do chua dinh vi (chuoi "0").
      const raw = [
        { name: KHO_B.label, display_name: KHO_B.address, lat: '20.8456', lon: '106.7713' },
        { name: 'Dao rong', display_name: 'Dao rong, Vinh Guinea', lat: '0', lon: '0' },
      ];
      const parsed = parseNominatimSearch(raw);
      expect(parsed?.map((candidate) => candidate.label)).toEqual([KHO_B.label]);
      const port = new ScriptedPlaceSearch(found(...(parsed ?? [])));

      const error = await domainErrorOf(
        bridgeOver(port).choiceOf(searchChoice('Dao rong', { latitude: 0, longitude: 0 })),
      );

      expect(error.reason).toBe('SITE_INTAKE_DESTINATION_UNVERIFIED');
      expect(port.queries).toHaveLength(1);
    });
  });
});
