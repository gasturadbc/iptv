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
  if (path === "/api/auth/session" && method === "GET") return json({ authenticated: await admin(request, env) });
  if (path === "/api/auth/login" && method === "POST") {
    const { password } = await request.json().catch(() => ({}));
    if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET || typeof password !== "string" || password.length > 256 || password !== env.ADMIN_PASSWORD) return json({ error: "Credenciais inválidas." }, 401);
    const payload = btoa(JSON.stringify({ exp: Date.now() + 28800000 })).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    const value = `${payload}.${await sign(payload, env.SESSION_SECRET)}`;
    return json({ authenticated: true }, 200, { "Set-Cookie": `iptv_session=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=28800` });
  }
  if (path === "/api/auth/logout" && method === "POST") return json({ authenticated: false }, 200, { "Set-Cookie": "iptv_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0" });
  if (["/api/playlist.m3u", "/playlist.m3u"].includes(path)) {
    const { results } = await env.DB.prepare("SELECT channels.name,channels.url,channels.logo,channels.category,channels.tvg_id,sources.epg_url FROM channels JOIN sources ON sources.id=channels.source_id WHERE channels.status='online' ORDER BY channels.category,channels.name").all();
    const epg = results.find((c) => c.epg_url)?.epg_url;
    const body = [epg ? `#EXTM3U url-tvg="${epg.replaceAll('"', "&quot;")}"` : "#EXTM3U", ...results.flatMap((c) => [`#EXTINF:-1 tvg-id="${String(c.tvg_id || "").replaceAll('"', "&quot;")}" tvg-logo="${String(c.logo || "").replaceAll('"', "&quot;")}" group-title="${String(c.category || "Geral").replaceAll('"', "&quot;")}",${c.name.replace(/[\r\n]/g, " ")}`, c.url])].join("\n");
    return new Response(body, { headers: { "Content-Type": "audio/x-mpegurl; charset=utf-8", "Cache-Control": "public, max-age=300" } });
  }
  if (path === "/api/sync/sources" && method === "GET") {
    if (!sync(request, env)) return json({ error: "Não autorizado." }, 401);
    const { results } = await env.DB.prepare("SELECT id,name,url,epg_url,consecutive_failures FROM sources WHERE enabled=1 AND consecutive_failures<2").all();
    return json({ sources: results });
  }
  if (path === "/api/sync/results" && method === "POST") {
    if (!sync(request, env)) return json({ error: "Não autorizado." }, 401);
    const data = await request.json().catch(() => null);
    if (!data || !Array.isArray(data.sources) || data.sources.length > 100) return json({ error: "Payload inválido." }, 400);
    const statements = [];
    for (const item of data.sources) {
      const source = await env.DB.prepare("SELECT id,consecutive_failures FROM sources WHERE id=? AND enabled=1").bind(item.id).first();
      if (!source) continue;
      const ok = item.ok === true && Array.isArray(item.channels) && item.channels.length <= 10000;
      const failures = ok ? 0 : source.consecutive_failures + 1;
      statements.push(env.DB.prepare("UPDATE sources SET consecutive_failures=?,last_checked_at=datetime('now'),enabled=CASE WHEN ?>=2 THEN 0 ELSE enabled END WHERE id=?").bind(failures, failures, item.id));
      statements.push(env.DB.prepare("INSERT INTO checks(source_id,status,channel_count,error) VALUES(?,?,?,?)").bind(item.id, ok ? "success" : "failure", ok ? item.channels.length : 0, ok ? null : String(item.error || "Falha na validação").slice(0, 500)));
      if (ok) {
        statements.push(env.DB.prepare("DELETE FROM channels WHERE source_id=?").bind(item.id));
        const seen = new Set();
        for (const c of item.channels) {
          if (!c.name || !validUrl(c.url) || seen.has(c.url)) continue;
          seen.add(c.url);
          statements.push(env.DB.prepare("INSERT OR IGNORE INTO channels(source_id,name,url,logo,category,tvg_id,status,last_checked_at) VALUES(?,?,?,?,?,?,?,datetime('now'))").bind(item.id, String(c.name).slice(0, 255), c.url, c.logo || null, String(c.category || "Geral").slice(0, 120), c.tvg_id || null, c.online ? "online" : "offline"));
        }
        statements.push(env.DB.prepare("UPDATE sources SET last_success_at=datetime('now') WHERE id=?").bind(item.id));
      } else if (failures >= 2) statements.push(env.DB.prepare("DELETE FROM channels WHERE source_id=?").bind(item.id));
    }
    if (statements.length) await env.DB.batch(statements);
    await env.DB.prepare("INSERT INTO runs(source_count,successful_count,completed_at) VALUES(?,?,datetime('now'))").bind(data.sources.length, data.sources.filter((i) => i.ok).length).run();
    return json({ updated: data.sources.length });
  }

  if (!await admin(request, env)) return json({ error: "Não autenticado." }, 401);
  if (path === "/api/dashboard" && method === "GET") {
    const counts = await env.DB.prepare("SELECT COUNT(*) total,COALESCE(SUM(status='online'),0) online,COALESCE(SUM(status='offline'),0) offline FROM channels").first();
    const pending = await env.DB.prepare("SELECT COUNT(*) total FROM sources WHERE enabled=1").first();
    const last = await env.DB.prepare("SELECT completed_at FROM runs ORDER BY id DESC LIMIT 1").first();
    return json({ ...counts, pending: pending.total, availability: counts.total ? Math.round(counts.online * 100 / counts.total) : 0, lastUpdate: last?.completed_at || null });
  }
  if (path === "/api/sources" && method === "GET") {
    const { results } = await env.DB.prepare("SELECT s.*,COUNT(c.id) channel_count FROM sources s LEFT JOIN channels c ON c.source_id=s.id GROUP BY s.id ORDER BY s.created_at DESC").all();
    return json({ sources: results });
  }
  if (path === "/api/sources" && method === "POST") {
    const b = await request.json().catch(() => ({}));
    if (!b.name || !validUrl(b.url) || (b.epg_url && !validUrl(b.epg_url))) return json({ error: "Informe nome e URL HTTP(S) válida." }, 400);
    const result = await env.DB.prepare("INSERT INTO sources(name,url,epg_url) VALUES(?,?,?)").bind(String(b.name).slice(0, 120), b.url, b.epg_url || null).run();
    return json({ id: result.meta.last_row_id }, 201);
  }
  const match = path.match(/^\/api\/sources\/(\d+)$/);
  if (match && method === "PUT") {
    const b = await request.json().catch(() => ({}));
    if (!b.name || !validUrl(b.url) || (b.epg_url && !validUrl(b.epg_url))) return json({ error: "Informe nome e URL HTTP(S) válida." }, 400);
    await env.DB.prepare("UPDATE sources SET name=?,url=?,epg_url=?,enabled=1,consecutive_failures=0 WHERE id=?").bind(String(b.name).slice(0, 120), b.url, b.epg_url || null, match[1]).run();
    return json({ updated: true });
  }
  if (match && method === "DELETE") { await env.DB.prepare("DELETE FROM sources WHERE id=?").bind(match[1]).run(); return json({ deleted: true }); }
  if (path === "/api/channels" && method === "GET") {
    const q = `%${(url.searchParams.get("q") || "").slice(0, 100)}%`, status = url.searchParams.get("status") || "", category = url.searchParams.get("category") || "";
    const { results } = await env.DB.prepare("SELECT c.*,s.name source_name FROM channels c JOIN sources s ON s.id=c.source_id WHERE c.name LIKE ? AND (?='' OR c.status=?) AND (?='' OR c.category=?) ORDER BY c.category,c.name LIMIT 500").bind(q, status, status, category, category).all();
    return json({ channels: results });
  }
  if (path === "/api/history" && method === "GET") {
    const { results: runs } = await env.DB.prepare("SELECT * FROM runs ORDER BY id DESC LIMIT 30").all();
    const { results: checks } = await env.DB.prepare("SELECT checks.*,sources.name source_name FROM checks JOIN sources ON sources.id=checks.source_id ORDER BY checks.id DESC LIMIT 100").all();
    return json({ runs, checks });
  }
  if (path === "/api/refresh" && method === "POST") {
    if (!env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY || !env.GITHUB_WORKFLOW) return json({ error: "Configure GitHub Actions nos secrets do Worker." }, 503);
    const response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/actions/workflows/${env.GITHUB_WORKFLOW}/dispatches`, { method: "POST", headers: { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" }, body: JSON.stringify({ ref: env.GITHUB_BRANCH || "main" }) });
    if (!response.ok) return json({ error: `GitHub Actions recusou a execução (${response.status}).` }, 502);
    return json({ queued: true }, 202);
  }
  return json({ error: "Rota não encontrada." }, 404);
}
