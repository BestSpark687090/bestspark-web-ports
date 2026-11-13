#!/usr/bin/env python3
"""HTTP server that fetches missing files from a remote host and caches them locally."""

import http.server
import os
import socketserver
import urllib.error
import urllib.parse
import urllib.request

REMOTE_BASE = "https://8c68f477-6c9a-4245-a0c0-f4000563c1f7.gdn.poki.com/861deeab-2990-4532-a55e-d00191d8e55f/"
SERVE_DIR = os.path.abspath(os.path.dirname(__file__))
HOST = "0.0.0.0"
PORT = 8000


class FallbackHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=SERVE_DIR, **kwargs)

    def do_GET(self):
        local_path = self.translate_path(self.path)

        if not os.path.isfile(local_path):
            self.try_fetch_remote(local_path)

        super().do_GET()

    def try_fetch_remote(self, local_path):
        # Strip query string / fragment, keep only the URL path
        url_path = urllib.parse.urlsplit(self.path).path
        relative_path = url_path.lstrip("/")

        if not relative_path or relative_path.endswith("/"):
            return  # nothing sensible to fetch for directories/root

        # Guard against path traversal escaping SERVE_DIR
        if not os.path.abspath(local_path).startswith(SERVE_DIR + os.sep):
            return

        remote_url = urllib.parse.urljoin(REMOTE_BASE, relative_path)

        print(f"Local miss for {self.path!r}, trying {remote_url}", flush=True)

        req = urllib.request.Request(
            remote_url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36"
                ),
                "Referer": "https://games.poki.com/",
            },
        )

        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                data = response.read()
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
            print(f"Fetch failed for {remote_url}: {exc}", flush=True)
            return  # let the normal 404 handling take over

        os.makedirs(os.path.dirname(local_path), exist_ok=True)
        with open(local_path, "wb") as f:
            f.write(data)

        print(f"Fetched {remote_url} -> {local_path}", flush=True)


def main():
    with socketserver.TCPServer((HOST, PORT), FallbackHandler) as httpd:
        print(f"Serving {SERVE_DIR} on http://{HOST}:{PORT}", flush=True)
        print(f"Missing files will be fetched from {REMOTE_BASE}", flush=True)
        httpd.serve_forever()


if __name__ == "__main__":
    main()
