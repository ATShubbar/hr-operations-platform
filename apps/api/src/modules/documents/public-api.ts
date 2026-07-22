// Public surface of the documents module (ADR-003).
export { DocumentsModule } from './documents.module';
export { DocumentsService } from './application/documents.service';
export type { CreateDocumentInput } from './domain/document';
// The scanner seam: the DI token + interface (so production can bind a real
// scanner) and the EICAR test signature (for exercising the quarantine path).
export { DOCUMENT_SCANNER, EICAR_TEST_SIGNATURE, type DocumentScanner } from './domain/scanner';
