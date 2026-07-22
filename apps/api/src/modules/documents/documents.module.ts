import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { DocumentsService } from './application/documents.service';

// Documents module (ACTION-PLAN 3.2; ADR-003 layout). DOC-01 registry + service.
// StorageModule (blobs) and PrismaModule are @Global; AuditModule provides the
// transactional audit. The HTTP upload/download API + client validation land in
// DOC-02/03.
@Module({
  imports: [AuditModule],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
