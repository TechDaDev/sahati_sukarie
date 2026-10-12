import type { Config } from 'drizzle-kit';

export default {
  schema: './src/server/db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://sahati:sahati_dev_password@127.0.0.1:5432/sahati' },
  strict: true,
  verbose: true,
} satisfies Config;
