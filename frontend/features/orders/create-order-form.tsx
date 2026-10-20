'use client';

import { FormEvent, useMemo, useRef, useState } from 'react';

interface DraftItem { name: string; quantity: string; unitPrice: string }
interface CreatePayload { customerName: string; customerEmail: string; items: Array<{ name: string; quantity: number; unitPriceCents: number }> }

const emptyItem = (): DraftItem => ({ name: '', quantity: '1', unitPrice: '0.00' });

function toCents(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function CreateOrderForm({ onCreated }: { onCreated: () => void }) {
  const key = useRef<string>(crypto.randomUUID());
  const retryPayload = useRef<CreatePayload | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [items, setItems] = useState<DraftItem[]>([emptyItem()]);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState('');

  const total = useMemo(() => items.reduce((sum, item) => {
    const cents = toCents(item.unitPrice);
    const quantity = Number(item.quantity);
    return sum + (cents !== null && Number.isInteger(quantity) ? cents * quantity : 0);
  }, 0), [items]);

  function payload(): CreatePayload | null {
    const normalizedItems = items.map((item) => ({ name: item.name.trim(), quantity: Number(item.quantity), unitPriceCents: toCents(item.unitPrice) }));
    if (customerName.trim().length < 2 || !/^\S+@\S+\.\S+$/.test(customerEmail.trim()) || normalizedItems.some((i) => !i.name || !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 1000 || i.unitPriceCents === null)) {
      setMessage('Check the customer and item fields. Prices need at most two decimal places.'); return null;
    }
    return { customerName: customerName.trim(), customerEmail: customerEmail.trim().toLowerCase(), items: normalizedItems.map((i) => ({ ...i, unitPriceCents: i.unitPriceCents! })) };
  }

  async function send(body: CreatePayload) {
    setBusy(true); setMessage(''); retryPayload.current = body;
    try {
      const response = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key.current }, body: JSON.stringify(body) });
      const result = await response.json() as { message?: string | string[]; replayed?: boolean; order?: { deletedAt?: string | null } };
      const responseMessage = Array.isArray(result.message) ? result.message.join(', ') : result.message;
      if (response.status === 409) { setLocked(true); setMessage('This key was used with different data. Start over to create a new submission.'); return; }
      if (response.status >= 500) { setLocked(true); setMessage('The result is uncertain. Retry the same submission or start over.'); return; }
      if (!response.ok) { setMessage(responseMessage ?? 'The order was rejected.'); return; }
      if (result.order?.deletedAt) setMessage('This submission previously created an order that was later deleted.');
      else setMessage(result.replayed ? 'Existing order recovered safely.' : 'Order created.');
      setCustomerName(''); setCustomerEmail(''); setItems([emptyItem()]); retryPayload.current = null; key.current = crypto.randomUUID(); setLocked(false); onCreated();
    } catch {
      setLocked(true); setMessage('The result is uncertain. Retry the same submission or start over.');
    } finally { setBusy(false); }
  }

  function submit(event: FormEvent) { event.preventDefault(); const body = payload(); if (body) void send(body); }
  function startOver() { if (!confirm('Discard this submission and use a new idempotency key?')) return; key.current = crypto.randomUUID(); retryPayload.current = null; setLocked(false); setMessage(''); }
  function updateItem(index: number, patch: Partial<DraftItem>) { setItems((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item)); }

  return <details className="create-card"><summary>Create order</summary><form className="create-form" onSubmit={submit}>
    <div className="form-grid"><label>Customer name<input disabled={locked} value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={150} required /></label><label>Email<input disabled={locked} type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} required /></label></div>
    <div className="items"><strong>Items</strong>{items.map((item, index) => <div className="item-row" key={index}><input aria-label={`Item ${index + 1} name`} disabled={locked} placeholder="Item name" value={item.name} onChange={(e) => updateItem(index, { name: e.target.value })} /><input aria-label={`Item ${index + 1} quantity`} disabled={locked} type="number" min="1" max="1000" value={item.quantity} onChange={(e) => updateItem(index, { quantity: e.target.value })} /><input aria-label={`Item ${index + 1} price`} disabled={locked} inputMode="decimal" value={item.unitPrice} onChange={(e) => updateItem(index, { unitPrice: e.target.value })} />{items.length > 1 && <button type="button" className="secondary" disabled={locked} onClick={() => setItems((v) => v.filter((_, i) => i !== index))}>Remove</button>}</div>)}</div>
    <div className="create-actions"><button type="button" className="secondary" disabled={locked || items.length >= 5} onClick={() => setItems((v) => [...v, emptyItem()])}>Add item</button><strong>Total: ${(total / 100).toFixed(2)}</strong><button disabled={busy || locked}>{busy ? 'Submitting…' : 'Create order'}</button></div>
    {locked && <div className="retry-actions"><button type="button" disabled={busy || !retryPayload.current} onClick={() => retryPayload.current && void send(retryPayload.current)}>Retry</button><button type="button" className="secondary" onClick={startOver}>Start over</button></div>}
    {message && <p className="notice">{message}</p>}
  </form></details>;
}

