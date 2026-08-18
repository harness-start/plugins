from __future__ import annotations

from dataclasses import dataclass

from harness_swe_bench.official_evaluator import github_raw_get


@dataclass
class Response:
    status_code: int
    text: str


def test_raw_github_rate_limit_falls_back_to_contents_api() -> None:
    calls: list[tuple[str, dict[str, str]]] = []

    def request_get(url: str, *, headers: dict[str, str]):
        calls.append((url, headers))
        if url.startswith("https://raw.githubusercontent.com/"):
            return Response(429, "rate limited")
        return Response(200, "asgiref ~= 3.2\n")

    response = github_raw_get(
        "https://raw.githubusercontent.com/django/django/"
        "419a78300f7cd27611196e1e464d50fd0385ff27/tests/requirements/py3.txt",
        {"User-Agent": "swebench"},
        request_get=request_get,
    )

    assert response.status_code == 200
    assert response.text == "asgiref ~= 3.2\n"
    assert calls[1][0] == (
        "https://api.github.com/repos/django/django/contents/"
        "tests/requirements/py3.txt?ref=419a78300f7cd27611196e1e464d50fd0385ff27"
    )
    assert calls[1][1]["Accept"] == "application/vnd.github.raw+json"


def test_non_rate_limit_response_is_not_rewritten() -> None:
    expected = Response(404, "missing")

    def request_get(url: str, *, headers: dict[str, str]):
        return expected

    assert github_raw_get(
        "https://raw.githubusercontent.com/owner/repo/commit/path.txt",
        {},
        request_get=request_get,
    ) is expected
