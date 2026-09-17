import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { assertBusinessDate, businessDateDifferenceInDays } from '../business-date.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { firstIssue } from '../transport.schemas.js';
import {
  FuelConsumptionReadService,
  type FuelVehicleConsumption,
} from './fuel-consumption.service.js';

/**
 * Mot drill-down la mot KY de soi, khong phai mot ban xuat ca nam. 92 ngay (tinh ca hai dau) du
 * cho mot quy; dai hon thi dung man xuat bao cao.
 */
export const FUEL_CONSUMPTION_MAX_SPAN_DAYS = 92;

const isRealBusinessDate = (value: string): boolean => {
  try {
    assertBusinessDate(value);
    return true;
  } catch {
    return false;
  }
};

const businessDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'ngay nghiep vu phai co dang YYYY-MM-DD')
  .refine(isRealBusinessDate, 'ngay nghiep vu khong co that');

/**
 * `from`/`to` BAT BUOC va sai thi 400 — khac hop thu (`catch(null)`).
 *
 * Hop thu roi ve "khong loc" van la mot man hinh dung. Drill-down thi khong co mac dinh trung thuc:
 * doan mot khoang ngay se tra ve mot chuoi km cua mot ky ma nguoi hoi khong he hoi.
 *
 * Khong `.strict()`: query string that mang theo tham so cua tang khac.
 *
 * `superRefine` co CANH GAC thay vi hai `.refine` noi tiep: loi `refine` cua tung truong KHONG chan
 * zod chay tiep phep kiem cua ca object, nen mot `?from=01/09/2026` se di thang vao
 * `businessDateDifferenceInDays` va nem mot `BusinessDateError` tho — tuc mot 500 thay cho mot 400.
 */
const vehicleConsumptionQuerySchema = z
  .object({ from: businessDate, to: businessDate })
  .superRefine(({ from, to }, context) => {
    // Truong hong da co loi rieng cua no; khong tinh khoang tren mot ngay khong co that.
    if (!isRealBusinessDate(from) || !isRealBusinessDate(to)) return;
    if (from > to) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'ngay bat dau phai truoc hoac bang ngay ket thuc',
        path: ['to'],
      });
      return;
    }
    if (businessDateDifferenceInDays(from, to) + 1 > FUEL_CONSUMPTION_MAX_SPAN_DAYS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `khoang ngay toi da ${FUEL_CONSUMPTION_MAX_SPAN_DAYS} ngay`,
        path: ['to'],
      });
    }
  });

/**
 * DRILL-DOWN TIEU HAO NHIEN LIEU theo XE / KY — `#313`.
 *
 * CHI MOT route `GET`, va quyen la `transport.fuel.entry.read` — KHONG mot ma moi: day la cung du
 * lieu ma `GET entries` va `GET trips/:tripId/entries` da tra ve, chi khac CACH HOI. Lai xe (`SALE`)
 * khong co ma nay, nen chuoi km cua ca doi khong mo ra tren be mat lai xe.
 *
 * Mot controller RIENG thay vi them route vao `FuelEntriesController`: cua vao theo XE la mot khung
 * nhin doc khac cua vao theo PHIEU, va de ca seam moi nam tron trong nhung tep moi cua no.
 */
@Controller('transport/fuel')
@UseGuards(TransportActionGuard)
export class FuelConsumptionController {
  constructor(private readonly consumption: FuelConsumptionReadService) {}

  @Get('vehicles/:vehicleId/consumption')
  @RequiresTransportAction('transport.fuel.entry.read')
  async vehicleConsumption(
    @Param('vehicleId') vehicleId: string,
    @Query() query: unknown,
  ): Promise<FuelVehicleConsumption> {
    const parsed = vehicleConsumptionQuerySchema.safeParse(query ?? {});
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));

    try {
      return await this.consumption.vehicleConsumption({ vehicleId, ...parsed.data });
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
