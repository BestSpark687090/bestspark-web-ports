#!/usr/bin/env python3
"""Static server for the PSX web player. Serves index.html at / and this
folder's files under /data/, with HEAD + HTTP Range support (the loader
fetches large games in 10 MB ranges).

Env vars: HOST (default 127.0.0.1), PASSWORD (enables HTTP Basic auth,
any username), TTL (seconds until the server exits)."""
import base64, os, re, sys, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
HOST = os.environ.get('HOST', '127.0.0.1')
PASSWORD = os.environ.get('PASSWORD')
TTL = int(os.environ.get('TTL', '0'))

class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.wasm': 'application/wasm', '.js': 'text/javascript'}

    def translate_path(self, path):
        path = path.split('?', 1)[0].split('#', 1)[0]
        if path == '/':
            path = '/index.html'
        # Static layout (index.html + data/ folder): serve the real path
        direct = os.path.normpath(os.path.join(ROOT, path.lstrip('/')))
        if direct.startswith(ROOT + os.sep) and os.path.isfile(direct):
            return direct
        # Flat layout: everything sits next to this script
        if path.startswith('/data/'):
            path = path[len('/data'):]
        name = os.path.basename(path)
        return os.path.join(ROOT, name)

    def authorized(self):
        if not PASSWORD:
            return True
        auth = self.headers.get('Authorization', '')
        if auth.startswith('Basic '):
            try:
                if base64.b64decode(auth[6:]).decode().split(':', 1)[1] == PASSWORD:
                    return True
            except Exception:
                pass
        self.send_response(401)
        self.send_header('WWW-Authenticate', 'Basic realm="psx"')
        self.send_header('Content-Length', '0')
        self.end_headers()
        return False

    def send_head(self):
        if not self.authorized():
            return None
        path = self.translate_path(self.path)
        if not os.path.isfile(path):
            self.send_error(404)
            return None
        size = os.path.getsize(path)
        start, end = 0, size - 1
        m = re.match(r'bytes=(\d*)-(\d*)', self.headers.get('Range', ''))
        f = open(path, 'rb')
        if m:
            if m.group(1):
                start = int(m.group(1))
                if m.group(2):
                    end = min(int(m.group(2)), size - 1)
            elif m.group(2):
                start = max(0, size - int(m.group(2)))
            self.send_response(206)
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        else:
            self.send_response(200)
        f.seek(start)
        self._remaining = end - start + 1
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Length', str(self._remaining))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        return f

    def copyfile(self, src, dst):
        while self._remaining > 0:
            buf = src.read(min(1 << 20, self._remaining))
            if not buf:
                break
            dst.write(buf)
            self._remaining -= len(buf)

if __name__ == '__main__':
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    if TTL:
        threading.Timer(TTL, server.shutdown).start()
    print(f'Serving on http://{HOST}:{PORT}/' + (f' for {TTL}s' if TTL else ''), flush=True)
    server.serve_forever()
