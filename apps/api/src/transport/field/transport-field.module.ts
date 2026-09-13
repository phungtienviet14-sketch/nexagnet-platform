import { Module } from '@nestjs/common';
import { TransportCheckpointModule } from '../checkpoint/transport-checkpoint.module.js';
import { TransportDocumentModule } from '../document/transport-document.module.js';
import { TransportModule } from '../transport.module.js';
import { TransportFieldCoreFacts, TransportFieldCoreFactsAdapter } from './field-facts.port.js';
import { DriverFieldReadService } from './field-read.service.js';

/**
 * MAN HINH HIEN TRUONG — `#279` O9/O11.
 *
 * Module nay CHI DOC. No khong khai mot kho nao, khong khai mot migration nao, va khong co mot
 * dich vu ghi nao: no gop bon nguon da co (moc, phien cho, chung tu, ban giao) thanh mot man hinh.
 *
 * Den cung `transport-checkpoint`, cung ly le voi `TransportDocumentModule`. Ba `imports` deu la
 * phu thuoc THAT — go bat ky cai nao thi mot phan cua man hinh bien mat, chu khong phai mot dong
 * import thua.
 */
@Module({
  imports: [TransportModule, TransportCheckpointModule, TransportDocumentModule],
  providers: [
    { provide: TransportFieldCoreFacts, useClass: TransportFieldCoreFactsAdapter },
    DriverFieldReadService,
  ],
  exports: [DriverFieldReadService],
})
export class TransportFieldModule {}
