/**
 * إنشاء حساب المدير الأول بأمان.
 * ---------------------------------------------------------------------------
 * - يقرأ البريد وكلمة المرور من INITIAL_ADMIN_EMAIL و INITIAL_ADMIN_PASSWORD.
 * - إن كان هناك مدير بالفعل، لا يُنشئ آخر ولا يغيّر كلمة المرور.
 * - يُجبر المدير على تغيير كلمة المرور عند أول تسجيل دخول.
 * - كلمة المرور تُخزَّن مجزّأة فقط (bcrypt)، ولا تُطبع في السجلات.
 */
import bcrypt from 'bcryptjs';
import { Client } from 'pg';
import { loadEnvFiles } from './load-env';

async function main() {
  await loadEnvFiles();
  const url = process.env.DATABASE_URL;
  const email = process.env.INITIAL_ADMIN_EMAIL;
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (!url) { console.error('✗ DATABASE_URL غير محدد.'); process.exit(1); }
  if (!email || !password) {
    console.error('✗ يجب تحديد INITIAL_ADMIN_EMAIL و INITIAL_ADMIN_PASSWORD في متغيرات البيئة.');
    console.error('  مثال: INITIAL_ADMIN_EMAIL=admin@example.com INITIAL_ADMIN_PASSWORD="كلمة-قوية-جدا"');
    process.exit(1);
  }
  if (password.length < 10) {
    console.error('✗ كلمة مرور المدير يجب أن تكون 10 أحرف على الأقل.');
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  const existing = await client.query("SELECT id, email FROM users WHERE role = 'ADMIN' LIMIT 1");
  if (existing.rowCount && existing.rowCount > 0) {
    console.log(`✓ يوجد حساب مدير بالفعل (${existing.rows[0].email}). لم يتم إنشاء حساب جديد.`);
    await client.end();
    return;
  }

  const emailTaken = await client.query('SELECT 1 FROM users WHERE lower(email) = lower($1)', [email]);
  if (emailTaken.rowCount && emailTaken.rowCount > 0) {
    console.error('✗ هذا البريد مستخدم لحساب آخر. اختر بريدًا مختلفًا للمدير.');
    await client.end();
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 12);
  const result = await client.query(
    `INSERT INTO users (email, password_hash, role, status, must_change_password)
     VALUES ($1, $2, 'ADMIN', 'ACTIVE', true)
     RETURNING id`,
    [email, hash],
  );

  await client.query(
    `INSERT INTO audit_logs (actor_user_id, actor_role, action, target_type, target_id, metadata)
     VALUES ($1::uuid, 'SYSTEM', 'INITIAL_ADMIN_CREATED', 'user', $1::text, $2::jsonb)`,
    [result.rows[0].id, JSON.stringify({ mustChangePassword: true, email })],
  );

  console.log('✓ تم إنشاء حساب المدير الأول بنجاح.');
  console.log(`  البريد: ${email}`);
  console.log('  كلمة المرور: (من متغير البيئة — غير مطبوعة لأسباب أمنية)');
  console.log('  رابط الدخول: /admin/login');
  console.log('  ⚠ سيُطلب تغيير كلمة المرور عند أول تسجيل دخول.');
  await client.end();
}

main().catch((error) => {
  console.error('✗ خطأ:', error instanceof Error ? error.message : error);
  process.exit(1);
});
