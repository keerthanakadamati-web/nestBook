import { describe, expect, it } from "vitest";
import { settingsDestination, settingsSections } from "./settings-access";

describe("existing settings access", () => {
  it("keeps owner settings on the owner-scoped profile path", () => {
    expect(settingsDestination("resident")).toBe("/profile");
    expect(settingsSections("resident", true).apartment).toBe(false);
  });
  it("keeps Treasurer settings finance-only", () => {
    expect(settingsSections("treasurer", false)).toEqual({ profile: true, roles: false, acknowledgments: false, recurring: true, apartment: false });
  });
  it("keeps President and Secretary role controls available without primary-society configuration", () => {
    expect(settingsSections("president", false).roles).toBe(true);
    expect(settingsSections("secretary", false).roles).toBe(true);
  });
  it("retains Admin-only acknowledgment access", () => {
    expect(settingsSections("admin", false).acknowledgments).toBe(true);
    expect(settingsSections("president", false).acknowledgments).toBe(false);
  });
});