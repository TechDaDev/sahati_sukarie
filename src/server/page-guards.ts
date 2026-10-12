/**
 * حرّاس الصفحات على الخادم (Server Components).
 * الحماية الحقيقية تحدث هنا وفي كل نقطة API — لا يُعتمد على الواجهة أبدًا.
 */
import { redirect } from 'next/navigation';
import { getCurrentSession } from './auth/session';
import { getProfileSummary } from './services/patient';

export type PatientContext = {
  userId: string;
  email: string;
  fullName: string;
  profileId: string;
  preferredUnit: 'MG_DL' | 'MMOL_L';
  numeralSystem: 'LATIN' | 'ARABIC_INDIC';
  timezone: string;
  heightCm: number;
  onboardingCompletedAt: Date | null;
};

/** يتطلب جلسة مريض صالحة، وإلا يعيد التوجيه */
export async function requirePatientPage(): Promise<PatientContext> {
  const session = await getCurrentSession();
  if (!session) redirect('/login');
  if (session.user.role === 'ADMIN') redirect('/admin');
  if (session.user.mustChangePassword) redirect('/settings?forcePassword=1');

  const profile = await getProfileSummary(session.user.id);
  if (!profile) redirect('/login');

  return {
    userId: session.user.id,
    email: profile.email,
    fullName: profile.fullName,
    profileId: profile.id,
    preferredUnit: profile.preferredGlucoseUnit,
    numeralSystem: profile.numeralSystem,
    timezone: profile.timezone,
    heightCm: Number(profile.heightCm),
    onboardingCompletedAt: profile.onboardingCompletedAt,
  };
}

/** يتطلب جلسة مدير صالحة */
export async function requireAdminPage(): Promise<{ userId: string; email: string; mustChangePassword: boolean }> {
  const session = await getCurrentSession();
  if (!session) redirect('/admin/login');
  if (session.user.role !== 'ADMIN') redirect('/dashboard');
  return {
    userId: session.user.id,
    email: session.user.email,
    mustChangePassword: session.user.mustChangePassword,
  };
}
