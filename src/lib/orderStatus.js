// Order lifecycle — mirrors the CHECK constraint on public.orders.status.
//
// The admin sets the first two steps (and can cancel); booking with PostEx
// makes an order "packed" (booked, awaiting pickup), and from there Sync moves
// it on from PostEx's own tracking: shipped (picked up), delivered, returned.
// `label` is what the admin sees; `customer` is what shoppers see.
export const FLOW = ["pending", "confirmed", "packed", "shipped", "delivered"];

export const STATUS = {
  pending: { label: "Pending", customer: "Order placed" },
  confirmed: { label: "Confirmed", customer: "Confirmed" },
  packed: { label: "Booked", customer: "Packed" },
  shipped: { label: "In transit", customer: "On its way" },
  delivered: { label: "Delivered", customer: "Delivered" },
  cancelled: { label: "Cancelled", customer: "Cancelled" },
  returned: { label: "Returned", customer: "Returned" },
};

export const ALL_STATUSES = [...FLOW, "cancelled", "returned"];

// What the admin can choose; everything after Confirmed comes from PostEx.
export const ADMIN_STATUSES = ["pending", "confirmed", "cancelled"];

export function nextStatus(status) {
  const i = FLOW.indexOf(status);
  return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1] : null;
}
