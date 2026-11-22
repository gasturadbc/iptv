const encoder = new TextEncoder();
const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });

async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return btoa(String.fromCharCode(...new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function cookie(request) { return request.headers.get("Cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("iptv_session="))?.slice(13); }
async function admin(request, env) {
  const token = cookie(request);
  if (!token || !env.SESSION_SECRET) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || await sign(payload, env.SESSION_SECRET) !== signature) return false;
  try { return JSON.parse(atob(payload.replaceAll("-", "+").replaceAll("_", "/"))).exp > Date.now(); } catch { return false; }
}
const sync = (request, env) => env.SYNC_TOKEN && request.headers.get("Authorization") === `Bearer ${env.SYNC_TOKEN}`;
const validUrl = (value) => { try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; } };

export async function handle(request, env) {
  const url = new URL(request.url), path = url.pathname.replace(/\/$/, ""), method = request.method;
  if (["/api/auth/session", "/api/session"].includes(path) && method === "GET") return await admin(request, env) ? json({ authenticated: true }) : json({ error: "Não autenticado." }, 401);
  if (["/api/auth/login", "/api/login"].includes(path) && method === "POST") {
    const { password } = await request.json().catch(() => ({}));
    if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET || typeof password !== "string" || password.length > 256 || password !== env.ADMIN_PASSWORD) return json({ error: "Credenciais inválidas." }, 401);
    const payload = btoa(JSON.stringify({ exp: Date.now() + 28800000 })).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    const value = `${payload}.${await sign(payload, env.SESSION_SECRET)}`;
    return json({ authenticated: true }, 200, { "Set-Cookie": `iptv_session=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800` });
  }
  if (["/api/auth/logout", "/api/logout"].includes(path) && method === "POST") return json({ authenticated: false }, 200, { "Set-Cookie": "iptv_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0" });
  if (["/api/playlist.m3u", "/playlist.m3u"].includes(path)) {
    const { results } = await env.DB.prepare("SELECT channels.name,channels.url,channels.logo,channels.category,channels.tvg_id,sources.epg_url FROM channels JOIN sources ON sources.id=channels.source_id WHERE channels.status='online' ORDER BY channels.category,channels.name").all();
    const config = await readSettings(env);
    const epg = results.find((c) => c.epg_url)?.epg_url || config.epgUrl;
    const unique = new Set();
    const channels = results.filter((c) => !unique.has(c.url) && unique.add(c.url));
    const playlistHeader = [epg && `url-tvg="${epg.replaceAll('"', "&quot;")}"`, `x-tvg-name="${config.playlistName.replaceAll('"', "&quot;")}"`].filter(Boolean).join(" ");
    const body = [`#EXTM3U ${playlistHeader}`, ...channels.flatMap((c) => [`#EXTINF:-1 tvg-id="${String(c.tvg_id || "").replaceAll('"', "&quot;")}" tvg-logo="${String(c.logo || "").replaceAll('"', "&quot;")}" group-title="${String(c.category || "Geral").replaceAll('"', "&quot;")}",${c.name.replace(/[\r\n]/g, " ")}`, c.url])].join("\n");
    return new Response(body, { headers: { "Content-Type": "audio/x-mpegurl; charset=utf-8", "Cache-Control": "public, max-age=300" } });
  }
  if (path === "/api/sync/sources" && method === "GET") {
    if (!sync(request, env)) return json({ error: "Não autorizado." }, 401);
    await env.DB.prepare("DELETE FROM channel_staging WHERE created_at < datetime('now','-1 day')").run();
    const { results } = await env.DB.prepare("SELECT id,name,url,epg_url,consecutive_failures,playlist_key FROM sources WHERE enabled=1 AND consecutive_failures<2").all();
    return json({ sources: results.map(({ playlist_key, ...source }) => ({ ...source, type: playlist_key ? "file" : "url" })) });
  }
  const uploadedPlaylist = path.match(/^\/api\/sync\/sources\/(\d+)\/playlist$/);
  if (uploadedPlaylist && method === "GET") {
    if (!sync(request, env)) return json({ error: "Nao autorizado." }, 401);
    const source = await env.DB.prepare("SELECT playlist_key FROM sources WHERE id=? AND enabled=1 AND consecutive_failures<2").bind(uploadedPlaylist[1]).first();
    if (!source?.playlist_key) return json({ error: "Playlist enviada nao encontrada." }, 404);
    const object = await env.PLAYLISTS.get(source.playlist_key);
    if (!object) return json({ error: "Arquivo da playlist nao encontrado." }, 404);
    return new Response(object.body, { headers: { "Content-Type": "audio/x-mpegurl; charset=utf-8", "Cache-Control": "no-store" } });
  }
  if (path === "/api/sync/results" && method === "POST") {
    if (!sync(request, env)) return json({ error: "Não autorizado." }, 401);
    const data = await request.json().catch(() => null);
    if (!data || !Array.isArray(data.sources) || data.sources.length > 100) return json({ error: "Payload inválido." }, 400);
    let successful = 0, checkedCount = 0, onlineCount = 0;
    for (const item of data.sources) {
      const source = await env.DB.prepare("SELECT id,consecutive_failures FROM sources WHERE id=? AND enabled=1").bind(item.id).first();
      if (!source) continue;
      const ok = item.ok === true && Array.isArray(item.channels) && item.channels.length <= 10000;
      const failures = ok ? 0 : source.consecutive_failures + 1;
      if (ok) {
        checkedCount += item.channels.length;
        onlineCount += item.channels.filter((c) => c.online === true).length;
        const seen = new Set();
        const key = crypto.randomUUID();
        let pending = [];
        for (const c of item.channels) {
          if (!c.name || !validUrl(c.url) || seen.has(c.url)) continue;
          seen.add(c.url);
          pending.push(env.DB.prepare("INSERT INTO channel_staging(run_key,source_id,name,url,logo,category,tvg_id,status) VALUES(?,?,?,?,?,?,?,?)").bind(key, item.id, String(c.name).slice(0, 255), c.url, c.logo || null, String(c.category || "Geral").slice(0, 120), c.tvg_id || null, c.online ? "online" : "offline"));
          if (pending.length === 80) { await env.DB.batch(pending); pending = []; }
        }
        if (pending.length) await env.DB.batch(pending);
        const finalStatements = [
          env.DB.prepare("INSERT INTO removed_channels(source_name,channel_name,channel_url) SELECT sources.name,channels.name,channels.url FROM channels JOIN sources ON sources.id=channels.source_id WHERE channels.source_id=? AND NOT EXISTS(SELECT 1 FROM channel_staging WHERE run_key=? AND url=channels.url)").bind(item.id, key),
          env.DB.prepare("DELETE FROM channels WHERE source_id=?").bind(item.id),
          env.DB.prepare("INSERT INTO channels(source_id,name,url,logo,category,tvg_id,status,last_checked_at) SELECT source_id,name,url,logo,category,tvg_id,status,datetime('now') FROM channel_staging WHERE run_key=?").bind(key),
          env.DB.prepare("DELETE FROM channel_staging WHERE run_key=?").bind(key),
          env.DB.prepare("UPDATE sources SET consecutive_failures=0,last_checked_at=datetime('now'),last_success_at=datetime('now') WHERE id=?").bind(item.id),
          env.DB.prepare("INSERT INTO checks(source_id,status,channel_count) VALUES(?,'success',?)").bind(item.id, seen.size),
        ];
        await env.DB.batch(finalStatements);
        successful += 1;
      } else {
        const failed = [env.DB.prepare("UPDATE sources SET consecutive_failures=?,last_checked_at=datetime('now'),enabled=CASE WHEN ?>=2 THEN 0 ELSE enabled END WHERE id=?").bind(failures, failures, item.id), env.DB.prepare("INSERT INTO checks(source_id,status,error) VALUES(?,'failure',?)").bind(item.id, String(item.error || "Falha na validação").slice(0, 500))];
        if (failures >= 2) {
          failed.push(env.DB.prepare("INSERT INTO removed_channels(source_name,channel_name,channel_url) SELECT sources.name,channels.name,channels.url FROM channels JOIN sources ON sources.id=channels.source_id WHERE channels.source_id=?").bind(item.id), env.DB.prepare("DELETE FROM channels WHERE source_id=?").bind(item.id));
        }
        await env.DB.batch(failed);
      }
    }
    const failedCount = checkedCount - onlineCount + (data.sources.length - successful);
    const runStatus = successful === data.sources.length && data.sources.length ? "success" : successful === 0 && data.sources.length ? "failure" : "partial";
    await env.DB.batch([env.DB.prepare("INSERT INTO runs(source_count,successful_count,channel_count,online_count,failed_count,status,completed_at) VALUES(?,?,?,?,?,?,datetime('now'))").bind(data.sources.length, successful, checkedCount, onlineCount, failedCount, runStatus), env.DB.prepare("INSERT INTO availability_snapshots(online,total) SELECT COUNT(DISTINCT CASE WHEN status='online' THEN url END),COUNT(DISTINCT url) FROM channels")]);
    return json({ updated: data.sources.length });
  }

  if (!await admin(request, env)) return json({ error: "Não autenticado." }, 401);
  if (path === "/api/dashboard" && method === "GET") {
    const counts = await env.DB.prepare("SELECT COUNT(DISTINCT url) total,COUNT(DISTINCT CASE WHEN status='online' THEN url END) online,COUNT(DISTINCT CASE WHEN status='offline' AND NOT EXISTS(SELECT 1 FROM channels c2 WHERE c2.url=channels.url AND c2.status='online') THEN url END) offline FROM channels").first();
    const pending = await env.DB.prepare("SELECT COUNT(*) total FROM sources WHERE enabled=1 AND last_success_at IS NULL").first();
    const last = await env.DB.prepare("SELECT completed_at FROM runs ORDER BY id DESC LIMIT 1").first();
    const { results: categories } = await env.DB.prepare("SELECT category name,COUNT(DISTINCT url) count FROM channels GROUP BY category ORDER BY count DESC").all();
    const { results: snapshots } = await env.DB.prepare("SELECT online,total,captured_at FROM availability_snapshots ORDER BY id DESC LIMIT 14").all();
    const { results: checks } = await env.DB.prepare("SELECT checks.id,sources.name,sources.name source_name,checks.status,checks.checked_at checkedAt FROM checks JOIN sources ON sources.id=checks.source_id ORDER BY checks.id DESC LIMIT 8").all();
    const availabilityHistory = snapshots.reverse().map((row) => ({ label: row.captured_at.slice(5, 16), availability: row.total ? Math.round(row.online * 100 / row.total) : 0 }));
    const stats = { total: counts.total, totalChannels: counts.total, online: counts.online, offline: counts.offline, pending: pending.total, categories: categories.length, availability: counts.total ? Math.round(counts.online * 100 / counts.total) : 0 };
    return json({ ...stats, stats, lastUpdate: last?.completed_at || null, lastUpdated: last?.completed_at || null, categories, availabilityHistory, recentChecks: checks.map((row) => ({ ...row, status: row.status === "success" ? "online" : "offline" })) });
  }
  if (path === "/api/sources" && method === "GET") {
    const { results } = await env.DB.prepare("SELECT s.*,COUNT(c.id) channel_count FROM sources s LEFT JOIN channels c ON c.source_id=s.id GROUP BY s.id ORDER BY s.created_at DESC").all();
    return json({ sources: results.map(sourceView), settings: await readSettings(env) });
  }
  if (path === "/api/sources" && method === "POST") {
    const b = await request.json().catch(() => ({}));
    const epg = b.epgUrl || b.epg_url;
    if (!b.name || !validUrl(b.url) || (epg && !validUrl(epg))) return json({ error: "Informe nome e URL HTTP(S) valida." }, 400);
    const result = await env.DB.prepare("INSERT INTO sources(name,url,epg_url) VALUES(?,?,?)").bind(String(b.name).slice(0, 120), b.url, epg || null).run();
    return json({ id: result.meta.last_row_id }, 201);
  }
  if (path === "/api/sources/upload" && method === "POST") {
    if (!env.PLAYLISTS) return json({ error: "Armazenamento de arquivos nao configurado no Worker." }, 503);
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    const name = form?.get("name");
    const epg = form?.get("epgUrl") || null;
    if (typeof name !== "string" || !name.trim() || name.length > 120 || !(file instanceof File)) return json({ error: "Informe nome e arquivo M3U/M3U8 valido." }, 400);
    if (!/\.(m3u8?)$/i.test(file.name)) return json({ error: "Use arquivo com extensao .m3u ou .m3u8." }, 400);
    if (file.size > 10 * 1024 * 1024) return json({ error: "O arquivo excede o limite de 10 MB." }, 413);
    if (epg && !validUrl(epg)) return json({ error: "URL EPG precisa usar HTTP(S)." }, 400);
    let content;
    try { content = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }
    catch { return json({ error: "O arquivo precisa usar codificacao UTF-8." }, 400); }
    if (!content.trimStart().startsWith("#EXTM3U") || !/^https?:\/\/\S+$/m.test(content)) return json({ error: "Playlist invalida: precisa de cabecalho #EXTM3U e ao menos uma URL HTTP(S)." }, 400);
    const key = `playlists/${crypto.randomUUID()}`;
    await env.PLAYLISTS.put(key, content, { httpMetadata: { contentType: "audio/x-mpegurl; charset=utf-8" } });
    try {
      const result = await env.DB.prepare("INSERT INTO sources(name,url,epg_url,playlist_key) VALUES(?,?,?,?)").bind(name.trim().slice(0, 120), "", epg, key).run();
      return json({ id: result.meta.last_row_id }, 201);
    } catch (error) {
      await env.PLAYLISTS.delete(key);
      throw error;
    }
  }
  const match = path.match(/^\/api\/sources\/(\d+)$/);
  if (match && method === "PUT") {
    const b = await request.json().catch(() => ({}));
    const epg = b.epgUrl || b.epg_url;
    const current = await env.DB.prepare("SELECT playlist_key FROM sources WHERE id=?").bind(match[1]).first();
    if (!b.name || (!current?.playlist_key && !validUrl(b.url)) || (epg && !validUrl(epg))) return json({ error: "Informe nome e URL HTTP(S) válida." }, 400);
    await env.DB.prepare("UPDATE sources SET name=?,url=?,epg_url=?,enabled=?,consecutive_failures=0 WHERE id=?").bind(String(b.name).slice(0, 120), current?.playlist_key ? "" : b.url, epg || null, b.enabled === false ? 0 : 1, match[1]).run();
    return json({ updated: true });
  }
  if (match && method === "DELETE") {
    const source = await env.DB.prepare("SELECT playlist_key FROM sources WHERE id=?").bind(match[1]).first();
    await env.DB.batch([env.DB.prepare("INSERT INTO removed_channels(source_name,channel_name,channel_url) SELECT sources.name,channels.name,channels.url FROM channels JOIN sources ON sources.id=channels.source_id WHERE sources.id=?").bind(match[1]), env.DB.prepare("DELETE FROM sources WHERE id=?").bind(match[1])]);
    if (source?.playlist_key) await env.PLAYLISTS?.delete(source.playlist_key);
    return json({ deleted: true });
  }
  if (path === "/api/channels" && method === "GET") {
    const q = `%${(url.searchParams.get("q") || "").slice(0, 100)}%`, status = url.searchParams.get("status") || "", category = url.searchParams.get("category") || "";
    const source = url.searchParams.get("source") || "";
    const { results } = await env.DB.prepare("SELECT c.*,s.name source_name FROM channels c JOIN sources s ON s.id=c.source_id WHERE c.name LIKE ? AND (?='' OR c.status=?) AND (?='' OR c.category=?) AND (?='' OR c.source_id=?) AND (?<>'' OR c.id=(SELECT c2.id FROM channels c2 WHERE c2.url=c.url ORDER BY (c2.status='online') DESC,c2.id LIMIT 1)) ORDER BY c.category,c.name LIMIT 500").bind(q, status, status, category, category, source, source, source).all();
    const { results: categories } = await env.DB.prepare("SELECT DISTINCT category name FROM channels ORDER BY category").all();
    const { results: sources } = await env.DB.prepare("SELECT id,name FROM sources ORDER BY name").all();
    return json({ channels: results.map((c) => ({ ...c, sourceName: c.source_name, checkedAt: c.last_checked_at })), categories: categories.map((c) => c.name), filters: { sources }, total: results.length, pagination: { total: results.length } });
  }
  if (path === "/api/history" && method === "GET") {
    const { results: runs } = await env.DB.prepare("SELECT *,completed_at startedAt,completed_at createdAt,channel_count checkedCount,online_count onlineCount,failed_count failedCount FROM runs ORDER BY id DESC LIMIT 30").all();
    const { results: checks } = await env.DB.prepare("SELECT checks.*,sources.name source_name FROM checks JOIN sources ON sources.id=checks.source_id ORDER BY checks.id DESC LIMIT 100").all();
    const failed = await env.DB.prepare("SELECT COALESCE(SUM(failed_count),0) total FROM runs").first();
    const { results: removed } = await env.DB.prepare("SELECT * FROM removed_channels ORDER BY id DESC LIMIT 100").all();
    const removedCount = await env.DB.prepare("SELECT COUNT(*) total FROM removed_channels").first();
    return json({ runs, checks, removed, summary: { totalChecks: runs.length, failures: failed.total, removedChannels: removedCount.total } });
  }
  if (path === "/api/settings" && method === "GET") return json({ settings: await readSettings(env) });
  if (path === "/api/settings" && method === "PUT") {
    const b = await request.json().catch(() => ({}));
    if (b.epgUrl && !validUrl(b.epgUrl)) return json({ error: "URL EPG precisa ser HTTP(S)." }, 400);
    await env.DB.batch([
      env.DB.prepare("INSERT INTO settings(key,value) VALUES('playlistName',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(b.playlistName || "Minha playlist IPTV").slice(0, 80)),
      env.DB.prepare("INSERT INTO settings(key,value) VALUES('epgUrl',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(b.epgUrl || ""),
    ]);
    return json({ settings: await readSettings(env) });
  }
  if (["/api/refresh", "/api/sync"].includes(path) && method === "POST") {
    if (!env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY || !env.GITHUB_WORKFLOW) return json({ error: "Configure GitHub Actions nos secrets do Worker." }, 503);
    const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/${env.GITHUB_WORKFLOW}/dispatches`, { method: "POST", headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" }, body: JSON.stringify({ ref: env.GITHUB_BRANCH || "main" }) });
    if (!response.ok) return json({ error: `GitHub Actions recusou a execução (${response.status}).` }, 502);
    return json({ queued: true }, 202);
  }
  return json({ error: "Rota não encontrada." }, 404);
}

async function readSettings(env) {
  const { results } = await env.DB.prepare("SELECT key,value FROM settings").all();
  const values = Object.fromEntries(results.map(({ key, value }) => [key, value]));
  return { playlistName: values.playlistName || "Minha playlist IPTV", epgUrl: values.epgUrl || "", intervalHours: 6, timeoutSeconds: 12, concurrency: 5 };
}

function sourceView(source) {
  return { id: source.id, name: source.name, type: source.playlist_key ? "file" : "url", url: source.url, epgUrl: source.epg_url || "", enabled: Boolean(source.enabled), channelCount: source.channel_count, lastChecked: source.last_checked_at, lastSuccess: source.last_success_at, consecutiveFailures: source.consecutive_failures };
}
