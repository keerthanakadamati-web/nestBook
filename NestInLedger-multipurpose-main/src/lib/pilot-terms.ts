import type { Role } from "@/lib/permissions";

export type PilotTerms = { version: string; title: string; text: string; accepted_at: string | null };
export type Acknowledgment = {
  user_id: string; email: string; society_code: string | null; society_name: string | null;
  terms_version: string; terms_text: string; terms_hash: string; accepted_at: string;
};
export function parsePilotTerms(value: unknown): PilotTerms {
  if (!value || typeof value !== "object" || !("version" in value) || !("title" in value) || !("text" in value) || !("accepted_at" in value)
    || typeof value.version !== "string" || typeof value.title !== "string" || typeof value.text !== "string"
    || (value.accepted_at !== null && typeof value.accepted_at !== "string")) throw new Error("Could not load pilot terms. Please try again.");
  return { version: value.version, title: value.title, text: value.text, accepted_at: value.accepted_at };
}
export function requiresPilotAcceptance(terms: PilotTerms) { return terms.accepted_at === null; }
export async function signInWithPilotAcceptance<T>(options: {
  acknowledged: boolean;
  version: string;
  signIn: () => Promise<T>;
  accept: (version: string) => Promise<void>;
  signOut: () => Promise<void>;
}): Promise<T> {
  if (!options.acknowledged || !options.version) throw new Error("Please read and accept the pilot terms before signing in.");
  const account = await options.signIn();
  try {
    await options.accept(options.version);
  } catch (error) {
    await options.signOut();
    throw error;
  }
  return account;
}
export function canDownloadAcknowledgments(role: Role) { return role === "admin"; }
export function acknowledgmentCsv(rows: Acknowledgment[]) {
  const cell = (value: unknown) => {
    const text = String(value ?? "");
    return `"${(/^[=+@\-\t\r]/.test(text) ? "'" : "") + text.replace(/"/g, '""')}"`;
  };
  return [["Account ID", "Email", "Society code", "Society", "Terms version", "Accepted at (UTC)", "Terms SHA-256", "Exact accepted terms"],
    ...rows.map(row => [row.user_id, row.email, row.society_code, row.society_name, row.terms_version, row.accepted_at, row.terms_hash, row.terms_text])]
    .map(row => row.map(cell).join(",")).join("\r\n");
}