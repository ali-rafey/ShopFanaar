// PostEx's tracking steps (from /api/track) in words a shopper understands,
// and how far along the parcel is. Codes as PostEx uses them (October 2026):
//   0001 / 0036  At Fanaar Warehouse            0004  Enroute for Delivery
//   0031  Departed to PostEx. Warehouse         0005  Delivered to Customer
//   0003  Received at FSD Warehouse             0013  Attempt Made: CNA(…)
//   0033  Departed to LAHORE                    0008  Delivery Under Review
//   0035  Arrived at Transit Hub LHE            0039 / 0040 / 0037 / 0032  being returned
//   0038  Waiting for Delivery                  0006  Returned at Merchant Warehouse

const HUBS = {
  FSD: "Faisalabad", LHE: "Lahore", KHI: "Karachi", ISB: "Islamabad", RWP: "Rawalpindi", MUL: "Multan",
  PWR: "Peshawar", PEW: "Peshawar", SKT: "Sialkot", GRW: "Gujranwala", GUJ: "Gujranwala", HYD: "Hyderabad",
  QTA: "Quetta", SGD: "Sargodha", BWP: "Bahawalpur", SKR: "Sukkur", ABT: "Abbottabad", GJT: "Gujrat",
  NOW: "Nowshera", SWT: "Swat", MRD: "Mardan", SHP: "Sheikhupura", RYK: "Rahim Yar Khan", DGK: "Dera Ghazi Khan",
  SHW: "Sahiwal", OKR: "Okara", JHG: "Jhang", KSR: "Kasur", MZD: "Muzaffarabad",
};
const RETURN_CODES = new Set(["0039", "0040", "0037", "0032"]);

const titleCase = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace("Peshawer", "Peshawar")
    .trim();
const hub = (code) => HUBS[String(code || "").toUpperCase()] || String(code || "").toUpperCase();

// One step, in plain words.
export function describe({ code, message }) {
  const m = String(message || "");
  switch (code) {
    case "0001":
    case "0036":
      return "Packed and booked with PostEx";
    case "0031":
      return "Picked up by PostEx";
    case "0003": {
      const at = m.match(/at\s+(\w+)\s+warehouse/i)?.[1];
      return at ? `At PostEx's ${hub(at)} warehouse` : "At PostEx's warehouse";
    }
    case "0033":
      return `On its way to ${titleCase(m.replace(/^departed to\s*/i, ""))}`;
    case "0035": {
      const at = m.match(/hub\s+(\w+)/i)?.[1];
      return at ? `Reached PostEx's ${hub(at)} hub` : "Reached a PostEx hub";
    }
    case "0038":
      return "At the local PostEx centre, waiting for a rider";
    case "0004":
      return "Out for delivery";
    case "0005":
      return "Delivered";
    case "0013":
      return /CNA|NOT AVAILABLE|NOT RESPONDING|PHONE/i.test(m)
        ? "Delivery attempted — the rider couldn't reach you"
        : "Delivery attempted";
    case "0008":
      return "PostEx is looking into the delivery";
    case "0006":
      return "Returned to Fanaar";
    default:
      if (RETURN_CODES.has(code) || /return/i.test(m)) return "Being returned to Fanaar";
      return m.charAt(0).toUpperCase() + m.slice(1).toLowerCase();
  }
}

// Where the parcel is overall: booked | moving | out | attempted | delivered | returning | returned
export function parcelStage(events) {
  const codes = events.map((e) => e.code);
  const last = events.at(-1);
  if (!last) return "booked";
  if (codes.includes("0005")) return "delivered";
  if (codes.includes("0006")) return "returned";
  if (codes.some((c) => RETURN_CODES.has(c))) return "returning";
  if (last.code === "0013" || last.code === "0008") return "attempted";
  if (last.code === "0004") return "out";
  if (codes.some((c) => ["0031", "0003", "0033", "0035", "0038"].includes(c))) return "moving";
  return "booked";
}

// The journey to show, newest first. Each step appears once, at its latest
// time (PostEx re-sorts parcels, so "On its way to Lahore" can come twice),
// and once a return has started every later stop is part of the way back.
export function journey(events) {
  const steps = new Map();
  let returning = false;
  for (const e of events) {
    if (RETURN_CODES.has(e.code)) returning = true;
    const text = returning && e.code !== "0006" ? "Being returned to Fanaar" : describe(e);
    steps.delete(text);
    steps.set(text, { at: e.at, text, code: e.code });
  }
  return [...steps.values()].reverse();
}
