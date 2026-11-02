// Swatch colours for colourway names ("Essential Piqué Polo - Black" → Black).
// Matched by the last word that names a colour; null when none does, and the
// swatch then shows the product's photo instead.
const COLOURS = {
  black: "#141414",
  charcoal: "#3d3e40",
  grey: "#8d8e8f",
  gray: "#8d8e8f",
  white: "#f2f1ec",
  ivory: "#efe9dc",
  cream: "#ece3cf",
  beige: "#d6c6a8",
  sand: "#cdb994",
  camel: "#b48a5a",
  brown: "#6a4b35",
  chocolate: "#4a3326",
  navy: "#1f2a44",
  blue: "#2e4f86",
  sky: "#8fb2d6",
  teal: "#1f5f5f",
  green: "#4b5d3f",
  olive: "#5e5b3a",
  khaki: "#8b8160",
  maroon: "#5b1f26",
  burgundy: "#5e1b2b",
  red: "#9e2b25",
  rust: "#9a4a2a",
  mustard: "#c79a2b",
  yellow: "#d9b740",
  pink: "#d9a3a8",
  purple: "#4f3a63",
};

export function swatchColour(name) {
  const words = String(name || "").toLowerCase().split(/[^a-z]+/).reverse();
  for (const w of words) if (COLOURS[w]) return COLOURS[w];
  return null;
}
