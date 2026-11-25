export type ReportSnapshot = {
  periodStart: string; periodEnd: string; asOf: string; basis: string;
  openingOutstanding: number; maintenanceBilled: number; maintenanceCollected: number; outstandingDues: number;
  otherReceipts: number; totalIncome: number; totalExpenses: number; openingBalance: number; closingBalance: number;
  openingBalanceRecorded: boolean;
  openingAdvanceCredit?: number;
  closingAdvanceCredit?: number;
  expenseCategories: { category: string; amount: number }[];
  transactions: { id: string; date: string; kind: string; flat: string | null; amount: number; method: string; reference: string | null; description: string; accounting_month: string }[];
};
export type FinancialReport = {
  id: string; period_type: string; period_start: string; period_end: string; generated_at: string;
  prepared_email: string; prepared_by: string; status: string; submitted_at: string | null;
  secretary_reviewed_at: string | null; president_reviewed_at: string | null; approved_at: string | null;
  snapshot: ReportSnapshot;
};
export const summaryFields = [
  ["Opening outstanding dues", "openingOutstanding"], ["Maintenance billed", "maintenanceBilled"],
  ["Maintenance collected", "maintenanceCollected"], ["Outstanding dues", "outstandingDues"],
  ["Other receipts", "otherReceipts"], ["Total income", "totalIncome"], ["Total expenses", "totalExpenses"],
  ["Opening fund balance", "openingBalance"], ["Closing fund balance", "closingBalance"],
] as const;

export function reportPeriod(report: FinancialReport) {
  const end = new Date(`${report.period_end}T00:00:00Z`); end.setUTCDate(end.getUTCDate() - 1);
  return `${report.period_start} to ${end.toISOString().slice(0, 10)}`;
}
export function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function reportCsv(report: FinancialReport, societyName?: string | null) {
  const s = report.snapshot;
  const soc = (societyName?.trim() || "Apartment Society").toUpperCase();
  const rows: unknown[][] = [["NestInLedger", soc], ["Report period", reportPeriod(report)], ["Report type", report.period_type], ["As of", s.asOf], ["Generated at", report.generated_at], ["Prepared by", report.prepared_email], ["Status", report.status], ["Submitted at", report.submitted_at], ["Secretary reviewed at", report.secretary_reviewed_at], ["President reviewed at", report.president_reviewed_at], ["Approved at", report.approved_at], [], ["Summary", "Amount (INR)"]];
  summaryFields.forEach(([label, key]) => rows.push([label, s[key]]));
  if (s.openingAdvanceCredit !== undefined) rows.push(["Opening advance credit", s.openingAdvanceCredit], ["Closing advance credit", s.closingAdvanceCredit ?? 0]);
  rows.push([], ["Accounting basis", s.basis], ["Opening fund balance", s.openingBalanceRecorded ? "Recorded" : "No opening balance recorded; existing zero default used"], [], ["Expense category", "Amount (INR)"]);
  s.expenseCategories.forEach((e) => rows.push([e.category, e.amount]));
  rows.push([], ["Transaction ID", "Date", "Type", "Flat", "Amount (INR)", "Method", "Reference", "Description / month covered", "Accounting month"]);
  s.transactions.forEach((t) => rows.push([t.id, t.date, t.kind, t.flat, t.amount, t.method, t.reference, t.description, t.accounting_month]));
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function reportFileName(report: FinancialReport, ext: "pdf" | "csv", societyName?: string | null) {
  const [y = 0, m = 1] = report.period_start.split("-").map(Number);
  const label = report.period_type === "yearly" ? `FY${y}-${String((y + 1) % 100).padStart(2, "0")}` : `${MONTHS[m - 1]}-${y}`;
  const prefix = (societyName?.trim() || "Society").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "") || "Society";
  return `${prefix}-Financial-Report-${label}.${ext}`;
}
function niceDate(v: string | null) {
  if (!v) return "-";
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
const rs = (n: number) => `Rs. ${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
type RGB = [number, number, number];
const NAVY: RGB = [15, 35, 75], GREEN: RGB = [16, 150, 100], RED: RGB = [200, 50, 50], AMBER: RGB = [210, 140, 20], GREY: RGB = [110, 115, 125], LIGHT: RGB = [242, 245, 249], LINE: RGB = [220, 225, 232];
const PALETTE: RGB[] = [[15, 35, 75], [16, 150, 100], [210, 140, 20], [80, 110, 190], [200, 50, 50], [120, 80, 160], [40, 150, 170]];

export async function reportPdf(report: FinancialReport, societyName?: string | null) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const s = report.snapshot; const W = 210, M = 14, CW = W - 2 * M; let y = 0;
  const fill = (c: RGB) => pdf.setFillColor(c[0], c[1], c[2]);
  const color = (c: RGB) => pdf.setTextColor(c[0], c[1], c[2]);
  const ensure = (h: number) => { if (y + h > 280) { pdf.addPage(); y = 16; } };
  const heading = (t: string) => { ensure(14); y += 4; pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); color(NAVY); pdf.text(t, M, y); fill(GREEN); pdf.rect(M, y + 1.5, 18, 0.8, "F"); y += 7; };

  // Header
  fill(NAVY); pdf.rect(0, 0, W, 36, "F");
  const soc = (societyName?.trim() || "Apartment Society").toUpperCase();
  pdf.setTextColor(255, 255, 255); pdf.setFont("helvetica", "bold"); pdf.setFontSize(18); pdf.text(soc, M, 14);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(11);
  const [py = 0, pm = 1] = report.period_start.split("-").map(Number);
  const title = report.period_type === "yearly" ? `Financial Year Report ${py}-${String((py + 1) % 100).padStart(2, "0")}` : `Monthly Financial Report - ${MONTHS[pm - 1]} ${py}`;
  pdf.text(title, M, 22); pdf.setFontSize(9);
  const end = new Date(`${report.period_end}T00:00:00Z`); end.setUTCDate(end.getUTCDate() - 1);
  pdf.text(`Period: ${niceDate(report.period_start)} to ${niceDate(end.toISOString().slice(0, 10))}   |   Prepared by: ${report.prepared_email}`, M, 30);
  const status = report.approved_at ? "APPROVED" : report.status.toUpperCase();
  const sc = report.approved_at ? GREEN : report.status === "prepared" ? GREY : AMBER;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(9); const sw = pdf.getTextWidth(status) + 8;
  fill(sc); pdf.roundedRect(W - M - sw, 9, sw, 7, 3, 3, "F"); pdf.setTextColor(255, 255, 255); pdf.text(status, W - M - sw + 4, 13.8);
  y = 44;

  // KPI cards
  const net = s.totalIncome - s.totalExpenses;
  const kpis: [string, number, RGB][] = [["Total income", s.totalIncome, GREEN], ["Total expenses", s.totalExpenses, RED], ["Net for period", net, net >= 0 ? GREEN : RED], ["Closing fund balance", s.closingBalance, NAVY]];
  const kw = (CW - 9) / 4;
  kpis.forEach(([label, val, c], i) => {
    const x = M + i * (kw + 3); fill(LIGHT); pdf.roundedRect(x, y, kw, 22, 2, 2, "F"); fill(c); pdf.rect(x, y, 1.6, 22, "F");
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); color(GREY); pdf.text(label, x + 5, y + 7);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); color(c); pdf.text(rs(val), x + 5, y + 16);
  });
  y += 30;

  // Bars
  const bar = (label: string, value: number, total: number, c: RGB, right: string) => {
    ensure(14); pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); color([40, 40, 50]); pdf.text(label, M, y);
    pdf.setFont("helvetica", "bold"); pdf.text(right, W - M, y, { align: "right" }); y += 2.5;
    fill(LINE); pdf.roundedRect(M, y, CW, 4.5, 2, 2, "F");
    const w = total > 0 ? Math.max(0, Math.min(1, value / total)) * CW : 0;
    if (w > 0) { fill(c); pdf.roundedRect(M, y, Math.max(w, 4), 4.5, 2, 2, "F"); }
    y += 10;
  };
  heading("Collection overview");
  const due = s.maintenanceBilled + s.openingOutstanding;
  const pct = due > 0 ? Math.round((Math.min(s.maintenanceCollected, due) / due) * 100) : 100;
  bar("Maintenance collected vs due (incl. old dues)", s.maintenanceCollected, due, GREEN, `${rs(s.maintenanceCollected)} of ${rs(due)}  (${pct}%)`);
  const big = Math.max(s.totalIncome, s.totalExpenses, 1);
  bar("Money in", s.totalIncome, big, GREEN, rs(s.totalIncome));
  bar("Money out", s.totalExpenses, big, RED, rs(s.totalExpenses));

  // Summary table
  const table = (head: string[], rows: string[][], widths: number[], alignRight: number[], highlightLast = false) => {
    const row = (cells: string[], isHead: boolean, i: number) => {
      const lines = cells.map((c, j) => pdf.splitTextToSize(c, (widths[j] ?? 20) - 4) as string[]);
      const h = Math.max(7, Math.max(...lines.map((l) => l.length)) * 4 + 3);
      if (!isHead && y + h > 280) { pdf.addPage(); y = 16; row(head, true, -1); }
      ensure(h);
      if (isHead) fill(NAVY); else if (highlightLast && i === rows.length - 1) fill([225, 245, 236]); else fill(i % 2 ? [255, 255, 255] : LIGHT);
      pdf.rect(M, y, CW, h, "F");
      pdf.setFont("helvetica", isHead || (highlightLast && i === rows.length - 1) ? "bold" : "normal"); pdf.setFontSize(8.5);
      if (isHead) pdf.setTextColor(255, 255, 255); else color([35, 35, 45]);
      let x = M;
      lines.forEach((l, j) => { const r = alignRight.includes(j); pdf.text(l, r ? x + (widths[j] ?? 0) - 2 : x + 2, y + 4.8, { align: r ? "right" : "left" }); x += widths[j] ?? 0; });
      y += h;
    };
    row(head, true, -1); rows.forEach((r, i) => row(r, false, i)); y += 4;
  };
  heading("Financial summary");
  const sumRows = summaryFields.map(([label, key]) => [label, rs(s[key])]);
  if (s.openingAdvanceCredit !== undefined) sumRows.push(["Opening advance credit", rs(s.openingAdvanceCredit)], ["Closing advance credit", rs(s.closingAdvanceCredit ?? 0)]);
  table(["Item", "Amount"], sumRows, [CW * 0.65, CW * 0.35], [1], true);

  // Expense chart
  heading("Expenses by category");
  if (!s.expenseCategories.length) { pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); color(GREY); pdf.text("No expenses in this period.", M, y); y += 8; }
  else {
    const total = s.expenseCategories.reduce((a, e) => a + Number(e.amount), 0) || 1;
    const maxE = Math.max(...s.expenseCategories.map((e) => Number(e.amount)), 1);
    [...s.expenseCategories].sort((a, b) => b.amount - a.amount).forEach((e, i) => {
      ensure(12); const c = PALETTE[i % PALETTE.length] ?? NAVY;
      pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); color([40, 40, 50]);
      pdf.text((pdf.splitTextToSize(e.category, 70) as string[])[0] ?? "", M, y + 3.5);
      const bx = M + 72, bw = CW - 72 - 42;
      fill(LINE); pdf.rect(bx, y, bw, 5, "F"); fill(c); pdf.rect(bx, y, Math.max(1, (e.amount / maxE) * bw), 5, "F");
      pdf.setFont("helvetica", "bold"); pdf.text(`${rs(e.amount)} (${Math.round((e.amount / total) * 100)}%)`, W - M, y + 3.8, { align: "right" });
      y += 9;
    });
  }

  // Transactions
  heading("Transaction details");
  if (!s.transactions.length) { pdf.setFont("helvetica", "normal"); pdf.setFontSize(9); color(GREY); pdf.text("No payments or expenses in this period.", M, y); y += 8; }
  else {
    const rows = [...s.transactions].sort((a, b) => a.date.localeCompare(b.date)).map((t) => [niceDate(t.date), t.kind === "Maintenance" ? "Maint." : t.kind, t.flat ? `Flat ${t.flat}` : "-", t.description, (t.method || "-").toUpperCase(), t.reference ?? "-", rs(t.amount)]);
    table(["Date", "Type", "Flat", "Details", "Mode", "Reference", "Amount"], rows, [21, 24, 15, 50, 16, 32, CW - 158], [6]);
  }

  // Review status
  heading("Review and approval");
  table(["Step", "Date"], [["Submitted by Treasurer", niceDate(report.submitted_at)], ["Reviewed by Secretary", niceDate(report.secretary_reviewed_at)], ["Reviewed by President", niceDate(report.president_reviewed_at)], ["Approved", niceDate(report.approved_at)]], [CW * 0.65, CW * 0.35], [1]);
  ensure(16); pdf.setFont("helvetica", "italic"); pdf.setFontSize(7.5); color(GREY);
  const note = (pdf.splitTextToSize(`Note: ${s.basis}${s.openingBalanceRecorded ? "" : " No opening fund balance was recorded, so zero is used."}`, CW) as string[]);
  pdf.text(note, M, y);

  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i); pdf.setDrawColor(LINE[0], LINE[1], LINE[2]); pdf.line(M, 287, W - M, 287);
    pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5); color(GREY);
    pdf.text(`NestInLedger | Generated ${niceDate(report.generated_at)}`, M, 291); pdf.text(`Page ${i} of ${pages}`, W - M, 291, { align: "right" });
  }
  return pdf.output("blob");
}
export function downloadReport(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}