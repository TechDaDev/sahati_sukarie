/**
 * GET /api/admin/password-requests — قائمة طلبات استعادة كلمة المرور.
 * تُعرض بيانات الاتصال فقط بقدر ما يلزم لعملية الاستعادة، مع تنبيه واضح
 * بأن رقم الهاتف غير مُتحقَّق إلكترونيًا.
 */
import { guard } from '@/server/auth/session';
import { handleError, ok } from '@/server/http';
import { formatDateTime } from '@/lib/format';
import { listRecoveryRequests } from '@/server/services/recovery';
import { formatPhone } from '@/server/lib/crypto';

export async function GET(request: Request) {
  try {
    const { session } = await guard(request, { roles: ['ADMIN'], csrf: false });
    const rows = await listRecoveryRequests();
    void session;
    return ok({
      requests: rows.map((r) => ({
        id: r.id,
        status: r.status,
        requestDate: r.requestDate,
        requestDateDisplay: formatDateTime(r.requestDate, 'Asia/Baghdad'),
        verifiedAt: r.verifiedAt,
        completedAt: r.completedAt,
        rejectedAt: r.rejectedAt,
        rejectionReason: r.rejectionReason,
        patientName: r.fullName ?? '—',
        email: r.userEmail,
        phoneNumber: r.phoneNumber ? formatPhone(r.phoneNumber) : '—',
        phoneVerified: r.phoneVerified,
        nationalIdMasked: r.nationalIdLast4 ? `••••••${r.nationalIdLast4}` : '—',
        accountStatus: r.userStatus,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}
