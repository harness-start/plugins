from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml


@dataclass(frozen=True)
class DatasetConfig:
    name: str
    revision: str
    split: str


@dataclass(frozen=True)
class ModelConfig:
    name: str
    api_host: str
    reasoning_effort: str


@dataclass(frozen=True)
class AgentConfig:
    timeout_sec: int
    attempts: int


@dataclass(frozen=True)
class HarnessConfig:
    mode: str


@dataclass(frozen=True)
class NetworkConfig:
    allowed_hosts: tuple[str, ...]


@dataclass(frozen=True)
class GraderConfig:
    max_workers: int
    timeout_sec: int
    cache_level: str


@dataclass(frozen=True)
class ToolchainConfig:
    swebench: str
    claude_code: str
    codex: str


@dataclass(frozen=True)
class SuiteConfig:
    schema_version: int
    suite: str
    dataset: DatasetConfig
    instances: tuple[str, ...]
    hosts: tuple[str, ...]
    model: ModelConfig
    agent: AgentConfig
    harness: HarnessConfig
    network: NetworkConfig
    grader: GraderConfig
    toolchain: ToolchainConfig
    path: Path


def _mapping(value: object, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be a mapping")
    return value


def _string(value: object, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{label} must be a non-empty string")
    return value.strip()


def _positive_int(value: object, label: str) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
        raise ValueError(f"{label} must be a positive integer")
    return value


def _strings(value: object, label: str) -> tuple[str, ...]:
    if not isinstance(value, list) or not value:
        raise ValueError(f"{label} must be a non-empty list")
    rows = tuple(_string(item, label) for item in value)
    if len(set(rows)) != len(rows):
        raise ValueError(f"{label} entries must be unique")
    return rows


def load_suite(path: Path) -> SuiteConfig:
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    root = _mapping(raw, "suite config")
    if root.get("schema_version") != 1:
        raise ValueError("schema_version must be 1")

    dataset = _mapping(root.get("dataset"), "dataset")
    model = _mapping(root.get("model"), "model")
    agent = _mapping(root.get("agent"), "agent")
    harness = _mapping(root.get("harness"), "harness")
    network = _mapping(root.get("network"), "network")
    grader = _mapping(root.get("grader"), "grader")
    toolchain = _mapping(root.get("toolchain"), "toolchain")

    attempts = _positive_int(agent.get("attempts"), "agent.attempts")
    if attempts != 1:
        raise ValueError("agent.attempts must be 1; benchmark retries require a new run ID")
    hosts = _strings(root.get("hosts"), "hosts")
    if any(host not in {"claude", "codex"} for host in hosts):
        raise ValueError("hosts may contain only claude and codex")
    harness_mode = _string(harness.get("mode"), "harness.mode")
    if harness_mode not in {"full", "off", "profile"}:
        raise ValueError("harness.mode must be full, off, or profile")
    cache_level = _string(grader.get("cache_level"), "grader.cache_level")
    if cache_level not in {"none", "base", "env", "instance"}:
        raise ValueError("grader.cache_level is invalid")

    return SuiteConfig(
        schema_version=1,
        suite=_string(root.get("suite"), "suite"),
        dataset=DatasetConfig(
            name=_string(dataset.get("name"), "dataset.name"),
            revision=_string(dataset.get("revision"), "dataset.revision"),
            split=_string(dataset.get("split"), "dataset.split"),
        ),
        instances=_strings(root.get("instances"), "instances"),
        hosts=hosts,
        model=ModelConfig(
            name=_string(model.get("name"), "model.name"),
            api_host=_string(model.get("api_host"), "model.api_host"),
            reasoning_effort=_string(
                model.get("reasoning_effort"), "model.reasoning_effort"
            ),
        ),
        agent=AgentConfig(
            timeout_sec=_positive_int(agent.get("timeout_sec"), "agent.timeout_sec"),
            attempts=attempts,
        ),
        harness=HarnessConfig(mode=harness_mode),
        network=NetworkConfig(
            allowed_hosts=_strings(network.get("allowed_hosts"), "network.allowed_hosts")
        ),
        grader=GraderConfig(
            max_workers=_positive_int(grader.get("max_workers"), "grader.max_workers"),
            timeout_sec=_positive_int(grader.get("timeout_sec"), "grader.timeout_sec"),
            cache_level=cache_level,
        ),
        toolchain=ToolchainConfig(
            swebench=_string(toolchain.get("swebench"), "toolchain.swebench"),
            claude_code=_string(
                toolchain.get("claude_code"), "toolchain.claude_code"
            ),
            codex=_string(toolchain.get("codex"), "toolchain.codex"),
        ),
        path=path.resolve(),
    )
