// Catalog data copied from the Fänaar Shopify store (www.shopfanaar.com)
// via the Shopify Admin connector. Images point to Shopify's public CDN.
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
  "https://www.shopfanaar.com/cdn/shop/files/1_f34cade3-8fd2-45ec-8454-fec01303a5dd.png?v=1756999466&width=3840";

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
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/1_9652ed8f-b1d4-4c47-80eb-8b22ae379c17.png?v=1764693341",
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/3_69a37530-7dc5-48bc-95a5-366b75974950.png?v=1764693341",
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/4_7afd74d1-c29b-4780-9ce3-0167042d6922.png?v=1764693341",
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/2_ae2bb1e1-1111-411a-98a6-52363b512d3f.png?v=1764693309",
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
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/3_dada0f23-ad7f-42ef-bfe6-84e6b65f5d54.png?v=1764692772",
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/2_4ae7b0ce-d416-4662-ad79-4f86576b1940.png?v=1764692772",
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/5_98a10e39-0d52-4915-afba-9fc924e9d537.png?v=1764692729",
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/4_8210d9a8-87bf-4b24-9558-bfc5e07a526a.png?v=1764692732",
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
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/1_c24c3ed0-22cf-44ca-abe6-4ffc6b164bc4.png?v=1770994094",
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/2_0d3c904a-54c1-4bca-8d46-f6cecb45eced.png?v=1770994094",
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
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/9.png?v=1764695113",
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/8.png?v=1764695113",
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
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/9_1df12136-0850-4560-b3b6-c7815dc8d2fe.png?v=1764695902",
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/8_0660e186-355a-4cfc-94fd-c99cc5ce64a6.png?v=1764695902",
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
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/8_8d3d0467-d582-4809-8a21-24ff056d6383.png?v=1764788084",
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/10_1d5f0d71-5c75-480d-b303-f4bf2eb6ea6b.png?v=1764788084",
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/11.png?v=1764788084",
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/1_4a2bdfed-1399-4212-97a2-e5dd8f4d8cf8.png?v=1770993494",
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
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/1_5896975d-769e-421e-9b7f-84b63a87eade.png?v=1764685484",
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/2_c7af6c7f-d8dd-4f7a-ba4c-c38529755875.png?v=1764685484",
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/4_acd82dd2-e5a7-461f-acdb-907dc894e73d.png?v=1764685484",
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
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/1_1e13510d-cc76-4592-9cd0-d4a64427580b.png?v=1764684993",
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/2_f3f81519-4233-4ebe-9042-5541c9ae6dc9.png?v=1764684994",
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/Untitled_design.png?v=1770992253",
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
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/1_228d847b-192b-4b3d-b8e0-1c3f6fe2538a.png?v=1764687948",
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/5_bc7c863a-faef-4ce1-9e32-193d983f31d6.png?v=1764687948",
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/6_b169c736-92ad-451a-b1bf-accd5a7f4d9b.png?v=1764687948",
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/7_638a00e7-bd9c-4a7c-a2ab-83259d753d5c.png?v=1764687948",
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
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/5_0fda6e51-bc55-4a8f-be98-8387c8aeed47.png?v=1764694162",
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/6_84203c56-15c3-44f9-8834-e337625b7581.png?v=1764694165",
      "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/7_4579d275-035c-4720-8e7d-e15fa3075881.png?v=1764694204",
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
