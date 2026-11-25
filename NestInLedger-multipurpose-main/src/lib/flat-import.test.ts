import { describe, expect, it } from "vitest";
import { FLAT_COLUMNS, parseFlatGrid } from "./flat-import";
const H = [...FLAT_COLUMNS];
describe("flat excel import", () => {
  it("requires a 12-digit Aadhaar", () => {
    const [r] = parseFlatGrid([H, ["101", "1", "Owner", "Ravi", "", "9876543210", "", "", "", "", "1234"]]);
    expect(r?.errors).toContain("Aadhaar must be 12 digits");
  });
  it("requires tenant name for tenant flats and maps vehicle 2/4", () => {
    const [r] = parseFlatGrid([H, ["102", "1", "Tenant", "Ravi", "", "9876543210", "P1", "4", "ts09ab1234", "", "123412341234"]]);
    expect(r?.errors).toEqual(["Tenant name missing"]);
    expect(r?.row.vehicle_type).toBe("4-wheeler");
  });
  it("allows empty house tax number", () => {
    const [r] = parseFlatGrid([H, ["103", "1", "Owner", "Ravi", "", "", "", "None", "", "", "123412341234"]]);
    expect(r?.errors).toEqual([]);
  });
});

import { makeTempPassword as mtp, parseFlatGrid as pfg, FLAT_COLUMNS as FC } from "./flat-import";
describe("owner login email column", () => {
  it("rejects an invalid email and keeps a valid one lowercased", () => {
    const base = ["101", "1", "Owner", "Ram", "", "9876543210", "", "", "", "", "123412341234"];
    const rows = pfg([[...FC], [...base, "Ram@Mail.com"], ["102", ...base.slice(1), "bad-email"]]);
    expect(rows[0]?.row.email).toBe("ram@mail.com");
    expect(rows[0]?.errors).toEqual([]);
    expect(rows[1]?.errors).toContain("Login email is not valid");
  });
  it("makes a password with flat number, symbol and digits", () => {
    expect(mtp("A-101", () => 0)).toBe("FlatA101#1000aa");
  });
});
