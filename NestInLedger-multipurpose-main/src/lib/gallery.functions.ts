import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { jpegDimensions } from "./gallery-jpeg";
import { MAX_EDGE, MAX_STORED_BYTES, THUMB_EDGE } from "./gallery-rules";

const bucket = "apartment-event-photos";
export const listGallery = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const permission = await context.supabase.rpc("has_permission", { _permission: "admin.read" });
  if (permission.error) throw new Error("Could not check gallery access.");
  const [albums, photos, uploads] = await Promise.all([
    context.supabase.from("gallery_albums").select("*").eq("deleted", false).order("created_at", { ascending: false }),
    context.supabase.from("gallery_photos").select("*").eq("deleted", false).order("uploaded_at", { ascending: false }),
    permission.data ? context.supabase.from("gallery_uploads").select("*").in("state", ["reserved", "ready"]) : Promise.resolve({ data: [], error: null }),
  ]);
  if (albums.error || photos.error || uploads.error) throw new Error("Could not load event photos.");
  const signedPhotos = await Promise.all(photos.data.map(async (p) => {
    const result = await context.supabase.storage.from(bucket).createSignedUrl(p.thumbnail_path, 300);
    if (result.error) throw new Error("Could not open gallery thumbnails.");
    return { ...p, thumbnailUrl: result.data.signedUrl };
  }));
  return { committee: Boolean(permission.data), albums: albums.data, photos: signedPhotos, uploads: uploads.data ?? [] };
});

export const galleryStorage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const measured = await context.supabase.rpc("measure_gallery_storage");
  if (measured.error) throw new Error("Storage Management is available only to authorized committee members.");
  const [budget, history, alerts, pending, photos] = await Promise.all([
    context.supabase.from("gallery_budget").select("*").single(),
    context.supabase.from("gallery_storage_history").select("*").order("measured_at", { ascending: false }).limit(100),
    context.supabase.from("gallery_notifications").select("*").order("created_at", { ascending: false }),
    context.supabase.from("gallery_uploads").select("*").neq("state", "removed"),
    context.supabase.from("gallery_photos").select("upload_id,deleted"),
  ]);
  if (budget.error || history.error || alerts.error || pending.error || photos.error) throw new Error("Could not load gallery storage usage.");
  return { usage: measured.data as { usedBytes: number; fileCount: number; photoCount: number; budgetBytes: number }, budget: budget.data, history: history.data, alerts: alerts.data, pending: pending.data.filter((u) => u.state !== "accepted" || photos.data.some((p) => p.upload_id === u.id && p.deleted)) };
});

export const galleryMetadataBackup = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const access = await context.supabase.rpc("has_permission", { _permission: "admin.read" });
  if (access.error || !access.data) throw new Error("Gallery backup access denied.");
  const [albums, photos, uploads, budget] = await Promise.all([
    context.supabase.from("gallery_albums").select("*"), context.supabase.from("gallery_photos").select("*"),
    context.supabase.from("gallery_uploads").select("*"), context.supabase.from("gallery_budget").select("*"),
  ]);
  if (albums.error || photos.error || uploads.error || budget.error) throw new Error("Could not export gallery metadata.");
  return { exportedAt: new Date().toISOString(), bucket, albums: albums.data, photos: photos.data, uploads: uploads.data, budget: budget.data };
});

export const reserveGalleryUpload = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ albumId: z.string().uuid(), filename: z.string().min(1).max(180), bytes: z.number().int().positive().max(MAX_STORED_BYTES * 2), allowOverBudget: z.boolean() }))
  .handler(async ({ context, data }) => {
    const access = await context.supabase.rpc("has_permission", { _permission: "admin.read" });
    if (access.error || !access.data) throw new Error("Only authorized committee members can upload photos.");
    const album = await context.supabase.from("gallery_albums").select("id,event_date,event_name").eq("id", data.albumId).eq("deleted", false).single();
    if (album.error) throw new Error("Save the album first. Secretary albums require President approval before photos can be added.");
    const measured = await context.supabase.rpc("measure_gallery_storage");
    if (measured.error) throw new Error("Could not check storage usage.");
    const usage = measured.data as { usedBytes: number; budgetBytes: number };
    if (usage.usedBytes + data.bytes > usage.budgetBytes && !data.allowOverBudget) return { warning: true as const, usedBytes: usage.usedBytes, budgetBytes: usage.budgetBytes };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const id = crypto.randomUUID(), slug = album.data.event_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50) || "event";
    const prefix = `${album.data.event_date.slice(0, 4)}/${slug}-${album.data.id}/${id}`;
    const filePath = `${prefix}.jpg`, thumbnailPath = `${prefix}-thumb.jpg`;
    const inserted = await supabaseAdmin.from("gallery_uploads").insert({ id, album_id: data.albumId, uploader: context.userId, file_path: filePath, thumbnail_path: thumbnailPath, file_name: data.filename });
    if (inserted.error) throw new Error("Could not reserve this upload.");
    const [image, thumbnail] = await Promise.all([supabaseAdmin.storage.from(bucket).createSignedUploadUrl(filePath), supabaseAdmin.storage.from(bucket).createSignedUploadUrl(thumbnailPath)]);
    if (image.error || thumbnail.error) throw new Error("Could not start this upload. Try again or discard the pending upload.");
    return { warning: false as const, id, filePath, thumbnailPath, imageUrl: image.data.signedUrl, thumbnailUrl: thumbnail.data.signedUrl };
  });

export const finalizeGalleryUpload = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ id: z.string().uuid(), originalSize: z.number().int().positive().max(20_000_000) }))
  .handler(async ({ context, data }) => {
    const access = await context.supabase.rpc("has_permission", { _permission: "admin.read" });
    if (access.error || !access.data) throw new Error("Upload access denied.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const found = await supabaseAdmin.from("gallery_uploads").select("*").eq("id", data.id).eq("uploader", context.userId).eq("state", "reserved").single();
    if (found.error) throw new Error("Pending upload not found.");
    const u = found.data;
    const [image, thumb] = await Promise.all([supabaseAdmin.storage.from(bucket).download(u.file_path), supabaseAdmin.storage.from(bucket).download(u.thumbnail_path)]);
    if (image.error || thumb.error) throw new Error("Both photo and thumbnail must finish uploading. No photo was recorded.");
    if (image.data.size > MAX_STORED_BYTES || thumb.data.size > MAX_STORED_BYTES) throw new Error("Stored file exceeds 5 MB. Discard this upload.");
    const dimensions = jpegDimensions(new Uint8Array(await image.data.arrayBuffer()));
    const small = jpegDimensions(new Uint8Array(await thumb.data.arrayBuffer()));
    if (Math.max(dimensions.width, dimensions.height) > MAX_EDGE || Math.max(small.width, small.height) > THUMB_EDGE) throw new Error("Photos must be resized before upload.");
    const updated = await supabaseAdmin.from("gallery_uploads").update({ state: "ready", file_size: image.data.size, thumbnail_size: thumb.data.size, width: dimensions.width, height: dimensions.height, original_size: data.originalSize }).eq("id", u.id).eq("state", "reserved");
    if (updated.error) throw new Error("Could not verify this upload.");
    const measured = await context.supabase.rpc("measure_gallery_storage");
    if (measured.error) throw new Error("Photo verified, but storage measurement failed. Refresh before adding it.");
    return { albumId: u.album_id, uploadId: u.id, bytes: image.data.size, thumbnailBytes: thumb.data.size };
  });

export const galleryPhotoLinks = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ albumId: z.string().uuid(), photoId: z.string().uuid().optional() }))
  .handler(async ({ context, data }) => {
    let query = context.supabase.from("gallery_photos").select("id,file_name,file_path").eq("album_id", data.albumId).eq("deleted", false);
    if (data.photoId) query = query.eq("id", data.photoId);
    const photos = await query; if (photos.error || !photos.data.length) throw new Error("No downloadable photos are available.");
    const album = await context.supabase.from("gallery_albums").select("id").eq("id", data.albumId).eq("deleted", false).single();
    if (album.error) throw new Error("Album unavailable.");
    return Promise.all(photos.data.map(async (p) => {
      const signed = await context.supabase.storage.from(bucket).createSignedUrl(p.file_path, 60);
      if (signed.error) throw new Error("Photo download access denied.");
      return { id: p.id, name: p.file_name, url: signed.data.signedUrl };
    }));
  });

export const removeGalleryFiles = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ uploadId: z.string().uuid() }))
  .handler(async ({ context, data }) => {
    const access = await context.supabase.rpc("has_permission", { _permission: "admin.read" });
    if (access.error || !access.data) throw new Error("Storage management access denied.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const found = await supabaseAdmin.from("gallery_uploads").select("*").eq("id", data.uploadId).single();
    if (found.error) throw new Error("Upload not found.");
    const u = found.data;
    const liveAccess = await context.supabase.rpc("has_permission", { _permission: "admin.write" });
    if (!liveAccess.data && (u.uploader !== context.userId || u.state === "accepted")) throw new Error("President approval is required before removing live photos.");
    const active = await supabaseAdmin.from("gallery_photos").select("id,deleted").eq("upload_id", u.id);
    if (active.error || active.data.some((p) => !p.deleted)) throw new Error("Remove the photo through its approval workflow before deleting stored files.");
    const pending = await supabaseAdmin.from("change_proposals").select("id").eq("module", "gallery_photos").eq("status", "pending").contains("proposed_values", { upload_id: u.id });
    if (pending.error || pending.data.length) throw new Error("Decide the pending photo proposal before discarding its files.");
    const removed = await supabaseAdmin.storage.from(bucket).remove([u.file_path, u.thumbnail_path]);
    if (removed.error) throw new Error("Cloud could not remove the files. They remain stored; retry later.");
    const update = await supabaseAdmin.from("gallery_uploads").update({ state: "removed" }).eq("id", u.id);
    if (update.error) throw new Error("Files removed, but upload status could not be updated. Refresh and retry.");
    await context.supabase.rpc("measure_gallery_storage"); return { ok: true };
  });