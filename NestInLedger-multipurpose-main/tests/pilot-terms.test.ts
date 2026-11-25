import { describe, expect, test } from "bun:test";
import { canDownloadAcknowledgments, requiresPilotAcceptance, signInWithPilotAcceptance } from "../src/lib/pilot-terms";
describe("pilot acknowledgment rules", () => {
  test("terms must be accepted before credentials are submitted", async () => {
    const calls: string[] = [];
    await expect(signInWithPilotAcceptance({ acknowledged: false, version: "v1.0-pilot",
      signIn: async () => { calls.push("login"); return "user"; },
      accept: async () => { calls.push("accept"); }, signOut: async () => {} })).rejects.toThrow("before signing in");
    expect(calls).toEqual([]);
  });
  test("pre-login consent is recorded only after account verification", async () => {
    const calls: string[] = [];
    const user = await signInWithPilotAcceptance({ acknowledged: true, version: "v1.0-pilot",
      signIn: async () => { calls.push("login"); return "verified-user"; },
      accept: async version => { calls.push(version); }, signOut: async () => {} });
    expect(calls).toEqual(["login", "v1.0-pilot"]);
    expect(user).toBe("verified-user");
  });
  test("failed acceptance closes the session instead of admitting the user", async () => {
    let signedOut = false;
    await expect(signInWithPilotAcceptance({ acknowledged: true, version: "v1.0-pilot",
      signIn: async () => "user", accept: async () => { throw new Error("Terms changed"); },
      signOut: async () => { signedOut = true; } })).rejects.toThrow("Terms changed");
    expect(signedOut).toBe(true);
  });
  test("first sign-in requires acceptance", () => {
    expect(requiresPilotAcceptance({ version: "v1.0-pilot", title: "Pilot", text: "Terms", accepted_at: null })).toBe(true);
  });
  test("recorded acceptance does not block subsequent sign-ins", () => {
    expect(requiresPilotAcceptance({ version: "v1.0-pilot", title: "Pilot", text: "Terms", accepted_at: "2026-11-24T07:22:00Z" })).toBe(false);
  });
  test("only Admin can download the acknowledgment register", () => {
    expect(canDownloadAcknowledgments("admin")).toBe(true);
    for (const role of ["president", "secretary", "treasurer", "resident", null] as const) expect(canDownloadAcknowledgments(role)).toBe(false);
  });
});