/**
 * scripts/clear-patient-data.ts
 * ---------------------------------------------------------------------------
 * يحذف كل حسابات المرضى وبياناتهم الصحية نهائيًا من قاعدة البيانات،
 * مع الإبقاء على حسابات الإدارة (ADMIN) وسجل الترحيلات.
 *
 * يُستخدم قبل تسليم المنصة أو قبل أي بيئة إنتاجية جديدة، لضمان عدم بقاء
 * أي بيانات تجريبية أو اصطناعية في النظام (لا بيانات مرضى وهميين).
 *
 * الاستخدام:
 *   npx tsx scripts/clear-patient-data.ts --yes
 *   (بدون --yes يتم عرض ملخص فقط دون حذف)
 */
import { sql } from 'drizzle-orm';
import { loadEnvFiles } from './load-env';

const TABLES_WITH_PATIENT_SCOPE = [
  'glucose_readings',
  'medication_administrations',
  'medications',
  'meal_records',
  'activity_records',
  'sleep_records',
  'symptom_records',
  'daily_factors',
  'weight_records',
  'lab_results',
  'patient_conditions',
  'reproductive_history',
  'diabetes_profiles',
  'password_recovery_tokens',
  'password_recovery_requests',
  'sessions',
];

async function main() {
  await loadEnvFiles();
  const confirmed = process.argv.includes('--yes');
  const { db, pool } = await import('../src/server/db');

  try {
    const summary: Array<[string, number]> = [];
    for (const table of TABLES_WITH_PATIENT_SCOPE) {
      const result = await db.execute(sql.raw(`select count(*)::int as c from ${table}`));
      summary.push([table, Number((result.rows[0] as { c: number }).c)]);
    }
    const usersResult = await db.execute(sql.raw("select role, count(*)::int as c from users group by role order by role"));
    const patients = Number((usersResult.rows.find((r) => (r as { role: string }).role === 'PATIENT') as { c: number } | undefined)?.c ?? 0);

    console.log('— ملخص البيانات الحالية —');
    for (const [table, count] of summary) console.log(`  ${table}: ${count}`);
    console.log(`  حسابات المرضى: ${patients}`);

    if (!confirmed) {
      console.log('\nلم يتم حذف أي شيء. أعد التشغيل مع --yes للحذف الفعلي.');
      return;
    }

    // الحذف داخل معاملة واحدة: يتكفّل بالترتيب الصحيح مع قيود المفاتيح الأجنبية
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`
        truncate table
          ${TABLES_WITH_PATIENT_SCOPE.join(',\n          ')},
          patient_profiles
        restart identity cascade
      `));
      await tx.execute(sql.raw("delete from sessions where user_id in (select id from users where role = 'PATIENT')"));
      await tx.execute(sql.raw("delete from users where role = 'PATIENT'"));
      await tx.execute(sql.raw("delete from rate_limit_counters"));
      await tx.execute(sql.raw("delete from audit_logs"));
    });

    const after = await db.execute(sql.raw("select role, count(*)::int as c from users group by role order by role"));
    console.log('\n— بعد الحذف —');
    for (const row of after.rows) {
      const r = row as { role: string; c: number };
      console.log(`  ${r.role}: ${r.c}`);
    }
    console.log('تم حذف كل بيانات المرضى بنجاح.');
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('فشل تنفيذ السكربت:', error instanceof Error ? error.message : error);
  process.exit(1);
});
