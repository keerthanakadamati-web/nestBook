import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mkdir, writeFile, rm } from "node:fs/promises";

const url = process.env["SUPABASE_URL"];
const secret = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const publishable = process.env["SUPABASE_PUBLISHABLE_KEY"];
describe.skipIf(!url || !secret || !publishable)("legal vault permissions and apartment isolation", () => {
  let admin: SupabaseClient;
  const users: { id: string; role: string; client: SupabaseClient }[] = [];
  const societies: string[] = [];
  let path = "";
  let documentId = "";
  const fixtureDir = `/tmp/browser/legal-vault-${crypto.randomUUID()}`;
  function clientFor(role: string) {
    const found = users.find(user => user.role === role);
    if (!found) throw new Error("Missing test account");
    return found.client;
  }
  beforeAll(async () => {
    if (!url || !secret || !publishable) throw new Error("Missing test configuration");
    admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    await mkdir(fixtureDir, { recursive: true });
    const sessions: Record<string, unknown> = {};
    for (let index = 0; index < 2; index++) {
      const id = crypto.randomUUID();
      const result = await admin.from("societies").insert({ id, code: `vault-test-${id}`, slug: `vault-${id.slice(0, 20)}`, name: "Legal vault verification", total_flats: 1 });
      if (result.error) throw new Error("Could not create test apartment");
      societies.push(id);
    }
    for (const role of ["president", "secretary", "treasurer", "admin", "resident", "other-president"]) {
      const email = `vault-${crypto.randomUUID()}@example.com`;
      const password = `V!${crypto.randomUUID()}a9`;
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error || !created.data.user) throw new Error("Could not create test account");
      const id = created.data.user.id;
      const client = createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });
      users.push({ id, role, client });
      const actualRole = role === "other-president" ? "president" : role;
      const assigned = await admin.from("user_roles").insert({ user_id: id, role: actualRole });
      if (assigned.error) throw new Error("Could not assign test role");
      if (["president", "secretary", "treasurer", "other-president"].includes(role)) {
        const member = await admin.from("society_committee").insert({ user_id: id, society_id: societies[role === "other-president" ? 1 : 0], role: actualRole, email });
        if (member.error) throw new Error("Could not assign apartment membership");
      }
      const login = await client.auth.signInWithPassword({ email, password });
      if (login.error || !login.data.session) throw new Error("Test sign in failed");
      sessions[role] = login.data.session;
    }
    const president = users.find(user => user.role === "president");
    const society = societies[0];
    if (!president || !society) throw new Error("Missing test President");
    path = `${society}/${president.id}/${crypto.randomUUID()}.png`;
    // Minimal real PNG; browser verification uploads another copy through the form.
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jFo0AAAAASUVORK5CYII=", "base64");
    await writeFile(`${fixtureDir}/legal-sample.png`, png);
    const upload = await president.client.storage.from("legal-documents").upload(path, png, { contentType: "image/png" });
    if (upload.error) throw new Error("President upload failed");
    const saved = await president.client.rpc("register_legal_document", { _title: "Vault permission test", _path: path, _name: "legal-sample.png" });
    if (saved.error || !saved.data) throw new Error("President document registration failed");
    documentId = saved.data as string;
    await writeFile(`${fixtureDir}/sessions.json`, JSON.stringify({ sessions, storageKey: `sb-${new URL(url).hostname.split(".")[0]}-auth-token` }), { mode: 0o600 });
  }, 120000);
  afterAll(async () => {
    if (!admin) return;
    for (const society of societies) {
      const docs = await admin.from("legal_documents").select("file_path").eq("society_id", society);
      await admin.from("legal_documents").delete().eq("society_id", society);
      const paths = (docs.data ?? []).map(row => row["file_path"] as string);
      if (paths.length) await admin.storage.from("legal-documents").remove(paths);
    }
    for (const user of users) {
      await admin.from("society_committee").delete().eq("user_id", user.id);
      const removed = await admin.auth.admin.deleteUser(user.id);
      if (removed.error) throw new Error("Could not clean up test account");
    }
    for (const society of societies) {
      const removed = await admin.from("societies").delete().eq("id", society);
      if (removed.error) throw new Error("Could not clean up test apartment");
    }
    await rm(fixtureDir, { recursive: true, force: true });
  }, 120000);
  test("President uploads and can read saved legal files", async () => {
    expect((await clientFor("president").from("legal_documents").select("id").eq("id", documentId)).data?.length).toBe(1);
    expect((await clientFor("president").storage.from("legal-documents").download(path)).error).toBeNull();
  });
  for (const role of ["secretary", "treasurer"]) test(`${role} views but cannot upload legal documents`, async () => {
    const client = clientFor(role);
    const society = societies[0];
    if (!society) throw new Error("Missing society");
    expect((await client.from("legal_documents").select("id").eq("id", documentId)).data?.length).toBe(1);
    expect((await client.storage.from("legal-documents").download(path)).error).toBeNull();
    expect((await client.rpc("can_access_legal_documents", { _society: society, _write: true })).data).toBe(false);
    expect((await client.rpc("register_legal_document", { _title: "Not allowed", _path: path, _name: "x.png" })).error).not.toBeNull();
    expect((await client.storage.from("legal-documents").upload(`${society}/${users.find(u => u.role === role)?.id}/forbidden.png`, new Blob(["x"], { type: "image/png" }))).error).not.toBeNull();
  });
  for (const role of ["admin", "resident", "other-president"]) test(`${role} cannot read this apartment's legal files`, async () => {
    const client = clientFor(role);
    expect((await client.from("legal_documents").select("id").eq("id", documentId)).data?.length).toBe(0);
    expect((await client.storage.from("legal-documents").download(path)).error).not.toBeNull();
    expect((await client.storage.from("legal-documents").createSignedUrl(path, 60)).error).not.toBeNull();
  });
  test("direct metadata writes and anonymous file access are denied", async () => {
    const updated = await clientFor("president").from("legal_documents").update({ title: "tampered" }).eq("id", documentId).select("id");
    expect(updated.error !== null || updated.data?.length === 0).toBe(true);
    expect((await clientFor("president").from("legal_documents").select("title").eq("id", documentId).single()).data?.["title"]).toBe("Vault permission test");
    if (!url || !publishable) throw new Error("Missing configuration");
    const anon = createClient(url, publishable, { auth: { persistSession: false } });
    expect((await anon.storage.from("legal-documents").download(path)).error).not.toBeNull();
    expect((await anon.from("legal_documents").select("id")).error).not.toBeNull();
  });
  test("President cannot upload into another apartment's folder", async () => {
    const president = users.find(user => user.role === "president");
    const other = societies[1];
    if (!president || !other) throw new Error("Missing test apartments");
    const uploaded = await president.client.storage.from("legal-documents").upload(`${other}/${president.id}/forbidden.png`, new Blob(["x"], { type: "image/png" }));
    expect(uploaded.error).not.toBeNull();
  });
  test("signed-in Documents upload, preview and download", async () => {
    const browserScript = process.env["LEGAL_VAULT_BROWSER_CHECK"];
    if (!browserScript) return;
    const child = Bun.spawn(["python3", browserScript, fixtureDir], { stdout: "inherit", stderr: "inherit" });
    expect(await child.exited).toBe(0);
  }, 120000);
});