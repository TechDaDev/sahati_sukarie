import * as activities from '../../app/api/activities/route';
import * as activityItem from '../../app/api/activities/[id]/route';
import * as administrations from '../../app/api/administrations/route';
import * as administrationItem from '../../app/api/administrations/[id]/route';
import * as factors from '../../app/api/factors/route';
import * as factorItem from '../../app/api/factors/[id]/route';
import * as glucose from '../../app/api/glucose/route';
import * as glucoseItem from '../../app/api/glucose/[id]/route';
import * as labs from '../../app/api/labs/route';
import * as labItem from '../../app/api/labs/[id]/route';
import * as meals from '../../app/api/meals/route';
import * as mealItem from '../../app/api/meals/[id]/route';
import * as medications from '../../app/api/medications/route';
import * as medicationItem from '../../app/api/medications/[id]/route';
import * as profile from '../../app/api/profile/route';
import * as conditions from '../../app/api/profile/conditions/route';
import * as diabetes from '../../app/api/profile/diabetes/route';
import * as reproductive from '../../app/api/profile/reproductive/route';
import * as additional from '../../app/api/profile/additional/route';
import * as reports from '../../app/api/reports/summary/route';
import * as reportPdf from '../../app/api/reports/pdf/route';
import * as settings from '../../app/api/settings/contact/route';
import * as sleep from '../../app/api/sleep/route';
import * as sleepItem from '../../app/api/sleep/[id]/route';
import * as symptoms from '../../app/api/symptoms/route';
import * as symptomItem from '../../app/api/symptoms/[id]/route';
import * as weight from '../../app/api/weight/route';
import * as weightItem from '../../app/api/weight/[id]/route';
import { ApiError } from '../auth/session';
import { requireSession } from '../auth/session';
import { getProfileByUserId } from '../services/patient';
import { ok } from '../http';
import { listMobilePage } from './pagination';
import { formatGlucose } from '../../lib/format';

const PAGED_COLLECTIONS = new Set(['glucose', 'medications', 'administrations', 'activities', 'factors', 'labs', 'meals', 'sleep', 'symptoms', 'weight']);

type Handler = (request: Request, ctx?: { params: Promise<{ id: string }> }) => Promise<Response>;
type RouteModule = Partial<Record<'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', Handler>>;

const routes: Record<string, { collection?: RouteModule; item?: RouteModule }> = {
  activities: { collection: activities as RouteModule, item: activityItem as RouteModule },
  administrations: { collection: administrations as RouteModule, item: administrationItem as RouteModule },
  factors: { collection: factors as RouteModule, item: factorItem as RouteModule },
  glucose: { collection: glucose as RouteModule, item: glucoseItem as RouteModule },
  labs: { collection: labs as RouteModule, item: labItem as RouteModule },
  meals: { collection: meals as RouteModule, item: mealItem as RouteModule },
  medications: { collection: medications as RouteModule, item: medicationItem as RouteModule },
  sleep: { collection: sleep as RouteModule, item: sleepItem as RouteModule },
  symptoms: { collection: symptoms as RouteModule, item: symptomItem as RouteModule },
  weight: { collection: weight as RouteModule, item: weightItem as RouteModule },
  profile: { collection: profile as RouteModule },
  'profile/conditions': { collection: conditions as RouteModule },
  'profile/diabetes': { collection: diabetes as RouteModule },
  'profile/reproductive': { collection: reproductive as RouteModule },
  'profile/additional': { collection: additional as RouteModule },
  'reports/summary': { collection: reports as RouteModule },
  'reports/pdf': { collection: reportPdf as RouteModule },
  'settings/contact': { collection: settings as RouteModule },
};

export async function dispatchPatientRoute(request: Request, path: string[]): Promise<Response> {
  const method = request.method.toUpperCase() as keyof RouteModule;
  const rawPath = path.join('/');
  if (rawPath === 'profile/reproductive' && method === 'GET') {
    const session = await requireSession(['PATIENT']);
    const profile = await getProfileByUserId(session.user.id);
    if (!profile) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'لم يتم العثور على الملف الصحي.');
    return withNoStore(ok({ reproductive: profile.reproductive }));
  }
  if (PAGED_COLLECTIONS.has(rawPath) && method === 'GET') {
    const session = await requireSession(['PATIENT']);
    const profile = await getProfileByUserId(session.user.id);
    if (!profile) throw new ApiError(404, 'PROFILE_NOT_FOUND', 'لم يتم العثور على الملف الصحي.');
    const page = await listMobilePage(rawPath as Parameters<typeof listMobilePage>[0], request, profile.profile.id, profile.profile.timezone ?? 'Asia/Baghdad');
    if (rawPath === 'glucose') {
      const items = page.items.map((item) => {
        const reading = item as Record<string, unknown>;
        const standardized = Number(reading.standardizedValueMgdl);
        return { ...reading, value: Number(reading.glucoseValue), unit: reading.glucoseUnit, displayValue: formatGlucose(standardized, profile.profile.preferredGlucoseUnit) };
      });
      return withNoStore(ok({ preferredUnit: profile.profile.preferredGlucoseUnit, items, pagination: page.pagination }));
    }
    return withNoStore(ok(page));
  }
  const [routeName, id] = splitItemPath(rawPath);
  const match = routes[routeName];
  const handler = id ? match?.item?.[method] : match?.collection?.[method];
  if (!handler) throw new ApiError(404, 'NOT_FOUND', 'المسار المطلوب غير متاح.');
  const response = await handler(request, id ? { params: Promise.resolve({ id }) } : undefined);
  return withNoStore(response);
}

function withNoStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'no-store, max-age=0');
  headers.set('Pragma', 'no-cache');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function splitItemPath(path: string): [string, string | undefined] {
  for (const name of Object.keys(routes).sort((a, b) => b.length - a.length)) {
    if (path === name) return [name, undefined];
    if (path.startsWith(`${name}/`)) return [name, path.slice(name.length + 1)];
  }
  return [path, undefined];
}
