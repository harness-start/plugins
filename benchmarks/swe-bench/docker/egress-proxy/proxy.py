#!/usr/bin/env python3
"""HTTPS CONNECT proxy with an exact hostname allowlist."""

from __future__ import annotations

import os
import select
import socket
import socketserver
from pathlib import Path

ALLOWLIST_FILE = Path(os.environ.get("ALLOWLIST_FILE", "/app/allowlist.txt"))
LISTEN_PORT = int(os.environ.get("LISTEN_PORT", "3128"))
BUFFER_SIZE = 65536


def load_allowlist() -> frozenset[str]:
    hosts = {
        line.strip().lower()
        for line in ALLOWLIST_FILE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }
    if not hosts:
        raise RuntimeError("egress allowlist must not be empty")
    return frozenset(hosts)


ALLOWLIST = load_allowlist()


class ProxyHandler(socketserver.StreamRequestHandler):
    def handle(self) -> None:
        upstream: socket.socket | None = None
        try:
            first_line = self.rfile.readline(65536)
            if not first_line:
                return
            parts = first_line.decode("iso-8859-1", errors="replace").strip().split()
            while self.rfile.readline(65536) not in (b"\r\n", b"\n", b""):
                pass
            if len(parts) < 2 or parts[0].upper() != "CONNECT":
                self.respond(405, b"Only HTTPS CONNECT is allowed\n")
                return
            host, separator, port_text = parts[1].rpartition(":")
            if not separator:
                host, port_text = parts[1], "443"
            host = host.strip("[]").lower()
            try:
                port = int(port_text)
            except ValueError:
                self.respond(400, b"Invalid CONNECT port\n")
                return
            if host not in ALLOWLIST or port != 443:
                print(f"DENY {host}:{port}", flush=True)
                self.respond(403, b"Host is not allowlisted\n")
                return
            print(f"ALLOW {host}:{port}", flush=True)
            upstream = socket.create_connection((host, port), timeout=30)
            self.connection.sendall(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            self.tunnel(upstream)
        except (OSError, ValueError) as error:
            print(f"ERROR {type(error).__name__}", flush=True)
        finally:
            if upstream is not None:
                upstream.close()

    def respond(self, code: int, body: bytes) -> None:
        reason = {400: "Bad Request", 403: "Forbidden", 405: "Method Not Allowed"}.get(
            code, "Error"
        )
        self.connection.sendall(
            f"HTTP/1.1 {code} {reason}\r\nContent-Length: {len(body)}\r\nConnection: close\r\n\r\n".encode()
            + body
        )

    def tunnel(self, upstream: socket.socket) -> None:
        sockets = [self.connection, upstream]
        while True:
            readable, _, errors = select.select(sockets, [], sockets, 300)
            if errors or not readable:
                return
            for source in readable:
                payload = source.recv(BUFFER_SIZE)
                if not payload:
                    return
                destination = upstream if source is self.connection else self.connection
                destination.sendall(payload)


class ThreadingProxy(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main() -> None:
    print(f"READY allow={','.join(sorted(ALLOWLIST))}", flush=True)
    with ThreadingProxy(("0.0.0.0", LISTEN_PORT), ProxyHandler) as server:
        server.serve_forever()


if __name__ == "__main__":
    main()
