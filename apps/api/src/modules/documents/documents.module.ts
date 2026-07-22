import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/public-api';
import { ClientsModule } from '../clients/public-api';
import { DocumentsController } from './api/documents.controller';
import { DocumentsService } from './application/documents.service';

// Documents module (ACTION-PLAN 3.2; ADR-003 layout). DOC-01 registry + service;
// DOC-02 the presigned upload flow (validates client_id via ClientsModule).
// StorageModule (blobs) and PrismaModule are @Global; AuditModule provides the
// transactional audit.
@Module({
  imports: [AuditModule, ClientsModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
