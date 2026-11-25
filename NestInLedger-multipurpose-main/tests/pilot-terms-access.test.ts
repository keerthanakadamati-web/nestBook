import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdir, rm, writeFile } from "node:fs/promises";

const url = process.env["SUPABASE_URL"];
const secret = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
describe.skipIf(!url || !secret || !key)("pilot acceptance access", () => {
  let admin: SupabaseClient;
  const users: { id: string; role: string; client: SupabaseClient }[] = [];
  const fixture = `/tmp/browser/pilot-terms/session-${crypto.randomUUID()}.json`;
  function clientFor(role: string) {
    const user = users.find(user => user.role === role);
    if (!user) throw new Error("Missing test user");
    return user.client;
  }
  beforeAll(async () => {
    if (!url || !secret || !key) throw new Error("Missing test configuration");
    admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    await mkdir("/tmp/browser/pilot-terms", { recursive: true });
    for (const role of ["admin", "president", "secretary", "treasurer", "resident"]) {
      const email = `pilot-${crypto.randomUUID()}@example.com`;
      const password = `T!${crypto.randomUUID()}9x`;
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error || !created.data.user) throw new Error("Test user creation failed");
      const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      users.push({ id: created.data.user.id, role, client });
      const assigned = await admin.from("user_roles").insert({ user_id: created.data.user.id, role });
      if (assigned.error) throw new Error("Test role assignment failed");
      const signed = await client.auth.signInWithPassword({ email, password });
      if (signed.error || !signed.data.session) throw new Error("Test sign in failed");
      if (role === "admin") await writeFile(fixture, JSON.stringify({ email, password, session: signed.data.session, storageKey: `sb-${new URL(url).hostname.split(".")[0]}-auth-token` }), { mode: 0o600 });
    }
  }, 120000);
  afterAll(async () => {
    if (!admin) return;
    for (const user of users) {
      await admin.from("user_terms_acceptance").delete().eq("user_id", user.id);
      const removed = await admin.auth.admin.deleteUser(user.id);
      if (removed.error) throw new Error("Test user cleanup failed");
    }
    await rm(fixture, { force: true });
  }, 120000);
  test("visitors can read terms but cannot read or accept private acknowledgments", async () => {
    if (!url || !key) throw new Error("Missing configuration");
    const anon = createClient(url, key, { auth: { persistSession: false } });
    const document = await anon.rpc("pilot_terms_document");
    expect(document.error).toBeNull();
    expect(document.data.version).toBe("v1.0-pilot");
    expect(document.data.accepted_at).toBeUndefined();
    expect((await anon.rpc("pilot_terms_status")).error).not.toBeNull();
    expect((await anon.rpc("accept_pilot_terms", { _version: "v1.0-pilot", _acknowledged: true })).error).not.toBeNull();
  });
  test("first sign-in has no acceptance and false checkbox or stale version is rejected", async () => {
    const client = clientFor("resident");
    expect((await client.rpc("pilot_terms_status")).data?.accepted_at).toBeNull();
    expect((await client.rpc("accept_pilot_terms", { _version: "v1.0-pilot", _acknowledged: false })).error).not.toBeNull();
    expect((await client.rpc("accept_pilot_terms", { _version: "old-version", _acknowledged: true })).error).not.toBeNull();
  });
  test("acceptance stores exact terms and server time and repeat requests preserve the time", async () => {
    const client = clientFor("resident");
    const before = Date.now();
    const first = await client.rpc("accept_pilot_terms", { _version: "v1.0-pilot", _acknowledged: true });
    expect(first.error).toBeNull();
    expect(Date.parse(first.data)).toBeGreaterThanOrEqual(before - 5000);
    const repeated = await client.rpc("accept_pilot_terms", { _version: "v1.0-pilot", _acknowledged: true });
    expect(repeated.data).toBe(first.data);
    const status = await client.rpc("pilot_terms_status");
    expect(status.data?.accepted_at).toBe(first.data);
    const own = await client.from("user_terms_acceptance").select("terms_text,terms_version,terms_hash").single();
    expect(own.data?.terms_text).toBe(status.data?.text);
    expect(own.data?.terms_version).toBe("v1.0-pilot");
    expect(own.data?.terms_hash).toHaveLength(64);
  });
  test("users cannot edit their saved acknowledgment or supply a forged timestamp", async () => {
    const client = clientFor("resident");
    expect((await client.from("user_terms_acceptance").update({ accepted_at: "2000-01-01T00:00:00Z" }).eq("terms_version", "v1.0-pilot")).error).not.toBeNull();
    expect((await client.from("user_terms_acceptance").delete().eq("terms_version", "v1.0-pilot")).error).not.toBeNull();
    expect((await client.from("user_terms_acceptance").insert({ user_id: crypto.randomUUID(), terms_version: "forged", terms_text: "x", terms_hash: "x", email: "x" })).error).not.toBeNull();
  });
  for (const role of ["president", "secretary", "treasurer", "resident"]) test(`${role} cannot export acknowledgments`, async () => {
    const client = clientFor(role);
    expect((await client.rpc("export_pilot_acknowledgments")).error).not.toBeNull();
    if (role !== "resident") expect((await client.from("user_terms_acceptance").select("user_id")).data).toEqual([]);
  });
  test("Admin can export the acknowledgment register", async () => {
    const result = await clientFor("admin").rpc("export_pilot_acknowledgments");
    expect(result.error).toBeNull();
    const resident = users.find(user => user.role === "resident");
    expect(result.data.some((row: { user_id: string }) => row.user_id === resident?.id)).toBe(true);
  });
  test("optional browser login check records acceptance", async () => {
    const script = process.env["PILOT_BROWSER_CHECK"];
    if (!script) return;
    const child = Bun.spawn(["python3", script, fixture], { stdout: "inherit", stderr: "inherit" });
    expect(await child.exited).toBe(0);
    const status = await clientFor("admin").rpc("pilot_terms_status");
    expect(status.error).toBeNull();
    expect(status.data.accepted_at).not.toBeNull();
  }, 120000);
});