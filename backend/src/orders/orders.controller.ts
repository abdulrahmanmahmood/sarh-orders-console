import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { isUUID } from 'class-validator';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../database/entities/user.entity';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateOrderResult } from './order.types';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  async create(
    @Body() dto: CreateOrderDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CreateOrderResult> {
    if (!idempotencyKey || !isUUID(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key must be a UUID');
    }
    const result = await this.orders.createIdempotent(dto, user.id, idempotencyKey);
    response.status(result.replayed ? HttpStatus.OK : HttpStatus.CREATED);
    if (result.replayed) response.setHeader('Idempotency-Replayed', 'true');
    return result;
  }

  @Roles(UserRole.Admin)
  @HttpCode(HttpStatus.OK)
  @Delete(':id')
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ ok: true }> {
    await this.orders.softDelete(id, user.id);
    return { ok: true };
  }
}
