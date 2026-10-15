import { NextResponse } from 'next/server';

const jsonBody = { required: true, content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } };
const success = { description: 'Success', content: { 'application/json': { schema: { type: 'object', required: ['ok', 'data'], properties: { ok: { type: 'boolean', enum: [true] }, data: { type: 'object', additionalProperties: true } } } } } };
const error = { description: 'Error', content: { 'application/json': { schema: { type: 'object', required: ['ok', 'error', 'code'], properties: { ok: { type: 'boolean', enum: [false] }, error: { type: 'string' }, code: { type: 'string' }, fields: { type: 'object', additionalProperties: { type: 'string' } } } } } } };
const protectedResponses = { '200': success, '400': error, '401': error, '403': error, '404': error, '409': error, '429': error };
const patient = { security: [{ bearerAuth: [] }], 'x-required-role': 'PATIENT', responses: protectedResponses };
const publicPost = { requestBody: jsonBody, responses: { '200': success, '201': success, '400': error, '401': error, '409': error, '429': error } };
const op = (summary: string, options: Record<string, unknown> = {}) => ({ summary, ...options });
const pageParams = [
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
  { name: 'cursor', in: 'query', schema: { type: 'string' }, description: 'Opaque stable cursor from previous page.' },
  { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
  { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
  { name: 'tz', in: 'query', schema: { type: 'string', default: 'Asia/Baghdad' }, description: 'IANA timezone for timestamp filters.' },
  { name: 'sort', in: 'query', schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' } },
];

const spec = {
  openapi: '3.1.0',
  info: { title: 'صحتي وسكري Mobile API', version: '1.0.0', description: 'Versioned patient API for Sahati wa Sukari. All timestamps use ISO 8601; dates use YYYY-MM-DD. Glucose values use MG_DL or MMOL_L as specified per record.' },
  servers: [{ url: 'https://sahatisukarie.up.railway.app', description: 'Production' }],
  tags: [{ name: 'Auth' }, { name: 'Patient' }, { name: 'Records' }, { name: 'Reports' }, { name: 'Config' }],
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'Opaque access token' } }, schemas: { Error: { type: 'object', required: ['ok', 'error', 'code'], properties: { ok: { type: 'boolean' }, error: { type: 'string' }, code: { type: 'string' }, fields: { type: 'object', additionalProperties: { type: 'string' } } } }, Page: { type: 'object', properties: { items: { type: 'array', items: { type: 'object' } }, pagination: { type: 'object', properties: { limit: { type: 'integer' }, hasMore: { type: 'boolean' }, nextCursor: { type: ['string', 'null'] } } } } } } },
  paths: {
    '/api/v1/config': { get: op('Read public app capabilities', { tags: ['Config'], responses: { '200': success } }) },
    '/api/v1/auth/register': { post: op('Register patient account', { tags: ['Auth'], ...publicPost }) },
    '/api/v1/auth/login': { post: op('Create patient device session', { tags: ['Auth'], ...publicPost }) },
    '/api/v1/auth/refresh': { post: op('Rotate refresh token; send X-Refresh-Request-ID UUID', { tags: ['Auth'], ...publicPost }) },
    '/api/v1/auth/forgot-password': { post: op('Create recovery request', { tags: ['Auth'], ...publicPost }) },
    '/api/v1/auth/redeem-recovery': { post: op('Redeem recovery code', { tags: ['Auth'], ...publicPost }) },
    '/api/v1/auth/me': { get: op('Read authenticated patient identity', { tags: ['Auth'], ...patient }) },
    '/api/v1/auth/logout': { post: op('Revoke current device session', { tags: ['Auth'], ...patient }) },
    '/api/v1/auth/logout-all': { post: op('Revoke all patient sessions', { tags: ['Auth'], ...patient }) },
    '/api/v1/auth/change-password': { post: op('Change password and revoke sessions', { tags: ['Auth'], requestBody: jsonBody, ...patient }) },
    '/api/v1/auth/sessions': { get: op('List active device sessions', { tags: ['Auth'], ...patient }) },
    '/api/v1/auth/sessions/{id}': { delete: op('Revoke owned device session', { tags: ['Auth'], ...patient, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }] }) },
    '/api/v1/dashboard': { get: op('Read patient dashboard summary', { tags: ['Patient'], ...patient }) },
    '/api/v1/profile': { get: op('Read patient profile', { tags: ['Patient'], ...patient }), patch: op('Update patient profile', { tags: ['Patient'], requestBody: jsonBody, ...patient }) },
    '/api/v1/profile/conditions': { get: op('Read patient conditions', { tags: ['Patient'], ...patient }), put: op('Replace patient conditions', { tags: ['Patient'], requestBody: jsonBody, ...patient }) },
    '/api/v1/profile/diabetes': { get: op('Read diabetes profile', { tags: ['Patient'], ...patient }), put: op('Update diabetes profile', { tags: ['Patient'], requestBody: jsonBody, ...patient }) },
    '/api/v1/profile/reproductive': { put: op('Update reproductive history', { tags: ['Patient'], requestBody: jsonBody, ...patient }) },
    '/api/v1/profile/additional': { put: op('Update additional profile fields', { tags: ['Patient'], requestBody: jsonBody, ...patient }) },
    '/api/v1/glucose': { get: op('List glucose readings with stable cursor pagination', { tags: ['Records'], ...patient, parameters: [...pageParams, { name: 'context', in: 'query', schema: { type: 'string' } }] }), post: op('Create glucose reading', { tags: ['Records'], requestBody: jsonBody, ...patient, responses: { '201': success, ...protectedResponses } }) },
    '/api/v1/glucose/{id}': { patch: op('Update owned glucose reading', { tags: ['Records'], requestBody: jsonBody, ...patient, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }] }), delete: op('Delete owned glucose reading', { tags: ['Records'], ...patient, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }] }) },
    '/api/v1/medications': { get: op('List medications with stable cursor pagination', { tags: ['Records'], ...patient, parameters: [...pageParams, { name: 'status', in: 'query', schema: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] } }] }), post: op('Create medication', { tags: ['Records'], requestBody: jsonBody, ...patient }) },
    '/api/v1/medications/{id}': { patch: op('Update owned medication', { tags: ['Records'], requestBody: jsonBody, ...patient }), delete: op('Delete owned medication', { tags: ['Records'], ...patient }) },
    '/api/v1/administrations': { get: op('List medication administrations with stable cursor pagination', { tags: ['Records'], ...patient, parameters: pageParams }), post: op('Record medication administration', { tags: ['Records'], requestBody: jsonBody, ...patient }) },
    '/api/v1/administrations/{id}': { delete: op('Delete owned administration', { tags: ['Records'], ...patient }) },
    '/api/v1/meals': { get: op('List meal records with stable cursor pagination', { tags: ['Records'], ...patient, parameters: pageParams }), post: op('Create meal record', { tags: ['Records'], requestBody: jsonBody, ...patient }) },
    '/api/v1/meals/{id}': { delete: op('Delete owned meal record', { tags: ['Records'], ...patient }) },
    '/api/v1/activities': { get: op('List activity records with stable cursor pagination', { tags: ['Records'], ...patient, parameters: pageParams }), post: op('Create activity record', { tags: ['Records'], requestBody: jsonBody, ...patient }) },
    '/api/v1/activities/{id}': { delete: op('Delete owned activity record', { tags: ['Records'], ...patient }) },
    '/api/v1/sleep': { get: op('List sleep records with stable cursor pagination', { tags: ['Records'], ...patient, parameters: pageParams }), post: op('Create sleep record', { tags: ['Records'], requestBody: jsonBody, ...patient }) },
    '/api/v1/sleep/{id}': { delete: op('Delete owned sleep record', { tags: ['Records'], ...patient }) },
    '/api/v1/symptoms': { get: op('List symptom records with stable cursor pagination', { tags: ['Records'], ...patient, parameters: pageParams }), post: op('Create symptom record', { tags: ['Records'], requestBody: jsonBody, ...patient }) },
    '/api/v1/symptoms/{id}': { delete: op('Delete owned symptom record', { tags: ['Records'], ...patient }) },
    '/api/v1/factors': { get: op('List daily factors with stable cursor pagination', { tags: ['Records'], ...patient, parameters: pageParams }), post: op('Create daily factor', { tags: ['Records'], requestBody: jsonBody, ...patient }) },
    '/api/v1/factors/{id}': { delete: op('Delete owned daily factor', { tags: ['Records'], ...patient }) },
    '/api/v1/weight': { get: op('List weight records with stable cursor pagination', { tags: ['Records'], ...patient, parameters: pageParams }), post: op('Create weight record', { tags: ['Records'], requestBody: jsonBody, ...patient }) },
    '/api/v1/weight/{id}': { delete: op('Delete owned weight record', { tags: ['Records'], ...patient }) },
    '/api/v1/labs': { get: op('List laboratory results with stable cursor pagination', { tags: ['Records'], ...patient, parameters: pageParams }), post: op('Create laboratory result', { tags: ['Records'], requestBody: jsonBody, ...patient }) },
    '/api/v1/labs/{id}': { delete: op('Delete owned laboratory result', { tags: ['Records'], ...patient }) },
    '/api/v1/reports/summary': { get: op('Read report summary', { tags: ['Reports'], ...patient }) },
    '/api/v1/reports/pdf': { get: op('Download report PDF', { tags: ['Reports'], ...patient, responses: { '200': { description: 'PDF attachment', content: { 'application/pdf': { schema: { type: 'string', format: 'binary' } } } }, '401': error, '403': error } }) },
    '/api/v1/settings/contact': { patch: op('Update contact settings', { tags: ['Patient'], requestBody: jsonBody, ...patient }) },
  },
};

export async function GET() {
  return NextResponse.json(spec, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
}
