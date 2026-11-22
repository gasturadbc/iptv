import { handle } from "./api.js";

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/") || pathname === "/playlist.m3u") {
      try {
        return await handle(request, env);
      } catch {
        return Response.json({ error: "Falha interna na API." }, { status: 500, headers: { "Cache-Control": "no-store" } });
      }
    }
    return env.ASSETS.fetch(request);
  },
};
