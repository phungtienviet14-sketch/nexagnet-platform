import { Injectable } from '@nestjs/common';
import {
  ControlTowerSiteIntakeFacts,
  type ControlTowerSiteIntakeFact,
} from '../control-tower/control-tower-facts.port.js';
import {
  PlanningPendingWorkSource,
  type PendingVehicleWork,
} from '../planning/planning-pending-work.port.js';
import { SiteIntakeReviewService } from './site-intake-review.service.js';

/**
 * HAI CUA SO cua `transport-site-intake` vao `transport-core` — dang ky o TANG UNG DUNG
 * (`app-composition.ts`), CHI khi capability nay bat. Ca hai CHI DOC, va ca hai doc qua CUNG
 * `SiteIntakeReviewService` — mot ham phan xu, mot nguon su that.
 *
 * Tiem `SiteIntakeReviewService` (duoc `TransportSiteIntakeModule` EXPORT), khong tiem kho: mot
 * adapter o goc ma tiem mot provider noi bo cua module se lam tien trinh api chet luc khoi dong.
 */

/** Hang "Can xu ly" cua thap dieu hanh: viec tai xe nhan truc tiep chua du dieu kien tao don. */
@Injectable()
export class SiteIntakeControlTowerFacts extends ControlTowerSiteIntakeFacts {
  constructor(private readonly reviews: SiteIntakeReviewService) {
    super();
  }

  listPendingReview(): Promise<readonly ControlTowerSiteIntakeFact[]> {
    return this.reviews.listNeedsReview();
  }
}

/** Lap ke hoach hoi: xe nay co dang giu mot viec tai xe nhan truc tiep chua co don khong. */
@Injectable()
export class SiteIntakePlanningPendingWorkSource extends PlanningPendingWorkSource {
  constructor(private readonly reviews: SiteIntakeReviewService) {
    super();
  }

  pendingIntakeForVehicle(vehicleId: string): Promise<PendingVehicleWork | null> {
    return this.reviews.pendingIntakeForVehicle(vehicleId);
  }
}
