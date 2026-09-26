import { Injectable } from '@nestjs/common';
import { TransportPlaceService } from '../places/place.service.js';
import type { PlaceSearchResponse } from '../places/place-search.types.js';
import { TransportDomainError } from '../transport.errors.js';
import type { DestinationChoice } from './site-intake-commercial.service.js';
import { samePoint } from './site-intake-commercial.service.js';
import type { DestinationChoiceBody } from './site-intake.schemas.js';

/**
 * CAU NOI toi tim dia diem cua #379 — dang ky o TANG UNG DUNG (`app-composition.ts`) vi
 * `TransportPlaceService` la mot provider o goc, khong nam trong module nao ma
 * `TransportSiteIntakeModule` import duoc.
 *
 * Viec DUY NHAT no lam ngoai viec chuyen tiep: bien mot ket qua tim ma may khach GUI LAI thanh su
 * that vi tri do MAY CHU doc. Tim LAI dung chuoi (tu bo nho dem cua chinh `TransportPlaceService`),
 * chi nhan ket qua co CUNG nhan va CUNG toa do. May khach sua mot toa do truoc khi gui thi khong
 * con khop, va lenh bi tu choi — khong co duong nao de mot cap so tu do thanh diem giao cua don.
 */
@Injectable()
export class SiteIntakePlaceSearchBridge {
  constructor(private readonly places: TransportPlaceService) {}

  search(query: string): Promise<PlaceSearchResponse> {
    return this.places.search(query);
  }

  async choiceOf(body: DestinationChoiceBody): Promise<DestinationChoice> {
    if (body.kind === 'KNOWN_PLACE') return { kind: 'KNOWN_PLACE', placeId: body.placeId };

    const found = await this.places.search(body.query);
    if (found.status !== 'OK') {
      throw TransportDomainError.conflict(
        'SITE_INTAKE_DESTINATION_SEARCH_UNAVAILABLE',
        'Tim dia diem dang tat hoac ban — chon trong danh sach dia diem da biet',
      );
    }
    const hit = found.results.find(
      (result) =>
        result.label === body.label &&
        samePoint(result.point, { latitude: body.latitude, longitude: body.longitude }),
    );
    if (!hit) {
      throw TransportDomainError.invalid(
        'SITE_INTAKE_DESTINATION_UNVERIFIED',
        'Ket qua tim gui len khong khop ket qua tim cua may chu — tim lai roi chon',
      );
    }
    return {
      kind: 'VERIFIED_SEARCH',
      destination: { label: hit.label, point: hit.point, source: 'PLACE_SEARCH', ref: null },
    };
  }
}
