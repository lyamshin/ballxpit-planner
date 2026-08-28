#!/usr/bin/env python3
"""Serve public/ on http://localhost:8123 (the JSON needs http://, not file://)."""
import functools, http.server, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent / "public"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
print("serving %s at http://localhost:%d" % (ROOT, PORT), flush=True)
http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler).serve_forever()
