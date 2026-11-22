import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "../worker/api.js";

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

test("playlist upload requires admin authentication", async () => {
  const response = await handle(new Request("https://app.test/api/sources/upload", { method: "POST" }), env);
  assert.equal(response.status, 401);
});

test("playlist upload stores authorized M3U file in R2 and registers source", async () => {
  let storedKey, storedBody, inserted;
  const db = { prepare: (sql) => ({ bind: (...values) => ({ run: async () => { inserted = { sql, values }; return { meta: { last_row_id: 12 } }; } }) }) };
  const bucket = { put: async (key, body) => { storedKey = key; storedBody = body; } };
  const login = await handle(new Request("https://app.test/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: env.ADMIN_PASSWORD }) }), env);
  const form = new FormData();
  form.set("name", "Lista local");
  form.set("epgUrl", "https://epg.test/guide.xml");
  form.set("file", new File(["#EXTM3U\n#EXTINF:-1,Canal\nhttps://stream.test/live\n"], "canais.m3u", { type: "audio/x-mpegurl" }));
  const response = await handle(new Request("https://app.test/api/sources/upload", { method: "POST", headers: { Cookie: login.headers.get("Set-Cookie").split(";")[0] }, body: form }), { ...env, DB: db, PLAYLISTS: bucket });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { id: 12 });
  assert.match(storedKey, /^playlists\/[0-9a-f-]+$/);
  assert.match(String(storedBody), /^#EXTM3U/);
  assert.match(inserted.sql, /playlist_key/);
  assert.equal(inserted.values[0], "Lista local");
  assert.equal(inserted.values[1], "");
  assert.equal(inserted.values[2], "https://epg.test/guide.xml");
  assert.equal(inserted.values[3], storedKey);
});

test("playlist upload rejects invalid M3U before writing storage", async () => {
  let writes = 0;
  const login = await handle(new Request("https://app.test/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: env.ADMIN_PASSWORD }) }), env);
  const form = new FormData();
  form.set("name", "Arquivo inválido");
  form.set("file", new File(["not a playlist"], "canais.txt"));
  const response = await handle(new Request("https://app.test/api/sources/upload", { method: "POST", headers: { Cookie: login.headers.get("Set-Cookie").split(";")[0] }, body: form }), { ...env, PLAYLISTS: { put: async () => writes++ } });
  assert.equal(response.status, 400);
  assert.equal(writes, 0);
});

test("playlist upload rejects files above 10 MB before writing storage", async () => {
  let writes = 0;
  const login = await handle(new Request("https://app.test/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: env.ADMIN_PASSWORD }) }), env);
  const form = new FormData();
  form.set("name", "Arquivo grande");
  form.set("file", new File([new Uint8Array(10 * 1024 * 1024 + 1)], "canais.m3u"));
  const response = await handle(new Request("https://app.test/api/sources/upload", { method: "POST", headers: { Cookie: login.headers.get("Set-Cookie").split(";")[0] }, body: form }), { ...env, PLAYLISTS: { put: async () => writes++ } });
  assert.equal(response.status, 413);
  assert.equal(writes, 0);
});

test("GitHub sync endpoint streams uploaded playlist only with sync token", async () => {
  const db = { prepare: () => ({ bind: () => ({ first: async () => ({ playlist_key: "playlists/test-key" }) }) }) };
  const authorized = await handle(new Request("https://app.test/api/sync/sources/12/playlist", { headers: { Authorization: `Bearer ${env.SYNC_TOKEN}` } }), { ...env, DB: db, PLAYLISTS: { get: async key => ({ body: key === "playlists/test-key" ? "#EXTM3U\n" : "" }) } });
  assert.equal(authorized.status, 200);
  assert.equal(await authorized.text(), "#EXTM3U\n");
  assert.equal(authorized.headers.get("Cache-Control"), "no-store");
  const denied = await handle(new Request("https://app.test/api/sync/sources/12/playlist"), { ...env, DB: db, PLAYLISTS: { get: async () => { throw new Error("must not read storage"); } } });
  assert.equal(denied.status, 401);
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
