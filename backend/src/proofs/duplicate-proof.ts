import { randomUUID } from 'node:crypto';
import AppDataSource from '../database/data-source';

const baseUrl = process.env.API_URL ?? 'http://localhost:3001/api';
const origin = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';

async function request(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { ...init, headers: { Origin: origin, ...init.headers } });
}

async function run(): Promise<void> {
  const login = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'agent@sarh.local', password: 'SarhDemo2026!' }),
  });
  if (!login.ok) throw new Error(`Login failed with ${login.status}`);
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error('Login did not set a cookie');

  const key = randomUUID();
  const email = `proof+${randomUUID()}@example.com`;
  const payload = { customerName: 'Concurrent Proof', customerEmail: email, items: [{ name: 'Proof item', quantity: 2, unitPriceCents: 1250 }] };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('Possible connection-pool deadlock: proof exceeded 15 seconds'), 15_000);
  let responses: Response[];
  try {
    responses = await Promise.all(Array.from({ length: 20 }, () => request('/orders', {
      method: 'POST', signal: controller.signal,
      headers: { Cookie: cookie, 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(payload),
    })));
  } finally { clearTimeout(timeout); }

  const bodies = await Promise.all(responses.map(async (response) => ({ status: response.status, body: await response.json() as { order?: { id?: string } } })));
  const created = bodies.filter((result) => result.status === 201).length;
  const replayed = bodies.filter((result) => result.status === 200).length;
  const orderIds = new Set(bodies.map((result) => result.body.order?.id));
  if (created !== 1 || replayed !== 19 || orderIds.size !== 1) throw new Error(`HTTP proof failed: created=${created}, replayed=${replayed}, ids=${orderIds.size}`);

  await AppDataSource.initialize();
  try {
    const [counts] = (await AppDataSource.query(`SELECT
      (SELECT count(*)::int FROM orders WHERE customer_email = $1) AS orders,
      (SELECT count(*)::int FROM order_items WHERE order_id = (SELECT id FROM orders WHERE customer_email = $1)) AS items,
      (SELECT count(*)::int FROM idempotency_keys WHERE key = $2) AS keys`, [email, key])) as Array<{ orders: number; items: number; keys: number }>;
    if (counts.orders !== 1 || counts.items !== 1 || counts.keys !== 1) throw new Error(`DB proof failed: ${JSON.stringify(counts)}`);

    const conflict = await request('/orders', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify({ ...payload, customerName: 'Changed' }) });
    if (conflict.status !== 409) throw new Error(`Expected 409 for changed payload, received ${conflict.status}`);
    console.table({ concurrentRequests: 20, created, replayed, uniqueOrderIds: orderIds.size, dbOrders: counts.orders, dbItems: counts.items, dbKeys: counts.keys, changedPayloadStatus: conflict.status });
    console.log('PASS: concurrent retries produced exactly one order.');
  } finally { await AppDataSource.destroy(); }
}

void run().catch((error: unknown) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
