import { handle } from "../_lib/api.js";
export async function onRequest(context) {
  try { return await handle(context.request, context.env); }
  catch (error) { return Response.json({ error: "Falha interna na API.", detail: context.env.ENVIRONMENT === "development" ? String(error) : undefined }, { status: 500, headers: { "Cache-Control": "no-store" } }); }
}
