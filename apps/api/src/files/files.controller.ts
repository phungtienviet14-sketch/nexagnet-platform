import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Roles } from '../auth/roles.decorator.js';
import type { AuthenticatedRequest } from '../auth/session.types.js';
import { requireFileAuthUserId, type UploadedPlatformFile } from './file-http.js';
import { fileErrorToHttp } from './file.errors.js';
import {
  toFileDescriptor,
  toFileLinkDescriptor,
  type FileDescriptor,
  type FileLinkDescriptor,
} from './file.dto.js';
import { FilePurgeService } from './file-purge.service.js';
import {
  firstFileIssue,
  legalHoldSchema,
  linkFileSchema,
  uploadFileSchema,
  withdrawFileSchema,
} from './file.schemas.js';
import { FileService } from './file.service.js';

/**
 * BE MAT HTTP cua nen tang tep — `#287` P1/P2/P6.
 *
 * ============================================================================================
 * CONG O DAY LA `@Roles`, CONG THAT SU LA MIEN
 * ============================================================================================
 *
 * Bon vai duoi day khong quyet dinh ai doc duoc tep nao. Chung chi tra loi "co phai mot nguoi da
 * dang nhap khong" — con "nguoi nay co duoc xem TO NAY khong" la cau ma `FileAuthorizationService`
 * hoi lai mien so huu.
 *
 * `#287` P6 cam *"broaden current role/action tables"*, va o day khong mot ma quyen moi nao duoc
 * them: khong `transport.*`, khong bang hanh dong moi. Tep gan vao mot chung tu van tai van duoc
 * gac boi dung cai quyen ma Lane O da dat cho chung tu do.
 *
 * ============================================================================================
 * KHONG MOT TUYEN NAO NHAN MOT DINH VI
 * ============================================================================================
 *
 * Moi tuyen nhan `:fileId` — mot ma DUC. Khong tuyen nao nhan `key`, `path` hay `bucket`, va khong
 * tuyen nao TRA ve chung: `toFileDescriptor()` la cua duy nhat ra ngoai.
 */
@Controller('files')
export class FilesController {
  constructor(
    private readonly files: FileService,
    private readonly purge: FilePurgeService,
  ) {}

  /**
   * TAI MOT TEP LEN.
   *
   * `@Throttle` chat hon mac dinh toan cuc: mot duong nhan byte la duong dat nhat cua he thong, va
   * mot vong lap tai len khong bi chan se lam day kho truoc khi lam day log. Cung con so ma
   * `DriverFuelEvidenceController` dung.
   *
   * `FileInterceptor('file')` BAT BUOC di cung `@UploadedFile`: khong co no, than `multipart` khong
   * duoc phan tich va `@Body()` ra `undefined` — mot lan hong IM LANG (khong loi build, khong test
   * do) da xay ra that o `#169`.
   */
  @Post()
  @Roles('SALE', 'MANAGER', 'ACCOUNTING', 'ADMIN')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file: UploadedPlatformFile | undefined,
    @Body() body: unknown,
  ): Promise<FileDescriptor> {
    const authUserId = requireFileAuthUserId(request);
    if (!file) throw new BadRequestException('Thieu tep: gui multipart voi truong "file"');

    const parsed = uploadFileSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstFileIssue(parsed.error));

    return this.guard(async () =>
      toFileDescriptor(
        await this.files.upload({
          bytes: file.buffer,
          purpose: parsed.data.purpose,
          // Ten goc duoc GIU LAI de doi chieu, nhung khong bao gio thanh duong dan va khong bao gio
          // di nguyen ven ra ngoai — xem `safeFilename()`.
          originalFilename: file.originalname,
          declaredMimeType: file.mimetype,
          createdBy: authUserId,
        }),
      ),
    );
  }

  @Get(':fileId')
  @Roles('SALE', 'MANAGER', 'ACCOUNTING', 'ADMIN')
  describe(
    @Req() request: AuthenticatedRequest,
    @Param('fileId') fileId: string,
  ): Promise<FileDescriptor> {
    const authUserId = requireFileAuthUserId(request);
    return this.guard(async () =>
      toFileDescriptor(await this.files.describeFor(fileId, authUserId)),
    );
  }

  /**
   * TRA BYTE.
   *
   * Bon header duoi day la cung bo ma `sendEvidence()` dat, va khong phai cho trang tri:
   *
   *   · `nosniff`  — mot tep duoc trinh duyet doan thanh HTML la mot duong XSS;
   *   · `sandbox`  — bang chung khong duoc chay nhu mot trang, ke ca khi mot loai tep moi lot qua
   *     danh sach trang sau nay;
   *   · `no-store` — tep la PII: khong cache o proxy chung, khong luu ra dia trinh duyet;
   *   · `Content-Disposition: inline` voi TEN DA CHUAN HOA — khong bao gio ten goc cua nguoi dung.
   */
  @Get(':fileId/content')
  @Roles('SALE', 'MANAGER', 'ACCOUNTING', 'ADMIN')
  async content(
    @Req() request: AuthenticatedRequest,
    @Param('fileId') fileId: string,
    @Res() response: Response,
  ): Promise<void> {
    const authUserId = requireFileAuthUserId(request);
    const result = await this.guard(() => this.files.read(fileId, authUserId));

    response.setHeader('Content-Type', result.blob.contentType);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(result.file.safeFilename)}"`,
    );
    response.end(result.blob.body);
  }

  @Post(':fileId/links')
  @Roles('SALE', 'MANAGER', 'ACCOUNTING', 'ADMIN')
  link(
    @Req() request: AuthenticatedRequest,
    @Param('fileId') fileId: string,
    @Body() body: unknown,
  ): Promise<FileLinkDescriptor> {
    const authUserId = requireFileAuthUserId(request);
    const parsed = linkFileSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstFileIssue(parsed.error));

    return this.guard(async () =>
      toFileLinkDescriptor(
        await this.files.link({
          fileId,
          businessOwnerType: parsed.data.businessOwnerType,
          businessOwnerId: parsed.data.businessOwnerId,
          purpose: parsed.data.purpose,
          authUserId,
        }),
      ),
    );
  }

  @Post(':fileId/withdraw')
  @Roles('SALE', 'MANAGER', 'ACCOUNTING', 'ADMIN')
  withdraw(
    @Req() request: AuthenticatedRequest,
    @Param('fileId') fileId: string,
    @Body() body: unknown,
  ): Promise<FileDescriptor> {
    const authUserId = requireFileAuthUserId(request);
    const parsed = withdrawFileSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstFileIssue(parsed.error));

    return this.guard(async () =>
      toFileDescriptor(await this.files.withdraw(fileId, authUserId, parsed.data.reason)),
    );
  }

  /**
   * LENH GIU THEO PHAP LY — `#287` P8. CHI `ADMIN`.
   *
   * ============================================================================================
   * DAY LA BE MAT DUY NHAT O TEP NAY KHONG MO CHO CA BON VAI, VA LY DO KHAC HAN
   * ============================================================================================
   *
   * Cac tuyen kia mo cho bon vai VI cong that su la mien — mot nguoi khong co quyen tren chung tu
   * se bi tu choi du ho co vai gi. Tuyen nay thi khong co mien nao de hoi: lenh giu thuoc ve HO SO
   * LUU TRU cua ca to chuc, khong ve mot doi tuong nghiep vu cu the.
   *
   * Nen no phai tu dat lay mot cong, va cong chat nhat dang co la `ADMIN`. `#287` P6 cam NOI RONG
   * bang vai/hanh dong hien co — day khong noi rong cai nao: khong mot ma `transport.*` nao duoc
   * them, va khong vai nao nhan them quyen tren mot tai nguyen da co.
   */
  @Post(':fileId/legal-hold')
  @Roles('ADMIN')
  legalHold(
    @Req() request: AuthenticatedRequest,
    @Param('fileId') fileId: string,
    @Body() body: unknown,
  ): Promise<FileDescriptor> {
    const authUserId = requireFileAuthUserId(request);
    const parsed = legalHoldSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(firstFileIssue(parsed.error));

    return this.guard(async () =>
      toFileDescriptor(await this.purge.setLegalHold(fileId, parsed.data.hold, authUserId)),
    );
  }

  private async guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      return fileErrorToHttp(error);
    }
  }
}
