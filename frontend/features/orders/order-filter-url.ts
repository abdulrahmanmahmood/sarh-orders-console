import type { ReadonlyURLSearchParams } from 'next/navigation';
import type { OrderFilters } from './use-orders-query';

const statuses = new Set(['pending', 'processing', 'completed', 'cancelled']);

export function filtersFromSearchParams(params: ReadonlyURLSearchParams): OrderFilters {
  const status = params.get('status') ?? '';
  const sort = params.get('sort');
  const direction = params.get('direction');
  return {
    search: (params.get('search') ?? '').trim().toLowerCase(),
    status: statuses.has(status) ? status : '',
    sort: sort === 'amount' ? 'amount' : 'createdAt',
    direction: direction === 'asc' ? 'asc' : 'desc',
    cursor: '',
  };
}

