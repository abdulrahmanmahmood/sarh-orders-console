import { describe, expect, it } from 'vitest';
import type { ReadonlyURLSearchParams } from 'next/navigation';
import { filtersFromSearchParams } from './order-filter-url';

describe('filtersFromSearchParams', () => {
  it('restores valid shared URL filters and normalizes search', () => {
    const params = new URLSearchParams('search=%20Ahmed%20&status=completed&sort=amount&direction=asc');
    expect(filtersFromSearchParams(params as ReadonlyURLSearchParams)).toEqual({
      search: 'ahmed', status: 'completed', sort: 'amount', direction: 'asc', cursor: '',
    });
  });

  it('falls back safely for unsupported URL values', () => {
    const params = new URLSearchParams('status=deleted&sort=password&direction=sideways');
    expect(filtersFromSearchParams(params as ReadonlyURLSearchParams)).toEqual({
      search: '', status: '', sort: 'createdAt', direction: 'desc', cursor: '',
    });
  });
});
