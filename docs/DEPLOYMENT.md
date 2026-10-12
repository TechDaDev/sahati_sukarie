# دليل النشر — منصة «صحتي وسكري»

هذا المستند يشرح نشر النسخة الأولى (MVP) في بيئة إنتاج حقيقية، مع النسخ الاحتياطي والمراقبة وقائمة تحقق أمنية.

---

## 1. المتطلبات

| المكوّن | الحد الأدنى |
|---|---|
| نظام التشغيل | Linux (Debian/Ubuntu أو ما يعادلها) |
| Node.js | 20 LTS أو أحدث |
| PostgreSQL | 15 أو أحدث (اختُبر على 17) |
| Chromium | أي إصدار حديث — **مطلوب لتوليد تقارير PDF العربية** |
| الذاكرة | 2 GB RAM (Chromium يحتاج ~300 MB لكل تقرير) |

---

## 2. الأسرار ومتغيرات البيئة

أنشئ `.env.local` (صلاحيات `600`) ولا تُدخلها أبدًا في مستودع الكود:

```bash
cp .env.example .env.local
chmod 600 .env.local

openssl rand -base64 48   # SESSION_SECRET
openssl rand -base64 32   # FIELD_ENCRYPTION_KEY
openssl rand -hex 32      # NATIONAL_ID_PEPPER
```

قواعد إلزامية:

- `FIELD_ENCRYPTION_KEY` **لا يُغيَّر** بعد إدخال بيانات مرضى (فقدانه يعني فقدان القدرة على فك تشفير الأرقام الوطنية).
- `INITIAL_ADMIN_PASSWORD` كلمة مرور قوية فريدة؛ تُقرأ مرة واحدة عند إنشاء أول حساب مدير، ويُجبر المدير على تغييرها عند أول دخول.
- لا تُعِد استخدام أسرار بيئة التطوير في الإنتاج.

---

## 3. قاعدة البيانات

```bash
# إنشاء الدور وقاعدة البيانات (يعمل الأمر على الخادم المحلي)
bash scripts/setup-postgres.sh

# تطبيق الترحيلات (idempotent — كل ملف يُطبَّق مرة واحدة ويُسجَّل في schema_migrations)
npm run db:migrate

# إنشاء أول حساب مدير من متغيرات البيئة
npx tsx scripts/create-admin.ts
```

ملاحظات:

- المستخدم التطبيقي لا يحتاج صلاحيات عليا؛ يكفيه ملكية قاعدة بياناته (`CREATEDB` غير مطلوب في الإنتاج).
- التخزين دائمًا بتوقيت **UTC**، والعرض بتوقيت `DISPLAY_TIMEZONE` (افتراضيًا `Asia/Baghdad`). لكل مريض عمود منطقة زمنية خاص لتوسعة مستقبلية.
- مخطط قاعدة البيانات هو `db/migrations/0001_init.sql` وهو المصدر المرجعي (FKs، قيود CHECK، فهارس، محفّزات `updated_at`).

---

## 4. البناء والتشغيل

```bash
npm ci
npm run build
npm run start        # يُنصت على 0.0.0.0:3000
```

### خدمة systemd (مثال)

```ini
# /etc/systemd/system/sahati.service
[Unit]
Description=Sahati wa Sukari (Next.js)
After=network.target postgresql.service

[Service]
Type=simple
User=sahati
WorkingDirectory=/srv/sahati
EnvironmentFile=/srv/sahati/.env.local
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

### وكيل عكسي مع HTTPS (مثال Nginx)

```nginx
server {
  listen 443 ssl http2;
  server_name sahati.example.iq;

  ssl_certificate     /etc/letsencrypt/live/sahati.example.iq/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/sahati.example.iq/privkey.pem;

  client_max_body_size 2m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;   # توليد PDF قد يستغرق وقتًا
  }
}
```

> **مهم:** كوكي الجلسة يُرسل بعلامة `Secure` عندما تكون البيئة `production`، لذا لا يعمل الدخول عبر HTTP بدون TLS. اضبط `APP_URL` على عنوان HTTPS النهائي.

---

## 5. تقارير PDF (Chromium)

يُستخدم Chromium عبر Puppeteer لتوليد ملفات PDF عربية RTL بخطوط مضمّنة.

- عند `npm install` يُنزّل Puppeteer نسخة Chromium إلى `~/.cache/puppeteer`.
- إن كان المتصفح مثبّتًا في مسار آخر، اضبط `CHROMIUM_EXECUTABLE_PATH`.
- إن لم يتوفر أي متصفح، تُعيد نقطة `/api/reports/pdf` الاستجابة `503 PDF_UNAVAILABLE` (ولا يتعطّل باقي التطبيق).
- في بيئات الحاويات قد تحتاج إلى `--no-sandbox` (مُستخدم افتراضيًا في هذا المشروع) وذاكرة مشتركة أكبر (`--disable-dev-shm-usage`).

---

## 6. النسخ الاحتياطي والاستعادة

```bash
# نسخة احتياطية (تلقائيًا في مجلد backups/)
npm run db:backup

# استعادة
pg_restore --clean --if-exists --no-owner -d "$DATABASE_URL" backups/sahati-<UTC>.dump
```

- جدولة يومية عبر cron:

```cron
0 2 * * * cd /srv/sahati && /usr/bin/npm run db:backup >> /var/log/sahati-backup.log 2>&1
```

- احتفظ بالنسخ خارج الخادم، واختبر الاستعادة دوريًا.
- **احتفظ بنسخة آمنة من `FIELD_ENCRYPTION_KEY` و`NATIONAL_ID_PEPPER`** خارج الخادم: بدون المفتاح لا يمكن قراءة الأرقام الوطنية من النسخ الاحتياطية.

---

## 7. المراقبة والسجلات

- سجلات التطبيق: مخرجات systemd (`journalctl -u sahati -f`).
- سجلات قاعدة البيانات: `/var/log/postgresql/`.
- ملاحظة: رسائل الأخطاء في الواجهة عامة ولا تكشف تفاصيل داخلية؛ التفاصيل التقنية تُطبع في سجلات الخادم فقط.
- راقب: `/api/health`-غير متوفر في هذه النسخة؛ استخدم فحص الصفحة الرئيسية `GET /` كفحص حياة بسيط.
- راقب جدول `rate_limit_counters` وسجل `audit_logs` لاكتشاف محاولات الدخول غير الطبيعية.

---

## 8. قائمة تحقق أمنية قبل النشر

- [ ] HTTPS مفعّل، و`APP_URL` يبدأ بـ `https://`.
- [ ] `SESSION_SECRET` / `FIELD_ENCRYPTION_KEY` / `NATIONAL_ID_PEPPER` قيم عشوائية جديدة وفريدة.
- [ ] لا تُوجد كلمات مرور افتراضية أو عامة في الكود أو التوثيق.
- [ ] `INITIAL_ADMIN_PASSWORD` قوية، وتم تغييرها عند أول دخول (`must_change_password`).
- [ ] منافذ PostgreSQL غير مفتوحة على الإنترنت (تقتصر على 127.0.0.1).
- [ ] نسخ احتياطي مجدول + اختبار استعادة ناجح.
- [ ] قاعدة البيانات نظيفة من أي بيانات تجريبية/وهمية (`npm run db:clear-patients -- --yes`).
- [ ] صلاحيات ملف `.env.local` = `600`، والقاعدة/التطبيق يعملان بمستخدم غير جذري.

---

## 9. توسعات مستقبلية (التصميم يدعمها)

- **وصول الطبيب**: الجداول مبنية على `patient_id` مع فهارس ومفاتيح أجنبية، ويمكن إضافة جدول ربط `doctor_patient_access` ودور `DOCTOR` دون تغيير المخطط الأساسي.
- **منطقة زمنية لكل مريض**: العمود `timezone` موجود في `patient_profiles` (العرض الافتراضي `Asia/Baghdad`).
- **حالة التسجيل/التحقق**: حقول `email_verified` و`phone_verified` موجودة ومعدّة للتوسعة لاحقًا دون تغيير الواجهات.
