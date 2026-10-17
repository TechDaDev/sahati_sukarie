import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { EMERGENCY_CONTACTS, SAFETY_DISCLAIMER } from '../src/lib/safety';

test('Iraq emergency help page uses unified 911 contact in Arabic RTL', () => {
  assert.equal(EMERGENCY_CONTACTS.length, 1);
  assert.deepEqual(EMERGENCY_CONTACTS[0], {
    label: 'رقم الطوارئ الموحد في العراق',
    value: '911',
    note: 'الإسعاف، الدفاع المدني، الشرطة، والحالات الطارئة',
    availability: 'على مدار الساعة',
    cost: 'الاتصال مجاني',
  });

  const page = readFileSync(resolve('src/app/urgent-help/page.tsx'), 'utf8');
  assert.match(page, /dir="rtl"/);
  assert.match(page, /href=\{`tel:\$\{contact\.value\}`}\s/);
  assert.match(page, /الاتصال بالطوارئ 911/);
  assert.doesNotMatch(page, /122|115|104/);
  assert.doesNotMatch(page, /تأكد من الأرقام المحلية المعتمدة/);
  assert.match(page, /لا تتصل بخدمات الطوارئ أو أي جهة طبية عنك/);
  assert.ok(page.includes('{SAFETY_DISCLAIMER}'));
  assert.match(SAFETY_DISCLAIMER, /خدمات الطوارئ/);
  assert.match(page, /href="\/dashboard"/);
});
