// Catalog data copied from the Fänaar Shopify store (www.shopfanaar.com)
// via the Shopify Admin connector. Images are self-hosted in /public/images.
// This file makes the React store fully independent — no live API calls.

export const shop = {
  name: "Fänaar",
  logo: "/logo.png",
  currency: "PKR",
  currencySymbol: "Rs.",
  tagline:
    "Fänaar draws inspiration from the deeper science of apparel — exploring how clothing interacts with the body and shapes the way we feel and live.",
  origin: "established from Faisalabad",
  social: {
    instagram: "https://www.instagram.com/",
    pinterest: "https://www.pinterest.com/",
  },
};

// Primary hero — the black & white portrait from the live store.
export const heroImage =
  "/images/hero.webp";

// handle -> collection metadata
export const collections = [
  { handle: "all-top", title: "All Top", group: "tops" },
  { handle: "shirts", title: "Shirts", group: "tops" },
  { handle: "t-shirts", title: "T-Shirts", group: "tops" },
  { handle: "quarter-zipper", title: "Sweatshirts", group: "tops" },
  { handle: "basics", title: "Polo", group: "tops" },
  { handle: "frontpage", title: "Drop Needle", group: "autonomy" },
  { handle: "bottoms", title: "Bottoms", group: "bottoms" },
  { handle: "landing-page-collection", title: "New In", group: "featured" },
];

const D =
  "Color tones may appear slightly different in imagery due to lighting conditions and display variations.";

export const products = [
  {
    id: "8834678849754",
    title: "Quad Vertical Rib Drop Needle Polo",
    handle: "polo",
    price: 2400,
    compareAtPrice: null,
    description:
      "A crafted polo in quad vertical drop needle knit, featuring defined rib lines that blend seamlessly with a soft, structured silhouette. The thick, high-weight fabric adds warmth and durability, while the clean, modern texture provides subtle depth and dimension for a sophisticated, contemporary look.",
    disclaimer: D,
    images: [
      "/images/polo-1.webp",
      "/images/polo-2.webp",
      "/images/polo-3.webp",
      "/images/polo-4.webp",
    ],
    sizes: [
      { size: "S", qty: 4 },
      { size: "M", qty: 1 },
      { size: "L", qty: 6 },
    ],
    collections: ["frontpage", "all-top", "landing-page-collection"],
  },
  {
    id: "8875592548570",
    title: "Micro Block Texture Knit",
    handle: "micro-block-drop-needle-knit",
    price: 3700,
    compareAtPrice: null,
    description:
      "High-weight polo crafted from micro-block drop needle knit, featuring a sophisticated silhouette at the collar and hem for a refined look. The thick, textured fabric provides warmth and comfort, making it ideal for lounge wear as well as winter layering.",
    disclaimer: D,
    images: [
      "/images/micro-block-drop-needle-knit-1.webp",
      "/images/micro-block-drop-needle-knit-2.webp",
      "/images/micro-block-drop-needle-knit-3.webp",
      "/images/micro-block-drop-needle-knit-4.webp",
    ],
    sizes: [
      { size: "S", qty: 2 },
      { size: "M", qty: 0 },
      { size: "L", qty: 4 },
    ],
    collections: ["frontpage", "all-top", "landing-page-collection"],
  },
  {
    id: "9165707313370",
    title: "Essential Piqué Polo - Black",
    handle: "essential-pique-polo-black",
    price: 1700,
    compareAtPrice: null,
    description:
      "A plain piqué polo crafted for daily use. This essential piece features a sophisticated silhouette and lightweight fabric, making it perfect for everyday wear with a clean finish.",
    disclaimer: D,
    images: [
      "/images/essential-pique-polo-black-1.webp",
      "/images/essential-pique-polo-black-2.webp",
    ],
    sizes: [
      { size: "S", qty: 23 },
      { size: "M", qty: 9 },
      { size: "L", qty: 20 },
    ],
    collections: ["basics", "all-top"],
  },
  {
    id: "8875623710938",
    title: "Essential Piqué Polo - Green",
    handle: "essential-pique-polo-green",
    price: 2200,
    compareAtPrice: null,
    description:
      "A plain piqué polo crafted for daily use. This essential piece features a sophisticated silhouette and lightweight fabric, making it perfect for everyday wear with a clean finish.",
    disclaimer: D,
    images: [
      "/images/essential-pique-polo-green-1.webp",
      "/images/essential-pique-polo-green-2.webp",
    ],
    sizes: [
      { size: "S", qty: 10 },
      { size: "M", qty: 3 },
      { size: "L", qty: 0 },
    ],
    collections: ["basics", "all-top", "landing-page-collection"],
  },
  {
    id: "8875778834650",
    title: "Essential Piqué Polo - Charcoal",
    handle: "essential-pique-polo-charcoal",
    price: 2200,
    compareAtPrice: null,
    description:
      "A plain piqué polo crafted for daily use. This essential piece features a sophisticated silhouette and lightweight fabric, making it perfect for everyday wear with a clean finish.",
    disclaimer: D,
    images: [
      "/images/essential-pique-polo-charcoal-1.webp",
      "/images/essential-pique-polo-charcoal-2.webp",
    ],
    sizes: [
      { size: "S", qty: 9 },
      { size: "M", qty: 2 },
      { size: "L", qty: 0 },
    ],
    collections: ["basics", "all-top"],
  },
  {
    id: "9082421346522",
    title: "Light Weight Interlock Shirt",
    handle: "interlock-shirt-with-zip-closure",
    price: 1600,
    compareAtPrice: null,
    description:
      "A lightweight, relaxed-fit shirt crafted from 100% cotton interlock fabric, featuring a sleek zip closure in solid black. The smooth texture and breathable construction make it ideal for layering or wearing on its own, offering a clean and casual look with effortless comfort. This is a lightweight interlock shirt, not a sweatshirt.",
    disclaimer: D,
    images: [
      "/images/interlock-shirt-with-zip-closure-1.webp",
      "/images/interlock-shirt-with-zip-closure-2.webp",
      "/images/interlock-shirt-with-zip-closure-3.webp",
      "/images/interlock-shirt-with-zip-closure-4.webp",
    ],
    sizes: [
      { size: "S", qty: 20 },
      { size: "M", qty: 34 },
      { size: "L", qty: 33 },
    ],
    collections: ["shirts", "all-top", "landing-page-collection"],
  },
  {
    id: "9082462273754",
    title: "Interlock Shirt with Zip Closure",
    handle: "interlock-shirt-with-zip-closure-navy",
    price: 2300,
    compareAtPrice: null,
    description:
      "A light-to-moderate weight, relaxed-fit shirt crafted from interlock fabric, featuring a sleek zip closure in navy blue. The smooth texture and polyester blend enhance durability while maintaining breathability, making it ideal for layering or wearing on its own. This is a moderate interlock shirt, not a sweatshirt.",
    disclaimer: D,
    images: [
      "/images/interlock-shirt-with-zip-closure-navy-1.webp",
      "/images/interlock-shirt-with-zip-closure-navy-2.webp",
      "/images/interlock-shirt-with-zip-closure-navy-3.webp",
    ],
    sizes: [
      { size: "S", qty: 1 },
      { size: "M", qty: 0 },
      { size: "L", qty: 1 },
    ],
    collections: ["shirts", "all-top", "landing-page-collection"],
  },
  {
    id: "9083175928026",
    title: "Yarn Dyed Stripe Tee",
    handle: "yarn-dyed-stripe-tee",
    price: 2000,
    compareAtPrice: null,
    description:
      "This lightweight navy blue and white striped shirt is crafted from yarn-dyed jersey knit, offering exceptional comfort and breathability in warm weather. Designed with a touch of Lycra, it ensures controlled stretch while maintaining its shape, providing a refined fit that moves with you. Perfect for casual layering or solo wear.",
    disclaimer: D,
    images: [
      "/images/yarn-dyed-stripe-tee-1.webp",
      "/images/yarn-dyed-stripe-tee-2.webp",
      "/images/yarn-dyed-stripe-tee-3.webp",
    ],
    sizes: [
      { size: "S", qty: 5 },
      { size: "M", qty: 3 },
      { size: "L", qty: 5 },
    ],
    collections: ["t-shirts", "all-top", "landing-page-collection"],
  },
  {
    id: "9015819993306",
    title: "Textured Quarter Zipper",
    handle: "microgrid-quarter-zipper",
    price: 3800,
    compareAtPrice: null,
    description:
      "A full-sleeve sweatshirt crafted from waffle thermal fabric, featuring ribbed hems and a minimalistic zip hook for a clean finish. The textured knit provides warmth and breathability, making it perfect for winter wear while maintaining a relaxed fit, whether layered or worn on its own.",
    disclaimer: D,
    images: [
      "/images/microgrid-quarter-zipper-1.webp",
      "/images/microgrid-quarter-zipper-2.webp",
      "/images/microgrid-quarter-zipper-3.webp",
      "/images/microgrid-quarter-zipper-4.webp",
    ],
    sizes: [
      { size: "S", qty: 1 },
      { size: "M", qty: 0 },
      { size: "L", qty: 1 },
    ],
    collections: ["quarter-zipper", "all-top"],
  },
  {
    id: "8834655748314",
    title: "Relaxed Fit Interlock Knit Trouser",
    handle: "tropical-pant-4",
    price: 3300,
    compareAtPrice: null,
    description:
      "Engineered for fluid movement and effortless polish. These interlock trousers offer a smooth double-knit surface with natural stretch and subtle structure. The double button waistband and clean tailoring add precision.",
    disclaimer: D,
    images: [
      "/images/tropical-pant-4-1.webp",
      "/images/tropical-pant-4-2.webp",
      "/images/tropical-pant-4-3.webp",
    ],
    sizes: [
      { size: "S", qty: 4 },
      { size: "M", qty: 4 },
      { size: "L", qty: 12 },
    ],
    collections: ["bottoms"],
  },
];

export function getProduct(handle) {
  return products.find((p) => p.handle === handle);
}

export function getCollection(handle) {
  const meta = collections.find((c) => c.handle === handle);
  const items = products.filter((p) => p.collections.includes(handle));
  return { meta, items };
}

export function formatPrice(amount) {
  return `${shop.currencySymbol}${amount.toLocaleString("en-PK")}`;
}
