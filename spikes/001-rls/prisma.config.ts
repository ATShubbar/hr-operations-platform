import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Migrations run as the table owner (hr). Runtime tests connect as the
// spike_staff / spike_client roles created in the roles_policies migration.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('SPIKE_DATABASE_URL'),
  },
});
