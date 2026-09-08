import { Injectable } from '@nestjs/common';
import { AssetComplianceReadService } from '../asset-compliance/asset-compliance-read.service.js';
import type { StakeholderDowntime } from './stakeholder-activity.js';

/**
 * CONG BAO DUONG cua be mat ben huu quan — TUY CHON, va chi doc (`#278` N9).
 *
 * ===========================================================================
 * MOT CONG, KHONG PHAI MOT `import` THANG.
 *
 * So ngay nghi thuoc `transport-asset-compliance`, con man hinh "Xe toi co co phan" thuoc
 * `transport-core`. Khach bat capability nay hay khong la quyet dinh cua ho, nen be mat ben huu
 * quan phai chay duoc ca hai duong.
 *
 * Cung khuon `ControlTowerCheckpointFacts` (#278 N4): lop truu tuong khai o day — phia DUNG — con
 * adapter duoc dang ky duoi capability SO HUU du lieu. Khi khach tat bao duong, adapter khong ton
 * tai, `@Optional()` cho ra `undefined`, va bang tra ve `unavailableSources` thay vi mot cot `0`
 * trong nhu that.
 *
 * Adapter goi `AssetComplianceReadService` chu khong `AssetComplianceRepository`: chi service moi
 * ap dung mui gio tenant khi dem ngay cua mot lenh sua DANG MO, va mot lan doc thang repository se
 * de ra mot con so thu hai lech mot ngay so voi man hinh Bao duong.
 */
export abstract class StakeholderMaintenanceFacts {
  /** `null` = khong doc duoc so ngay nghi cua chiec xe nay (khong phai "khong nghi ngay nao"). */
  abstract downtimeFor(vehicleId: string): Promise<StakeholderDowntime | null>;
}

@Injectable()
export class StakeholderMaintenanceFactsAdapter extends StakeholderMaintenanceFacts {
  constructor(private readonly compliance: AssetComplianceReadService) {
    super();
  }

  async downtimeFor(vehicleId: string): Promise<StakeholderDowntime | null> {
    const availability = await this.compliance.vehicleAvailability(vehicleId);
    if (!availability) return null;
    /*
     * CHEP CO DANH SACH. `availability` con mang `state` (giay to, han dang kiem) va `readiness`
     * (canh bao truoc khi dieu xe) — hai thu do la viec cua nguoi van hanh, khong phai cua mot
     * nguoi gop von. Lay nguyen `availability` ra ngoai se day ca hai len man hinh co dong.
     */
    return {
      workOrderDays: availability.downtime.totalDays,
      openWorkOrderCount: availability.downtime.openSpanCount,
    };
  }
}
