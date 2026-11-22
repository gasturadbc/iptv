import concurrent.futures
import os
import re
import subprocess
import sys

TIMEOUT = 12


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
    try:
        result = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type", "-of", "default=noprint_wrappers=1", channel["url"]], capture_output=True, text=True, timeout=TIMEOUT, check=False)
        channel["online"] = result.returncode == 0 and bool(result.stdout.strip())
    except (subprocess.TimeoutExpired, OSError):
        channel["online"] = False
    return channel


def main():
    import requests

    api_url = os.environ["APP_API_URL"].rstrip("/")
    headers = {"Authorization": f"Bearer {os.environ['SYNC_TOKEN']}"}
    response = requests.get(f"{api_url}/api/sync/sources", headers=headers, timeout=20)
    response.raise_for_status()
    results = []
    for source in response.json()["sources"]:
        try:
            response = requests.get(source["url"], timeout=TIMEOUT, stream=True)
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
