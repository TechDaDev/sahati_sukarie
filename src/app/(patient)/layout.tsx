/** هيكل صفحات المريض: يتحقق من الجلسة على الخادم ثم يعرض التنقّل */
import { requirePatientPage } from '@/server/page-guards';
import { PatientShell } from '@/components/patient-shell';

export default async function PatientLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePatientPage();
  return <PatientShell fullName={ctx.fullName}>{children}</PatientShell>;
}
