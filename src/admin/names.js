// Readable names for what Live view and Shoppers show: store pages, places
// and devices, from the paths and codes the store records.

const PAGE_NAMES = {
  "/": "Home",
  "/checkout": "Checkout",
  "/order": "Order confirmation",
  "/about": "About",
  "/saved": "Saved pieces",
  "/track": "Track your order",
  "/pages/contact": "Contact",
};
const tidy = (handle) => handle.charAt(0).toUpperCase() + handle.slice(1).replace(/-/g, " ");

export function pageName({ path, title }) {
  if (title) return title;
  if (PAGE_NAMES[path]) return PAGE_NAMES[path];
  const [, kind, handle] = path.split("/");
  if (kind === "products" && handle) return tidy(handle);
  if (kind === "collections" && handle) return `Collection · ${tidy(handle)}`;
  if (kind === "policies") return "Policies";
  return path;
}

const regionNames =
  typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
export function countryName(code) {
  try {
    return regionNames?.of(code) || code;
  } catch {
    return code;
  }
}
export const flag = (code) =>
  code ? String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0))) : "";
export const placeName = (p) => p.city || countryName(p.country);

const DEVICES = { mobile: "Phone", desktop: "Computer", tablet: "Tablet" };
export const deviceName = (device) => DEVICES[device] || "Unknown device";
