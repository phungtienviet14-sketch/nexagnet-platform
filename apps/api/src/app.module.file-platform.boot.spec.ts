import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BOOT_SPAWN_TIMEOUT_MS, BOOT_TEST_TIMEOUT_MS } from './boot-spec-timeout.js';

const apiDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = resolve(
  apiDir,
  '../../packages/tenant/src/__tests__/fixtures/transport-checkpoint',
);

/**
 * NEN TANG TEP PHAI SONG TRONG MOT TIEN TRINH THAT — `#287`, cac muc 1..5 va 10 cua nghiem thu cuoi.
 *
 * ============================================================================================
 * VI SAO BAI NAY TON TAI, khi da co gan tram bai don vi
 * ============================================================================================
 *
 * Hai thu chi lo ra o muc TIEN TRINH, va ca hai deu la trung tam cua lane nay:
 *
 *  1. `FilesController` duoc dang ky o GOC (`app-composition.ts`), nen no CHI thay phan EXPORT cua
 *     `FilesModule`. Neu mot ngay nao do no doi sang tiem mot provider noi bo, thi `tsc` xanh, bai
 *     don vi xanh, bai composition xanh — va tien trinh chet luc khoi dong o MOI khach. Do khong
 *     phai mot gia dinh: chinh dieu do da tung xay ra voi mot adapter cua dieu hanh.
 *
 *  2. `OperationalDocumentFileAuthorizer` TU DANG KY vao so dang ky cua nen tang trong mot
 *     `useFactory`. Dieu do chi dung neu Nest that su khoi tao provider do luc boot — mot dieu
 *     KHONG bai don vi nao kiem duoc, vi chung tu tay dung lay doi tuong. Neu Nest khong khoi tao
 *     no, moi lan doc bang chung van tai se im lang tra ve "khong dung duoc ma tep do".
 *
 * ============================================================================================
 * VA NO DI HET MOT VONG NGHIEP VU THAT
 * ============================================================================================
 *
 * tai len -> ma duc -> chung tu that -> lien ket -> ke toan doc duoc -> rut -> doc hong.
 *
 * Do la dung chuoi ma `#287` P11 goi la binh dien cho Lane O, va dung sau muc dau tien cua danh
 * sach nghiem thu cuoi.
 */
describe('file platform process boot contract', () => {
  it(
    'boot Nest that, va di het mot vong bang chung van hanh qua nen tang tep',
    () => {
      const script = `
      import { NestFactory } from '@nestjs/core';
      const { AppModule } = await import('./src/app.module.ts');
      const { FilesController } = await import('./src/files/files.controller.ts');
      const { FileService } = await import('./src/files/file.service.ts');
      const { FilePurgeService } = await import('./src/files/file-purge.service.ts');
      const { FileRepository } = await import('./src/files/file.repository.ts');
      const { FileDomainAuthorizerRegistry } = await import('./src/files/file-authorization.port.ts');
      const { UserRepository } = await import('./src/auth/user.repository.ts');
      const { MovementService } = await import('./src/transport/movement/movement.service.ts');
      const { FleetService } = await import('./src/transport/fleet/fleet.service.ts');
      const { OperationalDocumentService } = await import('./src/transport/document/document.service.ts');

      const context = await NestFactory.createApplicationContext(await AppModule.forRoot(), { logger: ['error'] });
      const has = (token) => { try { context.get(token, { strict: false }); return true; } catch { return false; } };

      const files = context.get(FileService, { strict: false });
      const fileRepo = context.get(FileRepository, { strict: false });
      const registry = context.get(FileDomainAuthorizerRegistry, { strict: false });
      const users = context.get(UserRepository, { strict: false });
      const fleet = context.get(FleetService, { strict: false });
      const movement = context.get(MovementService, { strict: false });
      const documents = context.get(OperationalDocumentService, { strict: false });

      const driverUser = await users.create({
        username: 'boot-driver', name: 'Lai xe Boot', email: null, phone: null,
        passwordHash: 'x', role: 'SALE',
      });
      const accountant = await users.create({
        username: 'boot-ke-toan', name: 'Ke toan Boot', email: null, phone: null,
        passwordHash: 'x', role: 'ACCOUNTING',
      });

      const vehicle = await fleet.registerVehicle({ registrationPlate: '29H-22222', vehicleClass: 'Dau keo' }, 'boot');
      const driver = await fleet.registerDriver({
        fullName: 'Lai xe Boot', phone: '0900000002', licenceClass: 'FC',
        licenceExpiry: '2030-01-01', authUserId: driverUser.id,
      }, 'boot');
      const order = await movement.createOrder({
        code: 'ORD-FILE-1', originLabel: 'Ha Noi', destinationLabel: 'Hai Phong',
      }, 'boot');
      const run = await movement.createRun({ code: 'RUN-FILE-1', vehicleId: vehicle.id }, 'boot');
      await movement.assignRun(run.id, { driverId: driver.id }, 'boot');
      await movement.addLeg(run.id, {
        sequence: 1, kind: 'LOADED', orderId: order.id,
        originLabel: 'Ha Noi', destinationLabel: 'Hai Phong', distanceKm: 105,
      }, 'boot');
      await movement.transitionRun(run.id, 'ACTIVE', 'boot');

      // MOT TEP THAT: byte JPEG that, vi cong nhan dang noi dung la mot cong that.
      const bytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('boot')]);
      const file = await files.upload({
        bytes, purpose: 'OPERATIONAL_DOCUMENT', originalFilename: '../bien-nhan.jpg',
        declaredMimeType: 'image/jpeg', createdBy: driverUser.id,
      });

      // MOT CHUNG TU VAN HANH THAT, ghi qua chinh duong cua van hanh — khong dung kho truc tiep.
      const document = await documents.recordAsOperator({
        type: 'DELIVERY_RECEIPT', runId: run.id, basis: 'DIGITAL_FILE', fileId: file.id,
        clientEventId: 'boot-file-1', authUserId: driverUser.id,
      });

      const links = await fileRepo.activeLinksOf(file.id);
      const readByAccountant = await files.describeFor(file.id, accountant.id).then(() => 'READ_OK', (e) => e.reason);
      const withdrawByAccountant = await files.withdraw(file.id, accountant.id, 'thu rut').then(() => 'WITHDRAWN', (e) => e.reason);

      // RUT bang van hanh ('ADMIN' la vai duy nhat co ma '...document.withdraw').
      const admin = await users.create({
        username: 'boot-admin-file', name: 'Van hanh Boot', email: null, phone: null,
        passwordHash: 'x', role: 'ADMIN',
      });
      const withdrawn = await files.withdraw(file.id, admin.id, 'tai nham');
      const readAfterWithdraw = await files.describeFor(file.id, accountant.id).then(() => 'READ_OK', (e) => e.reason);

      const proof = {
        filesController: has(FilesController),
        fileService: has(FileService),
        filePurgeService: has(FilePurgeService),
        /* Nest CO khoi tao provider tu dang ky luc boot — xem khoi chu thich cua bai nay. */
        transportAuthorizerRegistered: registry.authorizerFor('TRANSPORT_OPERATIONAL_DOCUMENT') !== null,
        unknownOwnerFailsClosed: registry.authorizerFor('MIEN_KHONG_AI_DANG_KY') === null,
        /* Ma duc, doc lap voi khoa luu tru; ten hien thi da chuan hoa. */
        fileIdIsOpaque: file.id !== file.storageKey && !file.storageKey.endsWith(file.id),
        safeFilename: file.safeFilename,
        /* Lien ket nghiep vu CHUNG, tro dung vao chung tu vua ghi. */
        linkCount: links.length,
        linkOwnerType: links[0]?.businessOwnerType ?? null,
        linkPointsAtDocument: links[0]?.businessOwnerId === document.id,
        documentBasis: document.basis,
        documentHasFile: document.fileId === file.id,
        /* Ke toan DOC duoc, nhung KHONG rut duoc — '#287' P6. */
        readByAccountant,
        withdrawByAccountant,
        /* Rut xong: duong doc hieu luc dong, lich su o lai. */
        stateAfterWithdraw: withdrawn.state,
        readAfterWithdraw,
        linksAfterWithdraw: (await fileRepo.activeLinksOf(file.id)).length,
        historyKept: (await fileRepo.linksOf(file.id)).length,
      };
      await context.close();
      process.stdout.write('<<FILE_PLATFORM_BOOT_PROOF>>' + JSON.stringify(proof));
    `;

      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;
      delete env.DEEPSEEK_API_KEY;
      delete env.FLOWISE_API_KEY;
      delete env.FLOWISE_BASE_URL;
      delete env.FLOWISE_FLOW_ID;
      delete env.ZALO_BOT_TOKEN;
      delete env.TENANT;
      env.TENANT_DIR = fixtureDir;
      env.PERSISTENCE = 'memory';
      // Kho byte BAT — mac dinh `none` se lam duong tai len tu choi truoc khi toi duoc cong nghiep vu.
      env.MEDIA_STORE = 'local';
      env.NODE_ENV = 'test';

      const child = spawnSync(
        process.execPath,
        ['--import', '@swc-node/register/esm-register', '--input-type=module', '--eval', script],
        { cwd: apiDir, env, encoding: 'utf8', timeout: BOOT_SPAWN_TIMEOUT_MS },
      );

      expect(child.status, `${child.stderr}\n${child.stdout}`).toBe(0);
      const proof = child.stdout.split('<<FILE_PLATFORM_BOOT_PROOF>>')[1];
      expect(proof, `khong tim thay dau moc trong stdout:\n${child.stdout}`).toBeDefined();
      expect(JSON.parse(proof ?? '{}')).toEqual({
        filesController: true,
        fileService: true,
        filePurgeService: true,
        transportAuthorizerRegistered: true,
        unknownOwnerFailsClosed: true,
        fileIdIsOpaque: true,
        /* Ten nguoi dung gui len la `../bien-nhan.jpg`; phan duong dan bi cat. */
        safeFilename: 'bien-nhan.jpg',
        linkCount: 1,
        linkOwnerType: 'TRANSPORT_OPERATIONAL_DOCUMENT',
        linkPointsAtDocument: true,
        documentBasis: 'DIGITAL_FILE',
        documentHasFile: true,
        readByAccountant: 'READ_OK',
        withdrawByAccountant: 'FILE_NOT_AVAILABLE_TO_CALLER',
        stateAfterWithdraw: 'WITHDRAWN',
        readAfterWithdraw: 'FILE_NOT_ACTIVE',
        linksAfterWithdraw: 0,
        historyKept: 1,
      });
    },
    BOOT_TEST_TIMEOUT_MS,
  );
});
