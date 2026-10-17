import { desc } from 'drizzle-orm';
import { db } from '@/server/db';
import { emailOtpChallenges } from '@/server/db/schema';
import { guard } from '@/server/auth/session';
import { handleError, ok } from '@/server/http';

export async function GET(request: Request) {
  try {
    await guard(request, { roles: ['ADMIN'], csrf: false });
    const url = new URL(request.url);
    const page = Math.max(1, Math.min(10000, Number(url.searchParams.get('page') ?? 1) || 1));
    const rows = await db.select({ id: emailOtpChallenges.id, purpose: emailOtpChallenges.purpose, status: emailOtpChallenges.deliveryStatus, providerMessageId: emailOtpChallenges.providerMessageId, errorCode: emailOtpChallenges.deliveryErrorCode, createdAt: emailOtpChallenges.createdAt })
      .from(emailOtpChallenges).orderBy(desc(emailOtpChallenges.createdAt)).limit(50).offset((page - 1) * 50);
    return ok({ deliveries: rows, page, perPage: 50 });
  } catch (error) { return handleError(error); }
}
