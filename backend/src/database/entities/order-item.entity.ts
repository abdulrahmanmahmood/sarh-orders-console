import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'order_items' })
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ name: 'unit_price_cents', type: 'bigint' })
  unitPriceCents: string;
}

