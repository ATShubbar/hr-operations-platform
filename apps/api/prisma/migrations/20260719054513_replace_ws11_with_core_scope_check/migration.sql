/*
  Warnings:

  - You are about to drop the `ws11_check` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "ws11_check";

-- CreateTable
CREATE TABLE "core_scope_check" (
    "id" SERIAL NOT NULL,
    "client_id" UUID NOT NULL,
    "note" TEXT NOT NULL,

    CONSTRAINT "core_scope_check_pkey" PRIMARY KEY ("id")
);
