import { Injectable } from '@nestjs/common';
import {
  InMemoryTurnRecordsRepository,
  TurnRecordsRepository,
} from '../turns/turn-records.repository.js';

/**
 * GOC NHIN SALES-ORDER tren kho luot (`TurnRecordsRepository`) — cung mot instance, cung mot
 * bang. Ton tai duoi ten rieng vi `OrdersService`/`OrderAmendmentService` doc kho nay bang ngon
 * ngu don hang; composition root noi hai token bang `useExisting`, nen KHONG co hai kho.
 *
 * Chi `sales-order` dang ky token nay. Khach khong ban hang van co `TurnRecordsRepository`.
 */
export abstract class OrdersRepository extends TurnRecordsRepository {}

/**
 * Bi danh cua `InMemoryTurnRecordsRepository` duoi ngon ngu don hang — giu vi hang chuc bo test
 * cua sales-order dung ten nay. Khong co logic rieng: mot kho thu hai la cach chac chan de don
 * va luot lech nhau.
 */
@Injectable()
export class InMemoryOrdersRepository extends InMemoryTurnRecordsRepository {}
