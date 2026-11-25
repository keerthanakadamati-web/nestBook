export const FLAT_COLUMNS = [
  "Flat Number", "Floor", "Owner or Tenant", "Owner Name", "Tenant Name", "Mobile Number",
  "Parking Slot", "Vehicle Type (2/4/Both/None)", "Vehicle Numbers", "House Tax Assessment Number (optional)", "Aadhaar Number", "Owner Login Email (optional)",
] as const;

export type FlatImportRow = {
  flat_number: string; floor: string; occupancy: "owner" | "tenant"; owner_name: string; tenant_name: string;
  mobile: string; parking_slot: string; vehicle_type: string; vehicle_numbers: string; house_tax_number: string; aadhaar_number: string; email: string;
};
export type ParsedRow = { line: number; row: FlatImportRow; errors: string[] };

const s = (v: unknown) => (v == null ? "" : String(v).trim());

function vehicle(v: string) {
  const t = v.toLowerCase().replace(/\s/g, "");
  if (!t || t === "none" || t === "no") return "none";
  if (t === "both" || t === "2&4" || t === "2/4" || t === "2,4") return "both";
  if (t.startsWith("2")) return "2-wheeler";
  if (t.startsWith("4")) return "4-wheeler";
  return "";
}

/** grid[0] is the header row; returns one result per non-empty data row. */
export function parseFlatGrid(grid: unknown[][]): ParsedRow[] {
  const header = (grid[0] ?? []).map((h) => s(h).toLowerCase());
  const col = (name: string) => header.findIndex((h) => h.startsWith(name.toLowerCase()));
  const idx = FLAT_COLUMNS.map((c) => col(c.split(" (")[0] ?? c));
  const seen = new Set<string>();
  const out: ParsedRow[] = [];
  grid.slice(1).forEach((cells, i) => {
    const get = (k: number) => { const c = idx[k] ?? -1; return c < 0 ? "" : s(cells[c]); };
    if (cells.every((c) => s(c) === "")) return;
    const occRaw = get(2).toLowerCase();
    const row: FlatImportRow = {
      flat_number: get(0), floor: get(1), occupancy: occRaw.startsWith("t") ? "tenant" : "owner",
      owner_name: get(3), tenant_name: get(4), mobile: get(5).replace(/\D/g, ""), parking_slot: get(6),
      vehicle_type: vehicle(get(7)), vehicle_numbers: get(8).toUpperCase(), house_tax_number: get(9), aadhaar_number: get(10).replace(/\s|-/g, ""), email: get(11).toLowerCase(),
    };
    const errors: string[] = [];
    if (!row.flat_number) errors.push("Flat number missing");
    else if (seen.has(row.flat_number.toLowerCase())) errors.push("Flat number repeated");
    seen.add(row.flat_number.toLowerCase());
    if (occRaw && !/^(o|t)/.test(occRaw)) errors.push("Write Owner or Tenant");
    if (!row.owner_name) errors.push("Owner name missing");
    if (row.occupancy === "tenant" && !row.tenant_name) errors.push("Tenant name missing");
    if (row.mobile && !/^\d{10}$/.test(row.mobile.slice(-10))) errors.push("Mobile must be 10 digits");
    row.mobile = row.mobile.slice(-10);
    if (!/^\d{12}$/.test(row.aadhaar_number)) errors.push("Aadhaar must be 12 digits");
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push("Login email is not valid");
    if (get(7) && !row.vehicle_type) errors.push("Vehicle type must be 2, 4, Both or None");
    out.push({ line: i + 2, row, errors });
  });
  return out;
}

/** Strong random first-time password, e.g. "Flat101#4821kq". */
export function makeTempPassword(flat: string, rand: () => number = Math.random) {
  const digits = String(Math.floor(1000 + rand() * 9000));
  const letters = "abcdefghjkmnpqrstuvwxyz";
  const a = letters[Math.floor(rand() * letters.length)] ?? "k", b = letters[Math.floor(rand() * letters.length)] ?? "q";
  return `Flat${flat.replace(/[^A-Za-z0-9]/g, "")}#${digits}${a}${b}`;
}
