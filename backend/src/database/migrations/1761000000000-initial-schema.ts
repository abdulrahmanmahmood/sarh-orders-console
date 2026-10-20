import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1761000000000 implements MigrationInterface {
  name = 'InitialSchema1761000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
    await queryRunner.query(`CREATE TYPE user_role AS ENUM ('admin', 'agent')`);
    await queryRunner.query(`CREATE TYPE order_status AS ENUM ('pending', 'processing', 'completed', 'cancelled')`);

    await queryRunner.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text NOT NULL,
        password_hash text NOT NULL,
        role user_role NOT NULL,
        created_at timestamptz(3) NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX users_email_lower_unique ON users (lower(email))`);

    await queryRunner.query(`
      CREATE TABLE orders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_name text NOT NULL,
        customer_email text NOT NULL,
        status order_status NOT NULL DEFAULT 'pending',
        total_amount_cents bigint NOT NULL CHECK (total_amount_cents >= 0),
        created_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
        created_at timestamptz(3) NOT NULL DEFAULT now(),
        deleted_at timestamptz(3) NULL,
        deleted_by uuid NULL REFERENCES users(id) ON DELETE RESTRICT,
        CONSTRAINT chk_orders_delete_pair CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE order_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
        name text NOT NULL,
        quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 1000),
        unit_price_cents bigint NOT NULL CHECK (unit_price_cents BETWEEN 0 AND 100000000)
      )
    `);

    await queryRunner.query(`
      CREATE TABLE idempotency_keys (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        key uuid NOT NULL,
        request_hash text NOT NULL,
        order_id uuid NULL REFERENCES orders(id) ON DELETE RESTRICT,
        created_at timestamptz(3) NOT NULL DEFAULT now(),
        CONSTRAINT uq_idempotency_user_key UNIQUE (user_id, key)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_orders_name_trgm ON orders USING GIN (lower(customer_name) gin_trgm_ops) WHERE deleted_at IS NULL`);
    await queryRunner.query(`CREATE INDEX idx_orders_email_trgm ON orders USING GIN (lower(customer_email) gin_trgm_ops) WHERE deleted_at IS NULL`);
    await queryRunner.query(`CREATE INDEX idx_orders_created_id ON orders (created_at DESC, id DESC) WHERE deleted_at IS NULL`);
    await queryRunner.query(`CREATE INDEX idx_orders_amount_id ON orders (total_amount_cents DESC, id DESC) WHERE deleted_at IS NULL`);
    await queryRunner.query(`CREATE INDEX idx_orders_status_created_id ON orders (status, created_at DESC, id DESC) WHERE deleted_at IS NULL`);
    await queryRunner.query(`CREATE INDEX idx_orders_status_amount_id ON orders (status, total_amount_cents DESC, id DESC) WHERE deleted_at IS NULL`);
    await queryRunner.query(`CREATE INDEX idx_order_items_order_id ON order_items (order_id)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS idempotency_keys`);
    await queryRunner.query(`DROP TABLE IF EXISTS order_items`);
    await queryRunner.query(`DROP TABLE IF EXISTS orders`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
    await queryRunner.query(`DROP TYPE IF EXISTS order_status`);
    await queryRunner.query(`DROP TYPE IF EXISTS user_role`);
  }
}

