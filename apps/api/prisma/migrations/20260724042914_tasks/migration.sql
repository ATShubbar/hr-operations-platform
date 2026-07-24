-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('open', 'in_progress', 'done', 'cancelled');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('low', 'normal', 'high');

-- CreateTable
CREATE TABLE "task_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID,
    "request_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'open',
    "priority" "TaskPriority" NOT NULL DEFAULT 'normal',
    "assignee_user_id" UUID,
    "created_by_user_id" UUID,
    "due_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_tasks_client_id_idx" ON "task_tasks"("client_id");

-- CreateIndex
CREATE INDEX "task_tasks_status_idx" ON "task_tasks"("status");

-- CreateIndex
CREATE INDEX "task_tasks_assignee_user_id_idx" ON "task_tasks"("assignee_user_id");

-- CreateIndex
CREATE INDEX "task_tasks_due_date_idx" ON "task_tasks"("due_date");

-- TASK-01 grants + RLS. Tasks are consultancy-INTERNAL (matrix — clients have no
-- task access), so app_client is granted NOTHING and there is no client policy;
-- app_staff has full access under a staff_full_access RLS policy (defence-in-
-- depth). client_id/request_id are reporting links, not a client-rep scope key.
GRANT SELECT, INSERT, UPDATE, DELETE ON "task_tasks" TO app_staff;

ALTER TABLE "task_tasks" ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_full_access ON "task_tasks"
  FOR ALL TO app_staff USING (true) WITH CHECK (true);
