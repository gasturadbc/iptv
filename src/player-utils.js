export function inspectStreamUrl(value, pageProtocol = globalThis.location?.protocol || "https:") {
  let stream;
  try {
    stream = new URL(value);
  } catch {
    return { ok: false, reason: "invalid" };
  }

  if (stream.protocol !== "http:" && stream.protocol !== "https:") {
    return { ok: false, reason: "protocol" };
  }

  if (pageProtocol === "https:" && stream.protocol !== "https:") {
    return { ok: false, reason: "insecure" };
  }

  return {
    ok: true,
    url: stream.href,
    isHls: /\.m3u8$/i.test(stream.pathname),
  };
}
