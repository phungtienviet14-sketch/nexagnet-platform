import { BadRequestException, ConflictException, HttpStatus, RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ROLES_KEY } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import { TransportPlaceService } from '../places/place.service.js';
import { TransportPlaceSearchPort } from '../places/place-search.port.js';
import {
  OPENSTREETMAP_ATTRIBUTION,
  type KnownPlace,
  type PlaceCandidate,
  type PlaceLookupOutcome,
  type PlaceSearchAvailability,
} from '../places/place-search.types.js';
import { TRANSPORT_ACTION_KEY } from '../transport-action.guard.js';
import { roleCanPerform } from '../transport-actions.js';
import type {
  CommercialOutcome,
  OfficeCompleteCommand,
  SiteIntakeCommercialService,
} from './site-intake-commercial.service.js';
import { SiteIntakePlaceSearchBridge } from './site-intake-place-search.bridge.js';
import { SiteIntakeReviewController } from './site-intake-review.controller.js';
import type { SiteIntakeReviewService } from './site-intake-review.service.js';

/**
 * BE MAT VAN PHONG chon diem giao (`#398` §6, override D): van phong tim theo ten qua CUNG cau noi
 * ma lenh `complete` dung de tim lai + doi chieu. Bai nay chung minh ba dieu:
 *
 *   1. tuyen tim chuyen DUNG chuoi da cat khoang trang toi cung dich vu tim dia diem (#379), va than
 *      sai bi 400 truoc khi goi nha cung cap;
 *   2. mot ket qua van phong vua tim, gui NGUYEN VAN vao `complete`, qua duoc doi chieu cua may chu;
 *      sua mot toa do thi khong qua;
 *   3. quyen/thu tu tuyen: ADMIN + ACCOUNTING, `.review.complete`, khai truoc `GET :intakeId`.
 */

const HIT: PlaceCandidate = {
  label: 'Cảng Đình Vũ, Hải Phòng',
  address: 'Đình Vũ, Hải An, Hải Phòng',
  point: { latitude: 20.8264, longitude: 106.7752 },
};

const KNOWN: KnownPlace = {
  id: 'fence-1',
  kind: 'CUSTOMER',
  name: 'Kho Đình Vũ',
  detail: null,
  point: { latitude: 20.83, longitude: 106.77 },
  radiusMetres: 150,
};

class RecordingProvider extends TransportPlaceSearchPort {
  readonly providerId = 'nominatim';
  readonly queries: string[] = [];
  constructor(private readonly outcome: PlaceLookupOutcome<readonly PlaceCandidate[]>) {
    super();
  }
  describe(): PlaceSearchAvailability {
    return { available: true, providerId: this.providerId, attribution: OPENSTREETMAP_ATTRIBUTION };
  }
  async search(query: string): Promise<PlaceLookupOutcome<readonly PlaceCandidate[]>> {
    this.queries.push(query);
    return this.outcome;
  }
  async reverse(): Promise<PlaceLookupOutcome<PlaceCandidate | null>> {
    return { status: 'OK', value: HIT, fromCache: false };
  }
}

const OUTCOME: CommercialOutcome = {
  intakeId: 'intake-1',
  status: 'PENDING',
  readiness: { kind: 'NEEDS_REVIEW', reasons: ['ORIGIN_LOCATION_UNVERIFIED'] },
  orderId: null,
  orderCode: null,
  bindingMode: null,
  bound: false,
  replayed: false,
};

function world(
  outcome: PlaceLookupOutcome<readonly PlaceCandidate[]> = {
    status: 'OK',
    value: [HIT],
    fromCache: false,
  },
) {
  const provider = new RecordingProvider(outcome);
  const completes: OfficeCompleteCommand[] = [];
  let knownCalls = 0;
  const commercial = {
    async knownDestinations() {
      knownCalls += 1;
      return { available: true as const, places: [KNOWN] };
    },
    async completeAsOffice(command: OfficeCompleteCommand) {
      // Dich vu that goi ham lua chon khi phai ghi — gia lap dung dieu do.
      const choice = typeof command.choice === 'function' ? await command.choice() : command.choice;
      completes.push({ ...command, ...(choice === undefined ? {} : { choice }) });
      return OUTCOME;
    },
  };
  const reviews = {
    async detail(intakeId: string) {
      return { intakeId };
    },
  };
  const controller = new SiteIntakeReviewController(
    reviews as unknown as SiteIntakeReviewService,
    commercial as unknown as SiteIntakeCommercialService,
    new SiteIntakePlaceSearchBridge(new TransportPlaceService(provider)),
  );
  return { controller, provider, completes, knownCalls: () => knownCalls };
}

/** Khoa metadata cua `@HttpCode` (`@nestjs/common/constants` `HTTP_CODE_METADATA`). */
const HTTP_CODE_METADATA = '__httpCode__';

const ACCOUNTANT = { authUser: { username: 'ke-toan' } } as unknown as AuthenticatedRequest;

describe('van phong tim diem giao — chuyen tiep toi dung cau noi #379', () => {
  it('gui DUNG chuoi da cat khoang trang, tra 200 co kieu', async () => {
    const { controller, provider } = world();

    const response = await controller.searchDestinations({ query: '  Đình Vũ  ' });

    expect(provider.queries).toEqual(['Đình Vũ']);
    expect(response).toEqual({
      status: 'OK',
      reason: null,
      results: [HIT],
      attribution: OPENSTREETMAP_ATTRIBUTION,
      fromCache: false,
    });
  });

  it('tat / ban -> van la than 200 voi trang thai, khong nem', async () => {
    const { controller } = world({ status: 'DISABLED', reason: 'PROVIDER_UNCONFIGURED' });

    expect(await controller.searchDestinations({ query: 'Dinh Vu' })).toEqual({
      status: 'DISABLED',
      reason: 'PROVIDER_UNCONFIGURED',
      results: [],
      attribution: null,
      fromCache: false,
    });
  });

  it('than sai (ngan, rong, khoa la, toa do tu do) -> 400, KHONG goi nha cung cap', () => {
    const { controller, provider } = world();

    for (const body of [
      { query: 'x' },
      { query: '   ' },
      undefined,
      {},
      { query: 'x'.repeat(201) },
      { query: 'Dinh Vu', customerId: 'KH02' },
      { query: 'Dinh Vu', latitude: 20.8, longitude: 106.7 },
    ]) {
      expect(() => controller.searchDestinations(body)).toThrow(BadRequestException);
    }
    expect(provider.queries).toEqual([]);
  });

  it('dia diem da biet: doc tu CUNG nguon doi chieu cua lenh complete', async () => {
    const { controller, knownCalls } = world();

    expect(await controller.destinations()).toEqual({ available: true, places: [KNOWN] });
    expect(knownCalls()).toBe(1);
  });
});

describe('ket qua tim -> complete: may chu tim LAI va doi chieu', () => {
  it('gui NGUYEN VAN mot ket qua vua tim -> lenh nhan diem giao DA XAC THUC', async () => {
    const { controller, completes, provider } = world();
    const found = await controller.searchDestinations({ query: 'Đình Vũ' });
    const hit = found.results[0]!;

    const response = await controller.complete(ACCOUNTANT, 'intake-1', {
      idempotencyKey: 'k-1',
      destination: {
        kind: 'PLACE_SEARCH',
        query: 'Đình Vũ',
        label: hit.label,
        latitude: hit.point.latitude,
        longitude: hit.point.longitude,
      },
    });

    expect(response).toEqual({ outcome: OUTCOME, intake: { intakeId: 'intake-1' } });
    expect(provider.queries).toEqual(['Đình Vũ', 'Đình Vũ']);
    expect(completes).toHaveLength(1);
    expect(completes[0]).toMatchObject({
      actor: 'ke-toan',
      intakeId: 'intake-1',
      idempotencyKey: 'k-1',
      choice: {
        kind: 'VERIFIED_SEARCH',
        destination: { label: HIT.label, point: HIT.point, source: 'PLACE_SEARCH', ref: null },
      },
    });
  });

  it('sua mot toa do truoc khi gui -> 400 SITE_INTAKE_DESTINATION_UNVERIFIED, khong ghi', async () => {
    const { controller, completes } = world();

    const error = await controller
      .complete(ACCOUNTANT, 'intake-1', {
        idempotencyKey: 'k-2',
        destination: {
          kind: 'PLACE_SEARCH',
          query: 'Đình Vũ',
          label: HIT.label,
          latitude: HIT.point.latitude + 0.01,
          longitude: HIT.point.longitude,
        },
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      reason: 'SITE_INTAKE_DESTINATION_UNVERIFIED',
    });
    expect(completes).toEqual([]);
  });

  it('tim dang tat -> complete bang ket qua tim bi 409, khong ghi', async () => {
    const { controller, completes } = world({
      status: 'DISABLED',
      reason: 'PROVIDER_UNCONFIGURED',
    });

    const error = await controller
      .complete(ACCOUNTANT, 'intake-1', {
        idempotencyKey: 'k-3',
        destination: {
          kind: 'PLACE_SEARCH',
          query: 'Đình Vũ',
          label: HIT.label,
          latitude: HIT.point.latitude,
          longitude: HIT.point.longitude,
        },
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      reason: 'SITE_INTAKE_DESTINATION_SEARCH_UNAVAILABLE',
    });
    expect(completes).toEqual([]);
  });
});

describe('quyen, gioi han va thu tu tuyen', () => {
  const proto = SiteIntakeReviewController.prototype;
  const handlers = {
    destinations: proto.destinations,
    search: proto.searchDestinations,
    complete: proto.complete,
  };

  it('y het lenh complete: ADMIN + ACCOUNTING, `.review.complete`; lai xe khong co', () => {
    for (const handler of Object.values(handlers)) {
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual(['ADMIN', 'ACCOUNTING']);
      expect(Reflect.getMetadata(TRANSPORT_ACTION_KEY, handler)).toBe(
        'transport.site_intake.review.complete',
      );
    }
    expect(roleCanPerform('ADMIN', 'transport.site_intake.review.complete')).toBe(true);
    expect(roleCanPerform('ACCOUNTING', 'transport.site_intake.review.complete')).toBe(true);
    expect(roleCanPerform('SALE', 'transport.site_intake.review.complete')).toBe(false);
  });

  it('tim: POST 200, 20/phut; dia diem da biet: GET', () => {
    expect(Reflect.getMetadata('path', handlers.search)).toBe('destinations/search');
    expect(Reflect.getMetadata('method', handlers.search)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handlers.search)).toBe(HttpStatus.OK);
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handlers.search)).toBe(20);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', handlers.search)).toBe(60_000);
    expect(Reflect.getMetadata('path', handlers.destinations)).toBe('destinations');
    expect(Reflect.getMetadata('method', handlers.destinations)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata('path', SiteIntakeReviewController)).toBe('transport/site-intakes');
  });

  /**
   * Nest dang ky tuyen theo thu tu phuong thuc tren prototype. `GET :intakeId` khai truoc se nuot
   * `GET destinations` (id = "destinations") va tra 404 thay vi danh sach.
   */
  it('`destinations` khai TRUOC `GET :intakeId`', () => {
    const order = Object.getOwnPropertyNames(proto);
    expect(Reflect.getMetadata('path', proto.detail)).toBe(':intakeId');
    expect(order.indexOf('destinations')).toBeGreaterThan(-1);
    expect(order.indexOf('destinations')).toBeLessThan(order.indexOf('detail'));
    expect(order.indexOf('searchDestinations')).toBeLessThan(order.indexOf('detail'));
  });
});
