// Public surface of the storage module (ADR-003). StorageService is how
// document-owning modules put/get/presign object blobs; the S3 client stays
// private.
export { StorageModule } from './storage.module';
export { StorageService } from './application/storage.service';
