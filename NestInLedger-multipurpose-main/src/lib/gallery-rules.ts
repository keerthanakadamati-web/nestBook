import { z } from "zod";

export const GALLERY_BUDGET = 1_000_000_000;
export const MAX_INPUT_BYTES = 20_000_000;
export const MAX_STORED_BYTES = 5_000_000;
export const MAX_EDGE = 1920;
export const THUMB_EDGE = 480;
export const JPEG_QUALITY = 0.78;
export const galleryThresholds = [70, 85, 95] as const;
export const albumInput = z.object({ event_name: z.string().trim().min(1).max(160), event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), description: z.string().max(5000), published: z.boolean() });
export function resizedDimensions(width: number, height: number, edge = MAX_EDGE) {
  if (width <= 0 || height <= 0 || !Number.isFinite(width * height)) throw new Error("Invalid image dimensions.");
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
export function crossedThresholds(bytes: number, budget = GALLERY_BUDGET) { return galleryThresholds.filter((t) => bytes * 100 >= budget * t); }
export function formatBytes(bytes: number) { return bytes >= 1_000_000_000 ? `${(bytes / 1_000_000_000).toFixed(2)} GB` : bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(2)} MB` : `${(bytes / 1000).toFixed(1)} KB`; }