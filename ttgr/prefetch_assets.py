#!/usr/bin/env python3
"""Pre-download every asset referenced in config.json from the remote CDN mirror."""

import concurrent.futures
import json
import os
import urllib.error
import urllib.parse
import urllib.request

REMOTE_BASE = "https://8c68f477-6c9a-4245-a0c0-f4000563c1f7.gdn.poki.com/861deeab-2990-4532-a55e-d00191d8e55f/"
SERVE_DIR = os.path.abspath(os.path.dirname(__file__))
CONFIG_PATH = os.path.join(SERVE_DIR, "config.json")
MAX_WORKERS = 6

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Referer": "https://games.poki.com/",
}


def collect_urls():
    with open(CONFIG_PATH) as f:
        config = json.load(f)

    urls = set()
    for asset in config["assets"].values():
        file_info = asset.get("file")
        if file_info and file_info.get("url"):
            urls.add(file_info["url"])
    return sorted(urls)


def fetch_one(relative_url):
    relative_path = relative_url[2:] if relative_url.startswith("./") else relative_url
    local_path = os.path.join(SERVE_DIR, relative_path)

    if os.path.isfile(local_path):
        return ("skip", relative_url)

    quoted_path = urllib.parse.quote(relative_path)
    remote_url = urllib.parse.urljoin(REMOTE_BASE, quoted_path)
    req = urllib.request.Request(remote_url, headers=HEADERS)

    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            data = response.read()
    except Exception as exc:
        return ("error", relative_url, str(exc))

    os.makedirs(os.path.dirname(local_path), exist_ok=True)
    with open(local_path, "wb") as f:
        f.write(data)

    return ("ok", relative_url)


def main():
    urls = collect_urls()
    print(f"{len(urls)} unique asset files referenced in config.json")

    ok = skip = err = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        for result in pool.map(fetch_one, urls):
            status = result[0]
            if status == "ok":
                ok += 1
                print(f"[ok]    {result[1]}")
            elif status == "skip":
                skip += 1
            else:
                err += 1
                print(f"[error] {result[1]}: {result[2]}")

    print(f"\nDone. downloaded={ok} already_present={skip} failed={err}")


if __name__ == "__main__":
    main()
