import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../../auth/session.types.js';
import { parseGeoPoint } from '../geo/geo-point.js';
import {
  RequiresTransportAction,
  TransportActionGuard,
  transportErrorToHttp,
} from '../transport-action.guard.js';
import { transportActorOf } from '../transport-actor.js';
import { TransportDomainError } from '../transport.errors.js';
import { firstIssue } from '../transport.schemas.js';
import { GeofenceRepository, toCircle, type Geofence } from './geofence.repository.js';
import { OperationalProofService } from './operational-proof.service.js';
import type { OperationalProofView } from './operational-proof.types.js';
import { registerGeofenceSchema, withdrawProofSchema } from './proof.schemas.js';
import { TRANSPORT_PROOF_POLICY, type TransportProofPolicy } from './tracking-policy.js';

/**
 * BE MAT NGUOI DUYET cua chung cu van hanh — doc, rut, va khai hang rao.
 *
 * ============================================================================================
 * BA QUYEN, KHONG PHAI MOT
 * ============================================================================================
 *
 *   · `transport.proof.read`     -> doc TOM TAT. Ke toan CO. Khong mot toa do nao di ra.
 *   · `transport.proof.withdraw` -> bia mo mot chung cu. Ke toan KHONG CO.
 *   · `transport.geofence.*`     -> doc/khai hang rao. Khai la quyen van hanh, doc thi rong hon.
 *
 * Vi sao `read` va `withdraw` khong dung chung mot ma: doc chung cu la viec doi soat hang ngay;
 * rut mot chung cu la go bo bang chung cua mot lan giao da xay ra. Va lai xe KHONG BAO GIO co
 * `withdraw`, ke ca voi chung cu cua chinh minh — mot nguoi xoa duoc bang chung cua chinh minh
 * thi cai con lai khong con la bang chung.
 *
 * ============================================================================================
 * HANG RAO DUOC CHAM LUC DOC, KHONG LUU SAN
 * ============================================================================================
 *
 * `viewsForTrip` nhan danh sach hang rao va tinh phan quyet ngay tai lan doc. Nen mot khach sua
 * ban kinh kho hom nay se thay phan quyet doi cho MOI chung cu cu, khong phai chi cho nhung
 * chung cu lap sau do. Do la hanh vi dung — va cung la ly do `transport.geofence.manage` bi tach
 * khoi ke toan: no doi duoc ket luan ve nhung lan giao da xong.
 */
@Controller('transport')
@UseGuards(TransportActionGuard)
export class ProofReviewController {
  constructor(
    private readonly proofs: OperationalProofService,
    private readonly geofences: GeofenceRepository,
    @Inject(TRANSPORT_PROOF_POLICY) private readonly policy: TransportProofPolicy,
  ) {}

  /**
   * TOM TAT chung cu cua mot chuyen — cau tra loi cho "lan giao nay co bang chung khong".
   *
   * `OperationalProofView` KHONG CO mot truong nao chua duoc toa do; do la mot tinh chat kiem duoc
   * luc bien dich, khong phai mot loi hua o day. Ai can toa do tho di qua
   * `transport.location.history.read`, va de lai mot dong o so quyet dinh.
   */
  @Get('trips/:tripId/proofs')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.proof.read')
  async forTrip(@Param('tripId') tripId: string): Promise<readonly OperationalProofView[]> {
    const fences = await this.geofences.listActive();
    return this.guard(() => this.proofs.viewsForTrip(tripId, fences.map(toCircle)));
  }

  @Post('proofs/:proofId/withdraw')
  @Roles('ADMIN')
  @RequiresTransportAction('transport.proof.withdraw')
  async withdraw(
    @Req() request: AuthenticatedRequest,
    @Param('proofId') proofId: string,
    @Body() body: unknown,
  ): Promise<{ id: string; withdrawnAt: Date | null; withdrawnBy: string | null }> {
    const parsed = withdrawProofSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));

    // `transportActorOf` la nguon DUY NHAT cua "ai da rut" — no khong bao gio doc mot header.
    const actorId = transportActorOf(request);
    const withdrawn = await this.guard(() =>
      this.proofs.withdraw({ proofId, actorId, reason: parsed.data.reason }),
    );
    return {
      id: withdrawn.id,
      withdrawnAt: withdrawn.withdrawnAt,
      withdrawnBy: withdrawn.withdrawnBy,
    };
  }

  @Get('geofences')
  @Roles('ACCOUNTING', 'ADMIN')
  @RequiresTransportAction('transport.geofence.read')
  list(): Promise<readonly Geofence[]> {
    return this.guard(() => this.geofences.listActive());
  }

  @Post('geofences')
  @Roles('ADMIN')
  @RequiresTransportAction('transport.geofence.manage')
  async register(@Req() request: AuthenticatedRequest, @Body() body: unknown): Promise<Geofence> {
    const parsed = registerGeofenceSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstIssue(parsed.error));
    const input = parsed.data;

    // Cung phep kiem bien voi duong ingest — mot tam hang rao o (0,0) la mot hang rao bao moi diem
    // tren the gioi deu "o ngoai", va no se im lang lam viec do mai mai.
    const centre = parseGeoPoint(input.latitude, input.longitude);
    if (!centre.ok) {
      throw TransportDomainError.invalid(
        'GEOFENCE_COORDINATE_REJECTED',
        `Toa do tam hang rao khong hop le: ${centre.rejection}`,
      );
    }
    if (
      input.radiusMetres < this.policy.geofenceRadiusMetres.min ||
      input.radiusMetres > this.policy.geofenceRadiusMetres.max
    ) {
      throw TransportDomainError.invalid(
        'GEOFENCE_RADIUS_OUT_OF_RANGE',
        `Ban kinh phai trong khoang ${this.policy.geofenceRadiusMetres.min}-${this.policy.geofenceRadiusMetres.max}m`,
      );
    }
    // `AD_HOC` phai KHONG co chu the; moi loai khac phai CO. Mot hang rao "cua kho nao do" khong
    // noi duoc no thuoc kho nao la mot hang rao khong doi chieu duoc voi bat ky don hang nao.
    const wantsSubject = input.subjectKind !== 'AD_HOC';
    if (wantsSubject !== Boolean(input.subjectId)) {
      throw TransportDomainError.invalid(
        'GEOFENCE_SUBJECT_SHAPE_INVALID',
        wantsSubject
          ? `Hang rao loai ${input.subjectKind} bat buoc co chu the`
          : 'Hang rao AD_HOC khong duoc gan chu the',
      );
    }

    return this.guard(() =>
      this.geofences.register({
        label: input.label,
        subjectKind: input.subjectKind,
        subjectId: input.subjectId ?? null,
        latitude: centre.point.latitude,
        longitude: centre.point.longitude,
        radiusMetres: input.radiusMetres,
        note: input.note ?? null,
        recordedBy: transportActorOf(request),
      }),
    );
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return transportErrorToHttp(error);
    }
  }
}
