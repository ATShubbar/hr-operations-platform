import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7: the connection URL for Migrate lives here, not in the schema.
// The runtime client connects via the pg driver adapter (see PrismaService).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
});
