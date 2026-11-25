import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listLegalDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: society, error } = await context.supabase.rpc("current_society");
    if (error) throw new Error("Could not load your apartment.");
    if (!society) return { canView: false, canUpload: false, societyId: null, documents: [] };
    const [read, write] = await Promise.all([
      context.supabase.rpc("can_access_legal_documents", { _society: society, _write: false }),
      context.supabase.rpc("can_access_legal_documents", { _society: society, _write: true }),
    ]);
    if (read.error || write.error) throw new Error("Could not check document access.");
    if (!read.data) return { canView: false, canUpload: false, societyId: null, documents: [] };
    const documents = await context.supabase.from("legal_documents").select("id,title,file_path,file_name,file_size,mime_type,created_at").order("created_at", { ascending: false });
    if (documents.error) throw new Error("Could not load legal documents.");
    return { canView: true, canUpload: Boolean(write.data), societyId: society, documents: documents.data };
  });