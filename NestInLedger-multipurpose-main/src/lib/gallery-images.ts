import { JPEG_QUALITY, MAX_EDGE, MAX_INPUT_BYTES, MAX_STORED_BYTES, THUMB_EDGE, resizedDimensions } from "./gallery-rules";

export async function optimizeGalleryImage(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPEG, PNG or WebP photo.");
  if (!file.size || file.size > MAX_INPUT_BYTES) throw new Error("Each original photo must be smaller than 20 MB.");
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    if (bitmap.width * bitmap.height > 80_000_000) throw new Error("This photo is too large to process safely.");
    const render = async (edge: number, quality: number) => {
      const size = resizedDimensions(bitmap.width, bitmap.height, edge);
      const canvas = document.createElement("canvas"); canvas.width = size.width; canvas.height = size.height;
      const context = canvas.getContext("2d"); if (!context) throw new Error("Image processing is unavailable.");
      context.fillStyle = "white"; context.fillRect(0, 0, size.width, size.height); context.drawImage(bitmap, 0, 0, size.width, size.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error("Could not compress this photo.")), "image/jpeg", quality));
      return { blob, ...size };
    };
    const image = await render(MAX_EDGE, JPEG_QUALITY), thumb = await render(THUMB_EDGE, JPEG_QUALITY);
    if (image.blob.size > MAX_STORED_BYTES) throw new Error("The optimized photo exceeds the 5 MB limit.");
    return { image, thumb, originalSize: file.size, name: file.name.replace(/\.[^.]+$/, "").slice(0, 160) + ".jpg" };
  } finally { bitmap.close(); }
}