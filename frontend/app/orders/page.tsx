'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { OrderFilters, useOrdersQuery } from '@/features/orders/use-orders-query';
import { CreateOrderForm } from '@/features/orders/create-order-form';

const initial: OrderFilters = { search: '', status: '', sort: 'createdAt', direction: 'desc', cursor: '' };
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export default function OrdersPage() {
  const router = useRouter();
  const [filters, setFilters] = useState(initial);
  const [searchInput, setSearchInput] = useState('');
  const [user, setUser] = useState<{ email: string; role: string } | null>(null);
  const query = useOrdersQuery(filters);

  useEffect(() => { void fetch('/api/auth/me').then(async (r) => { if (!r.ok) router.replace('/login'); else setUser(await r.json()); }); }, [router]);
  useEffect(() => { const id = setTimeout(() => setFilters((f) => ({ ...f, search: searchInput.trim().toLowerCase(), cursor: '' })), 300); return () => clearTimeout(id); }, [searchInput]);
  useEffect(() => { const params = new URLSearchParams(); Object.entries(filters).forEach(([k, v]) => { if (v && k !== 'cursor') params.set(k, v); }); window.history.replaceState(null, '', `/orders?${params}`); }, [filters]);
  const hint = useMemo(() => searchInput.trim().length > 0 && searchInput.trim().length < 3, [searchInput]);

  function update(patch: Partial<OrderFilters>) { setFilters((current) => ({ ...current, ...patch, cursor: '' })); }
  async function logout() { await fetch('/api/auth/logout', { method: 'POST' }); router.replace('/login'); }

  return <main className="console"><header><div><p className="eyebrow">SARH Operations</p><h1>Orders</h1></div><div className="session"><span>{user?.email}</span><button className="secondary" onClick={logout}>Log out</button></div></header>
    <section className="toolbar">
      <label>Search<input placeholder="Name or email" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} /></label>
      <label>Status<select value={filters.status} onChange={(e) => update({ status: e.target.value })}><option value="">All</option><option>pending</option><option>processing</option><option>completed</option><option>cancelled</option></select></label>
      <label>Sort<select value={filters.sort} onChange={(e) => update({ sort: e.target.value as OrderFilters['sort'] })}><option value="createdAt">Created date</option><option value="amount">Amount</option></select></label>
      <label>Direction<select value={filters.direction} onChange={(e) => update({ direction: e.target.value as OrderFilters['direction'] })}><option value="desc">Descending</option><option value="asc">Ascending</option></select></label>
    </section>
    <CreateOrderForm onCreated={query.reload} />
    {hint && <p className="hint">Type at least 3 characters to search.</p>}
    {query.error && <div className="notice error">{query.error} <button onClick={query.reload}>Retry</button></div>}
    <section className={`table-wrap ${query.loading ? 'loading' : ''}`}><table><thead><tr><th>Customer</th><th>Status</th><th>Amount</th><th>Created</th></tr></thead><tbody>
      {query.data.map((order) => <tr key={order.id}><td><strong>{order.customerName}</strong><small>{order.customerEmail}</small></td><td><span className={`status ${order.status}`}>{order.status}</span></td><td>{money.format(order.totalAmountCents / 100)}</td><td>{new Date(order.createdAt).toLocaleString()}</td></tr>)}
    </tbody></table>{query.loading && <div className="spinner">Loading…</div>}</section>
    {!query.loading && !query.error && query.data.length === 0 && <div className="notice">No orders match these filters.</div>}
    <footer><span>{query.data.length} orders on this page</span><button disabled={!query.pageInfo.hasNextPage || query.loading} onClick={() => setFilters((f) => ({ ...f, cursor: query.pageInfo.nextCursor ?? '' }))}>Next page</button></footer>
  </main>;
}
