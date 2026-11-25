import { Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Images, Plus, Upload, Download, Image as ImageIcon, Pencil, Trash2, Eye, EyeOff, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Notice } from "@/components/app-ui";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { saveAdministrativeChange } from "@/lib/approval";
import { useSessionRole } from "@/lib/session";
import { listGallery, reserveGalleryUpload, finalizeGalleryUpload, galleryPhotoLinks, removeGalleryFiles } from "@/lib/gallery.functions";
import { albumInput, formatBytes } from "@/lib/gallery-rules";
import { optimizeGalleryImage } from "@/lib/gallery-images";
import { deliverGalleryFile, prepareGalleryDownload, uploadGalleryBlob } from "@/lib/gallery-downloads";

export const galleryQuery = queryOptions({ queryKey: ["event-gallery"], queryFn: () => listGallery(), staleTime: 0, refetchInterval: 240000 });
type Album = Awaited<ReturnType<typeof listGallery>>["albums"][number];
export function GalleryPage() {
  const { data, refetch } = useSuspenseQuery(galleryQuery); const { role, societyName } = useSessionRole();
  const reserve = useServerFn(reserveGalleryUpload), finalize = useServerFn(finalizeGalleryUpload), linksFn = useServerFn(galleryPhotoLinks), removeFiles = useServerFn(removeGalleryFiles);
  const [search, setSearch] = useState(""), [year, setYear] = useState(""), [sort, setSort] = useState("upload");
  const [selected, setSelected] = useState<string | null>(null), [editing, setEditing] = useState<Album | "new" | null>(null);
  const [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [progress, setProgress] = useState("");
  const [prepared, setPrepared] = useState<{ blob: Blob; name: string } | null>(null);
  const active = data.albums.find((a) => a.id === selected);
  const photos = data.photos.filter((p) => p.album_id === selected);
  const years = [...new Set(data.albums.map((a) => a.event_date.slice(0, 4)))].sort().reverse();
  const shown = data.albums.filter((a) => a.event_name.toLowerCase().includes(search.toLowerCase()) && (!year || a.event_date.startsWith(year))).sort((a, b) => sort === "name" ? a.event_name.localeCompare(b.event_name) : sort === "event" ? b.event_date.localeCompare(a.event_date) : b.created_at.localeCompare(a.created_at));
  async function changed(pending: boolean) { setMessage(pending ? "Submitted for President approval. Live albums and photos are unchanged." : "Saved."); await refetch(); window.dispatchEvent(new Event("gallery-changed")); }
  async function albumChange(album: Album, values: { published?: boolean; cover_photo_id?: string }) {
    setBusy(true); setError(""); try {
      const result = await saveAdministrativeChange({ module: "gallery_albums", action: "update", key: album.id, values }, () => supabase.from("gallery_albums").update(values).eq("id", album.id));
      if (result.error) throw new Error(result.error.message); await changed(result.pending);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save this album."); } finally { setBusy(false); }
  }
  async function upload(files: FileList | null) {
    if (!files || !active) return; setBusy(true); setError(""); setMessage("");
    try {
      for (const file of Array.from(files)) {
        setProgress(`${file.name}: optimizing…`); const optimized = await optimizeGalleryImage(file);
        const args = { albumId: active.id, filename: optimized.name, bytes: optimized.image.blob.size + optimized.thumb.blob.size, allowOverBudget: false };
        let reservation = await reserve({ data: args });
        if (reservation.warning) {
          if (!confirm(`This upload would exceed the application’s gallery budget (${formatBytes(reservation.budgetBytes)}). This is not the Cloud quota. Continue?`)) continue;
          reservation = await reserve({ data: { ...args, allowOverBudget: true } });
        }
        if (reservation.warning) throw new Error("Upload not reserved.");
        await uploadGalleryBlob(reservation.imageUrl, optimized.image.blob, (p) => setProgress(`${file.name}: photo ${p}%`));
        await uploadGalleryBlob(reservation.thumbnailUrl, optimized.thumb.blob, (p) => setProgress(`${file.name}: thumbnail ${p}%`));
        const verified = await finalize({ data: { id: reservation.id, originalSize: optimized.originalSize } });
        const values = { album_id: active.id, upload_id: verified.uploadId };
        const saved = await saveAdministrativeChange({ module: "gallery_photos", action: "create", values }, () => supabase.from("gallery_photos").insert(values));
        if (saved.error) throw new Error(`${saved.error.message} Your verified upload remains available below for retry.`);
        setMessage(`${optimized.name}: ${formatBytes(optimized.originalSize)} → ${formatBytes(verified.bytes)} + ${formatBytes(verified.thumbnailBytes)} thumbnail. ${saved.pending ? "Waiting for President approval." : "Photo saved."}`);
      }
      await refetch(); window.dispatchEvent(new Event("gallery-changed"));
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed. No photo was recorded as successful."); await refetch(); }
    finally { setBusy(false); setProgress(""); }
  }
  async function resume(uploadId: string, albumId: string) {
    setBusy(true); setError(""); try {
      const values = { album_id: albumId, upload_id: uploadId };
      const r = await saveAdministrativeChange({ module: "gallery_photos", action: "create", values }, () => supabase.from("gallery_photos").insert(values));
      if (r.error) throw new Error(r.error.message); await changed(r.pending);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not add upload."); } finally { setBusy(false); }
  }
  async function discard(id: string) {
    if (!confirm("Discard these pending photo files? This cannot be undone.")) return;
    setBusy(true); setError(""); try { await removeFiles({ data: { uploadId: id } }); await refetch(); } catch (e) { setError(e instanceof Error ? e.message : "Could not discard files."); } finally { setBusy(false); }
  }
  async function removePhoto(id: string, uploadId: string) {
    if (!confirm(role === "secretary" ? "Propose removing this photo for President approval?" : "Remove this photo and its stored files?")) return;
    setBusy(true); setError(""); try {
      const result = await saveAdministrativeChange({ module: "gallery_photos", action: "update", key: id, values: { deleted: true } }, () => supabase.from("gallery_photos").update({ deleted: true }).eq("id", id));
      if (result.error) throw new Error(result.error.message);
      if (!result.pending) await removeFiles({ data: { uploadId } });
      await changed(result.pending);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not remove photo."); await refetch(); } finally { setBusy(false); }
  }
  async function prepareDownload(photoId?: string) {
    if (!active) return; setBusy(true); setError(""); setPrepared(null);
    try {
      const downloadable = await linksFn({ data: { albumId: active.id, photoId } });
      const total = photoId ? photos.find((p) => p.id === photoId)?.file_size ?? 0 : photos.reduce((sum, p) => sum + p.file_size, 0);
      if (total > 200_000_000) throw new Error("This album is too large for a browser ZIP. Download individual photos instead.");
      const result = await prepareGalleryDownload(downloadable, !photoId);
      setPrepared({ ...result, name: photoId ? result.name : `${active.event_name.replace(/[^a-zA-Z0-9-]/g, "_")}.zip` });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not prepare download."); } finally { setBusy(false); }
  }
  return <main className="min-h-screen px-4 py-8 md:px-10"><div className="mx-auto max-w-6xl">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold uppercase text-muted-foreground">{societyName ?? "Your apartment"}</p><h1 className="mt-1 flex items-center gap-3 text-3xl font-bold"><Images className="size-7 text-primary" />Event photos</h1></div>{data.committee && <div className="flex flex-wrap gap-2"><Button asChild variant="outline"><Link to="/storage"><HardDrive />Storage Management</Link></Button><Button onClick={() => setEditing("new")}><Plus />Create album</Button></div>}</header>
    <div className="my-6 flex flex-wrap items-end gap-4"><div className="min-w-48 flex-1"><Label htmlFor="gallery-search">Event name</Label><Input id="gallery-search" className="mt-2" value={search} onChange={(e) => setSearch(e.target.value)} /></div><label className="text-sm font-medium">Year<select className="mt-2 block h-9 rounded-md border border-input bg-background px-3" value={year} onChange={(e) => setYear(e.target.value)}><option value="">All years</option>{years.map((y) => <option key={y}>{y}</option>)}</select></label><label className="text-sm font-medium">Sort by<select className="mt-2 block h-9 rounded-md border border-input bg-background px-3" value={sort} onChange={(e) => setSort(e.target.value)}><option value="upload">Upload date</option><option value="event">Event date</option><option value="name">Event name</option></select></label><Button variant="outline" disabled={busy} onClick={() => refetch()}>Refresh</Button></div>
    {error && <Notice tone="error">{error}</Notice>}{message && <Notice tone="ok">{message}</Notice>}
    {!shown.length && <div className="flex flex-col items-center gap-3 border-y border-border py-16 text-muted-foreground"><Images className="size-10" /><p>No {data.committee ? "event" : "published"} albums yet.</p></div>}
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{shown.map((album) => {
      const albumPhotos = data.photos.filter((p) => p.album_id === album.id); const cover = albumPhotos.find((p) => p.id === album.cover_photo_id) ?? albumPhotos[0];
      return <article key={album.id} className="overflow-hidden rounded-lg border border-border bg-card"><div className="flex aspect-[4/3] items-center justify-center bg-muted">{cover ? <img src={cover.thumbnailUrl} alt={album.event_name} className="size-full object-cover" loading="lazy" /> : <ImageIcon className="size-12 text-muted-foreground" />}</div><div className="p-4"><div className="flex items-start justify-between gap-3"><h2 className="break-words text-lg font-semibold">{album.event_name}</h2>{data.committee && <span className="text-xs text-muted-foreground">{album.published ? "Published" : "Unpublished"}</span>}</div><p className="mt-1 text-sm text-muted-foreground">{album.event_date} · {albumPhotos.length} photos</p><p className="mt-1 text-xs text-muted-foreground">Added {album.created_at.slice(0, 10)}</p><Button className="mt-4 w-full" variant="outline" onClick={() => { setSelected(album.id); setPrepared(null); }}>View album</Button></div></article>;
    })}</div>
    {active && <section className="mt-8 border-t border-border pt-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="break-words text-2xl font-bold">{active.event_name}</h2><p className="mt-1 text-sm text-muted-foreground">{active.event_date} · {active.published ? "Published" : "Unpublished"}</p><p className="mt-3 whitespace-pre-wrap break-words">{active.description}</p></div><div className="flex flex-wrap gap-2">{photos.length > 0 && <Button disabled={busy} variant="outline" onClick={() => prepareDownload()}><Download />Prepare album ZIP</Button>}{data.committee && <><Button variant="outline" disabled={busy} onClick={() => setEditing(active)}><Pencil />Edit album</Button><Button variant="outline" disabled={busy} onClick={() => albumChange(active, { published: !active.published })}>{active.published ? <EyeOff /> : <Eye />}{active.published ? "Unpublish" : "Publish"}</Button></>}</div></div>
      {data.committee && <div className="my-5"><Label htmlFor="gallery-upload" className="flex items-center gap-2"><Upload className="size-4" />Upload photos</Label><Input id="gallery-upload" className="mt-2 max-w-md" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy} onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />{role === "secretary" && <p className="mt-2 text-sm text-muted-foreground">Photo additions and album changes need President approval.</p>}{progress && <p role="status" className="mt-2 text-sm">{progress}</p>}</div>}
      {prepared && <Button className="my-4" onClick={() => deliverGalleryFile(prepared.blob, prepared.name)}><Download />Download {prepared.name.endsWith(".zip") ? "album ZIP" : "photo"}</Button>}
      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">{photos.map((photo) => <article key={photo.id} className="overflow-hidden rounded-lg border border-border bg-card"><img src={photo.thumbnailUrl} alt={photo.file_name} className="aspect-[4/3] w-full object-contain bg-muted" loading="lazy" /><div className="p-3"><p className="truncate text-sm font-medium">{photo.file_name}</p><p className="mt-1 text-xs text-muted-foreground">{formatBytes(photo.file_size)} · {photo.width} × {photo.height}</p><div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => prepareDownload(photo.id)}><Download />Prepare photo</Button>{data.committee && <><Button variant="outline" size="icon" title="Set cover photo" aria-label={`Set cover ${photo.file_name}`} disabled={busy} onClick={() => albumChange(active, { cover_photo_id: photo.id })}><ImageIcon /></Button><Button variant="outline" size="icon" title="Remove photo" aria-label={`Remove ${photo.file_name}`} disabled={busy} onClick={() => removePhoto(photo.id, photo.upload_id)}><Trash2 /></Button></>}</div></div></article>)}</div>
      {data.committee && data.uploads.filter((u) => u.album_id === active.id).map((u) => <div key={u.id} className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-border py-3"><p className="break-words text-sm">{u.file_name} · {u.state === "ready" ? "Verified upload awaiting addition or approval" : "Incomplete upload"}</p><div className="flex gap-2">{u.state === "ready" && <Button variant="outline" disabled={busy} onClick={() => resume(u.id, u.album_id)}>Add verified photo</Button>}<Button variant="outline" disabled={busy} onClick={() => discard(u.id)}>Discard files</Button></div></div>)}
    </section>}
    {editing && <AlbumForm album={editing} onClose={() => setEditing(null)} onSaved={async (pending) => { setEditing(null); await changed(pending); }} />}
  </div></main>;
}

function AlbumForm({ album, onClose, onSaved }: { album: Album | "new"; onClose: () => void; onSaved: (pending: boolean) => Promise<void> }) {
  const existing = album === "new" ? null : album;
  const [name, setName] = useState(existing?.event_name ?? ""), [date, setDate] = useState(existing?.event_date ?? ""), [description, setDescription] = useState(existing?.description ?? ""), [published, setPublished] = useState(existing?.published ?? false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}><DialogContent><DialogTitle>{existing ? "Edit album" : "Create album"}</DialogTitle><form className="space-y-4" onSubmit={async (e) => {
    e.preventDefault(); setBusy(true); setError(""); try {
      const values = albumInput.parse({ event_name: name, event_date: date, description, published });
      const result = await saveAdministrativeChange({ module: "gallery_albums", action: existing ? "update" : "create", key: existing?.id, values }, () => existing ? supabase.from("gallery_albums").update(values).eq("id", existing.id) : supabase.from("gallery_albums").insert(values));
      if (result.error) throw new Error(result.error.message); await onSaved(result.pending);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save album."); } finally { setBusy(false); }
  }}><div><Label htmlFor="event-name">Event name</Label><Input id="event-name" className="mt-2" required maxLength={160} value={name} onChange={(e) => setName(e.target.value)} /></div><div><Label htmlFor="event-date">Event date</Label><Input id="event-date" className="mt-2" type="date" required value={date} onChange={(e) => setDate(e.target.value)} /></div><div><Label htmlFor="event-description">Description</Label><Textarea id="event-description" className="mt-2" maxLength={5000} value={description} onChange={(e) => setDescription(e.target.value)} /></div><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />Published</label>{error && <Notice tone="error">{error}</Notice>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save album"}</Button></div></form></DialogContent></Dialog>;
}