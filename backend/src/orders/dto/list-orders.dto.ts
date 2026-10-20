import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { OrderStatus } from '../../database/entities/order.entity';

export enum OrderSort {
  CreatedAt = 'createdAt',
  Amount = 'amount',
}

export enum SortDirection {
  Asc = 'asc',
  Desc = 'desc',
}

export class ListOrdersDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @MinLength(3)
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsEnum(OrderSort)
  sort: OrderSort = OrderSort.CreatedAt;

  @IsOptional()
  @IsEnum(SortDirection)
  direction: SortDirection = SortDirection.Desc;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  cursor?: string;
}

