import { Global, Module } from '@nestjs/common';
import { StorageService } from './application/storage.service';

// Storage shared module (STOR-01; ADR-003 layout). Global — the object-store
// adapter is infrastructure every document-owning module reaches through, the
// way PrismaService is. No controllers: this is a pure adapter (the HTTP
// document flows land in the Documents module, DOC-02+).
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
