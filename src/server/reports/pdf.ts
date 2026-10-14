/**
 * مولّد تقرير PDF العربي (RTL).
 * ---------------------------------------------------------------------------
 * لماذا Chromium؟ تشكيل الحروف العربية المتصل (contextual shaping) وترتيب
 * الاتجاهين (BiDi) وتطبيق خطوط الويب كلها مهام معقدة؛ محركات PDF التي ترسم
 * الحروف بشكل منفصل تُنتج نصًا عربيًا مقطّعًا أو معكوسًا. لذلك نُصيّر التقرير
 * كصفحة HTML عربية RTL ثم نطبعها إلى PDF عبر متصفح Chromium بدون واجهة،
 * وهو ما يضمن ظهور العربية بشكل صحيح تمامًا.
 *
 * المتطلبات: حزمة Chromium (تُثبَّت عبر npm install puppeteer).
 * إن لم تتوفر، يُرجع خطأ واضحًا بدل إنتاج ملف تالف.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ReportData } from '../services/reports';
import { formatDate, formatDateTime, formatNumber, applyNumerals, type NumeralSystem } from '../../lib/format';
import { labelOf } from '../../lib/labels';

export type PdfOptions = {
  unit: 'MG_DL' | 'MMOL_L';
  numeralSystem: NumeralSystem;
  timezone: string;
};

const FONT_DIR = path.join(process.cwd(), 'src', 'server', 'reports', 'fonts');

async function fontDataUri(file: string): Promise<string> {
  const buf = await readFile(path.join(FONT_DIR, file));
  return `data:font/ttf;base64,${buf.toString('base64')}`;
}

/** تهيئة HTML للطباعة — اتجاه من اليمين إلى اليسار وخط Cairo */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** رسم مخطط خطي بسيط بصيغة SVG على الخادم (بدون مكتبات رسم) */
function glucoseChartSvg(data: ReportData, opts: PdfOptions): string {
  const points = data.glucoseSeries;
  if (points.length < 2) return '';
  const W = 720;
  const H = 220;
  const padX = 34;
  const axisGutter = 52;   // مساحة أرقام المحور على اليمين
  const padY = 24;
  const values = points.map((p) => p.valueMgdl);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 20);
  const lo = Math.max(0, min - span * 0.15);
  const hi = max + span * 0.15;
  const t0 = points[0]!.at.getTime();
  const t1 = points[points.length - 1]!.at.getTime();
  const plotRight = W - axisGutter;
  const x = (t: number) => padX + ((t - t0) / Math.max(t1 - t0, 1)) * (plotRight - padX);
  const y = (v: number) => H - padY - ((v - lo) / (hi - lo)) * (H - padY * 2);

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.at.getTime()).toFixed(1)} ${y(p.valueMgdl).toFixed(1)}`)
    .join(' ');

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const v = lo + (hi - lo) * f;
    const yy = y(v);
    const label = opts.unit === 'MG_DL' ? Math.round(v) : (v / 18.0182).toFixed(1);
    return `<line x1="${padX}" y1="${yy.toFixed(1)}" x2="${plotRight}" y2="${yy.toFixed(1)}" stroke="#E3EDF5" stroke-width="1"/>
      <text x="${plotRight + 8}" y="${(yy + 4).toFixed(1)}" font-size="10" fill="#6B8299" direction="ltr" text-anchor="start">${applyNumerals(String(label), opts.numeralSystem)}</text>`;
  }).join('');

  const dots = points.map((p) =>
    `<circle cx="${x(p.at.getTime()).toFixed(1)}" cy="${y(p.valueMgdl).toFixed(1)}" r="2.6" fill="#2463A6"/>`).join('');

  const firstLabel = formatDate(points[0]!.at, opts.timezone, opts.numeralSystem);
  const lastLabel = formatDate(points[points.length - 1]!.at, opts.timezone, opts.numeralSystem);

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="220" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>
    ${gridLines}
    <path d="${path}" fill="none" stroke="#2463A6" stroke-width="2.2" stroke-linejoin="round"/>
    ${dots}
    <text x="${padX}" y="${H - 6}" font-size="10" fill="#6B8299" direction="ltr" text-anchor="start">${esc(firstLabel)}</text>
    <text x="${plotRight}" y="${H - 6}" font-size="10" fill="#6B8299" direction="ltr" text-anchor="end">${esc(lastLabel)}</text>
    <text x="${plotRight / 2 + padX / 2}" y="14" font-size="10" fill="#6B8299" text-anchor="middle">وحدة العرض: ${opts.unit === 'MG_DL' ? 'mg/dL' : 'mmol/L'}</text>
  </svg>`;
}

function table(headers: string[], rows: string[][]): string {
  if (!rows.length) return '';
  return `<table>
    <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

function buildHtml(data: ReportData, opts: PdfOptions, fonts: { regular: string; semibold: string; bold: string }): string {
  const n = opts.numeralSystem;
  const tz = opts.timezone;
  const num = (v: number | null | undefined, d = 0) => formatNumber(v ?? null, d, n);
  const gv = (mgdl: number | null | undefined) => {
    if (mgdl === null || mgdl === undefined) return '—';
    return opts.unit === 'MG_DL'
      ? `<span class="num">${num(mgdl, 0)}</span> mg/dL`
      : `<span class="num">${num(mgdl / 18.0182, 1)}</span> mmol/L`;
  };

  const patientRows: string[][] = [
    ['الاسم', esc(data.patient.fullName)],
    ['العمر', `${num(data.patient.age)} سنة`],
    ['الجنس', labelOf('gender', data.patient.gender)],
    ['الطول', `<span class="num">${num(data.patient.heightCm, 0)}</span> سم`],
  ];
  if (data.patient.diabetesType) patientRows.push(['نوع السكري', labelOf('diabetesType', data.patient.diabetesType)]);
  if (data.patient.diagnosisDate) patientRows.push(['تاريخ التشخيص', formatDate(data.patient.diagnosisDate, tz, n)]);
  else if (data.patient.diagnosisYear) patientRows.push(['سنة التشخيص', num(data.patient.diagnosisYear, 0)]);
  if (data.patient.treatmentApproach) patientRows.push(['أسلوب العلاج', labelOf('treatmentApproach', data.patient.treatmentApproach)]);
  if (data.patient.monitoringMethod) patientRows.push(['طريقة مراقبة السكر', labelOf('monitoringMethod', data.patient.monitoringMethod)]);

  const contextRows = data.glucose.byContext.map((c) => [
    esc(labelOf('context', c.context)),
    `<span class="num">${num(c.count)}</span>`,
    gv(c.averageMgdl),
  ]);

  const medRows = data.medications.map((m) => [
    esc(m.name),
    esc(labelOf('medicationCategory', m.category)),
    esc([m.strength, m.dose ? `${m.dose} ${labelOf('doseUnit', m.unit)}` : null].filter(Boolean).join(' — ') || '—'),
    esc(labelOf('frequency', m.frequency)),
    esc(labelOf('route', m.route)),
    esc(labelOf('medicationStatus', m.status)),
  ]);

  const adminRows = data.administrations.slice(0, 40).map((a) => [
    formatDateTime(a.at, tz, n),
    esc(a.medicationName),
    esc(a.dose ?? '—'),
    esc(labelOf('administrationStatus', a.status)),
  ]);

  const activityRows = data.activities.items.slice(0, 25).map((a) => [
    formatDateTime(a.at, tz, n),
    esc(a.type),
    `${num(a.minutes)} دقيقة`,
    esc(labelOf('intensity', a.intensity)),
  ]);

  const weightRows = data.weights.map((w) => [
    formatDate(w.date, tz, n),
    `<span class="num">${num(w.weightKg, 1)}</span> كغم`,
    w.bmi ? `<span class="num">${num(w.bmi, 1)}</span>` : '—',
  ]);

  const hba1cRows = data.hba1c.map((h) => [
    formatDate(h.date, tz, n),
    `<span class="num">${num(h.value, 1)}</span> ${esc(h.unit)}`,
  ]);

  const otherLabRows = data.labs.filter((l) => l.testType !== 'HBA1C').map((l) => [
    formatDate(l.date, tz, n),
    esc(labelOf('labTest', l.testType)),
    l.testType === 'BLOOD_PRESSURE'
      ? `<span class="num">${num(l.value)}</span>/<span class="num">${num(l.valueSecondary ?? 0)}</span> ${esc(l.unit)}`
      : `<span class="num">${num(l.value, l.value % 1 === 0 ? 0 : 2)}</span> ${esc(l.unit)}`,
  ]);

  const symptomRows = data.symptoms.slice(0, 30).map((s) => [
    formatDateTime(s.at, tz, n),
    esc(labelOf('symptom', s.type)),
    esc(labelOf('symptomSeverity', s.severity)),
    esc(s.notes ?? '—'),
  ]);

  const emptyBlock = data.emptyStates.length
    ? `<div class="empty"><strong>ملاحظة حول البيانات:</strong><ul>${data.emptyStates.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>`
    : '';

  const section = (title: string, body: string, note?: string) =>
    body ? `<section><h2>${esc(title)}</h2>${note ? `<p class="note">${esc(note)}</p>` : ''}${body}</section>` : '';

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline' data:;" />
<style>
  @font-face { font-family: 'Cairo'; src: url('${fonts.regular}') format('truetype'); font-weight: 400; }
  @font-face { font-family: 'Cairo'; src: url('${fonts.semibold}') format('truetype'); font-weight: 600; }
  @font-face { font-family: 'Cairo'; src: url('${fonts.bold}') format('truetype'); font-weight: 700; }
  * { box-sizing: border-box; }
  body { font-family: 'Cairo', sans-serif; color: #17324D; margin: 0; font-size: 11px; line-height: 1.7; }
  .num { font-variant-numeric: tabular-nums; direction: ltr; unicode-bidi: embed; display: inline-block; }
  header { border-bottom: 3px solid #2463A6; padding-bottom: 10px; margin-bottom: 14px; }
  h1 { color: #2463A6; font-size: 21px; margin: 0 0 4px; }
  .sub { color: #6B8299; font-size: 11px; }
  .meta { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 8px; font-size: 10.5px; color: #3C5872; }
  h2 { color: #2463A6; font-size: 14px; margin: 0 0 6px; border-right: 4px solid #16A6A0; padding-right: 8px; }
  section { margin-bottom: 14px; page-break-inside: avoid; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #DCEAF6; padding: 4px 6px; text-align: right; font-size: 10.5px; }
  th { background: #F5F9FC; color: #17324D; font-weight: 600; }
  .cards { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
  .card { border: 1px solid #DCEAF6; border-radius: 8px; padding: 7px 10px; min-width: 108px; background: #F9FCFF; }
  .card .l { color: #6B8299; font-size: 9.5px; }
  .card .v { font-size: 13px; font-weight: 700; color: #17324D; }
  .note { color: #6B8299; font-size: 9.5px; margin: 2px 0 6px; }
  .empty { background: #FFF9EE; border: 1px solid #F0D9AE; border-radius: 8px; padding: 8px 10px; margin-bottom: 12px; }
  .empty ul { margin: 4px 0 0; padding-right: 16px; }
  .disclaimer { background: #F5F9FC; border: 1px solid #DCEAF6; border-right: 4px solid #E6A23C; border-radius: 8px; padding: 8px 10px; font-size: 10px; color: #3C5872; }
  footer { margin-top: 14px; border-top: 1px solid #DCEAF6; padding-top: 6px; color: #6B8299; font-size: 9px; }
  .head-row { display: flex; justify-content: space-between; align-items: flex-start; }
</style>
</head>
<body>
<header>
  <div class="head-row">
    <div>
      <h1>تقرير متابعة مرض السكري</h1>
      <div class="sub">منصة صحتي وسكري — تقرير شخصي يعتمد على البيانات التي أدخلها المستخدم</div>
    </div>
    <div class="sub" style="text-align:left">
      <div>تاريخ إصدار التقرير: <span class="num">${formatDate(new Date(), tz, n)}</span></div>
      <div>الفترة: من <span class="num">${formatDate(data.range.from, tz, n)}</span> إلى <span class="num">${formatDate(data.range.to, tz, n)}</span></div>
    </div>
  </div>
</header>

${section('معلومات المريض الأساسية', table(['البيان', 'القيمة'], patientRows))}

${section('ملخص قراءات السكر',
    `<div class="cards">
      <div class="card"><div class="l">عدد القراءات</div><div class="v">${num(data.glucose.count)}</div></div>
      <div class="card"><div class="l">متوسط القراءات</div><div class="v">${gv(data.glucose.averageMgdl)}</div></div>
      <div class="card"><div class="l">أقل قراءة مسجّلة</div><div class="v">${gv(data.glucose.minMgdl)}</div></div>
      <div class="card"><div class="l">أعلى قراءة مسجّلة</div><div class="v">${gv(data.glucose.maxMgdl)}</div></div>
    </div>${table(['السياق', 'العدد', 'المتوسط'], contextRows)}`,
    'القيم أعلاه وصفية لما تم تسجيله فعليًا ولا تمثل نطاقات مستهدفة للعلاج.')}

${section('مخطط قراءات السكر', glucoseChartSvg(data, opts))}

${section('الأدوية المسجّلة', table(['الدواء', 'التصنيف', 'التركيز / الجرعة الموصوفة', 'التكرار', 'طريقة الإعطاء', 'الحالة'], medRows),
    'الجرعة الموصوفة هنا هي ما أدخله المريض، وليست توصية علاجية من المنصة.')}

${section('سجل الجرعات الفعلية', table(['الوقت', 'الدواء', 'الجرعة الفعلية', 'الحالة'], adminRows),
    'الغياب عن هذا السجل لا يعني بالضرورة عدم أخذ الجرعة؛ يعرض الجدول ما تم تسجيله فقط.')}

${section('ملخص النشاط البدني',
    `<div class="cards">
      <div class="card"><div class="l">عدد الأنشطة</div><div class="v">${num(data.activities.count)}</div></div>
      <div class="card"><div class="l">إجمالي المدة</div><div class="v">${num(data.activities.totalMinutes)} دقيقة</div></div>
      <div class="card"><div class="l">متوسط المدة</div><div class="v">${data.activities.averageMinutes === null ? '—' : `${num(data.activities.averageMinutes)} دقيقة`}</div></div>
    </div>${table(['التاريخ والوقت', 'النشاط', 'المدة', 'الشدة'], activityRows)}`)}

${section('قياسات الوزن', table(['التاريخ', 'الوزن', 'مؤشر كتلة الجسم'], weightRows),
    'مؤشر كتلة الجسم رقم معلوماتي، ولا يُستخدم وحده لتشخيص أي حالة.')}

${section('السكر التراكمي (HbA1c)', table(['تاريخ التحليل', 'القيمة'], hba1cRows),
    'هذه القيم مُدخلة يدويًا من المريض من تقارير مخبرية، ولم تُحسب من قراءات السكر المنزلية.')}

${section('تحاليل أخرى مسجّلة', table(['التاريخ', 'التحليل', 'القيمة'], otherLabRows))}

${section('الأعراض المسجّلة', table(['الوقت', 'العرض', 'الشدة', 'ملاحظات'], symptomRows),
    'تسجيل الأعراض لا يعني تحديد سببها.')}

${section('ملاحظات المريض',
    (data.notes.healthNotes || data.notes.diabetesNotes)
      ? `<p>${esc(data.notes.healthNotes ?? '')}${data.notes.diabetesNotes ? `<br/>${esc(data.notes.diabetesNotes)}` : ''}</p>`
      : '')}

${emptyBlock}

<div class="disclaimer">
  هذا التقرير يعتمد على المعلومات التي أدخلها المستخدم، وهو لا يُعد تشخيصًا طبيًا أو بديلًا عن تقييم الطبيب.
  المنصة لا تراقب القراءات بشكل مستمر ولا تنبّه خدمات الطوارئ تلقائيًا. عند الشعور بأعراض شديدة يرجى التوجه فورًا لأقرب خدمة طبية.
</div>

<footer>
  منصة صحتي وسكري — تقرير مُنشأ بتاريخ <span class="num">${formatDateTime(new Date(), tz, n)}</span>.
  الرقم الوطني غير مُضمّن في هذا التقرير حمايةً لبيانات الهوية.
</footer>
</body></html>`;
}

/** الحصول على مسار متصفح Chromium القابل للتنفيذ */
export async function resolveChromiumPath(): Promise<string | null> {
  const { existsSync } = await import('node:fs');

  // المسار المضبوط في متغيرات البيئة أولًا، لكن فقط إن كان الملف موجودًا فعلًا
  const configured = process.env.CHROMIUM_EXECUTABLE_PATH;
  if (configured && existsSync(configured)) return configured;

  try {
    const puppeteer = await import('puppeteer');
    const bundled = await puppeteer.default.executablePath();
    if (bundled && existsSync(bundled)) return bundled;
  } catch {
    /* الحزمة غير مثبّتة */
  }
  return null;
}

/**
 * يبني مستند HTML الكامل للتقرير (خطوط مضمّنة base64).
 * مُصدَّر لكي تتمكّن الاختبارات من التحقق من النصوص الإلزامية
 * (العنوان وإخلاء المسؤولية) ومن غياب الرقم الوطني.
 */
type Fonts = { regular: string; semibold: string; bold: string };

/** تحميل الخطوط العربية المضمّنة (base64) مرة واحدة لكل مستند */
async function loadFonts(): Promise<Fonts> {
  const [regular, semibold, bold] = await Promise.all([
    fontDataUri('Cairo-400.ttf'),
    fontDataUri('Cairo-600.ttf'),
    fontDataUri('Cairo-700.ttf'),
  ]);
  return { regular, semibold, bold };
}

export async function buildReportHtml(data: ReportData, opts: PdfOptions): Promise<string> {
  return buildHtml(data, opts, await loadFonts());
}

export async function renderHealthReportPdf(data: ReportData, opts: PdfOptions): Promise<Uint8Array> {
  const executablePath = await resolveChromiumPath();
  if (!executablePath) {
    throw new Error('محرك PDF (Chromium) غير متوفر في هذه البيئة.');
  }

  const fonts = await loadFonts();
  const html = buildHtml(data, opts, fonts);

  const puppeteer = (await import('puppeteer')).default;
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--disable-dev-shm-usage', '--font-render-hinting=none'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    const buffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `<style>
        @font-face { font-family:'Cairo'; src:url('${fonts.regular}') format('truetype'); }
        .f { font-family:'Cairo', sans-serif; font-size:8px; width:100%; text-align:center; color:#6B8299; }
      </style>
      <div class="f">صحتي وسكري — صفحة <span class="pageNumber"></span> من <span class="totalPages"></span></div>`,
    });
    return new Uint8Array(buffer);
  } finally {
    await browser.close();
  }
}
