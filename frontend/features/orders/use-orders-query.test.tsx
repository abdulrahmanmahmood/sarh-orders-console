import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useOrdersQuery, type OrderFilters } from './use-orders-query';

function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

function response(name: string): Response {
  return { ok: true, json: async () => ({ data: [{ id: name }], pageInfo: { nextCursor: null, hasNextPage: false } }) } as Response;
}

describe('useOrdersQuery', () => {
  afterEach(() => vi.restoreAllMocks());

  it('never lets older responses replace the latest filter result', async () => {
    const first = deferred(); const second = deferred(); const third = deferred();
    const requests = [first, second, third];
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => requests.shift()!.promise));
    const base: OrderFilters = { search: '', status: 'pending', sort: 'createdAt', direction: 'desc', cursor: '' };
    const { result, rerender } = renderHook(({ filters }) => useOrdersQuery(filters), { initialProps: { filters: base } });
    rerender({ filters: { ...base, status: 'processing' } });
    rerender({ filters: { ...base, status: 'completed' } });

    expect(fetch).toHaveBeenCalledTimes(3);
    await act(async () => { third.resolve(response('latest')); await third.promise; });
    await waitFor(() => expect(result.current.data[0]?.id).toBe('latest'));
    await act(async () => { first.resolve(response('stale-first')); second.resolve(response('stale-second')); await Promise.all([first.promise, second.promise]); });
    expect(result.current.data[0]?.id).toBe('latest');
    expect(result.current.loading).toBe(false);
  });

  it('flags an expired session so the page can redirect to login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 } as Response));
    const filters: OrderFilters = { search: '', status: '', sort: 'createdAt', direction: 'desc', cursor: '' };
    const { result } = renderHook(() => useOrdersQuery(filters));
    await waitFor(() => expect(result.current.unauthorized).toBe(true));
    expect(result.current.error).toBe('Your session expired.');
  });
});
