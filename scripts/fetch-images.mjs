// One-off: download all catalog images from Shopify's CDN into public/images/
// so the site is fully self-hosted (no external image dependency on deploy).
import fs from "node:fs/promises";
import path from "node:path";
import { products, heroImage } from "../src/data/store.js";

const OUT = "public/images";
await fs.mkdir(OUT, { recursive: true });

const toCdn = (url) =>
  url.replace(
    "https://www.shopfanaar.com/cdn/shop/files/",
    "https://cdn.shopify.com/s/files/1/0730/4698/2874/files/"
  );

const withWidth = (url, w) => {
  const u = new URL(toCdn(url));
  u.searchParams.set("width", String(w));
  return u.toString();
};

const jobs = [{ url: withWidth(heroImage, 2400), name: "hero", orig: heroImage }];
for (const p of products) {
  p.images.forEach((img, i) =>
    jobs.push({ url: withWidth(img, 1600), name: `${p.handle}-${i + 1}`, orig: img })
  );
}

const mapping = {};
let total = 0;
for (const j of jobs) {
  const res = await fetch(j.url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) {
    console.error("FAIL", res.status, j.url);
    process.exit(1);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(path.join(OUT, j.name + ".png"), buf);
  mapping[j.orig] = `/images/${j.name}.png`;
  total += buf.length;
  console.log("ok", j.name, (buf.length / 1024).toFixed(0) + "kb");
}

await fs.writeFile("scripts/image-map.json", JSON.stringify(mapping, null, 2));
console.log(`\ndone: ${jobs.length} files, ${(total / 1024 / 1024).toFixed(1)}MB`);
