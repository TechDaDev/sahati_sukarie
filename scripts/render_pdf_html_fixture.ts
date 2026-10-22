import { writeFile } from 'node:fs/promises';
import type { ReportData } from '../src/server/services/reports';
import { renderHealthReportPdf } from '../src/server/reports/pdf';
const start = new Date('2026-09-01T00:00:00Z');
const glucoseSeries = Array.from({ length: 72 }, (_, i) => ({ id: `g-${i}`, at: new Date(start.getTime() + i * 7 * 3600_000), valueMgdl: 90 + (i * 17) % 120, context: ['FASTING', 'AFTER_MEAL', 'BEDTIME'][i % 3]! }));
const administrations = Array.from({ length: 40 }, (_, i) => ({ id: `a-${i}`, at: new Date(start.getTime() + i * 12 * 3600_000), status: 'TAKEN', medicationName: ['Metformin XR 500 mg', 'Insulin glargine'][i % 2]!, dose: i % 2 ? '18 وحدات' : '500 mg' }));
const data = {
  patient: { fullName: 'سارة اختبار | Sara Synthetic', age: 34, gender: 'FEMALE', heightCm: 165, diabetesType: 'TYPE_2', treatmentApproach: 'MEDICATION', monitoringMethod: 'GLUCOSE_METER', diagnosisDate: '2019-05-14', diagnosisYear: 2019 },
  range: { from: start, to: new Date('2026-09-30T23:59:59Z') },
  glucose: { count: glucoseSeries.length, averageMgdl: 146, minMgdl: 91, maxMgdl: 209, averageDisplay: null, minDisplay: null, maxDisplay: null, byContext: [{ context: 'FASTING', count: 24, averageMgdl: 131 }, { context: 'AFTER_MEAL', count: 24, averageMgdl: 164 }, { context: 'BEDTIME', count: 24, averageMgdl: 143 }] },
  glucoseSeries, administrations, adherence: { taken: 36, missed: 2, delayed: 2, note: 'synthetic test only' },
  medications: [{ id: 'm-1', name: 'Metformin XR 500 mg', category: 'ORAL', strength: '500 mg', dose: '500', unit: 'MG', frequency: 'TWICE_DAILY', route: 'ORAL', status: 'ACTIVE' }, { id: 'm-2', name: 'Insulin glargine', category: 'INSULIN', strength: '100 U/mL', dose: '18', unit: 'UNIT', frequency: 'DAILY', route: 'SUBCUTANEOUS', status: 'ACTIVE' }],
  activities: { count: 12, totalMinutes: 330, averageMinutes: 27, byIntensity: [], items: Array.from({ length: 12 }, (_, i) => ({ id: `act-${i}`, at: new Date(start.getTime() + i * 86400_000), type: 'مشي / walking', minutes: 25 + i, intensity: 'MODERATE' })) },
  meals: { count: 0, totalCarbs: null, items: [] }, sleep: { count: 0, averageMinutes: null },
  symptoms: Array.from({ length: 18 }, (_, i) => ({ id: `s-${i}`, at: new Date(start.getTime() + i * 3600_000), type: 'OTHER', severity: 'MILD', notes: 'ملاحظة تجريبية / synthetic note' })),
  weights: Array.from({ length: 8 }, (_, i) => ({ id: `w-${i}`, date: `2026-09-${String(i+1).padStart(2, '0')}`, weightKg: 65.2 + i / 10, bmi: 23.9 + i / 20 })),
  hba1c: [{ id: 'h-1', date: '2026-09-02', value: 7.1, unit: '%' }], labs: [{ id: 'l-1', date: '2026-09-05', testType: 'BLOOD_PRESSURE', value: 118, valueSecondary: 77, unit: 'mmHg' }],
  notes: { healthNotes: 'ملاحظة صحية اصطناعية', diabetesNotes: 'لا توجد بيانات حقيقية.' }, emptyStates: [],
} as unknown as ReportData;
async function main() {
const pdf = await renderHealthReportPdf(data, { unit: 'MG_DL', numeralSystem: 'LATIN', timezone: 'Asia/Baghdad' });
await writeFile('/tmp/sahati-weasy-poc/backend-integration.pdf', pdf);
console.log('Wrote synthetic report PDF bytes:', pdf.length);
}
void main();
