/**
 * تحميل متغيرات البيئة من .env.local ثم .env (بدون اعتماديات إضافية).
 * القيم الموجودة مسبقًا في بيئة التشغيل لها الأولوية دائمًا.
 *
 * يُستخدم من سكربتات الصيانة (الترحيل، إنشاء المدير، تنظيف البيانات).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function loadEnvFiles(files: string[] = ['.env.local', '.env']): Promise<void> {
  for (const file of files) {
    try {
      const content = await readFile(path.join(process.cwd(), file), 'utf8');
      for (const line of content.split('\n')) {
        if (/^\s*#/.test(line)) continue;
        const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
        if (!match) continue;
        const [, key, rawValue] = match;
        if (process.env[key!] !== undefined) continue;
        let value = rawValue!;
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        process.env[key!] = value;
      }
    } catch { /* الملف غير موجود — نتجاهل */ }
  }
}
