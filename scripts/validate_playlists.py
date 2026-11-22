import concurrent.futures
import ipaddress
import os
import re
import socket
import subprocess
import sys
from urllib.parse import urlsplit

TIMEOUT = 12


def public_http_url(value):
    try:
        parsed = urlsplit(value)
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
            return False
        addresses = {ipaddress.ip_address(item[4][0]) for item in socket.getaddrinfo(parsed.hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)}
        return bool(addresses) and all(address.is_global for address in addresses)
    except (OSError, ValueError):
        return False


def attr(line, key):
    match = re.search(rf'\b{re.escape(key)}="([^"]*)"', line)
    return match.group(1) if match else ""


def parse_playlist(text):
    channels, metadata = [], {}
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("#EXTINF:"):
            metadata = {"name": line.rsplit(",", 1)[-1].strip() or "Canal sem nome", "logo": attr(line, "tvg-logo"), "category": attr(line, "group-title") or "Geral", "tvg_id": attr(line, "tvg-id")}
        elif line and not line.startswith("#"):
            channels.append({**metadata, "url": line})
            metadata = {}
    return channels


def probe(channel):
    if not public_http_url(channel["url"]):
        channel["online"] = False
        return channel
    try:
        result = subprocess.run(["ffprobe", "-v", "error", "-protocol_whitelist", "http,https,tcp,tls,crypto", "-show_entries", "stream=codec_type", "-of", "default=noprint_wrappers=1", channel["url"]], capture_output=True, text=True, timeout=TIMEOUT, check=False)
        channel["online"] = result.returncode == 0 and bool(result.stdout.strip())
    except (subprocess.TimeoutExpired, OSError):
        channel["online"] = False
    return channel


def main():
    import requests

    api_url = os.environ["APP_API_URL"].rstrip("/")
    if api_url.endswith("/api"):
        api_url = api_url[:-4]
    headers = {"Authorization": f"Bearer {os.environ['SYNC_TOKEN']}"}
    try:
        response = requests.get(f"{api_url}/api/sync/sources", headers=headers, timeout=20)
    except requests.RequestException as error:
        raise SystemExit(f"Could not reach Worker API. Check APP_API_URL and deployment: {error}") from error
    if response.status_code == 404:
        raise SystemExit("Worker API returned 404 at /api/sync/sources. Set APP_API_URL to the Worker base URL and deploy the current Worker version.")
    response.raise_for_status()
    results = []
    for source in response.json()["sources"]:
        try:
            if not public_http_url(source["url"]):
                raise ValueError("URL da fonte precisa apontar para um host HTTP(S) público")
            response = requests.get(source["url"], timeout=TIMEOUT, stream=True, allow_redirects=False)
            response.raise_for_status()
            content = response.raw.read(10 * 1024 * 1024 + 1)
            if len(content) > 10 * 1024 * 1024:
                raise ValueError("Playlist excede 10 MB")
            parsed = parse_playlist(content.decode("utf-8-sig", errors="replace"))
            if not parsed:
                raise ValueError("Playlist sem canais válidos")
            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
                checked = list(pool.map(probe, parsed))
            results.append({"id": source["id"], "ok": True, "channels": checked})
        except (requests.RequestException, ValueError, UnicodeError) as error:
            print(f"Fonte {source['id']}: {error}", file=sys.stderr)
            results.append({"id": source["id"], "ok": False, "error": str(error)})
    update = requests.post(f"{api_url}/api/sync/results", headers=headers, json={"sources": results}, timeout=60)
    update.raise_for_status()
    print(f"Fontes processadas: {len(results)}; sucesso: {sum(item['ok'] for item in results)}")


if __name__ == "__main__":
    main()
