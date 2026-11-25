import { describe, expect, test } from "bun:test";
import { p256 } from "@noble/curves/nist.js";
import { classifyPushResponse, nextAttemptAt } from "../src/lib/push-rules.ts";
import { deriveVapidKeys, encryptPayload, b64url, fromB64url, vapidAuthorization } from "../src/lib/web-push-crypto.ts";

const enc = new TextEncoder();
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, len * 8));
}

describe("web push", () => {
  test("same seed gives the same key; different seeds differ", async () => {
    const a = await deriveVapidKeys("seed-one"), b = await deriveVapidKeys("seed-one"), c = await deriveVapidKeys("seed-two");
    expect(b64url(a.publicKey)).toBe(b64url(b.publicKey));
    expect(b64url(a.publicKey)).not.toBe(b64url(c.publicKey));
    expect(a.publicKey.length).toBe(65);
  });

  test("a device can decrypt what we encrypt", async () => {
    const devicePriv = p256.utils.randomSecretKey();
    const devicePub = p256.getPublicKey(devicePriv, false);
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const body = await encryptPayload('{"title":"Hi"}', b64url(devicePub), b64url(auth));
    const salt = body.slice(0, 16), asPub = body.slice(21, 86), cipher = body.slice(86);
    const shared = p256.getSharedSecret(devicePriv, asPub).slice(1);
    const ikm = await hkdf(auth, shared, new Uint8Array([...enc.encode("WebPush: info\0"), ...devicePub, ...asPub]), 32);
    const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
    const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
    const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, key, cipher));
    expect(new TextDecoder().decode(plain.slice(0, -1))).toBe('{"title":"Hi"}');
  });

  test("VAPID signature verifies with the public key", async () => {
    const keys = await deriveVapidKeys("seed-one");
    const header = await vapidAuthorization("https://fcm.googleapis.com/x", keys, "mailto:a@b.c");
    const [, jwt] = /t=([^,]+)/.exec(header);
    const [h, c, s] = jwt.split(".");
    expect(JSON.parse(atob(c.replace(/-/g, "+").replace(/_/g, "/"))).aud).toBe("https://fcm.googleapis.com");
    const pub = await crypto.subtle.importKey("raw", keys.publicKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    expect(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, fromB64url(s), enc.encode(`${h}.${c}`))).toBe(true);
  });

  test("dead devices are removed, busy services retried at most 3 times", () => {
    expect(classifyPushResponse(201)).toBe("accepted");
    expect(classifyPushResponse(410)).toBe("expired");
    expect(classifyPushResponse(404)).toBe("expired");
    expect(classifyPushResponse(429)).toBe("retry");
    expect(classifyPushResponse(503)).toBe("retry");
    expect(classifyPushResponse(400)).toBe("failed");
    expect(nextAttemptAt(1, 0)).toBe(new Date(120000).toISOString());
    expect(nextAttemptAt(3, 0)).toBeNull();
  });
});
