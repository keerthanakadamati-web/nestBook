export function deliverGalleryFile(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    void navigator.share({ files: [file], title: filename }).catch(() => {}); return;
  }
  const url = URL.createObjectURL(blob), anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
export async function prepareGalleryDownload(links: { name: string; id: string; url: string }[], zip: boolean) {
  const files = await Promise.all(links.map(async (link) => {
    const response = await fetch(link.url);
    if (!response.ok) throw new Error("A photo could not be downloaded. Refresh and try again.");
    const blob = await response.blob(); if (!blob.size || !blob.type.startsWith("image/")) throw new Error("Invalid photo response.");
    return { ...link, blob };
  }));
  if (!zip) { const file = files[0]; if (!file) throw new Error("No photo available."); return { blob: file.blob, name: file.name }; }
  const { default: JSZip } = await import("jszip"); const archive = new JSZip();
  files.forEach((file, index) => archive.file(`${String(index + 1).padStart(3, "0")}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`, file.blob));
  return { blob: await archive.generateAsync({ type: "blob", compression: "STORE" }), name: "album.zip" };
}
export function uploadGalleryBlob(url: string, blob: Blob, progress: (percent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest(); xhr.open("PUT", url); xhr.setRequestHeader("Content-Type", "image/jpeg"); xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) progress(Math.round(e.loaded / e.total * 100)); };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(xhr.status === 413 ? "Cloud rejected the file size." : "Cloud rejected this upload. Check storage restrictions or available capacity."));
    xhr.onerror = () => reject(new Error("Upload connection failed. No photo was recorded.")); xhr.send(blob);
  });
}