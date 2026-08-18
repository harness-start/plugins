FROM python:3.11-slim-bookworm@sha256:d29f48a31a8b408ed19272ca1e7b10ebae13b240a27e862d3d4217c528e2e0c3

WORKDIR /app
COPY proxy.py /app/proxy.py
COPY allowlist.txt /app/allowlist.txt

ENV ALLOWLIST_FILE=/app/allowlist.txt
ENV LISTEN_PORT=3128

EXPOSE 3128
USER nobody
HEALTHCHECK --interval=5s --timeout=2s --retries=10 \
  CMD ["python", "-c", "import socket; socket.create_connection(('127.0.0.1', 3128), 1).close()"]
CMD ["python", "/app/proxy.py"]
