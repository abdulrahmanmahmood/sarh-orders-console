export interface OrderItemResponse {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export interface OrderResponse {
  id: string;
  customerName: string;
  customerEmail: string;
  status: string;
  totalAmountCents: number;
  createdAt: string;
  deletedAt: string | null;
  items: OrderItemResponse[];
}

export interface CreateOrderResult {
  replayed: boolean;
  order: OrderResponse;
}

