// Product photos are resized and converted to WebP in the browser before
// upload, matching the optimised /public/images set — a 6MB phone photo
// becomes a ~150KB file that loads fast on mobile data.
const MAX_SIDE = 1600;
const QUALITY = 0.85;

export async function prepareImage(file) {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} is not an image.`);
  const bitmap = await loadBitmap(file);
  const bw = bitmap.naturalWidth || bitmap.width;
  const bh = bitmap.naturalHeight || bitmap.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(bw, bh));
  const w = Math.round(bw * scale);
  const h = Math.round(bh * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", QUALITY));
  // Very old Safari can't encode WebP and silently returns PNG/null.
  if (blob && blob.type === "image/webp") return blob;
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
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
