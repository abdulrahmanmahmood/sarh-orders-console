import 'reflect-metadata';
import AppDataSource from './data-source';
import { hashPassword } from '../security/password';

const ADMIN_EMAIL = 'admin@sarh.local';
const AGENT_EMAIL = 'agent@sarh.local';
const DEVELOPMENT_PASSWORD = 'SarhDemo2026!';

async function seed(): Promise<void> {
  const startedAt = performance.now();
  const reset = process.argv.includes('--reset');
  await AppDataSource.initialize();

  try {
    const [{ count }] = (await AppDataSource.query(`SELECT count(*)::int AS count FROM orders`)) as Array<{ count: number }>;
    if (count > 0 && !reset) {
      throw new Error(`Refusing to seed a non-empty orders table (${count} rows). Re-run with --reset to replace local data.`);
    }

    if (reset) {
      await AppDataSource.query(`TRUNCATE idempotency_keys, order_items, orders, users CASCADE`);
    }

    const [adminHash, agentHash] = await Promise.all([
      hashPassword(DEVELOPMENT_PASSWORD),
      hashPassword(DEVELOPMENT_PASSWORD),
    ]);

    await AppDataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin'), ($3, $4, 'agent')`,
        [ADMIN_EMAIL, adminHash, AGENT_EMAIL, agentHash],
      );

      await manager.query(`
        INSERT INTO orders (id, customer_name, customer_email, status, total_amount_cents, created_at)
        SELECT
          gen_random_uuid(),
          'Customer ' || n,
          'customer' || n || '@example.com',
          (ARRAY['pending', 'processing', 'completed', 'cancelled']::order_status[])[1 + (n % 4)],
          0,
          date_trunc('milliseconds', now() - ((n % 365) || ' days')::interval - ((n % 86400) || ' seconds')::interval)
        FROM generate_series(1, 50000) AS n
      `);

      await manager.query(`
        INSERT INTO order_items (order_id, name, quantity, unit_price_cents)
        SELECT
          o.id,
          'Item ' || item_number,
          1 + (abs(hashtext(o.id::text || ':' || item_number::text)) % 5),
          100 + (abs(hashtext(item_number::text || ':' || o.id::text)) % 50000)
        FROM orders o
        CROSS JOIN LATERAL generate_series(1, 1 + (abs(hashtext(o.id::text)) % 5)) AS item_number
      `);

      await manager.query(`
        UPDATE orders o
        SET total_amount_cents = totals.amount
        FROM (
          SELECT order_id, SUM(quantity::bigint * unit_price_cents)::bigint AS amount
          FROM order_items
          GROUP BY order_id
        ) totals
        WHERE totals.order_id = o.id
      `);
    });

    const [summary] = (await AppDataSource.query(`
      SELECT
        (SELECT count(*)::int FROM users) AS users,
        (SELECT count(*)::int FROM orders) AS orders,
        (SELECT count(*)::int FROM order_items) AS items,
        (SELECT count(*)::int FROM orders o WHERE o.total_amount_cents <> (
          SELECT SUM(i.quantity::bigint * i.unit_price_cents)::bigint FROM order_items i WHERE i.order_id = o.id
        )) AS invalid_totals
    `)) as Array<{ users: number; orders: number; items: number; invalid_totals: number }>;

    console.table({ ...summary, elapsedMs: Math.round(performance.now() - startedAt) });
    console.log(`Admin: ${ADMIN_EMAIL}`);
    console.log(`Agent: ${AGENT_EMAIL}`);
    console.log(`Development password: ${DEVELOPMENT_PASSWORD}`);
  } finally {
    await AppDataSource.destroy();
  }
}

void seed().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

