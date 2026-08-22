import 'reflect-metadata';
// PHAI dung ngay sau reflect-metadata va TRUOC moi import nghiep vu — cung ly do voi `main.ts`:
// do thi module keo theo loader goi khach, ma loader do doc `process.env.TENANT` ngay luc import.
import '../config/load-dotenv.js';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkflowWorkerModule } from './workflow-worker.module.js';
import { WorkflowWorkerService } from './workflow-worker.service.js';

/**
 * DIEM VAO CUA TIEN TRINH WORKER — container RIENG, cung image voi `api`, khac lenh chay.
 *
 * ---------------------------------------------------------------------------
 * VI SAO KHONG NAM TRONG TIEN TRINH API. Bang chung, khong phai "best practice":
 *
 * `deploy/netviet/deploy-stack.sh:88` chay
 *
 *     docker compose up -d --no-deps --force-recreate api web
 *
 * moi lan deploy — tuc la container `api` bi HUY VA TAO LAI. Neu worker song trong do thi:
 *
 *   1. deploy phien ban moi -> container `api` cu bien mat ngay;
 *   2. worker duy nhat dang phuc vu `integration-handoff.v1` bien mat cung no;
 *   3. moi run `.v1` dang do NAM CHO VINH VIEN — dung che do hong ma Gate A mo ta;
 *   4. va buoc DRAIN cua runbook §2 tro thanh KHONG THUC HIEN DUOC: khong co cach nao giu
 *      worker phien ban cu song trong khi phien ban moi len, vi ca hai dung chung mot container.
 *
 * Tach ra thi deploy `api` khong dung toi worker, va nang phien ban khuon tro thanh mot thao tac
 * RIENG theo dung REGISTER -> ACTIVATE -> DRAIN -> DEACTIVATE -> REMOVE.
 *
 * ---------------------------------------------------------------------------
 * MOT CONTAINER = MOT PHIEN BAN. `WORKFLOW_WORKER_VERSION` la bat buoc va khong co mac dinh;
 * thieu no thi boot NEM chu tien trinh khong duoc phep song ma khong dang ky gi.
 */
const logger = new Logger('WorkflowWorkerBootstrap');

const context = await NestFactory.createApplicationContext(WorkflowWorkerModule);

// Bien SIGTERM cua Docker thanh mot lan `stop()` sach se qua `onModuleDestroy`. Khong co dong
// nay thi `docker stop` phai doi het thoi gian an han roi SIGKILL, va engine giu lease cua mot
// worker da chet cho toi luc no het han.
context.enableShutdownHooks();

const worker = context.get(WorkflowWorkerService);
await worker.start();
logger.log(`Tien trinh worker dang phuc vu ${worker.registeredWorkflowName}`);
