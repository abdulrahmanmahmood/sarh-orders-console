import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { z } from 'zod';
import { ConfigService } from '@nestjs/config';
import { ListOrdersDto, OrderSort, SortDirection } from './dto/list-orders.dto';

const cursorBase = {
  v: z.literal(1),
  dir: z.nativeEnum(SortDirection),
  f: z.string().length(16),
};

// The sort value is cast to timestamptz/bigint in SQL, so its shape must be checked here to keep bad input a 400.
const cursorSchema = z.discriminatedUnion('sort', [
  z.object({ ...cursorBase, sort: z.literal(OrderSort.CreatedAt), k: z.tuple([z.iso.datetime(), z.uuid()]) }),
  z.object({ ...cursorBase, sort: z.literal(OrderSort.Amount), k: z.tuple([z.string().regex(/^\d{1,18}$/), z.uuid()]) }),
]);

interface OrderListRow {
  id: string;
  customerName: string;
  customerEmail: string;
  status: string;
  totalAmountCents: number;
  createdAt: string;
}

export interface ListResult {
  data: OrderListRow[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}

interface RawOrderRow {
  id: string;
  customer_name: string;
  customer_email: string;
  status: string;
  total_amount_cents: string;
  created_at: Date | string;
}

@Injectable()
export class OrdersQueryService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  async list(query: ListOrdersDto): Promise<ListResult> {
    await this.simulateDevelopmentLatency();
    const sort = query.sort ?? OrderSort.CreatedAt;
    const direction = query.direction ?? SortDirection.Desc;
    const limit = query.limit ?? 50;
    const fingerprint = this.filterFingerprint(query.search, query.status);
    const parameters: unknown[] = [];
    const bind = (value: unknown): string => {
      parameters.push(value);
      return `$${parameters.length}`;
    };
    const where = ['deleted_at IS NULL'];

    if (query.status) where.push(`status = ${bind(query.status)}::order_status`);
    if (query.search) {
      const escaped = query.search.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
      const placeholder = bind(escaped);
      where.push(`(lower(customer_name) LIKE '%' || ${placeholder} || '%' ESCAPE '\\'
        OR lower(customer_email) LIKE '%' || ${placeholder} || '%' ESCAPE '\\')`);
    }

    const column = sort === OrderSort.CreatedAt ? 'created_at' : 'total_amount_cents';
    const cast = sort === OrderSort.CreatedAt ? 'timestamptz' : 'bigint';
    if (query.cursor) {
      const cursor = this.decodeCursor(query.cursor);
      if (cursor.sort !== sort || cursor.dir !== direction || cursor.f !== fingerprint) {
        throw new BadRequestException({ code: 'INVALID_CURSOR', message: 'Cursor does not match this query' });
      }
      const comparison = direction === SortDirection.Desc ? '<' : '>';
      where.push(`(${column}, id) ${comparison} (${bind(cursor.k[0])}::${cast}, ${bind(cursor.k[1])}::uuid)`);
    }

    const orderDirection = direction === SortDirection.Desc ? 'DESC' : 'ASC';
    const rows = (await this.dataSource.query(
      `SELECT id, customer_name, customer_email, status, total_amount_cents, created_at
       FROM orders
       WHERE ${where.join(' AND ')}
       ORDER BY ${column} ${orderDirection}, id ${orderDirection}
       LIMIT ${bind(limit + 1)}`,
      parameters,
    )) as RawOrderRow[];

    const hasNextPage = rows.length > limit;
    const pageRows = hasNextPage ? rows.slice(0, limit) : rows;
    const last = pageRows.at(-1);
    const nextCursor = hasNextPage && last
      ? this.encodeCursor({
          v: 1,
          sort,
          dir: direction,
          f: fingerprint,
          k: [sort === OrderSort.CreatedAt ? new Date(last.created_at).toISOString() : last.total_amount_cents, last.id],
        })
      : null;

    return {
      data: pageRows.map((row) => {
        const amount = Number(row.total_amount_cents);
        if (!Number.isSafeInteger(amount)) throw new Error('Stored order total is outside the safe integer range');
        return {
          id: row.id,
          customerName: row.customer_name,
          customerEmail: row.customer_email,
          status: row.status,
          totalAmountCents: amount,
          createdAt: new Date(row.created_at).toISOString(),
        };
      }),
      pageInfo: { nextCursor, hasNextPage },
    };
  }

  private async simulateDevelopmentLatency(): Promise<void> {
    if (this.config.get<string>('NODE_ENV') === 'production') return;
    const min = this.config.get<number>('SIMULATE_LATENCY_MIN_MS') ?? 0;
    const max = Math.max(min, this.config.get<number>('SIMULATE_LATENCY_MAX_MS') ?? 0);
    if (max === 0) return;
    const delay = Math.floor(min + Math.random() * (max - min + 1));
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  private filterFingerprint(search?: string, status?: string): string {
    return createHash('sha256').update(`${status ?? ''}|${search ?? ''}`).digest('hex').slice(0, 16);
  }

  private encodeCursor(cursor: z.infer<typeof cursorSchema>): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
  }

  private decodeCursor(encoded: string): z.infer<typeof cursorSchema> {
    try {
      const decoded: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      return cursorSchema.parse(decoded);
    } catch {
      throw new BadRequestException({ code: 'INVALID_CURSOR', message: 'Cursor is malformed' });
    }
  }
}

