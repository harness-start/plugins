from __future__ import annotations

import runpy
from collections.abc import Callable, Mapping
from typing import Any
from urllib.parse import quote, urlsplit

import requests

RAW_GITHUB_HOST = "raw.githubusercontent.com"
_fallback_installed = False


def github_raw_get(
    url: str,
    headers: Mapping[str, str],
    *,
    request_get: Callable[..., Any] = requests.get,
):
    response = request_get(url, headers=dict(headers))
    parsed = urlsplit(url)
    if parsed.hostname != RAW_GITHUB_HOST or response.status_code not in {403, 429}:
        return response
    parts = parsed.path.lstrip("/").split("/", 3)
    if len(parts) != 4 or not all(parts):
        return response
    owner, repo, commit, path = parts
    api_url = (
        f"https://api.github.com/repos/{quote(owner, safe='')}/{quote(repo, safe='')}"
        f"/contents/{quote(path, safe='/')}?ref={quote(commit, safe='')}"
    )
    fallback_headers = dict(headers)
    fallback_headers["Accept"] = "application/vnd.github.raw+json"
    return request_get(api_url, headers=fallback_headers)


def install_github_transport_fallback() -> None:
    global _fallback_installed
    if _fallback_installed:
        return
    from swebench.harness.test_spec import python as python_spec

    real_requests = python_spec.requests

    class RequestsAdapter:
        @staticmethod
        def get(url: str, headers: Mapping[str, str] | None = None):
            return github_raw_get(
                url,
                headers or {},
                request_get=real_requests.get,
            )

    python_spec.requests = RequestsAdapter
    _fallback_installed = True


def main() -> None:
    install_github_transport_fallback()
    runpy.run_module("swebench.harness.run_evaluation", run_name="__main__")


if __name__ == "__main__":
    main()
