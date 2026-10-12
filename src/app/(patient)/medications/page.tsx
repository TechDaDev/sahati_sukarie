/** صفحة أدويتي — خطة الأدوية + سجل الجرعات الفعلية */
import type { Metadata } from 'next';
import { requirePatientPage } from '@/server/page-guards';
import { listAdministrations, listMedications } from '@/server/services/records';
import { MedicationsScreen } from './medications-screen';

export const metadata: Metadata = { title: 'أدويتي' };
export const dynamic = 'force-dynamic';

export default async function MedicationsPage() {
  const ctx = await requirePatientPage();
  const [medications, administrations] = await Promise.all([
    listMedications(ctx.profileId),
    listAdministrations(ctx.profileId),
  ]);

  return (
    <MedicationsScreen
      numeralSystem={ctx.numeralSystem}
      timezone={ctx.timezone}
      medications={medications.map((m) => ({
        id: m.id,
        medicationName: m.medicationName,
        category: m.category,
        strength: m.strength ? Number(m.strength) : null,
        strengthUnit: m.strengthUnit,
        prescribedDose: m.prescribedDose ? Number(m.prescribedDose) : null,
        doseUnit: m.doseUnit,
        route: m.route,
        frequency: m.frequency,
        usualTime: m.usualTime,
        startDate: m.startDate,
        endDate: m.endDate,
        prescriberName: m.prescriberName,
        insulinFormulation: m.insulinFormulation,
        notes: m.notes,
        status: m.status,
      }))}
      administrations={administrations.map((a) => ({
        id: a.administration.id,
        medicationId: a.administration.medicationId,
        medicationName: a.medication.medicationName,
        actualDose: a.administration.actualDose ? Number(a.administration.actualDose) : null,
        doseUnit: a.administration.doseUnit,
        administrationDatetime: a.administration.administrationDatetime.toISOString(),
        status: a.administration.status,
        notes: a.administration.notes,
      }))}
    />
  );
}
