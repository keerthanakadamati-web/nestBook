import { jsPDF } from "jspdf";

import { shortDate } from "./format";

export type ReceiptInput = {
  receiptNo: string;
  flatNumber: string;
  residentName: string;
  amount: number | string;
  method: string;
  paidOn: string;
  monthCovered: string;
  reference?: string | null;
  societyName?: string;
};

// jsPDF built-in fonts cannot draw the ₹ sign, so PDFs use "Rs.".
export function pdfMoney(value: number | string | null | undefined) {
  const n = Number(value ?? 0);
  return `Rs. ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

const NAVY: [number, number, number] = [15, 32, 68];
const EMERALD: [number, number, number] = [16, 150, 105];
const RED: [number, number, number] = [200, 40, 40];
const LIGHT: [number, number, number] = [244, 246, 250];

function header(doc: jsPDF, society: string, title: string, sub: string) {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, 595, 100, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(society.toUpperCase(), 40, 48);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(title, 40, 70);
  doc.setFontSize(10);
  doc.text(sub, 555, 70, { align: "right" });
}

function table(doc: jsPDF, y: number, heading: string, rows: Array<[string, string]>, highlightLast = false) {
  const left = 40, width = 515, rowH = 28, split = 230;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text(heading, left, y);
  y += 10;
  doc.setDrawColor(210);
  rows.forEach(([label, value], i) => {
    const last = highlightLast && i === rows.length - 1;
    if (last) doc.setFillColor(...NAVY); else doc.setFillColor(...(i % 2 ? ([255, 255, 255] as [number, number, number]) : LIGHT));
    doc.rect(left, y, width, rowH, "FD");
    doc.line(left + split, y, left + split, y + rowH);
    doc.setFontSize(11);
    doc.setFont("helvetica", last ? "bold" : "normal");
    doc.setTextColor(last ? 255 : 90);
    doc.text(label, left + 12, y + 18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(last ? 255 : 30);
    doc.text(String(value || "-"), left + split + 12, y + 18);
    y += rowH;
  });
  return y + 26;
}

function statusBadge(doc: jsPDF, y: number, label: string, good: boolean) {
  doc.setFillColor(...(good ? EMERALD : RED));
  doc.roundedRect(40, y, 180, 30, 6, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(label, 130, y + 20, { align: "center" });
  return y + 50;
}

function footer(doc: jsPDF, note: string) {
  doc.setDrawColor(200);
  doc.line(40, 780, 555, 780);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(note, 40, 796);
  doc.text(`Generated ${new Date().toLocaleDateString("en-IN")}`, 555, 796, { align: "right" });
}

export function downloadReceipt(input: ReceiptInput) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  header(doc, input.societyName || "Apartment Society", "Maintenance Payment Receipt", `Receipt No: ${input.receiptNo}`);
  let y = statusBadge(doc, 130, "PAYMENT RECEIVED", true);
  y = table(doc, y, "Resident details", [
    ["Flat number", input.flatNumber],
    ["Resident name", input.residentName],
  ]);
  const pay: Array<[string, string]> = [
    ["Month covered", input.monthCovered],
    ["Payment date", shortDate(input.paidOn)],
    ["Payment method", input.method === "upi" ? "Online UPI" : "Cash"],
  ];
  if (input.reference) pay.push(["Reference", input.reference]);
  pay.push(["Amount paid", pdfMoney(input.amount)]);
  table(doc, y, "Payment details", pay, true);
  footer(doc, "Thank you. Please keep this receipt for your records.");
  doc.save(`Receipt-${input.receiptNo}.pdf`);
}

export type StatementInput = {
  flatNumber: string;
  ownerName: string;
  monthLabel: string;
  dueDate: string;
  billed: number | string;
  currentOutstanding: number | string;
  previous: number | string;
  outstanding: number | string;
  credit: number | string;
  status: string;
  payments: Array<{ date: string; amount: number | string; method: string; status: string; receiptNo?: string | null }>;
  fileName: string;
  societyName?: string;
};

export function downloadStatement(s: StatementInput) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  header(doc, s.societyName || "Apartment Society", "Maintenance Statement", `${s.monthLabel} | Flat ${s.flatNumber}`);
  const due = Number(s.outstanding) > 0;
  const label = due ? (Number(s.outstanding) < Number(s.billed) + Number(s.previous) ? "PARTIALLY PAID" : "OUTSTANDING") : "PAID";
  let y = statusBadge(doc, 130, label, !due);
  y = table(doc, y, "Flat details", [
    ["Flat number", s.flatNumber],
    ["Owner", s.ownerName],
    ["Month", s.monthLabel],
    ["Due date", shortDate(s.dueDate)],
  ]);
  const rows: Array<[string, string]> = [
    ["Monthly bill", pdfMoney(s.billed)],
    ["This month remaining", pdfMoney(s.currentOutstanding)],
    ["Previous dues remaining", pdfMoney(s.previous)],
  ];
  if (Number(s.credit) > 0) rows.push(["Advance credit", pdfMoney(s.credit)]);
  rows.push(["Total amount due", pdfMoney(s.outstanding)]);
  y = table(doc, y, "Amount summary", rows, true);

  // Payment history table
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...NAVY);
  doc.text("Payment history", 40, y); y += 10;
  const cols: number[] = [40, 150, 260, 360, 460];
  const heads = ["Date", "Amount", "Method", "Status", "Receipt"];
  doc.setFillColor(...NAVY); doc.rect(40, y, 515, 24, "F");
  doc.setTextColor(255); doc.setFontSize(10);
  heads.forEach((h, i) => doc.text(h, (cols[i] ?? 0) + 10, y + 16));
  y += 24;
  doc.setFont("helvetica", "normal");
  const list = s.payments.slice(-12);
  if (!list.length) { doc.setTextColor(120); doc.text("No payments yet.", 50, y + 18); y += 28; }
  list.forEach((p, i) => {
    if (i % 2 === 0) { doc.setFillColor(...LIGHT); doc.rect(40, y, 515, 22, "F"); }
    doc.setTextColor(40);
    [shortDate(p.date), pdfMoney(p.amount), p.method === "upi" ? "UPI" : "Cash", p.status === "confirmed" ? "Confirmed" : p.status === "pending" ? "Pending" : "Not received", p.receiptNo && p.status === "confirmed" ? p.receiptNo : "-"]
      .forEach((v, c) => doc.text(String(v), (cols[c] ?? 0) + 10, y + 15));
    y += 22;
  });
  footer(doc, "Confirmed payments only. Oldest dues are cleared first.");
  doc.save(s.fileName);
}
