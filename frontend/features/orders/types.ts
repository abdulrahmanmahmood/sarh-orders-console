export interface OrderRow {
  id: string;
  customerName: string;
  customerEmail: string;
  status: 'pending' | 'processing' | 'completed' | 'cancelled';
  totalAmountCents: number;
  createdAt: string;
}

export interface OrdersPageResponse {
  data: OrderRow[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}

