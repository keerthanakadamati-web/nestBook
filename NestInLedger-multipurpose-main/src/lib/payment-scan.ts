// Reads text from a UPI payment screenshot on the user's phone (free, no AI credits).
export type ScanResult = {
  utr: string | null;
  month: { year: number; month: number } | null; // month 1-12
  date: string | null; // YYYY-MM-DD of the top-most date
  success: boolean;
  failed: boolean;
  payeeMatch: boolean;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function parsePaymentText(raw: string, payee: { upiId: string; name: string }): ScanResult {
  const text = raw.replace(/\s+/g, " ");
  const low = text.toLowerCase();
  // Transaction ID first (e.g. PhonePe "Transaction ID T2611231015123456789"); UTR only as fallback.
  let utr: string | null = null;
  const txn = text.match(/(?:transaction\s*id|txn\s*id|transaction\s*no\.?)\s*[:#-]?\s*([A-Z0-9]{10,35})/i);
  if (txn?.[1] && /\d{6}/.test(txn[1])) utr = txn[1].toUpperCase();
  else {
    const t = text.match(/\bT\d{15,30}\b/);
    if (t) utr = t[0];
    else {
      const labelled = text.match(/(?:utr|upi\s*ref(?:erence)?(?:\s*no\.?)?|ref(?:erence)?\s*(?:no|number)\.?)[^0-9]{0,15}(\d{12})/i);
      if (labelled?.[1]) utr = labelled[1];
      else { const any = text.match(/(?<!\d)\d{12}(?!\d)/); if (any) utr = any[0]; }
    }
  }
  // Date: use the first (top-most) date shown on the screenshot.
  const found: { at: number; m: { year: number; month: number }; d: number }[] = [];
  for (const x of low.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*,?\s*(20\d{2})/g)) if (x[2] && x[3]) found.push({ at: x.index ?? 0, m: { year: Number(x[3]), month: MONTHS.indexOf(x[2]) + 1 }, d: Number(x[1]) });
  for (const x of low.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*(\d{1,2}),?\s*(20\d{2})/g)) if (x[1] && x[2] && x[3]) found.push({ at: x.index ?? 0, m: { year: Number(x[3]), month: MONTHS.indexOf(x[1]) + 1 }, d: Number(x[2]) });
  for (const x of low.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})\b/g)) if (x[1] && x[2] && x[3]) found.push({ at: x.index ?? 0, m: { year: Number(x[3]), month: Number(x[2]) }, d: Number(x[1]) });
  found.sort((a, b) => a.at - b.at);
  const top = found[0];
  const month: ScanResult["month"] = top?.m ?? null;
  const date = top && top.d >= 1 && top.d <= 31 && top.m.month >= 1 && top.m.month <= 12
    ? `${top.m.year}-${String(top.m.month).padStart(2, "0")}-${String(top.d).padStart(2, "0")}` : null;
  const failed = /\b(failed|declined|cancelled|pending|processing)\b/.test(low);
  const success = /(successful|success|completed|paid to|money sent|sent successfully|paid)/.test(low);
  const id = payee.upiId.toLowerCase().trim();
  const words = payee.name.toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
  const payeeMatch = (!!id && low.replace(/\s/g, "").includes(id)) || words.some((w) => low.includes(w));
  return { utr, month, date, success, failed, payeeMatch };
}

export async function scanPaymentScreenshot(file: File, payee: { upiId: string; name: string }): Promise<ScanResult> {
  const { recognize } = await import("tesseract.js");
  const res = await recognize(file, "eng");
  return parsePaymentText(res.data.text, payee);
}
