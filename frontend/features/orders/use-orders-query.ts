'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { OrdersPageResponse } from './types';

export interface OrderFilters {
  search: string;
  status: string;
  sort: 'createdAt' | 'amount';
  direction: 'asc' | 'desc';
  cursor: string;
}

export function useOrdersQuery(filters: OrderFilters) {
  const [result, setResult] = useState<OrdersPageResponse>({ data: [], pageInfo: { nextCursor: null, hasNextPage: false } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const sequence = useRef(0);

  const reload = useCallback(() => setRetry((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    const current = ++sequence.current;
    const params = new URLSearchParams({ sort: filters.sort, direction: filters.direction, limit: '50' });
    if (filters.search.length >= 3) params.set('search', filters.search);
    if (filters.status) params.set('status', filters.status);
    if (filters.cursor) params.set('cursor', filters.cursor);

    setLoading(true);
    setError(null);
    void fetch(`/api/orders?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 401 ? 'Your session expired.' : 'Could not load orders.');
        return (await response.json()) as OrdersPageResponse;
      })
      .then((data) => {
        if (sequence.current === current) setResult(data);
      })
      .catch((reason: unknown) => {
        if (sequence.current === current && !(reason instanceof DOMException && reason.name === 'AbortError')) {
          setError(reason instanceof Error ? reason.message : 'Could not load orders.');
        }
      })
      .finally(() => {
        if (sequence.current === current) setLoading(false);
      });
    return () => controller.abort();
  }, [filters.cursor, filters.direction, filters.search, filters.sort, filters.status, retry]);

  return { ...result, loading, error, reload };
}

