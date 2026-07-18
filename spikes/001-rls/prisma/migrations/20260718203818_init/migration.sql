-- CreateTable
CREATE TABLE "sp_employees" (
    "id" SERIAL NOT NULL,
    "client_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "salary" INTEGER NOT NULL,

    CONSTRAINT "sp_employees_pkey" PRIMARY KEY ("id")
);
