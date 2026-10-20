import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Order } from '../database/entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateOrderResult, OrderResponse } from './order.types';

interface NormalizedOrder {
  customerName: string;
  customerEmail: string;
  items: Array<{ name: string; quantity: number; unitPriceCents: number }>;
}

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    private readonly dataSource: DataSource,
  ) {}

  async createIdempotent(dto: CreateOrderDto, userId: string, key: string): Promise<CreateOrderResult> {
    const normalized = this.normalize(dto);
    const requestHash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');

    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      const idempotencyId = randomUUID();
      const claimed = (await manager.query(
        `INSERT INTO idempotency_keys (id, user_id, key, request_hash)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, key) DO NOTHING
         RETURNING id`,
        [idempotencyId, userId, key, requestHash],
      )) as Array<{ id: string }>;

      if (claimed.length === 0) {
        const existing = (await manager.query(
          `SELECT request_hash, order_id FROM idempotency_keys WHERE user_id = $1 AND key = $2`,
          [userId, key],
        )) as Array<{ request_hash: string; order_id: string }>;
        if (!existing[0] || existing[0].request_hash !== requestHash) {
          throw new ConflictException('Idempotency key was already used with a different payload');
        }
        return { replayed: true, order: await this.loadOrder(manager, existing[0].order_id) };
      }

      const totalAmountCents = normalized.items.reduce(
        (sum, item) => sum + item.quantity * item.unitPriceCents,
        0,
      );
      if (!Number.isSafeInteger(totalAmountCents)) {
        throw new ConflictException('Calculated order total exceeds the supported range');
      }

      const orderId = randomUUID();
      await manager.query(
        `INSERT INTO orders (id, customer_name, customer_email, status, total_amount_cents, created_by)
         VALUES ($1, $2, $3, 'pending', $4, $5)`,
        [orderId, normalized.customerName, normalized.customerEmail, totalAmountCents, userId],
      );

      for (const item of normalized.items) {
        await manager.query(
          `INSERT INTO order_items (id, order_id, name, quantity, unit_price_cents)
           VALUES ($1, $2, $3, $4, $5)`,
          [randomUUID(), orderId, item.name, item.quantity, item.unitPriceCents],
        );
      }
      await manager.query(`UPDATE idempotency_keys SET order_id = $1 WHERE id = $2`, [orderId, idempotencyId]);
      return { replayed: false, order: await this.loadOrder(manager, orderId) };
    });
  }

  async softDelete(id: string, userId: string): Promise<void> {
    const result = await this.orders
      .createQueryBuilder()
      .update(Order)
      .set({ deletedAt: () => 'CURRENT_TIMESTAMP', deletedBy: userId })
      .where('id = :id', { id })
      .andWhere('deleted_at IS NULL')
      .execute();
    if (result.affected !== 1) throw new NotFoundException('Order not found');
  }

  private normalize(dto: CreateOrderDto): NormalizedOrder {
    return {
      customerName: dto.customerName.trim(),
      customerEmail: dto.customerEmail.trim().toLowerCase(),
      items: dto.items.map((item) => ({
        name: item.name.trim(),
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
      })),
    };
  }

  private async loadOrder(manager: EntityManager, orderId: string): Promise<OrderResponse> {
    const rows = (await manager.query(
      `SELECT id, customer_name, customer_email, status, total_amount_cents, created_at, deleted_at
       FROM orders WHERE id = $1`,
      [orderId],
    )) as Array<Record<string, string | null>>;
    if (!rows[0]) throw new NotFoundException('Order not found');

    const items = (await manager.query(
      `SELECT id, name, quantity, unit_price_cents FROM order_items WHERE order_id = $1 ORDER BY id`,
      [orderId],
    )) as Array<Record<string, string | number>>;
    const amount = Number(rows[0].total_amount_cents);
    if (!Number.isSafeInteger(amount)) throw new Error('Stored order total is outside the safe integer range');

    return {
      id: String(rows[0].id),
      customerName: String(rows[0].customer_name),
      customerEmail: String(rows[0].customer_email),
      status: String(rows[0].status),
      totalAmountCents: amount,
      createdAt: new Date(String(rows[0].created_at)).toISOString(),
      deletedAt: rows[0].deleted_at ? new Date(String(rows[0].deleted_at)).toISOString() : null,
      items: items.map((item) => ({
        id: String(item.id),
        name: String(item.name),
        quantity: Number(item.quantity),
        unitPriceCents: Number(item.unit_price_cents),
      })),
    };
  }
}

