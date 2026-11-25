import { useState } from "react";
import { Download, FileText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/app-ui";
import { supabase } from "@/integrations/supabase/client";
import { acknowledgmentCsv, canDownloadAcknowledgments, type Acknowledgment } from "@/lib/pilot-terms";
import type { Role } from "@/lib/permissions";

export function PilotAcknowledgments({ role }: { role: Role }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!canDownloadAcknowledgments(role)) return null;
  async function download(format: "csv" | "pdf") {
    setBusy(true); setError("");
    try {
      const result = await supabase.rpc("export_pilot_acknowledgments");
      if (result.error) throw result.error;
      if (!Array.isArray(result.data)) throw new Error("Could not load acknowledgments.");
      const rows = result.data as unknown as Acknowledgment[];
      const name = `NestInLedger-Pilot-Acknowledgments-${new Date().toISOString().slice(0, 10)}`;
      if (format === "csv") {
        const url = URL.createObjectURL(new Blob(["\uFEFF", acknowledgmentCsv(rows)], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a"); link.href = url; link.download = `${name}.csv`;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF(); let y = 20;
        const line = (text: string, size = 10) => {
          pdf.setFontSize(size);
          const lines: string[] = pdf.splitTextToSize(text, 178);
          for (const part of lines) {
            if (y > 275) { pdf.addPage(); y = 20; }
            pdf.text(part, 16, y); y += size === 16 ? 8 : 5;
          }
        };
        line("NestInLedger - Pilot Acknowledgment Register", 16);
        line(`Generated: ${new Date().toISOString()} (UTC)`);
        line(`Accepted accounts: ${rows.length}`); y += 6;
        if (!rows.length) line("No acknowledgments recorded yet.");
        rows.forEach((row, index) => {
          if (y > 225) { pdf.addPage(); y = 20; }
          line(`${index + 1}. ${row.email}`);
          line(`Account: ${row.user_id}`);
          line(`Society: ${row.society_name ?? "Platform account"} (${row.society_code ?? "-"})`);
          line(`Version: ${row.terms_version} | Accepted: ${row.accepted_at} (UTC)`);
          line(`Terms SHA-256: ${row.terms_hash}`); y += 5;
        });
        const versions = new Map(rows.map(row => [row.terms_version, row]));
        for (const [version, row] of versions) {
          pdf.addPage(); y = 20; line(`Exact accepted terms - ${version}`, 16);
          line(row.terms_text);
        }
        pdf.save(`${name}.pdf`);
      }
    } catch (err) { setError(err instanceof Error ? err.message : "Could not download acknowledgments. Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="mt-8 border-t border-border pt-6">
    <h2 className="flex items-center gap-2 text-xl font-semibold"><ShieldCheck className="size-5 text-primary" />Pilot acknowledgments</h2>
    <p className="mt-2 text-sm text-muted-foreground">Accepted terms, account details and acceptance dates. Admin access only.</p>
    <div className="mt-4 flex flex-wrap gap-3">
      <Button disabled={busy} onClick={() => download("pdf")}><FileText className="size-4" />Download PDF</Button>
      <Button variant="outline" disabled={busy} onClick={() => download("csv")}><Download className="size-4" />Download spreadsheet</Button>
    </div>
    {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
  </section>;
}