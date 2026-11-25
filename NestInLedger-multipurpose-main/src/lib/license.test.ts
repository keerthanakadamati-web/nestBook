import { describe, it, expect } from "vitest";
import { daysLeft, extendBy } from "./license";
describe("license", () => {
  it("renew 1 year extends from current end date", () => { expect(extendBy("2027-11-10", 12, new Date(2026, 10, 10))).toBe("2028-11-10"); });
  it("renew after expiry starts from today", () => { expect(extendBy("2026-01-01", 12, new Date(2026, 10, 10))).toBe("2027-11-10"); });
  it("days left is negative once expired", () => { expect(daysLeft("2026-11-09", new Date(2026, 10, 10))).toBe(-1); });
});
