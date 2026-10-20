import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { IdempotencyKey } from './entities/idempotency-key.entity';
import { OrderItem } from './entities/order-item.entity';
import { Order } from './entities/order.entity';
import { User } from './entities/user.entity';
import { InitialSchema1761000000000 } from './migrations/1761000000000-initial-schema';

config({ path: process.env.ENV_FILE ?? '../.env', quiet: true });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const AppDataSource = new DataSource({
  type: 'postgres',
  url: databaseUrl,
  entities: [User, Order, OrderItem, IdempotencyKey],
  migrations: [InitialSchema1761000000000],
  synchronize: false,
  migrationsRun: false,
  logging: false,
  extra: { max: 10 },
});

export default AppDataSource;

