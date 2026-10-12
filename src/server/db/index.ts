/**
 * اتصال قاعدة البيانات (Pool واحد يُعاد استخدامه).
 */
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { env } from '../env';
import * as schema from './schema';

declare global {
  // eslint-disable-next-line no-var
  var __sahatiPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __sahatiDb: NodePgDatabase<typeof schema> | undefined;
}

function createPool(): Pool {
  const pool = new Pool({
    connectionString: env().DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    application_name: 'sahati-wa-sukari',
  });
  // كل الطوابع الزمنية تُقرأ كـ UTC
  pool.on('connect', (client) => {
    client.query("SET TIME ZONE 'UTC'").catch(() => undefined);
  });
  return pool;
}

export const pool: Pool = globalThis.__sahatiPool ?? createPool();
export const db: NodePgDatabase<typeof schema> = globalThis.__sahatiDb ?? drizzle(pool, { schema });

if (env().NODE_ENV !== 'production') {
  globalThis.__sahatiPool = pool;
  globalThis.__sahatiDb = db;
}

export { schema };
export type Database = typeof db;
