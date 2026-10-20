import { config } from 'dotenv';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';

config({ path: process.env.ENV_FILE ?? '../.env', quiet: true });

const baseUrl = process.env.API_URL ?? 'http://localhost:3001/api';
const origin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';
const secret = process.env.JWT_SECRET ?? '';
const issuer = process.env.JWT_ISSUER ?? 'sarh-orders-api';
const audience = process.env.JWT_AUDIENCE ?? 'sarh-orders-web';
const password = 'SarhDemo2026!';

interface Check { check: string; expected: number; actual: number; pass: boolean }
const checks: Check[] = [];

function record(check: string, expected: number, actual: number): void {
  checks.push({ check, expected, actual, pass: expected === actual });
}

function request(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { ...init, headers: { Origin: origin, ...init.headers } });
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function token(claims: object, signingSecret: string | null): string {
  const header = encode({ alg: signingSecret === null ? 'none' : 'HS256', typ: 'JWT' });
  const body = encode(claims);
  const signature = signingSecret === null
    ? ''
    : createHmac('sha256', signingSecret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

async function login(email: string): Promise<string> {
  const response = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`Login as ${email} failed with ${response.status}`);
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error(`Login as ${email} did not set a cookie`);
  return cookie;
}

async function listStatus(cookie?: string): Promise<number> {
  return (await request('/orders?limit=1', cookie ? { headers: { Cookie: cookie } } : {})).status;
}

async function searchCount(cookie: string, term: string): Promise<number> {
  const response = await request(`/orders?search=${term}`, { headers: { Cookie: cookie } });
  return ((await response.json()) as { data: unknown[] }).data.length;
}

async function run(): Promise<void> {
  if (Buffer.byteLength(secret, 'utf8') < 32) throw new Error('JWT_SECRET must be set in .env to build the expired/audience tokens');
  const now = Math.floor(Date.now() / 1000);
  const forgedAdmin = { sub: randomUUID(), email: 'forged@sarh.local', role: 'admin', iss: issuer, aud: audience, iat: now, exp: now + 3600 };

  record('No cookie → list', 401, await listStatus());
  record('Admin token signed with a guessed secret', 401, await listStatus(`access_token=${token(forgedAdmin, 'sarh-secret-2026')}`));
  record('Admin token with alg "none"', 401, await listStatus(`access_token=${token(forgedAdmin, null)}`));
  record('Real secret, expired token', 401, await listStatus(`access_token=${token({ ...forgedAdmin, iat: now - 7200, exp: now - 3600 }, secret)}`));
  record('Real secret, wrong audience', 401, await listStatus(`access_token=${token({ ...forgedAdmin, aud: 'another-app' }, secret)}`));
  // Control: the same claims signed correctly must pass, so the 401s above come from each specific defect.
  record('Control: real secret, valid claims', 200, await listStatus(`access_token=${token(forgedAdmin, secret)}`));

  const agent = await login('agent@sarh.local');
  record('Agent session → list', 200, await listStatus(agent));

  const marker = randomBytes(6).toString('hex');
  const created = await request('/orders', {
    method: 'POST',
    headers: { Cookie: agent, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({ customerName: 'Auth Proof', customerEmail: `authproof${marker}@example.com`, items: [{ name: 'Proof item', quantity: 1, unitPriceCents: 100 }] }),
  });
  record('Agent creates an order', 201, created.status);
  const orderId = ((await created.json()) as { order: { id: string } }).order.id;
  record('New order is visible in search (rows)', 1, await searchCount(agent, marker));

  record('Agent deletes an order', 403, (await request(`/orders/${orderId}`, { method: 'DELETE', headers: { Cookie: agent } })).status);
  record('POST from a foreign Origin', 403, (await request('/orders', {
    method: 'POST',
    headers: { Cookie: agent, Origin: 'https://evil.example', 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() },
    body: '{}',
  })).status);

  const admin = await login('admin@sarh.local');
  record('Admin soft-deletes the order', 200, (await request(`/orders/${orderId}`, { method: 'DELETE', headers: { Cookie: admin } })).status);
  record('Deleted order is gone from search (rows)', 0, await searchCount(admin, marker));
  record('Admin deletes it again', 404, (await request(`/orders/${orderId}`, { method: 'DELETE', headers: { Cookie: admin } })).status);

  console.table(checks);
  const failed = checks.filter((check) => !check.pass);
  if (failed.length > 0) throw new Error(`FAIL: ${failed.length} authorization check(s) did not match`);
  console.log(`PASS: all ${checks.length} authentication and authorization checks matched.`);
}

void run().catch((error: unknown) => {
  if (checks.length > 0) console.table(checks);
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
