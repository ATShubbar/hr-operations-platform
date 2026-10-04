import { Global, Module } from '@nestjs/common';
import { StorageService } from './application/storage.service';
import { FILE_SCANNER } from './domain/file-scanner';
import { passThroughScannerProvider } from './infra/passthrough-scanner';

// Storage shared module (STOR-01; ADR-003 layout). Global — the object-store
// adapter is infrastructure every document-owning module reaches through, the
// way PrismaService is. No controllers: this is a pure adapter (the HTTP
// document flows land in the Documents module, DOC-02+). It also binds the
// virus scanner (FILE_SCANNER — dev pass-through here; ClamAV swaps in for
// production), shared by every module that accepts uploads (THREAD-02).
@Global()
@Module({
  providers: [StorageService, passThroughScannerProvider],
  exports: [StorageService, FILE_SCANNER],
})
export class StorageModule {}
