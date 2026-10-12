/**
 * تطبيق ترحيلات قاعدة البيانات بشكل متتابع وآمن (idempotent).
 * كل ملف .sql في db/migrations يُطبَّق مرة واحدة، ويُسجَّل في جدول schema_migrations.
 *
 *   npm run db:migrate
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import { loadEnvFiles } from './load-env';

async function main() {
  await loadEnvFiles();
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('✗ DATABASE_URL غير محدد. انسخ .env.example إلى .env.local وعدّل القيم.');
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const dir = path.join(process.cwd(), 'db', 'migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const applied = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    process.stdout.write(`→ تطبيق الترحيل: ${file} ... `);
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log('تم');
      count += 1;
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('\n✗ فشل الترحيل:', error instanceof Error ? error.message : error);
      await client.end();
      process.exit(1);
    }
  }

  console.log(count === 0 ? '✓ قاعدة البيانات محدّثة بالفعل (لا ترحيلات جديدة).' : `✓ تم تطبيق ${count} ترحيل.`);
  console.log('ℹ لم يتم إنشاء أي بيانات مرضى. استخدم npm run db:setup لإنشاء حساب المدير.');
  await client.end();
}

main().catch((error) => {
  console.error('✗ خطأ غير متوقع:', error);
  process.exit(1);
});
