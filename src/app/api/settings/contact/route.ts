/**
 * PATCH /api/settings/contact — تحديث بيانات التواصل وتفضيلات العرض.
 * - البريد الإلكتروني: فريد ومقارن بحالة غير حساسة لحالة الأحرف.
 * - رقم الهاتف: يُطبَّع إلى صيغة دولية موحّدة قبل التخزين.
 * - الرقم الوطني غير قابل للتعديل من هنا (يتطلب عملية تصحيح مضبوطة).
 */
import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/server/db';
import { patientProfiles, users } from '@/server/db/schema';
import { ApiError, guard, writeAudit } from '@/server/auth/session';
import { handleError, ok, parseBody } from '@/server/http';
import { getProfileByUserId } from '@/server/services/patient';
import { contactUpdateSchema } from '@/server/validation/schemas';

export async function PATCH(request: Request) {
  try {
    const { session, ip } = await guard(request, { roles: ['PATIENT'] });
    const data = await parseBody(request, contactUpdateSchema);
    const full = await getProfileByUserId(session.user.id);
    if (!full) throw new ApiError(404, 'NO_PROFILE', 'الملف الصحي غير موجود.');

    const changed: string[] = [];

    if (data.email && data.email !== full.user.email.toLowerCase()) {
      const taken = await db.select({ id: users.id }).from(users)
        .where(and(eq(users.email, data.email), ne(users.id, session.user.id))).limit(1);
      if (taken.length) {
        throw new ApiError(409, 'EMAIL_TAKEN', 'هذا البريد الإلكتروني مستخدم لحساب آخر.',
          { email: 'البريد مستخدم مسبقًا' });
      }
      await db.update(users).set({ email: data.email, updatedAt: new Date() }).where(eq(users.id, session.user.id));
      changed.push('email');
    }

    if (data.phone && data.phone !== full.profile.phoneNumber) {
      await db.update(patientProfiles).set({
        phoneNumber: data.phone,
        phoneNorm: data.phone,
        // رقم جديد لم يُتحقق منه إلكترونيًا
        phoneVerified: false,
        updatedAt: new Date(),
      }).where(eq(patientProfiles.id, full.profile.id));
      changed.push('phone');
    }

    if (data.preferredGlucoseUnit || data.numeralSystem) {
      await db.update(patientProfiles).set({
        preferredGlucoseUnit: data.preferredGlucoseUnit ?? full.profile.preferredGlucoseUnit,
        numeralSystem: data.numeralSystem ?? full.profile.numeralSystem,
        updatedAt: new Date(),
      }).where(eq(patientProfiles.id, full.profile.id));
      if (data.preferredGlucoseUnit) changed.push('preferredGlucoseUnit');
      if (data.numeralSystem) changed.push('numeralSystem');
    }

    if (changed.length) {
      await writeAudit({
        actorUserId: session.user.id, actorRole: 'PATIENT', action: 'CONTACT_SETTINGS_UPDATED',
        targetType: 'patient_profile', targetId: full.profile.id,
        metadata: { fields: changed, emailVerified: false, phoneVerified: false }, ip,
      });
    }

    return ok({ updated: true, changed });
  } catch (error) {
    return handleError(error);
  }
}
