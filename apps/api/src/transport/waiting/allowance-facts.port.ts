import { Injectable } from '@nestjs/common';
import { FleetRepository } from '../fleet/fleet.repository.js';

/**
 * MOT CUA SO tu phu cap cho nhin sang ho so lai xe — CHI DOC, va co y CHI MOT CAU HOI.
 *
 * Cung khuon `TransportCheckpointCoreFacts`, va cung ly le: mien phu cap khong duoc tiem
 * `FleetRepository` truc tiep. No duoc tiem cong nay, va cong nay KHONG CO mot ham ghi nao.
 *
 * Cau hoi duy nhat: *"tai khoan dang thao tac co phai chinh lai xe nay khong"*. Cong khong tra ve
 * ten, khong tra ve so dien thoai, khong tra ve luong — chi mot ma dinh danh de so sanh. Mot cong
 * tra ve `Driver` day du se lam mien nay doc duoc ho so nhan su cua nguoi ma no dang quyet tien,
 * va khong mot cau nao trong `#279` doi dieu do.
 */
export abstract class WaitingAllowanceDriverIdentityFacts {
  /** `null` khi tai khoan nay khong noi voi mot ho so lai xe nao — truong hop THUONG GAP. */
  abstract findDriverIdByAuthUserId(authUserId: string): Promise<string | null>;
}

@Injectable()
export class WaitingAllowanceDriverIdentityFactsAdapter extends WaitingAllowanceDriverIdentityFacts {
  constructor(private readonly fleet: FleetRepository) {
    super();
  }

  async findDriverIdByAuthUserId(authUserId: string): Promise<string | null> {
    const driver = await this.fleet.findDriverByAuthUserId(authUserId);
    return driver?.id ?? null;
  }
}
