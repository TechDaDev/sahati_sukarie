/**
 * أدوات التشفير وحماية البيانات الحساسة.
 *  - تشفير الحقول: AES-256-GCM بمفتاح من متغيرات البيئة (FIELD_ENCRYPTION_KEY)
 *  - فهرس البحث الأعمى: HMAC-SHA256 (NATIONAL_ID_PEPPER) لكشف التكرار دون تخزين الرقم صريحًا
 *  - الجلسات: توكن عشوائي 32 بايت، يُخزَّن SHA-256 منه فقط
 */
import {
  createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual,
} from 'node:crypto';
import { env } from '../env';

const KEY_VERSION = 'v1';

function encryptionKey(): Buffer {
  const raw = env().FIELD_ENCRYPTION_KEY.trim();
  let key: Buffer;
  try {
    key = Buffer.from(raw, 'base64');
  } catch {
    key = Buffer.from(raw, 'utf8');
  }
  if (key.length !== 32) {
    throw new Error(
      'FIELD_ENCRYPTION_KEY يجب أن يكون 32 بايت (base64). أنشئ مفتاحًا جديدًا بـ: openssl rand -base64 32',
    );
  }
  return key;
}

/** تشفير قيمة حساسة (مثل الرقم الوطني) — يُخزَّن فقط في هذا الشكل */
export function encryptField(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [KEY_VERSION, iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

export function decryptField(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== KEY_VERSION) {
    throw new Error('صيغة البيانات المشفرة غير صحيحة');
  }
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

/** فهرس أعمى (blind index) للمقارنة وكشف التكرار */
export function blindIndex(value: string): string {
  return createHmac('sha256', env().NATIONAL_ID_PEPPER).update(value).digest('hex');
}

export function hmacHex(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** توكن عشوائي آمن تشفيريًا (base64url) */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** رمز استعادة رقمي عشوائي (لا يعتمد على Math.random) */
export function randomRecoveryCode(digits = 8): string {
  let out = '';
  for (let i = 0; i < digits; i += 1) out += String(randomInt(0, 10));
  return out;
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/* -------------------------------------------------- تطبيع البيانات الوطنية */

/** الرقم الوطني يُعامل كنص — إزالة المسافات والفواصل مع الحفاظ على الأصفار البادئة */
export function normalizeNationalId(input: string): string {
  return input.replace(/[\s\-_]/g, '').trim();
}

export function maskNationalId(last4: string): string {
  return `••••••${last4}`;
}

/**
 * تطبيع رقم الهاتف العراقي إلى صيغة دولية موحّدة (+9647XXXXXXXXX).
 * يقبل: 07XXXXXXXXX، +9647XXXXXXXXX، 00964...، 9647...
 */
export function normalizeIraqiPhone(input: string): string | null {
  const digits = input.replace(/[\s\-().]/g, '');
  if (!/^\+?\d{9,15}$/.test(digits)) return null;
  const withoutPlus = digits.replace(/^\+/, '');

  let national: string | null = null;
  if (/^07\d{9}$/.test(withoutPlus)) national = withoutPlus.slice(1);            // 07XXXXXXXXX → 7XXXXXXXXX
  else if (/^7\d{9}$/.test(withoutPlus)) national = withoutPlus;                  // 7XXXXXXXXX
  else if (/^9647\d{9}$/.test(withoutPlus)) national = withoutPlus.slice(3);      // 9647XXXXXXXXX
  else if (/^009647\d{9}$/.test(withoutPlus)) national = withoutPlus.slice(5);
  if (!national) return null;
  return `+964${national}`;
}

/** عرض مقروء للرقم العراقي: +964 7XX XXX XXXX */
export function formatPhone(normalized: string): string {
  const m = /^\+964(\d{10})$/.exec(normalized);
  if (!m) return normalized;
  const d = m[1];
  return `+964 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}
