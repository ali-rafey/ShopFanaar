import { money } from "../ui";

// Rupees with a proper minus sign: "−Rs.1,200".
export const signed = (n) => (n < 0 ? `−${money(-n)}` : money(n));

// "4.5%", "23%" — always positive; the wording says which way.
export const pct = (n) => `${Math.abs(n) < 10 ? Math.abs(n).toFixed(1) : Math.round(Math.abs(n))}%`;

// "12,000", "Rs 12,000", "12000 " → 12000; anything else → NaN.
export function parseAmount(text) {
  const s = String(text ?? "").replace(/rs\.?/i, "").replace(/[,\s]/g, "");
  return /^\d{1,9}$/.test(s) ? Number(s) : NaN;
}

export const sumOf = (rows, key = "amount") => rows.reduce((n, r) => n + Number(r[key] || 0), 0);

