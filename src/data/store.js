// Site content + the original catalog.
//
// The live catalog (products, prices, stock, collections) is managed in the
// admin at /admin and served from Supabase. The `products` / `collections`
// below are the starting catalog: they seed the database
// (scripts/generate-seed.mjs) and act as an offline fallback. Editorial
// content (hero, tiles, lookbook, copy) is still edited here.

export const shop = {
  name: "Fanaar",
  logo: "/logo.png",
  currency: "PKR",
  currencySymbol: "Rs.",
  tagline:
    "Fanaar draws inspiration from the deeper science of apparel — exploring how clothing interacts with the body and shapes the way we feel and live.",
  origin: "established from Faisalabad",
  social: {
    instagram: "https://www.instagram.com/fanaarpakistan/",
    pinterest: "https://www.pinterest.com/fanaarpakistan/",
  },
  // Shown on /pages/contact. Leave a value empty ("") to hide that line.
  contact: {
    email: "",
    phone: "+44 7534 953387", // as displayed next to WhatsApp
    whatsapp: "447534953387", // international digits for wa.me links
    hours: "",
    location: "Faisalabad, Pakistan",
  },
};

// Footer "Information" links + the tabs across the info pages. Paths match
// the old Shopify URLs so existing links and search results keep working.
export const infoPages = [
  { to: "/pages/contact", label: "Contact" },
  { to: "/policies/shipping-policy", label: "Shipping" },
  { to: "/policies/refund-policy", label: "Returns" },
  { to: "/policies/privacy-policy", label: "Privacy" },
];

// Primary hero — the black & white portrait from the live store.
export const heroImage =
  "/images/hero.webp";

// Category tiles for the "Shop by Category" board + mega-menu previews.
export const categoryTiles = [
  {
    handle: "shirts",
    title: "Shirts",
    image: "/images/interlock-shirt-with-zip-closure-1.webp",
  },
  {
    handle: "basics",
    title: "Polo",
    image: "/images/essential-pique-polo-green-1.webp",
  },
  {
    handle: "quarter-zipper",
    title: "Sweatshirts",
    image: "/images/microgrid-quarter-zipper-1.webp",
  },
  {
    handle: "t-shirts",
    title: "T-Shirts",
    image: "/images/yarn-dyed-stripe-tee-1.webp",
  },
  {
    handle: "bottoms",
    title: "Bottoms",
    image: "/images/tropical-pant-4-1.webp",
  },
  {
    handle: "frontpage",
    title: "Drop Needle",
    image: "/images/polo-1.webp",
  },
];

// Editorial feature — "Autonomy by Fanaar" (fabrication story).
export const craft = {
  eyebrow: "Autonomy by Fanaar",
  title: "Knitting & Weaving",
  body: "Autonomy is where the garment begins — at the yarn. Drop needle ribs, micro-block textures and waffle thermals are engineered on the machine, not printed on the surface. The structure is the design.",
  image: "/images/micro-block-drop-needle-knit-3.webp",
  cta: { label: "Explore Autonomy", to: "/collections/frontpage" },
};

// Lookbook moodboard (home page). Add new looks to public/images/lookbook/
// and list them here — the board sizes its columns to the count.
export const lookbook = [
  { src: "/images/lookbook/look-01.webp", width: 720, height: 1280, alt: "Black quarter-zip with pleated black trousers" },
  { src: "/images/lookbook/look-02.webp", width: 720, height: 1080, alt: "Black quarter-zip and trousers, seated on a studio stool" },
  { src: "/images/lookbook/look-03.webp", width: 720, height: 1280, alt: "Navy and white stripe tee with pleated black trousers" },
  { src: "/images/lookbook/look-04.webp", width: 720, height: 1073, alt: "Navy stripe tee with wide black trousers, full look" },
];

// Small trust/values strip.
export const values = [
  { title: "Knit in Faisalabad", body: "Developed and finished in our own facility." },
  { title: "Structured by design", body: "Texture engineered at the yarn, never printed." },
  { title: "Considered quantities", body: "Small runs, restocked only when they earn it." },
];

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
      "/images/interlock-shirt-with-zip-closure-5.webp",
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
      "/images/yarn-dyed-stripe-tee-4.webp",
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
