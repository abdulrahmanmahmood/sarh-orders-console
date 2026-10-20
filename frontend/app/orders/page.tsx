import { Suspense } from 'react';
import { OrdersClient } from './orders-client';

export default function OrdersPage() {
  return <Suspense fallback={<main className="console"><div className="notice">Loading orders…</div></main>}><OrdersClient /></Suspense>;
}
