-- AlterTable
ALTER TABLE "gro_processes" ADD COLUMN     "source_document_id" UUID;

-- CreateIndex (GRO-05 idempotency lookup — at most one process per source document)
CREATE INDEX "gro_processes_source_document_id_idx" ON "gro_processes"("source_document_id");
