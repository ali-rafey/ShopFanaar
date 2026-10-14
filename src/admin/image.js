// Product photos are resized and compressed in the browser before upload, in
// two sizes:
//   large — up to 2400px on the long side, for the product page. Shown about
//           700pt wide on a laptop, which on Retina/iPhone screens needs
//           ~1400–2100 real pixels; the bundled /public photos are 1500×2250.
//   small — up to 1200px, for product cards, cart, checkout and thumbnails,
//           so shop pages don't download the full photo (and Supabase's free
//           egress allowance goes much further).
// Shrinking happens in halving steps with high-quality smoothing — one big
// low-quality jump makes knit textures look rough or smeared.
const LARGE = { maxSide: 2400, quality: 0.9 };
const SMALL = { maxSide: 1200, quality: 0.82 };

// → { large: Blob, small: Blob }
export async function prepareImage(file) {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image.`);
  const bitmap = await loadBitmap(file);
  const w = bitmap.naturalWidth || bitmap.width;
  const h = bitmap.naturalHeight || bitmap.height;
  const large = shrink(bitmap, w, h, LARGE.maxSide);
  bitmap.close?.();
  const small = shrink(large, large.width, large.height, SMALL.maxSide);
  return { large: await encode(large, LARGE.quality), small: await encode(small, SMALL.quality) };
}

function shrink(source, w, h, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const tw = Math.round(w * scale);
  const th = Math.round(h * scale);
  let current = source;
  let cw = w;
  let ch = h;
  while (cw / 2 >= tw && ch / 2 >= th) {
    current = draw(current, Math.round(cw / 2), Math.round(ch / 2));
    cw = current.width;
    ch = current.height;
  }
  return draw(current, tw, th);
}

function draw(source, w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  return canvas;
}

async function encode(canvas, quality) {
  const webp = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
  // Safari can't encode WebP and silently returns PNG/null: use JPEG there.
  if (webp && webp.type === "image/webp") return webp;
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

async function loadBitmap(file) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* fall back to <img> (e.g. HEIC on browsers that can't decode it) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error(`Couldn't read ${file.name}. Try a JPG or PNG.`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
