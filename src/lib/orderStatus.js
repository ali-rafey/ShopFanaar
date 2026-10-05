// Order lifecycle — mirrors the CHECK constraint on public.orders.status.
export const FLOW = ["pending", "confirmed", "packed", "shipped", "delivered"];

export const STATUS = {
  pending: { label: "Pending", customer: "Order placed" },
  confirmed: { label: "Confirmed", customer: "Confirmed" },
  packed: { label: "Packed", customer: "Packed" },
  shipped: { label: "Shipped", customer: "On its way" },
  delivered: { label: "Delivered", customer: "Delivered" },
  cancelled: { label: "Cancelled", customer: "Cancelled" },
  returned: { label: "Returned", customer: "Returned" },
};

export const ALL_STATUSES = [...FLOW, "cancelled", "returned"];

export function nextStatus(status) {
  const i = FLOW.indexOf(status);
  return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1] : null;
}
