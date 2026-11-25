import { useState } from "react";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileLock2, Upload, Eye, Download, FileText, LockKeyhole } from "lucide-react";
import { PrimaryButton, QuietButton, Field, Notice } from "@/components/app-ui";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { listLegalDocuments } from "@/lib/legal-documents.functions";
import { legalFileError } from "@/lib/legal-documents";
import { shortDate } from "@/lib/format";

export const legalDocumentsQuery = queryOptions({ queryKey: ["legal-documents"], queryFn: () => listLegalDocuments() });
type LegalDoc = Awaited<ReturnType<typeof listLegalDocuments>>["documents"][number];

export function LegalDocuments() {
  const { data } = useSuspenseQuery(legalDocumentsQuery);
  const refresh = useServerFn(listLegalDocuments);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<{ doc: LegalDoc; url: string } | null>(null);
  const [success, setSuccess] = useState("");
  if (!data.canView) return null;

  async function upload(event: React.FormEvent) {
    event.preventDefault(); setMessage(""); setSuccess("");
    if (!file || !title.trim()) return setMessage("Enter a title and choose a file.");
    const validation = legalFileError(file);
    if (validation) return setMessage(validation);
    setBusy(true);
    let path: string | null = null;
    let registered = false;
    try {
      // Recheck apartment and authority immediately before uploading.
      const latest = await refresh();
      const { data: auth, error } = await supabase.auth.getUser();
      if (error || !auth.user || !latest.canUpload || !latest.societyId) throw new Error("Only your President can upload legal documents.");
      path = `${latest.societyId}/${auth.user.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
      const uploaded = await supabase.storage.from("legal-documents").upload(path, file, { contentType: file.type, upsert: false });
      if (uploaded.error) throw new Error("Could not upload the file. Please try again.");
      const saved = await supabase.rpc("register_legal_document", { _title: title.trim(), _path: path, _name: file.name });
      if (saved.error) throw new Error("Could not save the document. Please try again.");
      registered = true;
      setOpen(false); setFile(null); setTitle(""); setSuccess("Legal document saved.");
      await queryClient.invalidateQueries({ queryKey: ["legal-documents"] });
    } catch (error) {
      if (path && !registered) await supabase.storage.from("legal-documents").remove([path]);
      setMessage(error instanceof Error ? error.message : "Could not save the document.");
    } finally { setBusy(false); }
  }

  async function view(doc: LegalDoc) {
    setMessage(""); setBusy(true);
    try {
      const signed = await supabase.storage.from("legal-documents").createSignedUrl(doc.file_path, 120);
      if (signed.error || !signed.data?.signedUrl) throw new Error("Could not open this document. Try again.");
      setPreview({ doc, url: signed.data.signedUrl });
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not open this document."); }
    finally { setBusy(false); }
  }

  async function download(doc: LegalDoc) {
    setBusy(true); setMessage("");
    try {
      const result = await supabase.storage.from("legal-documents").download(doc.file_path);
      if (result.error || !result.data) throw new Error("Could not download this document. Try again.");
      const url = URL.createObjectURL(result.data);
      const link = document.createElement("a"); link.href = url; link.download = doc.file_name;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not download this document."); }
    finally { setBusy(false); }
  }

  return <section className="mt-10 border-t border-border pt-8">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3"><span className="rounded-lg bg-primary/10 p-3 text-primary"><FileLock2 aria-hidden="true" className="h-6 w-6" /></span><div><h2 className="text-xl font-semibold">Legal Documents</h2><p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><LockKeyhole className="h-3 w-3" />Private committee records</p></div></div>
      {data.canUpload && <PrimaryButton onClick={() => { setOpen(true); setMessage(""); }}><Upload className="mr-2 h-4 w-4" />Upload legal document</PrimaryButton>}
    </div>
    <div className="mt-4"><Notice tone="error">{message}</Notice><Notice tone="ok">{success}</Notice></div>
    {data.documents.length === 0 ? <p className="py-8 text-muted-foreground">No legal documents saved yet.</p> : <div className="mt-4 divide-y divide-border">{data.documents.map(doc => <article key={doc.id} className="flex flex-wrap items-center justify-between gap-4 py-5"><div className="flex min-w-0 flex-1 items-start gap-3"><FileText className="mt-1 h-5 w-5 shrink-0 text-primary" /><div className="min-w-0"><h3 className="break-words font-semibold">{doc.title}</h3><p className="break-all text-sm text-muted-foreground">{doc.file_name}</p><p className="mt-1 text-xs text-muted-foreground">{(doc.file_size / 1024 / 1024).toFixed(2)} MB · {shortDate(doc.created_at)}</p></div></div><div className="flex gap-2"><QuietButton disabled={busy} onClick={() => view(doc)}><Eye className="mr-2 h-4 w-4" />View</QuietButton><QuietButton disabled={busy} onClick={() => download(doc)}><Download className="mr-2 h-4 w-4" />Download</QuietButton></div></article>)}</div>}
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto rounded-lg"><DialogHeader><DialogTitle>Upload legal document</DialogTitle><DialogDescription>Private committee records</DialogDescription></DialogHeader><form onSubmit={upload} className="space-y-4"><Field label="Document title" value={title} maxLength={150} required onChange={e => setTitle(e.target.value)} /><Field label="Choose document" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" required hint="PDF, Word, JPG or PNG · Up to 10 MB" onChange={e => setFile(e.target.files?.[0] ?? null)} /><Notice tone="error">{message}</Notice><PrimaryButton type="submit" disabled={busy}><Upload className="mr-2 h-4 w-4" />{busy ? "Saving…" : "Save legal document"}</PrimaryButton></form></DialogContent></Dialog>
    <Dialog open={Boolean(preview)} onOpenChange={value => { if (!value) setPreview(null); }}><DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto rounded-lg"><DialogHeader><DialogTitle className="break-words pr-6">{preview?.doc.title}</DialogTitle><DialogDescription className="break-all">{preview?.doc.file_name}</DialogDescription></DialogHeader>{preview && <>{preview.doc.mime_type.startsWith("image/") ? <img src={preview.url} alt={preview.doc.title} className="max-h-[60vh] w-full object-contain" /> : preview.doc.mime_type === "application/pdf" ? <iframe src={preview.url} title={preview.doc.title} className="h-[60vh] w-full rounded-md border border-border" /> : <p className="py-8 text-muted-foreground">Word document · Download to open.</p>}<QuietButton disabled={busy} onClick={() => download(preview.doc)}><Download className="mr-2 h-4 w-4" />Download document</QuietButton></>}</DialogContent></Dialog>
  </section>;
}