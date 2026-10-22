import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import type { ReportData } from '../../src/server/services/reports';
import { renderHealthReportPdf } from '../../src/server/reports/pdf';

test('PDF renderer handles hostile patient text as inert text without network access', async () => {
  let requestCount = 0;
  const server = createServer((_request, response) => {
    requestCount += 1;
    response.end('unexpected request');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const malicious = `<script>throw new Error("xss")</script><img src="http://127.0.0.1:${address.port}/pixel">`;
  const data = {
    patient: { fullName: malicious, age: 40, gender: 'MALE', heightCm: 170, diabetesType: null,
      treatmentApproach: null, monitoringMethod: null, diagnosisDate: null, diagnosisYear: null },
    range: { from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-01-31T00:00:00Z') },
    glucose: { count: 0, averageMgdl: null, minMgdl: null, maxMgdl: null, averageDisplay: null,
      minDisplay: null, maxDisplay: null, byContext: [] },
    glucoseSeries: [], administrations: [], adherence: { taken: 0, missed: 0, delayed: 0, note: '' },
    medications: [], activities: { count: 0, totalMinutes: 0, averageMinutes: null, byIntensity: [], items: [] },
    meals: { count: 0, totalCarbs: null, items: [] }, sleep: { count: 0, averageMinutes: null },
    symptoms: [{ id: 'synthetic', at: new Date(), type: 'OTHER', severity: 'MILD', notes: malicious }],
    weights: [], hba1c: [], labs: [], notes: { healthNotes: malicious, diabetesNotes: null }, emptyStates: [],
  } as ReportData;
  try {
    const pdf = await renderHealthReportPdf(data, { unit: 'MG_DL', numeralSystem: 'LATIN', timezone: 'Asia/Baghdad' });
    assert.equal(Buffer.from(pdf).subarray(0, 5).toString('ascii'), '%PDF-');
    assert.ok(pdf.length > 5_000, 'Generated report must contain rendered document pages');
    assert.equal(requestCount, 0, 'Report rendering must not fetch patient-controlled URLs');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
