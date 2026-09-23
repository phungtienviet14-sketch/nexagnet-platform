import { Injectable } from '@nestjs/common';
import { CounterpartySiteService } from '../counterparty/site.service.js';
import { GeofenceRepository } from '../proof/geofence.repository.js';
import { buildKnownPlaces, type KnownSiteName } from './known-places.js';
import type { KnownPlace } from './place-search.types.js';

/**
 * CUA SO CHI DOC vao so hang rao — thuoc `transport-proof`, doc tu `transport-core`.
 *
 * Man tao don thuoc `transport-core`; so hang rao thuoc `transport-proof`. Cung khuon
 * `DispatchLocationFacts`: cong nay la TUY CHON, adapter chi duoc dang ky khi khach bat
 * `transport-proof`, va `TransportPlaceService` tiem no bang `@Optional()`. Vang mat thi man hinh
 * noi "chua co so dia diem da biet" — dung, chu khong phai "khong co dia diem nao".
 *
 * Khong mot ham ghi nao: `NO_CROSS_CONTEXT_REPOSITORY_WRITE` duoc dat bang CAU TRUC.
 */
export abstract class KnownPlacesFacts {
  abstract listKnownPlaces(): Promise<readonly KnownPlace[]>;
}

/**
 * Tiem hai token DUOC EXPORT: `GeofenceRepository` (tu `TransportProofModule`) va
 * `CounterpartySiteService` (tu `TransportModule`). Adapter dang ky o GOC chi thay danh sach
 * export — mot provider noi bo o day se lam tien trinh api chet luc khoi dong (da xay ra that).
 */
@Injectable()
export class KnownPlacesFactsAdapter extends KnownPlacesFacts {
  constructor(
    private readonly geofences: GeofenceRepository,
    private readonly sites: CounterpartySiteService,
  ) {
    super();
  }

  async listKnownPlaces(): Promise<readonly KnownPlace[]> {
    const fences = await this.geofences.listActive();
    const siteIds = fences.flatMap((fence) =>
      fence.subjectKind === 'COUNTERPARTY_SITE' && fence.subjectId !== null
        ? [fence.subjectId]
        : [],
    );
    // Mot lan doc theo lo cho moi dia diem, khong N lan — xem `CounterpartySiteService.activeViews`.
    const views = siteIds.length === 0 ? [] : await this.sites.activeViews([...new Set(siteIds)]);
    const sitesById = new Map<string, KnownSiteName>(
      views.map((view) => [
        view.site.id,
        { siteName: view.site.name, counterpartyName: view.counterpartyName },
      ]),
    );
    return buildKnownPlaces(fences, sitesById);
  }
}
