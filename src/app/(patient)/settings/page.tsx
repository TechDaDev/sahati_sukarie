/** صفحة الإعدادات */
import type { Metadata } from 'next';
import { requirePatientPage } from '@/server/page-guards';
import { getCurrentSession } from '@/server/auth/session';
import { getProfileSummary } from '@/server/services/patient';
import { formatPhone, maskNationalId } from '@/server/lib/crypto';
import { SettingsScreen } from './settings-screen';

export const metadata: Metadata = { title: 'الإعدادات' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const ctx = await requirePatientPage();
  const [session, profile] = await Promise.all([
    getCurrentSession(),
    getProfileSummary(ctx.userId),
  ]);

  return (
    <SettingsScreen
      email={ctx.email}
      phone={profile ? formatPhone(profile.phoneNumber) : '—'}
      nationalIdMasked={profile ? maskNationalId(profile.npLast4) : '—'}
      phoneVerified={false}
      preferredUnit={ctx.preferredUnit}
      numeralSystem={ctx.numeralSystem}
      mustChangePassword={session?.user.mustChangePassword ?? false}
    />
  );
}
