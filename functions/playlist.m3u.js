import { handle } from "./_lib/api.js";
export async function onRequest(context) {
  try { return await handle(context.request, context.env); }
  catch { return new Response("Playlist indisponível.", { status: 503 }); }
}
