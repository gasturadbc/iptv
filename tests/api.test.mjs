import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../functions/_lib/api.js";

const env = {
  ADMIN_PASSWORD: "test-password",
  SESSION_SECRET: "test-session-secret-long-enough-for-local-test",
  SYNC_TOKEN: "test-sync-token",
  DB: { prepare: () => ({ all: async () => ({ results: [] }) }) },
};

test("admin login sets an HttpOnly secure session cookie", async () => {
  const response = await handle(new Request("https://app.test/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: env.ADMIN_PASSWORD }),
  }), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Set-Cookie"), /HttpOnly; Secure; SameSite=Strict/);
});

test("admin routes reject requests without a valid session", async () => {
  const response = await handle(new Request("https://app.test/api/dashboard"), env);
  assert.equal(response.status, 401);
});

test("public playlist route returns an M3U response", async () => {
  const response = await handle(new Request("https://app.test/playlist.m3u"), env);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Content-Type"), /audio\/x-mpegurl/);
  assert.match(await response.text(), /^#EXTM3U/);
});

test("public playlist removes duplicate stream URLs", async () => {
  const db = { prepare: (sql) => ({ all: async () => ({ results: sql.startsWith("SELECT channels.name") ? [
    { name: "Canal A", url: "https://stream.test/live", category: "Geral", tvg_id: "a", epg_url: "https://epg.test/guide.xml" },
    { name: "Canal duplicado", url: "https://stream.test/live", category: "Geral", epg_url: "https://epg.test/guide.xml" },
  ] : [] }) }) };
  const response = await handle(new Request("https://app.test/playlist.m3u"), { ...env, DB: db });
  const text = await response.text();
  assert.match(text, /url-tvg="https:\/\/epg\.test\/guide\.xml"/);
  assert.equal((text.match(/https:\/\/stream\.test\/live/g) || []).length, 1);
});
