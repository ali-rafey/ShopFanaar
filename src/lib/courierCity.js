// Matching the city a shopper typed ("lahore", "Lhr", "D.G. Khan") to the
// exact name a courier expects ("Lahore", "DERA GHAZI KHAN"). Shared by the
// admin's booking screen and api/postex.js, which re-checks every city
// before anything is sent to the courier.
//
// A match is either sure — exact (ignoring case, spaces and punctuation), a
// known short form, or a spelling the admin corrected before — or merely a
// suggestion that the admin has to confirm. Nothing is ever booked on a
// suggestion alone.

// Normalised form used for every comparison: "D.G. Khan " → "DG KHAN".
export const normCity = (s) =>
  String(s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

const compact = (s) => normCity(s).replace(/ /g, "");

// Common short forms and old names → the courier's name for the city. Only
// used when that name is actually on the courier's list.
const SHORT_FORMS = {
  LHR: "Lahore",
  KHI: "Karachi",
  ISB: "Islamabad",
  ISLAMBAD: "Islamabad",
  RWP: "Rawalpindi",
  PINDI: "Rawalpindi",
  "RAWAL PINDI": "Rawalpindi",
  FSD: "Faisalabad",
  LYALLPUR: "Faisalabad",
  MUX: "MULTAN",
  PEW: "PESHAWAR",
  GRW: "GUJRANWALA",
  "DG KHAN": "DERA GHAZI KHAN",
  "D G KHAN": "DERA GHAZI KHAN",
  "DI KHAN": "DERA ISMAIL KHAN",
  "D I KHAN": "DERA ISMAIL KHAN",
  RYK: "RAHIM YAR KHAN",
  "R Y KHAN": "RAHIM YAR KHAN",
  "RY KHAN": "RAHIM YAR KHAN",
  "TOBA TEK SINGH": "T.T SINGH",
  TTS: "T.T SINGH",
  MZD: "MUZAFFARABAD (AJK)",
  MUZAFFARABAD: "MUZAFFARABAD (AJK)",
  "MIRPUR AJK": "MIRPUR (AJK)",
  "MIR PUR AJK": "MIRPUR (AJK)",
};

// Build once per city list: normalised and space-free lookups.
export function cityIndex(names) {
  const byNorm = new Map();
  const byCompact = new Map();
  for (const name of names) {
    if (!byNorm.has(normCity(name))) byNorm.set(normCity(name), name);
    if (!byCompact.has(compact(name))) byCompact.set(compact(name), name);
  }
  return { names, byNorm, byCompact };
}

// The courier's own spelling of a city, if `value` is one (any case).
export const canonicalCity = (index, value) => index.byNorm.get(normCity(value)) || null;

function distance(a, b) {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

// Closest names, best first: same start, then contained words, then spelling.
export function suggestCities(index, input, limit = 5) {
  const q = normCity(input);
  if (!q) return [];
  const qc = q.replace(/ /g, "");
  const words = q.split(" ").filter((w) => w.length >= 4);
  const scored = [];
  for (const name of index.names) {
    const n = normCity(name);
    const nc = n.replace(/ /g, "");
    let score;
    if (nc.startsWith(qc) || qc.startsWith(nc)) score = Math.abs(nc.length - qc.length) * 0.1;
    else if (words.some((w) => n.split(" ").includes(w))) score = 1 + Math.abs(nc.length - qc.length) * 0.05;
    else {
      const d = distance(qc, nc);
      if (d > Math.max(2, Math.floor(qc.length / 4))) continue;
      score = 2 + d;
    }
    scored.push([score, name]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].length - b[1].length).slice(0, limit).map((x) => x[1]);
}

// → { city, sure, how, suggestions }
//    sure: true only for an exact name, a known short form or a saved
//    correction; otherwise `city` is the best suggestion (or null).
export function resolveCity(index, input, learned = {}) {
  const q = normCity(input);
  if (!q) return { city: null, sure: false, how: "empty", suggestions: [] };

  const saved = learned[q] && canonicalCity(index, learned[q]);
  if (saved) return { city: saved, sure: true, how: "saved", suggestions: [] };

  const exact = index.byNorm.get(q) || index.byCompact.get(q.replace(/ /g, ""));
  if (exact) return { city: exact, sure: true, how: "exact", suggestions: [] };

  const short = SHORT_FORMS[q] && canonicalCity(index, SHORT_FORMS[q]);
  if (short) return { city: short, sure: true, how: "short", suggestions: [] };

  // "DHA Phase 5 Lahore", "Johar Town, Karachi": a city name inside the
  // address-like text is a strong hint, but still needs a human check.
  const words = q.split(" ");
  let inside = null;
  for (let len = Math.min(4, words.length); len >= 1 && !inside; len--) {
    for (let i = 0; i + len <= words.length && !inside; i++) {
      const hit = index.byNorm.get(words.slice(i, i + len).join(" "));
      if (hit && normCity(hit).length >= 4) inside = hit;
    }
  }
  const suggestions = suggestCities(index, input);
  const best = inside || suggestions[0] || null;
  return {
    city: best,
    sure: false,
    how: best ? "suggested" : "unknown",
    suggestions: best ? [best, ...suggestions.filter((s) => s !== best)].slice(0, 5) : suggestions,
  };
}
