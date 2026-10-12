/** صفحة طلبات استعادة كلمة المرور (المدير) */
import type { Metadata } from 'next';
import { requireAdminPage } from '@/server/page-guards';
import { listRecoveryRequests } from '@/server/services/recovery';
import { formatPhone } from '@/server/lib/crypto';
import { formatDateTime, formatDate } from '@/lib/format';
import { RequestsScreen } from './requests-screen';

export const metadata: Metadata = { title: 'طلبات استعادة كلمة المرور' };
export const dynamic = 'force-dynamic';

export default async function PasswordRequestsPage() {
  await requireAdminPage();
  const rows = await listRecoveryRequests();

  return (
    <RequestsScreen
      numeralSystem="ARABIC_INDIC"
      initialRequests={rows.map((r) => ({
        id: r.id,
        status: r.status,
        requestDate: r.requestDate.toISOString(),
        requestDateDisplay: `${formatDate(r.requestDate, 'Asia/Baghdad', 'ARABIC_INDIC')} — ${formatDateTime(r.requestDate, 'Asia/Baghdad', 'ARABIC_INDIC').split('— ')[1] ?? ''}`,
        verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
        rejectedAt: r.rejectedAt ? r.rejectedAt.toISOString() : null,
        rejectionReason: r.rejectionReason,
        patientName: r.fullName ?? '—',
        email: r.userEmail,
        phoneNumber: r.phoneNumber ? formatPhone(r.phoneNumber) : '—',
        phoneVerified: Boolean(r.phoneVerified),
        nationalIdMasked: r.nationalIdLast4 ? `••••••${r.nationalIdLast4}` : '—',
        accountStatus: r.userStatus,
      }))}
    />
  );
}
