import { describe, expect, it } from "vitest";
import { maskAadhaar, validateRegistration, type Registration } from "./flat-registration";
const base: Registration = { flat_number: "101", floor: "1", owner_name: "Ravi", mobile: "9876543210", owner_email: "owner@example.com", occupancy: "owner", tenant_name: "", tenant_phone: "", parking_slot: "", vehicle_type: "", vehicle_numbers: "", house_tax_number: "", aadhaar_number: "123412341234" };
describe("flat registration", () => {
  it("accepts a complete owner entry", () => expect(validateRegistration(base)).toBeNull());
  it("requires a 12-digit Aadhaar", () => expect(validateRegistration({ ...base, aadhaar_number: "12345" })).toMatch(/12 digits/));
  it("house tax number is optional", () => expect(validateRegistration({ ...base, house_tax_number: "" })).toBeNull());
  it("rented flats need a tenant name", () => expect(validateRegistration({ ...base, occupancy: "rented" })).toMatch(/tenant name/));
  it("masks all but last 4 Aadhaar digits", () => expect(maskAadhaar("123412345678")).toBe("XXXX XXXX 5678"));
});

import { validateRegistration as vr } from "./flat-registration";
describe("owner email", () => {
  it("is required for the login", () => {
    expect(vr({ flat_number: "101", floor: "", owner_name: "A", mobile: "9876543210", owner_email: "bad", occupancy: "owner", tenant_name: "", tenant_phone: "", parking_slot: "", vehicle_type: "none", vehicle_numbers: "", house_tax_number: "", aadhaar_number: "123456789012" })).toBe("Please enter a valid email address.");
  });
});
