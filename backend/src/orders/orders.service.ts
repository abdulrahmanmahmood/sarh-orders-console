import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '../database/entities/order.entity';

@Injectable()
export class OrdersService {
  constructor(@InjectRepository(Order) private readonly orders: Repository<Order>) {}

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
}

