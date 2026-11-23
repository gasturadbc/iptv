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

  if (stream.username || stream.password) {
    return { ok: false, reason: "credentials" };
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

export function secureStreamUrl(value) {
  const source = inspectStreamUrl(value, "http:");
  if (!source.ok) return null;

  const url = new URL(source.url);
  if (url.protocol === "http:") {
    if (/^[\d.]+$/.test(url.hostname) || url.hostname.includes(":")) return null;
    url.protocol = "https:";
  }
  return url.href;
}
